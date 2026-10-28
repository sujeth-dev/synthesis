"""Diagnose why DKT's learning curves fail while its aggregate metrics win.

The question. On the public benchmarks DKT beats per-skill BKT on every
aggregate metric — on ASSISTments 2009 by +0.087 AUC — yet its learning curve
is nearly flat while the observed curve rises. An adaptive tutor cannot use a
model like that: every mastery and scheduling decision it makes is a claim that
a learner improved, and a flat curve is a model that cannot make that claim.

How this script answers it, without retraining anything. The trained DKT
weights and the fitted BKT parameters are committed, so the predictions can be
reproduced with a numpy forward pass (dkt_numpy) and an EM refit (bkt, a few
seconds per dataset). Every run begins by checking the reproduced AUC, log-loss,
RMSE and accuracy against the committed metrics.json; if those do not match,
nothing downstream is trustworthy and the run fails loudly.

The six hypotheses it tests, and the measure that settles each:

  H1  The curve measurement is itself confounded — each opportunity bucket is a
      different, more persistent population.          -> cohort_curve vs raw_curve
  H2  The classic DKT reconstruction / non-monotonicity pathology: the
      prediction for a skill does not move after an answer on that skill.
                                 -> evidence_response, reconstruction_error, w1/w2
  H3  DKT learned static difficulty and ability, not growth.
                                 -> the baselines, and within_pair_spread
  H4  Long-sequence degradation: the LSTM's state saturates.   -> position_slices
  H5  Cold start: one fixed all-zero-state output.      -> opportunity-1 residual
  H6  Dataset artefacts make a curve impossible or meaningless.      -> the audit

Usage:
    python diagnose.py                  # all datasets with data + committed weights
    python diagnose.py assist2009       # one

Writes results/<name>.json["diagnostics"]. Public benchmarks and the Synaptic
simulator are reported separately, never pooled: they answer different
questions, and the simulator's ground truth is only as good as its own
assumptions.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd

import bkt
import curves
import dkt_numpy
from evaluate import scores
from stats import DATA_DIR, RESULTS_DIR, update_results

WEB_DATA = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "data"))
ORDER = ["assist2009", "assist2015", "synthetic5", "synaptic_sim"]
PUBLIC = {"assist2009", "assist2015", "synthetic5"}

TRAJECTORY_STUDENTS = 150       # students sampled for the whole-skill-vector measures
TRAJECTORY_MIN_LENGTH = 20
COHORT_MIN_OPPORTUNITIES = 10
REPRODUCTION_TOLERANCE = 1e-6   # vs the committed metrics; the numpy pass matches to ~1e-9


def load(name: str):
    """Same load as run.py, minus torch and minus the DKT-side bookkeeping."""
    df = pd.read_csv(os.path.join(DATA_DIR, name, "sequences.csv"), dtype={"student_id": str, "skill_id": str})
    df = df.sort_values(["student_id", "order"], kind="stable").reset_index(drop=True)
    with open(os.path.join(DATA_DIR, name, "splits.json")) as f:
        splits = json.load(f)
    df["split"] = df["student_id"].map({s: k for k, ids in splits.items() for s in ids})
    df["opportunity"] = curves.opportunity_index(df)
    return df, splits


def build_eval(name: str, df: pd.DataFrame) -> tuple[pd.DataFrame, dict, dict]:
    """Reproduce the evaluated rows and both models' predictions on them.

    Evaluated rows are run.py's: every test-split interaction except each
    student's first, for students with at least two interactions. BKT and DKT are
    scored on exactly these rows, as in the original protocol.
    """
    w = dkt_numpy.load_weights(os.path.join(WEB_DATA, name, "dkt_weights.json"))
    skills = sorted(df["skill_id"].unique())
    if skills != w.skills:
        raise SystemExit(f"[{name}] skill order differs from the committed weights; "
                         "the dataset and the model are not the same vintage")

    train_df = df[df["split"] == "train"]
    test_df = df[df["split"] == "test"]

    t0 = time.time()
    params = bkt.fit_all_skills(train_df, skills)
    bkt_seconds = time.time() - t0

    seqs, row_blocks = [], []
    for _, g in test_df.groupby("student_id", sort=True):
        if len(g) < 2:
            continue
        seqs.append((g["skill_id"].map(w.skill_index).to_numpy(), g["correct"].to_numpy().astype(np.int64)))
        row_blocks.append(g.index.to_numpy()[1:])
    rows = np.concatenate(row_blocks)

    ev = df.loc[rows].copy()
    ev["dkt"] = np.concatenate(dkt_numpy.predict_next_step(w, seqs))
    ev["bkt"] = bkt.predict_rows(test_df, params).loc[rows].to_numpy()
    if ev[["bkt", "dkt"]].isna().any().any():
        raise SystemExit(f"[{name}] missing predictions after reproduction")

    for label, p in curves.baseline_predictions(train_df, ev).items():
        ev[label] = p
    return ev, params, {"bkt_fit_seconds": round(bkt_seconds, 1), "weights": w}


def verify(name: str, ev: pd.DataFrame) -> dict:
    """Check the reproduced predictions against the committed metrics before
    anything is concluded from them."""
    with open(os.path.join(WEB_DATA, name, "metrics.json")) as f:
        committed = json.load(f)
    y = ev["correct"].to_numpy(dtype=int)
    out, worst = {}, 0.0
    for model in ("bkt", "dkt"):
        got = scores(y, ev[model].to_numpy(dtype=float))
        ref = committed[model]
        deltas = {k: abs(got[k] - ref[k]) for k in ("auc", "log_loss", "rmse", "accuracy")}
        worst = max(worst, max(deltas.values()))
        out[model] = {"reproduced": {k: got[k] for k in ("auc", "log_loss", "rmse", "accuracy", "n")},
                      "committed": {k: ref[k] for k in ("auc", "log_loss", "rmse", "accuracy", "n")},
                      "max_abs_delta": max(deltas.values()), "n_matches": got["n"] == ref["n"]}
    out["max_abs_delta"] = worst
    out["tolerance"] = REPRODUCTION_TOLERANCE
    out["ok"] = worst <= REPRODUCTION_TOLERANCE and all(out[m]["n_matches"] for m in ("bkt", "dkt"))
    return out


def trajectories(w, df: pd.DataFrame, splits: dict, seed: int = 42) -> list[dict]:
    """Whole-skill prediction vectors for a sample of held-out students.

    The mechanism measures need every skill's prediction at every step, not just
    the next-step one, so they run on a sample rather than the full test split."""
    test = df[df["split"] == "test"]
    lengths = test.groupby("student_id").size()
    eligible = sorted(s for s in splits["test"] if lengths.get(s, 0) >= TRAJECTORY_MIN_LENGTH)
    if not eligible:
        return []
    rng = np.random.default_rng(seed)
    chosen = rng.choice(eligible, size=min(TRAJECTORY_STUDENTS, len(eligible)), replace=False)
    out = []
    by_student = {s: g for s, g in test.groupby("student_id")}
    for sid in sorted(chosen):
        g = by_student[sid]
        sk = g["skill_id"].map(w.skill_index).to_numpy()
        co = g["correct"].to_numpy().astype(np.int64)
        out.append({"traj": dkt_numpy.all_skill_trajectory(w, sk, co), "skills": sk, "correct": co})
    return out


def bkt_trajectories(df: pd.DataFrame, splits: dict, params: dict, skills: list[str], seed: int = 42) -> list[dict]:
    """The same whole-skill vectors for BKT, so the mechanism measures compare
    like with like. BKT has no cross-skill transfer, so its vector only changes
    in the one entry for the skill just answered — which is the point: that is
    what a model updating on evidence looks like."""
    test = df[df["split"] == "test"]
    lengths = test.groupby("student_id").size()
    eligible = sorted(s for s in splits["test"] if lengths.get(s, 0) >= TRAJECTORY_MIN_LENGTH)
    if not eligible:
        return []
    rng = np.random.default_rng(seed)
    chosen = rng.choice(eligible, size=min(TRAJECTORY_STUDENTS, len(eligible)), replace=False)
    index = {s: i for i, s in enumerate(skills)}
    out = []
    by_student = {s: g for s, g in test.groupby("student_id")}
    for sid in sorted(chosen):
        g = by_student[sid]
        sk = g["skill_id"].to_numpy()
        co = g["correct"].to_numpy().astype(np.int64)
        beliefs = {s: params[s]["p_init"] for s in skills}
        traj = np.zeros((len(sk), len(skills)))
        for t, (s, c) in enumerate(zip(sk, co)):
            _, beliefs[s] = bkt.bkt_step(beliefs[s], int(c), params[s])
            traj[t] = [bkt.p_correct(beliefs[k], params[k]) for k in skills]
        out.append({"traj": traj, "skills": np.array([index[s] for s in sk]), "correct": co})
    return out


def audit(name: str, df: pd.DataFrame, ev: pd.DataFrame) -> dict:
    """H6: can this dataset support a learning curve at all, and is its
    "opportunity" index meaningful?"""
    pairs = df.groupby(["student_id", "skill_id"]).size()
    out = {
        "max_opportunity": int(df["opportunity"].max()),
        "mean_attempts_per_student_skill": float(pairs.mean()),
        "fraction_pairs_with_one_attempt": float((pairs == 1).mean()),
        "fraction_eval_rows_at_opportunity_1": float((ev["opportunity"] == 1).mean()),
        "max_sequence_length": int(df.groupby("student_id").size().max()),
        "has_time": bool("t_days" in df.columns),
    }
    # ASSISTments tags one problem with several skills, so one problem can become
    # several consecutive rows. If that is common, "n-th practice opportunity"
    # partly counts re-tagging rather than practice. Measured on the raw file,
    # which still carries the original order_id.
    raw_dir = os.path.join(DATA_DIR, "raw", name)
    if os.path.isdir(raw_dir):
        for fn in sorted(os.listdir(raw_dir)):
            if not fn.endswith(".csv"):
                continue
            try:
                raw = pd.read_csv(os.path.join(raw_dir, fn), encoding="latin-1", low_memory=False,
                                  usecols=lambda c: c in ("user_id", "order_id", "skill_id"))
            except Exception:
                continue
            if {"user_id", "order_id", "skill_id"} <= set(raw.columns):
                raw = raw.dropna(subset=["skill_id"]).drop_duplicates(["user_id", "order_id", "skill_id"])
                per_problem = raw.groupby(["user_id", "order_id"]).size()
                out["raw_multi_skill"] = {
                    "file": fn,
                    "mean_skills_per_problem": float(per_problem.mean()),
                    "fraction_rows_from_multi_skill_problems": float(
                        per_problem[per_problem > 1].sum() / per_problem.sum()),
                }
            break
    return out


def diagnose(name: str) -> dict:
    t_start = time.time()
    df, splits = load(name)
    ev, params, meta = build_eval(name, df)
    w = meta.pop("weights")
    skills = w.skills
    check = verify(name, ev)
    status = "OK" if check["ok"] else "MISMATCH"
    print(f"[{name}] reproduced committed metrics: {status} (max |delta| {check['max_abs_delta']:.2e})")
    if not check["ok"]:
        raise SystemExit(f"[{name}] could not reproduce the committed metrics; refusing to diagnose stale numbers")

    model_cols = ["bkt", "dkt", "global_rate", "skill_rate", "student_rate", "skill_and_student"]
    y = ev["correct"].to_numpy(dtype=int)

    raw = curves.raw_curve(ev, model_cols)
    cohort = curves.cohort_curve(ev, model_cols, COHORT_MIN_OPPORTUNITIES)

    dkt_traj = trajectories(w, df, splits)
    bkt_traj = bkt_trajectories(df, splits, params, skills)

    out = {
        "question": "DKT wins the aggregate metrics and loses the learning curve. Which of six "
                    "hypotheses explains it, and what does each measure say?",
        "protocol": "identical held-out rows to metrics.json (every test interaction except each "
                    "student's first); DKT reproduced from the committed weights with a numpy "
                    "forward pass, BKT refitted by EM on the training split",
        "kind": "public benchmark" if name in PUBLIC else "Synaptic simulator (synthetic)",
        "reproduction_check": check,
        "all_model_scores": {c: scores(y, ev[c].to_numpy(dtype=float)) for c in model_cols},
        "baselines_note": "global_rate, skill_rate, student_rate and skill_and_student contain no "
                          "notion of practice on a skill. They are the control: a model whose curve "
                          "looks like theirs has not learned learning.",
        "raw_curve": raw,
        "cohort_curve": cohort,
        "raw_curve_fidelity": curves.curve_fidelity(raw["points"], model_cols),
        "cohort_curve_fidelity": curves.curve_fidelity(cohort["points"], model_cols),
        "per_skill_fidelity": curves.per_skill_fidelity(ev, ["bkt", "dkt"]),
        "within_pair_spread": curves.within_pair_spread(ev, model_cols),
        "position_slices": curves.position_slices(ev, ["bkt", "dkt"]),
        "evidence_response": {
            "note": "change in the predicted probability for a skill, from just before to just "
                    "after an answer on that skill. A model that updates on evidence separates "
                    "correct from wrong; near-zero means the answer changed nothing.",
            "students_sampled": len(dkt_traj),
            "dkt": curves.evidence_response(dkt_traj),
            "bkt": curves.evidence_response(bkt_traj),
        },
        "consistency": {
            "note": "Yeung & Yeung (2018): w1/w2 measure how much the whole prediction vector "
                    "thrashes between answers; reconstruction_error is the gap between the "
                    "prediction for the skill just answered and that answer.",
            "dkt": curves.waviness_and_reconstruction(dkt_traj),
            "bkt": curves.waviness_and_reconstruction(bkt_traj),
        },
        "dataset_audit": audit(name, df, ev),
        "timing": meta | {"total_seconds": round(time.time() - t_start, 1)},
    }

    f = out["cohort_curve_fidelity"]["models"]
    if f:
        print(f"[{name}] cohort-curve slope ratio: BKT {f['bkt']['slope_ratio']:+.2f}  "
              f"DKT {f['dkt']['slope_ratio']:+.2f}  (1.0 = tracks the observed growth)")
    s = out["all_model_scores"]
    print(f"[{name}] AUC: BKT {s['bkt']['auc']:.4f}  DKT {s['dkt']['auc']:.4f}  "
          f"skill+student baseline {s['skill_and_student']['auc']:.4f}")
    e = out["evidence_response"]
    print(f"[{name}] evidence separation: BKT {e['bkt']['separation']:+.4f}  DKT {e['dkt']['separation']:+.4f}")
    return out


def main(names: list[str]) -> int:
    done = []
    for name in names:
        if not os.path.exists(os.path.join(DATA_DIR, name, "sequences.csv")):
            print(f"[{name}] no data/{name}/sequences.csv — run datasets.py first; skipping")
            continue
        if not os.path.exists(os.path.join(WEB_DATA, name, "dkt_weights.json")):
            print(f"[{name}] no committed weights — run run.py first; skipping")
            continue
        update_results(name, "diagnostics", diagnose(name))
        done.append(name)
    if done:
        print(f"\nwrote diagnostics for {', '.join(done)} into {RESULTS_DIR}")
    return 0 if done else 1


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("names", nargs="*", default=ORDER)
    sys.exit(main(p.parse_args().names))
