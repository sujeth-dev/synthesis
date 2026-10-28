"""Lab 9: fix the defect FINDINGS-CURVES.md identified, and measure the fix on
the thing that was broken.

The diagnosis. DKT's aggregate metrics are fine and its learning curve is too
shallow: on assist2009 it reproduces 56% of the observed growth against BKT's
82%. The mechanism is H2 — DKT updates in the wrong direction after roughly one
answer in four, and its predictions for skills the learner never touched thrash
about 90x more than BKT's. The shallow slope is the aggregate shadow of that
noise.

Why this is a different experiment from Lab 6. Lab 6 (tune.py) already tried
DKT+ regularisation — the published remedy for exactly this pathology — and
recorded that it "never beat plain early-stopped DKT". But it was judged on
validation **AUC**, and AUC is a pure ranking measure that cannot see a slope.
DKT+ was dismissed for failing a test it was never meant to pass. So the
candidates here overlap with Lab 6's phase C on purpose; what changes is the
criterion.

Selection rule, stated up front so it cannot be bent afterwards:

    Among candidates whose validation AUC is no worse than the baseline's by
    more than AUC_TOLERANCE, choose the one whose validation cohort-curve slope
    ratio is closest to 1.0.

That keeps the ranking quality the lab already has while optimising the quantity
an adaptive tutor actually schedules on. Every candidate that is run is
reported, including the ones that do not help. Choices are made on validation;
each candidate touches the test split exactly once, after training.

Public benchmarks first, separately, then the Synaptic simulator — they answer
different questions and are never pooled.

Usage:
    python improve.py                          # assist2009 sweep, then confirm
    python improve.py --datasets assist2009    # sweep one dataset only
    python improve.py --confirm-only           # re-run the winner elsewhere
"""
from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import replace

import numpy as np

import bkt
import curves
import dkt
import run
from evaluate import scores
from tune import CKPT_DIR, Experiment

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "results", "dkt_improve.json")

SWEEP_DATASET = "assist2009"          # where the failure is starkest
CONFIRM_DATASETS = ["assist2015", "synaptic_sim"]
COHORT_MIN_OPPORTUNITIES = 10
AUC_TOLERANCE = 0.005                 # how much ranking we will trade for growth
MECHANISM_STUDENTS = 150
MECHANISM_MIN_LENGTH = 20

# Lab 3's shipped configuration, and Lab 6's phase-A winner shape, as references.
BASELINE = dkt.DKTConfig(hidden_size=100, lr=1e-3, batch_size=32, epochs=10)
EARLY = dkt.DKTConfig(hidden_size=100, lr=1e-3, batch_size=32, epochs=30,
                      dropout=0.2, early_stopping=True, patience=3)


def candidates() -> list[tuple[str, dkt.DKTConfig]]:
    """Ordered by what the diagnosis predicts should help.

    lambda_r is the reconstruction term: it asks the model to reproduce the
    answer it has just consumed, which is precisely the wrong-way-update defect.
    lambda_w1 / lambda_w2 penalise the prediction vector moving between steps,
    which is the cross-skill thrash. Both are already implemented in
    dkt.loss_fn; only the strengths and the criterion are new here.
    """
    return [
        ("Lab 3 baseline (no regularisation)", BASELINE),
        ("early stopping + dropout 0.2", EARLY),
        ("DKT+ reconstruction only (r 0.1)", replace(EARLY, lambda_r=0.1)),
        ("DKT+ reconstruction strong (r 0.5)", replace(EARLY, lambda_r=0.5)),
        ("DKT+ reconstruction only (r 1.0)", replace(EARLY, lambda_r=1.0)),
        ("DKT+ published (r 0.1, w1 0.003, w2 3.0)", replace(EARLY, lambda_r=0.1, lambda_w1=0.003, lambda_w2=3.0)),
        ("DKT+ weak waviness (r 0.1, w1 0.003, w2 0.3)", replace(EARLY, lambda_r=0.1, lambda_w1=0.003, lambda_w2=0.3)),
        ("DKT+ strong both (r 0.5, w1 0.01, w2 3.0)", replace(EARLY, lambda_r=0.5, lambda_w1=0.01, lambda_w2=3.0)),
        ("DKT+ smoothness only (w1 0.003, w2 3.0)", replace(EARLY, lambda_w1=0.003, lambda_w2=3.0)),
    ]


# ── measurement ─────────────────────────────────────────────────────────────
def curve_metrics(ex: Experiment, split: str, preds) -> dict:
    """Cohort-curve fidelity for one model on one split.

    The cohort curve holds the (student, skill) population fixed, so the slope
    ratio is a statement about the model rather than about which learners
    happened to persist. See curves.cohort_curve."""
    rows = ex.rows[split]
    ev = ex.df.loc[rows].copy()
    ev["model"] = preds.loc[rows].to_numpy()
    cohort = curves.cohort_curve(ev, ["model"], COHORT_MIN_OPPORTUNITIES)
    fid = curves.curve_fidelity(cohort["points"], ["model"])
    m = fid.get("models", {}).get("model")
    return {
        "pairs": cohort["pairs"],
        "n_points": fid.get("n_points", 0),
        "observed_slope": fid.get("actual_slope"),
        "slope_ratio": m["slope_ratio"] if m else None,
        "curve_mae": m["mae"] if m else None,
        "curve_bias": m["bias"] if m else None,
    }


