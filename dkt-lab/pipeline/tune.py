"""Lab 6: try to make DKT beat a tuned BKT on the Synaptic simulator data, or
show clearly why it doesn't.

Rules (enforced here, reported in results/dkt_tuning.json):
  * Every choice is made on the validation split. Each final model touches the
    test split exactly once, after training; test numbers never feed a choice.
  * Same split (split.py, seed 42) and same training seed (42) for every variant.
  * Every variant that is run is reported, including the ones that don't help.

Phases (run in order; each phase starts from the best validation config so far):
  A  training: early stopping on val AUC (<= 30 epochs), hidden {50,100,200} x
     lr {1e-3,3e-3} at dropout 0.2, then dropout {0.35, 0.5} at the best pair
  B  time features (only datasets with timestamps): input step, upcoming
     attempt (output layer), both
  C  DKT+ regularisation: (lambda_r, lambda_w1, lambda_w2) = (0.1, 0.003, 3.0)
     and a weaker (0.1, 0.003, 0.3) / reconstruction-only (0.1, 0, 0)
  D  data volume: simulator with 1,000 / 3,000 / 5,000 learners, BKT and DKT
  E  fair baselines alongside: per-skill BKT, BKT with forgetting (p_forget),
     the app's live BKT and the simulator's ground-truth ceiling (references)

Usage: python tune.py [--phases ABCDE] [--dataset synaptic_sim]
"""
from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import replace

import numpy as np
import pandas as pd
import torch

import dkt
import run
from datasets import prepare_synaptic_sim, DATA_DIR
from evaluate import scores
from split import split_dataset

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "results", "dkt_tuning.json")
CKPT_DIR = os.path.join(DATA_DIR, "tuning")
MAX_EPOCHS = 30
PATIENCE = 3


class Experiment:
    def __init__(self, name: str):
        self.name = name
        self.df, self.splits, self.prov, _ = run.load(name)
        self.skills = sorted(self.df["skill_id"].unique())
        self.index = {s: i for i, s in enumerate(self.skills)}
        self.has_time = "t_days" in self.df.columns
        self.seqs = {k: dkt.build_sequences(self.df[self.df["split"] == k], self.index, with_time=self.has_time)
                     for k in ("train", "val", "test")}
        # Evaluation rows per split: every interaction except each student's first.
        self.rows = {k: np.concatenate([s.rows[1:] for s in v]) for k, v in self.seqs.items()}
        self.y = {k: self.df.loc[r, "correct"].to_numpy() for k, r in self.rows.items()}

    def score(self, split: str, preds: pd.Series) -> dict:
        return scores(self.y[split], preds.loc[self.rows[split]].to_numpy())


def dkt_variant(ex: Experiment, label: str, phase: str, cfg: dkt.DKTConfig, log) -> dict:
    t0 = time.time()
    model, hist = dkt.train(ex.seqs["train"], ex.seqs["val"], len(ex.skills), cfg, log=lambda m: None)
    secs = time.time() - t0
    best_epoch = max(hist, key=lambda e: e["val_auc"])["epoch"]
    val = ex.score("val", run.dkt_predict_rows(model, ex.seqs["val"], cfg))
    test = ex.score("test", run.dkt_predict_rows(model, ex.seqs["test"], cfg))   # touched once
    os.makedirs(CKPT_DIR, exist_ok=True)
    ckpt = os.path.join(CKPT_DIR, f"{ex.name}__{label.replace(' ', '_').replace('/', '-')}.pt")
    torch.save({"state_dict": model.state_dict(), "skills": ex.skills, "config": cfg.to_dict()}, ckpt)
    r = {"dataset": ex.name, "phase": phase, "model": "DKT", "variant": label, "config": cfg.to_dict(),
         "val_auc": val["auc"], "val_log_loss": val["log_loss"],
         "test_auc": test["auc"], "test_log_loss": test["log_loss"], "test_rmse": test["rmse"],
         "test_accuracy": test["accuracy"], "n_test": test["n"],
         "epochs_run": len(hist), "best_epoch": best_epoch, "train_seconds": round(secs, 1),
         "history": hist, "checkpoint": os.path.relpath(ckpt, HERE)}
    log(f"  [{phase}] {label:<44} val {val['auc']:.4f}  test {test['auc']:.4f}  ll {test['log_loss']:.4f}  "
        f"{len(hist)} ep  {secs:.0f}s")
    return r


