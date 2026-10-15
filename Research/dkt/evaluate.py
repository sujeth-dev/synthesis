"""Evaluate DKT vs. the per-skill BKT baseline on the same held-out test
split, and emit a results table + ROC plot.

Both `bkt_baseline.py` and `train_dkt.py` produce next-step test
predictions in the same shape: a list of
{student_id, skill_id, timestamp, actual, predicted}. This script:

1. Reports each model's AUC over its own full test-prediction set (the
   headline comparison -- "DKT AUC vs. BKT AUC on the held-out test
   split", per `basic-guide.md`).
2. Additionally reports AUC over the *intersection* of
   (student_id, skill_id, timestamp) keys both models produced a
   prediction for -- a stricter, row-aligned comparison. The two full
   sets differ slightly at the edges: BKT predicts every test
   interaction (using its prior even before any evidence for that
   student/skill), while DKT -- trained per-student across all skills,
   not per-skill -- has no prediction for a student's very first
   interaction overall (no prior state to condition on). Both
   conventions are standard for their respective methods; the
   intersection number controls for that difference.

No target AUC is asserted anywhere in this script -- per the plan, the
benchmark simply reports what each model achieves.

Output:
    results/auc_comparison.md
    results/roc_comparison.png
"""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import roc_auc_score, roc_curve

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
BKT_RESULTS_PATH = os.path.join(DATA_DIR, "bkt_results.json")
DKT_PREDICTIONS_PATH = os.path.join(DATA_DIR, "dkt_test_predictions.json")


def _key(row: dict) -> tuple:
    return (row["student_id"], row["skill_id"], row["timestamp"])


def load_predictions() -> tuple[list, list]:
    if not os.path.exists(BKT_RESULTS_PATH):
        raise FileNotFoundError(f"{BKT_RESULTS_PATH} not found -- run bkt_baseline.py first.")
    if not os.path.exists(DKT_PREDICTIONS_PATH):
        raise FileNotFoundError(f"{DKT_PREDICTIONS_PATH} not found -- run train_dkt.py first.")

    with open(BKT_RESULTS_PATH) as f:
        bkt = json.load(f)["test_predictions"]
    with open(DKT_PREDICTIONS_PATH) as f:
        dkt = json.load(f)

    return bkt, dkt


def auc_of(rows: list) -> tuple[float, int]:
    actual = [r["actual"] for r in rows]
    predicted = [r["predicted"] for r in rows]
    if len(set(actual)) < 2:
        return float("nan"), len(rows)
    return roc_auc_score(actual, predicted), len(rows)


def aligned_subsets(bkt_rows: list, dkt_rows: list) -> tuple[list, list]:
    bkt_by_key = {_key(r): r for r in bkt_rows}
    dkt_by_key = {_key(r): r for r in dkt_rows}
    common = sorted(set(bkt_by_key) & set(dkt_by_key))
    return [bkt_by_key[k] for k in common], [dkt_by_key[k] for k in common]


def main() -> None:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    bkt_rows, dkt_rows = load_predictions()

    bkt_auc, bkt_n = auc_of(bkt_rows)
    dkt_auc, dkt_n = auc_of(dkt_rows)

    bkt_aligned, dkt_aligned = aligned_subsets(bkt_rows, dkt_rows)
    bkt_aligned_auc, aligned_n = auc_of(bkt_aligned)
    dkt_aligned_auc, _ = auc_of(dkt_aligned)

    lines = [
        "# DKT vs. BKT baseline -- AUC comparison\n",
        "Benchmark-dataset result on ASSISTments 2009-2010 (see `README.md`);",
        "not a Synaptic-production result.\n",
        "| Model | AUC (own full test set) | n |",
        "|---|---|---|",
        f"| Per-skill BKT (EM/Baum-Welch) | {bkt_auc:.4f} | {bkt_n} |",
        f"| DKT (LSTM) | {dkt_auc:.4f} | {dkt_n} |",
        "",
        "## Row-aligned comparison",
        "Restricted to the intersection of (student_id, skill_id, timestamp)",
        "both models produced a prediction for, controlling for each method's",
        "own cold-start convention (see module docstring).\n",
        "| Model | AUC (aligned subset) | n |",
        "|---|---|---|",
        f"| Per-skill BKT | {bkt_aligned_auc:.4f} | {aligned_n} |",
        f"| DKT | {dkt_aligned_auc:.4f} | {aligned_n} |",
        "",
    ]
    report_path = os.path.join(RESULTS_DIR, "auc_comparison.md")
    with open(report_path, "w") as f:
        f.write("\n".join(lines))

    plt.figure(figsize=(6, 6))
    for name, rows in (("BKT", bkt_rows), ("DKT", dkt_rows)):
        actual = [r["actual"] for r in rows]
        predicted = [r["predicted"] for r in rows]
        if len(set(actual)) < 2:
            continue
        fpr, tpr, _ = roc_curve(actual, predicted)
        auc = roc_auc_score(actual, predicted)
        plt.plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})")
    plt.plot([0, 1], [0, 1], linestyle="--", color="gray", label="chance")
    plt.xlabel("False Positive Rate")
    plt.ylabel("True Positive Rate")
    plt.title("DKT vs. BKT -- next-step prediction ROC (ASSISTments 2009-2010 test split)")
    plt.legend()
    plt.tight_layout()
    plot_path = os.path.join(RESULTS_DIR, "roc_comparison.png")
    plt.savefig(plot_path, dpi=150)

    print(f"BKT AUC: {bkt_auc:.4f} (n={bkt_n})")
    print(f"DKT AUC: {dkt_auc:.4f} (n={dkt_n})")
    print(f"Aligned subset (n={aligned_n}): BKT={bkt_aligned_auc:.4f} DKT={dkt_aligned_auc:.4f}")
    print(f"Wrote {report_path}")
    print(f"Wrote {plot_path}")


if __name__ == "__main__":
    main()
