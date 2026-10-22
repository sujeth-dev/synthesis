"""DKT-10: train DKT on Synaptic's own 120-skill space.

The ASSISTments model (train_dkt.py) knows ASSISTments' 123 skills, not
Synaptic's, so it can never be used inside the app. This script trains the
same DKTModel on interactions over Synaptic's real skill graph, with a skill
index fixed by content/graph/nodes.json (not by whatever skills happen to
appear in the data) so a trained model can later be loaded by the app.

Input: any CSV whose first columns are student_id, skill_id, correct, timestamp
  - default: the learner simulator's event log
      (npm run sim  ->  Research/sim/output/sm2_events.csv)   SYNTHETIC
  - or real data from `npm run dkt:export`
      (Research/dkt/data/synaptic_interactions.csv), once there is enough

Comparisons on held-out students (split by student, as in split.py):
  - Synaptic's live BKT  -- the app's actual estimate (bkt_p_correct column,
    simulator data only)
  - Per-skill fitted BKT -- bkt_baseline.py's EM fit on the training students
  - DKT                  -- this model
  - Oracle ceiling       -- the simulator's true P(correct) (simulator data
    only); no model can beat it, so it shows how much headroom is left.

Output:
  data/synaptic_dkt.pt                (gitignored: weights + skill index)
  results/synaptic_dkt_results.md     (committed)
  results/synaptic_dkt_results.json   (committed)

Usage: python train_synaptic.py [--input PATH] [--epochs N]
"""
import argparse
import json
import os
import time

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import log_loss, roc_auc_score

from bkt_baseline import fit_skill_bkt, predict_sequence
from split import split_students
from train_dkt import DKTModel, HIDDEN_SIZE, NUM_LAYERS, SEED, encode_batch, train
import train_dkt

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
NODES_PATH = os.path.join(REPO, "content", "graph", "nodes.json")
DEFAULT_INPUT = os.path.join(REPO, "Research", "sim", "output", "sm2_events.csv")
MODEL_PATH = os.path.join(HERE, "data", "synaptic_dkt.pt")
RESULTS_DIR = os.path.join(HERE, "results")


def curriculum_skill_index(nodes_path: str = NODES_PATH) -> dict:
    """Stable skill -> index map over every live curriculum node, in
    nodes.json order. Fixed by the curriculum, not the data, so the app and
    the model always agree on what index i means."""
    with open(nodes_path) as f:
        nodes = json.load(f)
    live = [n["id"] for n in nodes if not n.get("deprecated")]
    return {skill_id: idx for idx, skill_id in enumerate(live)}


def load_interactions(path: str, skill_index: dict) -> pd.DataFrame:
    df = pd.read_csv(path)
    unknown = sorted(set(df["skill_id"]) - set(skill_index))
    if unknown:
        raise ValueError(f"{len(unknown)} skill IDs are not in the curriculum, e.g. {unknown[:3]}")
    df["correct"] = df["correct"].astype(int)
    # Stable sort keeps file order for same-timestamp rows.
    return df.sort_values(["student_id", "timestamp"], kind="stable").reset_index(drop=True)


def sequences_for(df: pd.DataFrame, students: set, skill_index: dict) -> list:
    subset = df[df["student_id"].isin(students)]
    out = []
    for _, group in subset.groupby("student_id", sort=True):
        if len(group) >= 2:
            out.append(group)
    return out


def dkt_next_step(model: DKTModel, groups: list, skill_index: dict) -> list:
    """Forward-only next-step predictions, one student at a time. Row i of
    the returned list aligns with interaction i+1 of that student."""
    num_skills = len(skill_index)
    model.eval()
    rows = []
    with torch.no_grad():
        for group in groups:
            skills = group["skill_id"].map(skill_index).to_numpy()
            corrects = group["correct"].to_numpy()
            x, target_skill, _, mask = encode_batch([(skills, corrects)], num_skills)
            preds = torch.gather(model(x), 2, target_skill.unsqueeze(-1)).squeeze(-1)
            L = int(mask.sum().item())
            for t in range(L):
                rows.append((group.index[t + 1], float(preds[0, t].item())))
    return rows


def fitted_bkt_next_step(train_df: pd.DataFrame, test_groups: list) -> dict:
    """Per-skill EM BKT fit on training students; forward-only predictions on
    test students. Returns {row_index: predicted}."""
    params = {}
    for skill_id, skill_rows in train_df.groupby("skill_id"):
        seqs = [g["correct"].to_numpy() for _, g in skill_rows.groupby("student_id") if len(g) > 0]
        params[skill_id] = fit_skill_bkt(seqs)
    out = {}
    for group in test_groups:
        for skill_id, skill_rows in group.groupby("skill_id", sort=False):
            if skill_id not in params:
                continue
            preds = predict_sequence(skill_rows["correct"].to_numpy(), params[skill_id])
            out.update(zip(skill_rows.index, preds))
    return out