def bkt_variant(ex: Experiment, label: str, phase: str, forgetting: bool, log) -> dict:
    t0 = time.time()
    params = run.fit_bkt(ex.df[ex.df["split"] == "train"], ex.skills, forgetting=forgetting)
    secs = time.time() - t0
    out = {}
    for split in ("val", "test"):
        part = ex.df[ex.df["split"] == split]
        out[split] = ex.score(split, run.bkt_predict_rows(part, params))
    log(f"  [{phase}] {label:<44} val {out['val']['auc']:.4f}  test {out['test']['auc']:.4f}  ll {out['test']['log_loss']:.4f}  {secs:.0f}s")
    forget = [p["p_forget"] for p in params.values() if not p.get("default")]
    return {"dataset": ex.name, "phase": phase, "model": "BKT", "variant": label, "config": {"forgetting": forgetting},
            "val_auc": out["val"]["auc"], "val_log_loss": out["val"]["log_loss"],
            "test_auc": out["test"]["auc"], "test_log_loss": out["test"]["log_loss"], "test_rmse": out["test"]["rmse"],
            "test_accuracy": out["test"]["accuracy"], "n_test": out["test"]["n"], "train_seconds": round(secs, 1),
            "median_p_forget": float(np.median(forget)) if forgetting and forget else None}


def reference_rows(ex: Experiment, log) -> list[dict]:
    """The app's live BKT and the simulator's (approximate) ground truth, on the
    same test rows. References only: not candidates, not tuned."""
    raw_path = os.path.join(DATA_DIR, "raw", f"synaptic_sim_{ex.prov.get('learners', 1000)}", "sm2_events.csv")
    if not os.path.exists(raw_path):
        return []
    raw = pd.read_csv(raw_path, usecols=["student_id", "timestamp", "true_recall", "bkt_p_correct"], dtype={"student_id": str})
    raw = raw.sort_values(["student_id", "timestamp"], kind="stable")
    raw["order"] = raw.groupby("student_id").cumcount()
    m = ex.df[["student_id", "order"]].merge(raw, on=["student_id", "order"], how="left")
    m.index = ex.df.index
    out = []
    for label, series in (("Synaptic live BKT (app engine, global params)", m["bkt_p_correct"]),
                          ("Ground-truth ceiling (simulator true recall, approx.)", m["true_recall"] * 0.9 + (1 - m["true_recall"]) * 0.22)):
        s = {k: ex.score(k, series) for k in ("val", "test")}
        log(f"  [ref] {label:<46} val {s['val']['auc']:.4f}  test {s['test']['auc']:.4f}")
        out.append({"dataset": ex.name, "phase": "E", "model": "reference", "variant": label, "config": {},
                    "val_auc": s["val"]["auc"], "val_log_loss": s["val"]["log_loss"], "test_auc": s["test"]["auc"],
                    "test_log_loss": s["test"]["log_loss"], "test_rmse": s["test"]["rmse"], "test_accuracy": s["test"]["accuracy"],
                    "n_test": s["test"]["n"], "train_seconds": 0.0})
    return out


def best(rows: list[dict], model="DKT") -> dict:
    """Selection uses validation AUC only."""
    return max((r for r in rows if r["model"] == model), key=lambda r: r["val_auc"])


