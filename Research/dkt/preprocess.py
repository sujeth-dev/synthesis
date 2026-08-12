"""Preprocess the raw ASSISTments 2009-2010 skill-builder export into
(student_id, skill_id, correct, timestamp) interaction sequences.

Cleaning rules applied to the raw CSV (documented here, not silently
implicit -- see README.md's "Dataset" section for the known data-quality
caveats this addresses):

1. Drop rows with a missing/blank `skill_id` (~13% of rows) -- these
   interactions carry no usable skill label for either DKT or per-skill BKT.
2. Drop exact duplicate `(user_id, order_id, skill_id)` rows, keeping the
   first occurrence. The raw export contains a known anomaly where a
   fraction of `order_id`s repeat with only bookkeeping columns
   (`opportunity`/`opportunity_original`) differing -- these are re-logged
   copies of the same interaction, not new evidence, and double-counting
   them would bias both the BKT and DKT fits. Genuine multi-skill problems
   (same `order_id`, *different* `skill_id`) are kept as separate
   interactions -- that repetition is real, one row per skill the problem
   is tagged with.
3. `timestamp` in the output is `order_id`, used purely as a strictly
   increasing per-student ordering key. This specific ASSISTments export
   does not include a wall-clock timestamp column; `order_id` is
   monotonically assigned in logging order, which is the standard ordering
   proxy used for this dataset in the DKT literature.

Output: data/sequences.csv with columns
    student_id, skill_id, correct, timestamp
sorted by (student_id, timestamp), one row per retained interaction.
"""
import os

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_PATH = os.path.join(DATA_DIR, "skill_builder_data.csv")
OUT_PATH = os.path.join(DATA_DIR, "sequences.csv")


def load_raw(path: str = RAW_PATH) -> pd.DataFrame:
    usecols = ["order_id", "user_id", "skill_id", "correct"]
    df = pd.read_csv(path, usecols=usecols, encoding="latin-1")
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["skill_id"]).copy()
    df["skill_id"] = df["skill_id"].astype(int)
    df["correct"] = df["correct"].astype(int)
    df["user_id"] = df["user_id"].astype(int)
    df["order_id"] = df["order_id"].astype(int)

    df = df.drop_duplicates(subset=["user_id", "order_id", "skill_id"], keep="first")

    df = df.rename(columns={"user_id": "student_id", "order_id": "timestamp"})
    df = df[["student_id", "skill_id", "correct", "timestamp"]]
    df = df.sort_values(["student_id", "timestamp"]).reset_index(drop=True)
    return df


def main() -> None:
    if not os.path.exists(RAW_PATH):
        raise FileNotFoundError(
            f"{RAW_PATH} not found -- run `python download_data.py` first."
        )
    raw = load_raw()
    sequences = clean(raw)
    sequences.to_csv(OUT_PATH, index=False)
    print(
        f"Wrote {len(sequences)} interactions "
        f"({sequences['student_id'].nunique()} students, "
        f"{sequences['skill_id'].nunique()} skills) -> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
