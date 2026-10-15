"""Fit BKT and DKT on one dataset and evaluate both on the same held-out rows.

Adapted from Research/dkt/train_synaptic.py's flow (split by student -> per-skill
EM BKT on train -> DKT on train, monitored on val -> score both on identical
test rows), generalised to every dataset in the lab.

Evaluated rows: every test-split interaction except each student's first
(DKT has no prior state there). BKT and DKT are scored on exactly these rows.

Writes:
    results/<name>.json             metrics, curves, heatmap, samples, bkt_params
    data/<name>/dkt_model.pt        checkpoint (gitignored)
    data/<name>/dkt_weights.json    browser weights (copied to the web by export.py)
    data/<name>/predictions.npz     aligned test predictions (gitignored)

Usage: python run.py [name ...] [--epochs N]
"""
from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
import pandas as pd
import torch

import bkt
import dkt
from evaluate import per_skill_auc, roc_points, scores
from stats import DATA_DIR, update_results

N_SAMPLES = 20
SAMPLE_MAX_STEPS = 60
HEATMAP_SKILLS = 20
CURVE_MAX_OPP = 20
BASELINE = dkt.DKTConfig(hidden_size=100, lr=1e-3, batch_size=32, epochs=10)


def load(name: str):
    df = pd.read_csv(os.path.join(DATA_DIR, name, "sequences.csv"), dtype={"student_id": str, "skill_id": str})
    df = df.sort_values(["student_id", "order"], kind="stable").reset_index(drop=True)
    with open(os.path.join(DATA_DIR, name, "splits.json")) as f:
        splits = json.load(f)
    with open(os.path.join(DATA_DIR, name, "provenance.json")) as f:
        prov = json.load(f)
    with open(os.path.join(DATA_DIR, name, "skills.json")) as f:
        skill_meta = json.load(f)
    df["split"] = df["student_id"].map({s: k for k, ids in splits.items() for s in ids})
    # Opportunity number: n-th attempt of this student on this skill (1-based).
    df["opportunity"] = df.groupby(["student_id", "skill_id"]).cumcount() + 1
    return df, splits, prov, skill_meta


def fit_bkt(train_df: pd.DataFrame, skills: list[str], forgetting: bool = False) -> dict:
    params = {}
    grouped = {k: g for k, g in train_df.groupby("skill_id")}
    for s in skills:
        g = grouped.get(s)
        seqs = [] if g is None else [x["correct"].to_numpy() for _, x in g.groupby("student_id")]
        if len(seqs) >= bkt.MIN_TRAIN_SEQUENCES:
            params[s] = bkt.fit_skill_bkt(seqs, forgetting=forgetting)
        else:
            params[s] = dict(bkt.DEFAULT_PARAMS) | {"n_train_sequences": len(seqs), "em_iters": 0,
                                                     "log_likelihood": None, "default": True}
    return params


def bkt_predict_rows(df: pd.DataFrame, params: dict) -> pd.Series:
    """Forward-only BKT P(correct) for every row of df (per student x skill)."""
    out = pd.Series(np.nan, index=df.index)
    for (_, s), g in df.groupby(["student_id", "skill_id"], sort=False):
        out.loc[g.index] = bkt.predict_sequence(g["correct"].to_numpy(), params[s])
    return out


def dkt_predict_rows(model, seqs, cfg) -> pd.Series:
    preds = dkt.predict(model, seqs, cfg)
    idx = np.concatenate([s.rows[1:] for s in seqs])
    return pd.Series(np.concatenate(preds), index=idx)


def learning_curves(ev: pd.DataFrame) -> dict:
    rows = []
    for n in range(1, CURVE_MAX_OPP + 1):
        m = ev[ev["opportunity"] == n]
        if len(m) < 30:
            break
        rows.append({"opportunity": n, "n": int(len(m)), "actual": float(m["correct"].mean()),
                     "bkt": float(m["bkt"].mean()), "dkt": float(m["dkt"].mean())})
    return {"max_opportunity": CURVE_MAX_OPP, "min_rows": 30, "points": rows}


def pick_samples(df: pd.DataFrame, test_ids: list[str]) -> list[str]:
    lengths = df[df["split"] == "test"].groupby("student_id").size()
    eligible = sorted(s for s in test_ids if lengths.get(s, 0) >= 15)
    rng = np.random.default_rng(42)
    return sorted(rng.choice(eligible, size=min(N_SAMPLES, len(eligible)), replace=False).tolist())