def save(state: dict) -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(state, f, indent=1)
        f.write("\n")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--phases", default="ABCDE")
    p.add_argument("--dataset", default="synaptic_sim")
    a = p.parse_args()
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    state = json.load(open(OUT)) if os.path.exists(OUT) else {"runs": []}
    state.update({"dataset": a.dataset, "rules": [
        "Selection on validation AUC only; each final model is scored on the test split once.",
        "Same split (seed 42) and same training seed (42) for every variant.",
        "Every variant run is reported, including those that did not help."]})
    runs = state["runs"]
    log = print

    def add(r):
        runs[:] = [x for x in runs if not (x["dataset"] == r["dataset"] and x["phase"] == r["phase"] and x["variant"] == r["variant"])] + [r]
        save(state)

    ex = Experiment(a.dataset)
    print(f"{a.dataset}: {len(ex.df)} rows, {len(ex.skills)} skills, time features: {ex.has_time}")
    base = dkt.DKTConfig(hidden_size=100, lr=1e-3, batch_size=32, epochs=MAX_EPOCHS, early_stopping=True, patience=PATIENCE)

    if "E" in a.phases:
        add(bkt_variant(ex, "Per-skill BKT (EM)", "E", False, log))
        add(bkt_variant(ex, "BKT with forgetting (EM, p_forget)", "E", True, log))
        for r in reference_rows(ex, log):
            add(r)

    if "A" in a.phases:
        add(dkt_variant(ex, "Lab 3 baseline (h100, lr1e-3, 10 epochs, no ES)", "A",
                        dkt.DKTConfig(hidden_size=100, lr=1e-3, batch_size=32, epochs=10), log))
        for h in (50, 100, 200):
            for lr in (1e-3, 3e-3):
                add(dkt_variant(ex, f"ES, h{h}, lr{lr:g}, dropout 0.2", "A", replace(base, hidden_size=h, lr=lr, dropout=0.2), log))
        b = best([r for r in runs if r["dataset"] == ex.name and r["phase"] == "A"])
        for dr in (0.35, 0.5):
            cfg = dkt.DKTConfig(**(b["config"] | {"dropout": dr}))
            add(dkt_variant(ex, f"ES, h{cfg.hidden_size}, lr{cfg.lr:g}, dropout {dr}", "A", cfg, log))

    def best_so_far():
        return best([r for r in runs if r["dataset"] == ex.name and r["model"] == "DKT" and r["phase"] in "ABC"])

    if "B" in a.phases and ex.has_time:
        cfg0 = dkt.DKTConfig(**best_so_far()["config"])
        for label, it, ot in (("time features on input step", True, False),
                              ("time features of upcoming attempt (output)", False, True),
                              ("time features on input + upcoming attempt", True, True)):
            add(dkt_variant(ex, f"best A + {label}", "B", replace(cfg0, input_time=it, output_time=ot), log))

    if "C" in a.phases:
        cfg0 = dkt.DKTConfig(**best_so_far()["config"])
        for lr_, w1, w2 in ((0.1, 0.003, 3.0), (0.1, 0.003, 0.3), (0.1, 0.0, 0.0)):
            add(dkt_variant(ex, f"best so far + DKT+ (r={lr_}, w1={w1}, w2={w2})", "C",
                            replace(cfg0, lambda_r=lr_, lambda_w1=w1, lambda_w2=w2), log))

    if "D" in a.phases and a.dataset == "synaptic_sim":
        best_onehot = best([r for r in runs if r["dataset"] == ex.name and r["phase"] == "A"])
        best_all = best_so_far()
        for n in (1000, 3000, 5000):
            name = "synaptic_sim" if n == 1000 else f"synaptic_sim_{n}"
            if n != 1000 and not os.path.exists(os.path.join(DATA_DIR, name, "splits.json")):
                prepare_synaptic_sim(n, name)
                split_dataset(name)
            exn = ex if n == 1000 else Experiment(name)
            add(bkt_variant(exn, f"Per-skill BKT · {n} learners", "D", False, log))
            add(bkt_variant(exn, f"BKT with forgetting · {n} learners", "D", True, log))
            add(dkt_variant(exn, f"DKT best one-hot (phase A) · {n} learners", "D", dkt.DKTConfig(**best_onehot["config"]), log))
            if best_all["variant"] != best_onehot["variant"]:
                add(dkt_variant(exn, f"DKT best overall · {n} learners", "D", dkt.DKTConfig(**best_all["config"]), log))

    summarise(state)
    save(state)


def summarise(state: dict) -> None:
    """Final ranking on the 1,000-learner data: best DKT and best BKT, each chosen
    on validation, compared on test."""
    rows = [r for r in state["runs"] if r["dataset"] == state["dataset"] and r["phase"] in "ABCE"]
    if not any(r["model"] == "DKT" for r in rows) or not any(r["model"] == "BKT" for r in rows):
        return
    d, b = best(rows, "DKT"), best(rows, "BKT")
    gain = d["test_auc"] - b["test_auc"]
    state["final"] = {
        "best_dkt": d["variant"], "best_bkt": b["variant"],
        "dkt_test_auc": d["test_auc"], "bkt_test_auc": b["test_auc"], "test_auc_gain": gain,
        "dkt_test_log_loss": d["test_log_loss"], "bkt_test_log_loss": b["test_log_loss"],
        "meets_gate": bool(gain >= 0.02 and d["test_log_loss"] <= b["test_log_loss"]),
        "gate": "DKT test AUC >= tuned BKT + 0.02 and DKT log-loss <= BKT log-loss (src/lib/dkt/compare.ts)",
    }


if __name__ == "__main__":
    main()