def mechanism(ex: Experiment, model) -> dict:
    """Wrong-way updates and cross-skill thrash, measured on held-out students.

    Uses dkt.hidden_trajectory, which gives the prediction over every skill at
    every step — the view the next-step predictions cannot provide."""
    test = ex.df[ex.df["split"] == "test"]
    lengths = test.groupby("student_id").size()
    eligible = sorted(s for s in lengths.index if lengths[s] >= MECHANISM_MIN_LENGTH)
    if not eligible:
        return {}
    rng = np.random.default_rng(42)
    chosen = sorted(rng.choice(eligible, size=min(MECHANISM_STUDENTS, len(eligible)), replace=False))
    by_student = {s: g for s, g in test.groupby("student_id")}
    traj = []
    for sid in chosen:
        g = by_student[sid]
        sk = g["skill_id"].map(ex.index).to_numpy()
        co = g["correct"].to_numpy().astype(np.int64)
        traj.append({"traj": dkt.hidden_trajectory(model, list(zip(sk.tolist(), co.tolist()))),
                     "skills": sk, "correct": co})
    return {"students": len(traj),
            **curves.evidence_response(traj),
            **curves.waviness_and_reconstruction(traj)}


def evaluate_dkt(ex: Experiment, label: str, cfg: dkt.DKTConfig, log) -> dict:
    t0 = time.time()
    model, hist = dkt.train(ex.seqs["train"], ex.seqs["val"], len(ex.skills), cfg, log=lambda m: None)
    secs = time.time() - t0
    val_preds = run.dkt_predict_rows(model, ex.seqs["val"], cfg)
    test_preds = run.dkt_predict_rows(model, ex.seqs["test"], cfg)      # touched once
    val, test = ex.score("val", val_preds), ex.score("test", test_preds)
    os.makedirs(CKPT_DIR, exist_ok=True)
    row = {
        "dataset": ex.name, "model": "DKT", "variant": label, "config": cfg.to_dict(),
        "val": {**{k: val[k] for k in ("auc", "log_loss")}, "curve": curve_metrics(ex, "val", val_preds)},
        "test": {**{k: test[k] for k in ("auc", "log_loss", "rmse", "accuracy", "n")},
                 "curve": curve_metrics(ex, "test", test_preds)},
        "mechanism": mechanism(ex, model),
        "epochs_run": len(hist), "train_seconds": round(secs, 1),
    }
    _log_row(row, log)
    return row


def evaluate_bkt(ex: Experiment, label: str, forgetting: bool, log) -> dict:
    """Per-skill EM BKT, as the reference the curve has to be judged against —
    it is the model that currently tracks growth best."""
    t0 = time.time()
    params = bkt.fit_all_skills(ex.df[ex.df["split"] == "train"], ex.skills, forgetting=forgetting)
    secs = time.time() - t0
    out = {}
    for split in ("val", "test"):
        preds = bkt.predict_rows(ex.df[ex.df["split"] == split], params)
        out[split] = (ex.score(split, preds), curve_metrics(ex, split, preds))
    row = {
        "dataset": ex.name, "model": "BKT", "variant": label, "config": {"forgetting": forgetting},
        "val": {**{k: out["val"][0][k] for k in ("auc", "log_loss")}, "curve": out["val"][1]},
        "test": {**{k: out["test"][0][k] for k in ("auc", "log_loss", "rmse", "accuracy", "n")},
                 "curve": out["test"][1]},
        "mechanism": {}, "epochs_run": 0, "train_seconds": round(secs, 1),
    }
    _log_row(row, log)
    return row


def _log_row(row: dict, log) -> None:
    v, t = row["val"], row["test"]
    sr = t["curve"]["slope_ratio"]
    log(f"  {row['variant']:<46} val auc {v['auc']:.4f}  test auc {t['auc']:.4f}  "
        f"test ll {t['log_loss']:.4f}  slope ratio {sr if sr is None else f'{sr:+.2f}'}")


# ── selection ───────────────────────────────────────────────────────────────
def select(rows: list[dict], baseline_label: str) -> dict:
    """The rule from the module docstring, applied to validation numbers only."""
    dkt_rows = [r for r in rows if r["model"] == "DKT"]
    base = next(r for r in dkt_rows if r["variant"] == baseline_label)
    floor = base["val"]["auc"] - AUC_TOLERANCE
    eligible = [r for r in dkt_rows
                if r["val"]["auc"] >= floor and r["val"]["curve"]["slope_ratio"] is not None]
    if not eligible:
        return {"winner": None, "reason": "no candidate kept its validation AUC within tolerance"}
    winner = min(eligible, key=lambda r: abs(1.0 - r["val"]["curve"]["slope_ratio"]))
    return {
        "winner": winner["variant"],
        "rule": f"closest validation cohort-curve slope ratio to 1.0, among candidates within "
                f"{AUC_TOLERANCE} validation AUC of the baseline ({base['val']['auc']:.4f})",
        "val_auc_floor": floor,
        "candidates_considered": len(eligible),
        "candidates_excluded_on_auc": [r["variant"] for r in dkt_rows if r["val"]["auc"] < floor],
    }


