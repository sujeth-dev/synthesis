"""Train/val/test split by student_id (70/15/15, seeded).

Copied from Research/dkt/split.py and adapted for dkt-lab: works on any
dataset in the common schema (string student ids), writes
data/<name>/splits.json. The logic -- shuffle sorted student ids with a
seeded RNG, cut 70/15/15 -- is unchanged, so a student's whole sequence lands
in exactly one split (no leakage of a student's future into training).

Usage: python split.py [name ...]
"""
import argparse
import json
import os
import random

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")

TRAIN_FRAC = 0.7
VAL_FRAC = 0.15
SEED = 42


def split_students(student_ids, train_frac=TRAIN_FRAC, val_frac=VAL_FRAC, seed=SEED) -> dict:
    students = sorted(student_ids)
    rng = random.Random(seed)
    rng.shuffle(students)
    n = len(students)
    n_train = int(n * train_frac)
    n_val = int(n * val_frac)
    return {
        "train": sorted(students[:n_train]),
        "val": sorted(students[n_train:n_train + n_val]),
        "test": sorted(students[n_train + n_val:]),
    }


def split_dataset(name: str) -> dict:
    df = pd.read_csv(os.path.join(DATA_DIR, name, "sequences.csv"), usecols=["student_id"], dtype={"student_id": str})
    splits = split_students(df["student_id"].unique().tolist())
    with open(os.path.join(DATA_DIR, name, "splits.json"), "w") as f:
        json.dump(splits, f)
    print(f"[{name}] train={len(splits['train'])} val={len(splits['val'])} test={len(splits['test'])}")
    return splits


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("names", nargs="*")
    args = p.parse_args()
    names = args.names or sorted(d for d in os.listdir(DATA_DIR) if os.path.exists(os.path.join(DATA_DIR, d, "sequences.csv")))
    for n in names:
        split_dataset(n)
