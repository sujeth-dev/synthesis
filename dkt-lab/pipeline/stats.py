"""Descriptive statistics per dataset -> results/<name>.json["stats"].

Usage: python stats.py [name ...]
"""
import argparse
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
RESULTS_DIR = os.path.join(HERE, "results")


def load_sequences(name: str) -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, name, "sequences.csv"), dtype={"student_id": str, "skill_id": str})


def sequence_length_stats(lengths: np.ndarray) -> dict:
    q = np.percentile(lengths, [10, 25, 50, 75, 90])
    # Log-spaced bins: sequence lengths are heavy-tailed on the real datasets.
    hi = max(int(lengths.max()), 2)
    edges = np.unique(np.round(np.logspace(0, np.log10(hi + 1), 13)).astype(int))
    counts, _ = np.histogram(lengths, bins=edges)
    return {
        "min": int(lengths.min()), "p10": float(q[0]), "p25": float(q[1]), "median": float(q[2]),
        "p75": float(q[3]), "p90": float(q[4]), "max": int(lengths.max()), "mean": float(lengths.mean()),
        "hist": {"edges": edges.tolist(), "counts": counts.tolist()},
    }


def dataset_stats(name: str) -> dict:
    df = load_sequences(name)
    with open(os.path.join(DATA_DIR, name, "splits.json")) as f:
        splits = json.load(f)
    with open(os.path.join(DATA_DIR, name, "skills.json")) as f:
        skills = json.load(f)
    lengths = df.groupby("student_id").size().to_numpy()
    per_skill = df.groupby("skill_id")["correct"].agg(["size", "mean"]).sort_values("size", ascending=False)
    split_of = {s: k for k, ids in splits.items() for s in ids}
    df["split"] = df["student_id"].map(split_of)
    return {
        "students": int(df["student_id"].nunique()),
        "skills": int(df["skill_id"].nunique()),
        "interactions": int(len(df)),
        "pct_correct": float(df["correct"].mean()),
        "sequence_length": sequence_length_stats(lengths),
        "skills_per_student_median": float(df.groupby("student_id")["skill_id"].nunique().median()),
        "split": {k: {"students": len(v), "interactions": int((df["split"] == k).sum())} for k, v in splits.items()},
        "top_skills": [
            {"skill_id": k, "label": skills.get(k, {}).get("label", k), "count": int(r["size"]), "pct_correct": float(r["mean"])}
            for k, r in per_skill.head(15).iterrows()
        ],
    }


def update_results(name: str, key: str, value) -> None:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    path = os.path.join(RESULTS_DIR, f"{name}.json")
    data = {}
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
    data[key] = value
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")


def main(names):
    for name in names:
        with open(os.path.join(DATA_DIR, name, "provenance.json")) as f:
            prov = json.load(f)
        update_results(name, "provenance", prov)
        s = dataset_stats(name)
        update_results(name, "stats", s)
        print(f"[{name}] {s['interactions']} rows, {s['pct_correct']:.3f} correct, median len {s['sequence_length']['median']}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("names", nargs="*")
    a = p.parse_args()
    main(a.names or ["assist2009", "assist2015", "synthetic5", "synaptic_sim"])