def run(name: str, cfg: dkt.DKTConfig = BASELINE) -> dict:
    t_start = time.time()
    df, splits, prov, skill_meta = load(name)
    skills = sorted(df["skill_id"].unique())
    skill_index = {s: i for i, s in enumerate(skills)}
    print(f"[{name}] {len(df)} rows, {len(skills)} skills")

    # BKT
    t0 = time.time()
    params = fit_bkt(df[df["split"] == "train"], skills)
    bkt_seconds = time.time() - t0
    test_df = df[df["split"] == "test"]
    bkt_test = bkt_predict_rows(test_df, params)
    print(f"[{name}] BKT fitted in {bkt_seconds:.1f}s")

    # DKT
    seqs = {k: dkt.build_sequences(df[df["split"] == k], skill_index) for k in ("train", "val", "test")}
    t0 = time.time()
    model, history = dkt.train(seqs["train"], seqs["val"], len(skills), cfg)
    dkt_seconds = time.time() - t0
    dkt_test = dkt_predict_rows(model, seqs["test"], cfg)

    # Same rows for both models.
    ev = df.loc[dkt_test.index].copy()
    ev["dkt"] = dkt_test
    ev["bkt"] = bkt_test.loc[ev.index]
    assert ev["bkt"].notna().all() and ev["dkt"].notna().all()
    y = ev["correct"].to_numpy()
    metrics = {
        "protocol": "next-step prediction on held-out test students; every interaction except each student's first; identical rows for both models",
        "bkt": scores(y, ev["bkt"].to_numpy()) | {"fit_seconds": round(bkt_seconds, 1)},
        "dkt": scores(y, ev["dkt"].to_numpy()) | {"train_seconds": round(dkt_seconds, 1)},
        "roc": {"bkt": roc_points(y, ev["bkt"].to_numpy()), "dkt": roc_points(y, ev["dkt"].to_numpy())},
        "per_skill_auc": [r | {"label": skill_meta.get(r["skill_id"], {}).get("label", r["skill_id"])}
                          for r in per_skill_auc(ev["skill_id"].to_numpy(), y,
                                                 {"bkt": ev["bkt"].to_numpy(), "dkt": ev["dkt"].to_numpy()})],
        "dkt_config": cfg.to_dict(),
        "dkt_history": history,
        "test_students": len(splits["test"]),
    }
    print(f"[{name}] BKT AUC {metrics['bkt']['auc']:.4f}  DKT AUC {metrics['dkt']['auc']:.4f}  (n={len(ev)})")

    # Samples, heatmap, BKT params for the website.
    sample_ids = pick_samples(df, splits["test"])
    by_student = {s: g for s, g in test_df.groupby("student_id")}
    top = df["skill_id"].value_counts()
    heat_skills = sorted(top.index[:HEATMAP_SKILLS], key=lambda s: skill_index[s])
    samples, heat_rows = [], []
    for sid in sample_ids:
        g = by_student[sid]
        steps = [[str(s), int(c)] for s, c in zip(g["skill_id"], g["correct"])]
        samples.append({"student_id": sid, "length": len(steps), "steps": steps[:SAMPLE_MAX_STEPS]})
        hist = [(skill_index[s], c) for s, c in steps]
        dkt_all = dkt.torch_predict_all(model, hist)
        beliefs = {}
        for s, c in steps:
            b = beliefs.get(s, params[s]["p_init"])
            _, beliefs[s] = bkt.bkt_step(b, c, params[s])
        heat_rows.append({
            "student_id": sid, "length": len(steps),
            "bkt": [round(bkt.p_correct(beliefs.get(s, params[s]["p_init"]), params[s]), 4) for s in heat_skills],
            "dkt": [round(dkt_all[skill_index[s]], 4) for s in heat_skills],
            "practised": [int(sum(1 for k, _ in steps if k == s)) for s in heat_skills],
        })
    heatmap = {"quantity": "P(correct on the next attempt) after the student's full held-out sequence",
               "skills": [{"skill_id": s, "label": skill_meta.get(s, {}).get("label", s)} for s in heat_skills],
               "students": heat_rows}
    bkt_params = {"skills": [{"skill_id": s, "label": skill_meta.get(s, {}).get("label", s),
                              **{k: round(params[s][k], 6) for k in ("p_init", "p_transit", "p_slip", "p_guess")},
                              "n_train_sequences": params[s]["n_train_sequences"],
                              "default": bool(params[s].get("default", False)),
                              **({"hidden_concept": skill_meta[s]["hidden_concept"]} if "hidden_concept" in skill_meta.get(s, {}) else {})}
                             for s in skills]}

    for key, value in (("metrics", metrics), ("curves", learning_curves(ev)), ("heatmap", heatmap),
                       ("samples", {"max_steps": SAMPLE_MAX_STEPS, "students": samples}), ("bkt_params", bkt_params)):
        update_results(name, key, value)

    d = os.path.join(DATA_DIR, name)
    torch.save({"state_dict": model.state_dict(), "skills": skills, "config": cfg.to_dict()}, os.path.join(d, "dkt_model.pt"))
    with open(os.path.join(d, "dkt_weights.json"), "w") as f:
        json.dump(dkt.weights_json(model, skills, synthetic=prov["kind"] == "synthetic"), f)
    np.savez(os.path.join(d, "predictions.npz"), rows=ev.index.to_numpy(), y=y, bkt=ev["bkt"].to_numpy(), dkt=ev["dkt"].to_numpy())
    print(f"[{name}] done in {time.time() - t_start:.0f}s; weights {os.path.getsize(os.path.join(d, 'dkt_weights.json')) / 1e6:.2f} MB")
    return metrics


def summary(names: list[str]) -> None:
    from stats import RESULTS_DIR
    rows = []
    for n in names:
        with open(os.path.join(RESULTS_DIR, f"{n}.json")) as f:
            r = json.load(f)
        if "metrics" not in r:
            continue
        m = r["metrics"]
        rows.append({"id": n, "name": r["provenance"]["name"], "kind_label": r["provenance"]["kind_label"],
                     "bkt": {k: m["bkt"][k] for k in ("auc", "log_loss", "rmse", "accuracy")},
                     "dkt": {k: m["dkt"][k] for k in ("auc", "log_loss", "rmse", "accuracy")},
                     "n": m["bkt"]["n"], "auc_gain": m["dkt"]["auc"] - m["bkt"]["auc"]})
    with open(os.path.join(RESULTS_DIR, "summary.json"), "w") as f:
        json.dump({"datasets": rows}, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("names", nargs="*", default=["assist2009", "assist2015", "synthetic5", "synaptic_sim"])
    p.add_argument("--epochs", type=int, default=BASELINE.epochs)
    a = p.parse_args()
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    cfg = dkt.DKTConfig(**(BASELINE.to_dict() | {"epochs": a.epochs}))
    for n in a.names:
        run(n, cfg)
    summary([n for n in ["assist2009", "assist2015", "synthetic5", "synaptic_sim"]
             if os.path.exists(os.path.join(DATA_DIR, "..", "results", f"{n}.json"))])