def score(actual: np.ndarray, predicted: np.ndarray) -> dict:
    p = np.clip(predicted, 1e-6, 1 - 1e-6)
    return {"auc": float(roc_auc_score(actual, p)), "log_loss": float(log_loss(actual, p)), "n": int(len(actual))}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--epochs", type=int, default=train_dkt.NUM_EPOCHS)
    parser.add_argument("--lambda-r", type=float, default=0.0,
                        help="DKT+ reconstruction weight; 0.1 is dkt-lab's growth-fidelity default")
    parser.add_argument("--early-stopping", action="store_true",
                        help=f"restore the best validation-AUC epoch (patience {train_dkt.PATIENCE})")
    args = parser.parse_args()
    if not os.path.exists(args.input):
        raise FileNotFoundError(f"{args.input} not found -- run `npm run sim` (or `npm run dkt:export`) first.")

    torch.manual_seed(SEED)
    train_dkt.NUM_EPOCHS = args.epochs
    skill_index = curriculum_skill_index()
    df = load_interactions(args.input, skill_index)
    synthetic = "true_recall" in df.columns

    splits = split_students(sorted(df["student_id"].unique().tolist()))
    train_groups = sequences_for(df, set(splits["train"]), skill_index)
    val_groups = sequences_for(df, set(splits["val"]), skill_index)
    test_groups = sequences_for(df, set(splits["test"]), skill_index)
    print(f"{len(skill_index)} curriculum skills, {len(df)} interactions; students "
          f"train={len(train_groups)} val={len(val_groups)} test={len(test_groups)}")

    to_seq = lambda groups: [(g["skill_id"].map(skill_index).to_numpy(), g["correct"].to_numpy()) for g in groups]
    model = DKTModel(len(skill_index))
    t0 = time.time()
    history = train(model, to_seq(train_groups), to_seq(val_groups), len(skill_index),
                    lambda_r=args.lambda_r, early_stopping=args.early_stopping)
    train_seconds = time.time() - t0
    # Carried into the exported weights so a shadow row can be traced back to
    # the configuration that produced the model serving it.
    training = {"lambda_r": args.lambda_r, "early_stopping": args.early_stopping,
                "epochs_budget": args.epochs, "epochs_run": len(history),
                "best_val_auc": max(h["val_auc"] for h in history)}

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "skill_index": skill_index,
                "num_skills": len(skill_index), "hidden_size": HIDDEN_SIZE, "num_layers": NUM_LAYERS,
                "training": training}, MODEL_PATH)

    # Score every model on exactly the same test rows: those DKT can predict
    # (every interaction after a student's first) that fitted BKT also covers.
    dkt_rows = dkt_next_step(model, test_groups, skill_index)
    train_df = df[df["student_id"].isin(set(splits["train"]))]
    bkt_fit = fitted_bkt_next_step(train_df, test_groups)
    rows = [(i, p) for i, p in dkt_rows if i in bkt_fit]
    idx = [i for i, _ in rows]
    actual = df.loc[idx, "correct"].to_numpy()

    results = {
        "synthetic": synthetic,
        "input": os.path.relpath(args.input, REPO),
        "skills": len(skill_index),
        "interactions": int(len(df)),
        "students": {k: len(v) for k, v in (("train", train_groups), ("val", val_groups), ("test", test_groups))},
        "epochs": args.epochs,
        "train_seconds": round(train_seconds, 1),
        "models": {
            "dkt": score(actual, np.array([p for _, p in rows])),
            "fitted_bkt": score(actual, np.array([bkt_fit[i] for i in idx])),
        },
    }
    if synthetic:
        results["models"]["live_bkt"] = score(actual, df.loc[idx, "bkt_p_correct"].to_numpy())
        # True P(correct) = R(1 - slip) + (1 - R)guess; per-learner slip/guess
        # aren't in the CSV, so use the population means from learner.ts —
        # close enough for a ceiling, and labeled as approximate.
        recall = df.loc[idx, "true_recall"].to_numpy()
        results["models"]["oracle_approx"] = score(actual, recall * 0.9 + (1 - recall) * 0.22)

    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(os.path.join(RESULTS_DIR, "synaptic_dkt_results.json"), "w") as f:
        json.dump(results, f, indent=2)
        f.write("\n")

    labels = {"oracle_approx": "Oracle ceiling (true recall, approx.)", "dkt": "DKT (LSTM, this model)",
              "fitted_bkt": "Per-skill fitted BKT (EM)", "live_bkt": "Synaptic live BKT (app engine)"}
    order = [m for m in ("oracle_approx", "dkt", "fitted_bkt", "live_bkt") if m in results["models"]]
    lines = [
        "# DKT on Synaptic's skill space (DKT-10)\n",
        ("**SYNTHETIC RESULT** -- trained and tested on simulated learners (`src/lib/sim`), "
         "not real users. It shows the pipeline works on Synaptic's 120 skills and how DKT "
         "compares against the app's BKT under a known memory model; it is not evidence "
         "about real learners.\n") if synthetic else "**Real learner data.**\n",
        f"Input `{results['input']}` -- {results['interactions']} interactions, "
        f"{results['skills']} skills, students train/val/test = "
        f"{results['students']['train']}/{results['students']['val']}/{results['students']['test']}, "
        f"{args.epochs} epochs ({results['train_seconds']}s on CPU).\n",
        "All models scored on the same held-out test rows.\n",
        "| Model | AUC | Log-loss | n |", "|---|---|---|---|",
    ]
    for m in order:
        r = results["models"][m]
        lines.append(f"| {labels[m]} | {r['auc']:.4f} | {r['log_loss']:.4f} | {r['n']} |")
    with open(os.path.join(RESULTS_DIR, "synaptic_dkt_results.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