def sweep(name: str, only: list[str] | None = None, log=print) -> list[dict]:
    """`only` filters candidates by substring, for re-running one family of
    configurations on another dataset without paying for the whole sweep."""
    chosen = [(l, c) for l, c in candidates() if not only or any(o.lower() in l.lower() for o in only)]
    log(f"\n=== {name} ({len(chosen)} DKT candidates) ===")
    ex = Experiment(name)
    rows = [evaluate_bkt(ex, "per-skill BKT (EM)", False, log)]
    if "t_days" in ex.df.columns:
        rows.append(evaluate_bkt(ex, "BKT with forgetting", True, log))
    for label, cfg in chosen:
        rows.append(evaluate_dkt(ex, label, cfg, log))
    return rows


def dose_response(runs: list[dict]) -> list[dict]:
    """The reconstruction term's effect, per dataset, as its strength rises.

    Separated out because it is the finding: lambda_r is a dose with a
    monotone effect on the curve, while the waviness terms are not."""
    out = []
    for r in runs:
        if r["model"] != "DKT" or r["config"].get("lambda_w1") or r["config"].get("lambda_w2"):
            continue
        m = r.get("mechanism") or {}
        out.append({
            "dataset": r["dataset"], "variant": r["variant"],
            "lambda_r": r["config"]["lambda_r"],
            "test_slope_ratio": r["test"]["curve"]["slope_ratio"],
            "test_auc": r["test"]["auc"], "test_log_loss": r["test"]["log_loss"],
            "evidence_separation": m.get("separation"),
            "reconstruction_error": m.get("reconstruction_error"),
            "w1": m.get("w1"),
        })
    return sorted(out, key=lambda r: (r["dataset"], r["lambda_r"]))


def confirm(name: str, label: str, cfg: dkt.DKTConfig, log=print) -> list[dict]:
    """Run only the sweep's winner, plus the references, on another dataset.

    A fix chosen on one dataset and never checked elsewhere is a fix to that
    dataset."""
    log(f"\n=== {name} (confirming '{label}') ===")
    ex = Experiment(name)
    rows = [evaluate_bkt(ex, "per-skill BKT (EM)", False, log)]
    rows.append(evaluate_dkt(ex, "Lab 3 baseline (no regularisation)", BASELINE, log))
    rows.append(evaluate_dkt(ex, label, cfg, log))
    return rows


def save(state: dict) -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(state, f, indent=1)
        f.write("\n")
    print(f"\nwrote {OUT}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--datasets", nargs="*", default=None,
                   help="datasets to sweep in full (default: the sweep dataset only)")
    p.add_argument("--confirm", nargs="*", default=None,
                   help="datasets to re-run the winner on (default: the other two)")
    p.add_argument("--confirm-only", action="store_true")
    p.add_argument("--variants", nargs="*", default=None,
                   help="substrings selecting which candidates to run (default: all)")
    p.add_argument("--append", action="store_true",
                   help="add these runs to an existing results file instead of starting over")
    a = p.parse_args()

    import torch
    torch.set_num_threads(max(1, os.cpu_count() or 1))

    state = json.load(open(OUT)) if os.path.exists(OUT) and (a.confirm_only or a.append) else {
        "question": "DKT's aggregate metrics are fine and its learning curve is too shallow. "
                    "Does the published DKT+ remedy fix the curve when it is judged on the curve?",
        "selection_rule": f"closest validation cohort-curve slope ratio to 1.0, among candidates "
                          f"within {AUC_TOLERANCE} validation AUC of the Lab 3 baseline",
        "protocol": "choices on validation; each candidate touches the test split once after "
                    "training; every variant run is reported, including the ones that do not help",
        "cohort_min_opportunities": COHORT_MIN_OPPORTUNITIES,
        "runs": [], "selection": {}, "confirmation": [],
    }

    if not a.confirm_only:
        for name in (a.datasets or [SWEEP_DATASET]):
            state["runs"] += sweep(name, a.variants)
        if not a.append:
            state["selection"] = select(state["runs"], "Lab 3 baseline (no regularisation)")
            print(f"\nselected: {state['selection'].get('winner')!r}")
        state["dose_response"] = dose_response(state["runs"])
        save(state)

    winner = state["selection"].get("winner")
    if winner:
        cfg = dkt.DKTConfig(**next(r for r in state["runs"]
                                   if r["model"] == "DKT" and r["variant"] == winner)["config"])
        for name in (a.confirm if a.confirm is not None else CONFIRM_DATASETS):
            state["confirmation"] += confirm(name, winner, cfg)
        save(state)


if __name__ == "__main__":
    main()
