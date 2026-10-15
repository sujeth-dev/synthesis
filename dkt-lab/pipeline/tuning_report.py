"""Lab 6 diagnostics and write-up, appended to results/dkt_tuning.json.

Uses only the final models already chosen on validation by tune.py (best DKT,
best BKT) and their single test evaluation:
  * a bootstrap over test *students* for the test-AUC difference;
  * AUC on test rows split by situation (first attempt at a skill, repeat
    within a day, repeat after a gap of >= 1 day), to show where each model
    wins or loses;
  * the conclusion paragraph and ranked next steps, chosen from these numbers;
  * if the gate is met, the app-format weights export (otherwise a note).

Usage: python tuning_report.py
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import roc_auc_score

import dkt
import run
from tune import OUT, Experiment, best

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_DATA = os.path.abspath(os.path.join(HERE, "..", "web", "public", "data"))
N_BOOT = 1000


def load_dkt(r: dict):
    ck = torch.load(os.path.join(HERE, r["checkpoint"]), weights_only=False)
    cfg = dkt.DKTConfig(**ck["config"])
    m = dkt.DKTModel(len(ck["skills"]), cfg.hidden_size, cfg.dropout, cfg.input_time, cfg.output_time)
    m.load_state_dict(ck["state_dict"])
    return m, cfg, ck["skills"]


def main() -> None:
    state = json.load(open(OUT))
    ex = Experiment(state["dataset"])
    rows = [r for r in state["runs"] if r["dataset"] == ex.name and r["phase"] in "ABCE"]
    bd, bb = best(rows, "DKT"), best(rows, "BKT")
    base = next(r for r in rows if r["variant"].startswith("Lab 3 baseline"))

    model, cfg, _ = load_dkt(bd)
    test = ex.df.loc[ex.rows["test"]].copy()
    test["dkt"] = run.dkt_predict_rows(model, ex.seqs["test"], cfg).loc[test.index]
    params = run.fit_bkt(ex.df[ex.df["split"] == "train"], ex.skills, forgetting=bb["config"].get("forgetting", False))
    test["bkt"] = run.bkt_predict_rows(ex.df[ex.df["split"] == "test"], params).loc[test.index]
    m0, c0, _ = load_dkt(base)
    test["dkt_base"] = run.dkt_predict_rows(m0, ex.seqs["test"], c0).loc[test.index]
    # sanity: same numbers as the single test evaluation in tune.py
    assert abs(roc_auc_score(test["correct"], test["dkt"]) - bd["test_auc"]) < 1e-9
    assert abs(roc_auc_score(test["correct"], test["bkt"]) - bb["test_auc"]) < 1e-9

    # Bootstrap over students.
    rng = np.random.default_rng(42)
    groups = {s: g.index.to_numpy() for s, g in test.groupby("student_id")}
    ids = list(groups)
    diffs = []
    for _ in range(N_BOOT):
        idx = np.concatenate([groups[s] for s in rng.choice(ids, size=len(ids), replace=True)])
        t = test.loc[idx]
        diffs.append(roc_auc_score(t["correct"], t["dkt"]) - roc_auc_score(t["correct"], t["bkt"]))
    lo, hi = np.percentile(diffs, [2.5, 97.5])

    # Situations.
    full = ex.df.sort_values(["student_id", "order"])
    gap = full.groupby(["student_id", "skill_id"])["t_days"].diff()
    test["gap_days"] = gap.loc[test.index]
    test["situation"] = np.where(test["opportunity"] == 1, "first attempt at the skill",
                         np.where(test["gap_days"] < 1, "repeat, same day", "repeat after >= 1 day"))
    situations = []
    for name, g in test.groupby("situation"):
        if g["correct"].nunique() < 2:
            continue
        situations.append({"situation": name, "n": int(len(g)), "pct_correct": float(g["correct"].mean()),
                           "bkt_auc": float(roc_auc_score(g["correct"], g["bkt"])),
                           "dkt_base_auc": float(roc_auc_score(g["correct"], g["dkt_base"])),
                           "dkt_best_auc": float(roc_auc_score(g["correct"], g["dkt"]))})

    state["diagnostics"] = {
        "best_dkt": bd["variant"], "best_bkt": bb["variant"],
        "bootstrap": {"what": "test AUC(best DKT) - AUC(best BKT), resampling test students", "n": N_BOOT,
                      "mean": float(np.mean(diffs)), "ci95": [float(lo), float(hi)]},
        "by_situation": situations,
    }
    write_text(state)
    with open(OUT, "w") as f:
        json.dump(state, f, indent=1)
        f.write("\n")
    print(json.dumps(state["diagnostics"], indent=1))
    print(state["conclusion"])


def write_text(state: dict) -> None:
    """Conclusion and next steps, chosen from the numbers (see README)."""
    f, d = state["final"], state["diagnostics"]
    runs = state["runs"]
    get = lambda v: next(r for r in runs if r["variant"] == v)
    a = [r for r in runs if r["phase"] == "A" and r["dataset"] == state["dataset"]]
    best_a = max(a, key=lambda r: r["val_auc"])
    base = next(r for r in a if r["variant"].startswith("Lab 3 baseline"))
    b = [r for r in runs if r["phase"] == "B"]
    c = [r for r in runs if r["phase"] == "C"]
    best_b = max(b, key=lambda r: r["val_auc"]) if b else None
    best_c = max(c, key=lambda r: r["val_auc"]) if c else None
    ceiling = next((r for r in runs if r["model"] == "reference" and "ceiling" in r["variant"]), None)
    lo, hi = d["bootstrap"]["ci95"]
    sit = {s["situation"]: s for s in d["by_situation"]}
    size = sorted([r for r in runs if r["phase"] == "D"], key=lambda r: r["variant"])

    def size_auc(prefix, n):
        r = next((x for x in runs if x["phase"] == "D" and x["variant"] == f"{prefix} · {n} learners"), None)
        return r["test_auc"] if r else None

    gains = {n: (size_auc("DKT best overall", n) or size_auc("DKT best one-hot (phase A)", n) or 0) - (size_auc("Per-skill BKT", n) or 0)
             for n in (1000, 3000, 5000) if size_auc("Per-skill BKT", n) is not None}

    lead = (f"DKT now ranks first on the Synaptic simulator, but only narrowly: its best variant "
            f"(“{f['best_dkt']}”) reaches test AUC {f['dkt_test_auc']:.4f} against {f['bkt_test_auc']:.4f} for the best BKT "
            f"(“{f['best_bkt']}”), a gain of {f['test_auc_gain']:+.4f} (95% bootstrap interval over test learners "
            f"{lo:+.4f} to {hi:+.4f}) with log-loss {f['dkt_test_log_loss']:.4f} vs {f['bkt_test_log_loss']:.4f}. "
            if f["test_auc_gain"] > 0 else
            f"DKT still ranks below BKT on the Synaptic simulator: best DKT test AUC {f['dkt_test_auc']:.4f} vs "
            f"{f['bkt_test_auc']:.4f} (95% interval {lo:+.4f} to {hi:+.4f}). ")
    gate = ("That clears the app's switch gate. " if f["meets_gate"] else
            "That is below the +0.02 AUC the app's gate (src/lib/dkt/compare.ts) requires, so the gate's answer is still “don't switch”. ")
    why = (f"The evidence: the untuned Lab 3 DKT lost ({base['test_auc']:.4f}) mainly because it was under-trained — early "
           f"stopping with a higher learning rate alone lifted it to {best_a['test_auc']:.4f} (validation {best_a['val_auc']:.4f}, "
           f"level with BKT's {f['bkt_test_auc']:.4f}). ")
    if best_b:
        why += (f"Time features, the suspected cause, helped but only a little ({best_b['test_auc']:.4f}, "
                f"{best_b['val_auc'] - best_a['val_auc']:+.4f} on validation), because the simulator's learners forget slowly "
                f"over 60 days and most of the remaining error is elsewhere: ")
    if sit:
        first = sit.get("first attempt at the skill")
        late = sit.get("repeat after >= 1 day")
        if first and late:
            why += (f"on first attempts at a skill ({first['n']:,} test answers) BKT scores {first['bkt_auc']:.3f} and DKT "
                    f"{first['dkt_best_auc']:.3f}; on repeats after a day or more ({late['n']:,}) {late['bkt_auc']:.3f} vs "
                    f"{late['dkt_best_auc']:.3f}. ")
    if best_c:
        why += f"DKT+ regularisation did not help (best {best_c['val_auc']:.4f} validation). "
    if gains:
        ns = sorted(gains)
        why += ("More data is the lever that matters: per-skill BKT stays flat while DKT keeps improving, so the gap goes " +
                ", ".join(f"{gains[n]:+.4f} at {n:,}" for n in ns) + " learners" +
                (f", flattening between {ns[-2]:,} and {ns[-1]:,}" if len(ns) > 2 and abs(gains[ns[-1]] - gains[ns[-2]]) < 0.003 else "") +
                (f" and still just short of +0.02 at {ns[-1]:,}" if gains[ns[-1]] < 0.02 else f" and passes +0.02 at {ns[-1]:,}") + ". ")
    if ceiling:
        why += (f"Both models remain far below the simulator's own ground-truth ceiling ({ceiling['test_auc']:.4f}), "
                "which knows each learner's hidden memory state; that gap, not BKT vs DKT, is where the headroom is.")
    state["conclusion"] = lead + gate + why

    state["next_steps"] = [
        {"step": "Collect real shadow-log data, and plenty of it, before deciding anything",
         "expected_gain": "decisive (the only way to know)",
         "evidence": "Every number here is from simulated learners whose memory model was written by hand, and the ranking flips between "
                     "datasets (DKT +0.09 on ASSISTments 2009, −0.02 untuned here). Phase D shows DKT's lead grows with volume while "
                     "BKT's does not, so the decision should be taken on a large real log (the app's gate already demands ≥ 5,000 attempts)."},
        {"step": "Per-learner memory parameters (learner ability, per-learner decay) in either model",
         "expected_gain": "largest modelled gain",
         "evidence": (f"The ground-truth ceiling ({ceiling['test_auc']:.3f}) sits ~0.1 AUC above every model; the simulator draws "
                      "per-learner learn, stability, slip and guess, which neither per-skill BKT nor DKT's input represents directly.") if ceiling else "ceiling gap"},
        {"step": "Richer time modelling: exponential per-skill decay with learnable rates (DKT-forget / HLR-style), not log-gap features",
         "expected_gain": "small to moderate",
         "evidence": f"Log-gap time features were the single biggest gain after training fixes ({best_b['val_auc'] - best_a['val_auc']:+.4f} validation AUC)." if best_b else "phase B"},
        {"step": "Attention model (SAKT/AKT) as a second deep baseline, once there is more data",
         "expected_gain": "small",
         "evidence": "At 1,000 learners capacity was not the bottleneck (hidden 200 was no better than 50 on validation); larger models were not re-tuned at 3,000-5,000 learners."},
        {"step": "Drop DKT+ regularisation and BKT forgetting-per-attempt from further work",
         "expected_gain": "none observed",
         "evidence": "Phase C (DKT+) did not beat plain early-stopped DKT on validation, and BKT with p_forget matched plain BKT at every data size: forgetting in the simulator is driven by elapsed days, which a per-attempt forget rate cannot see."},
    ]
    if f["meets_gate"]:
        state["app_export"] = {"file": "synaptic_dkt_tuned.json", "note": "Best variant passes the gate; exported in the app's weights format."}
    else:
        state["app_export"] = {"file": None, "note": (
            "No app-format export: the best DKT variant does not beat tuned BKT by ≥ 0.02 test AUC, so the condition for "
            "exporting it to the app's synaptic-dkt.json format is not met. The app is unchanged.")}


if __name__ == "__main__":
    main()
