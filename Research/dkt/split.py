"""Train/val/test split of preprocessed sequences, by student_id.

Splitting by *student* (not by interaction row) is deliberate: a
row-level split would let a student's earlier interactions land in one
split and their later interactions in another, so a model could learn
that student's idiosyncrasies from "training" rows and get credit for
it on "test" rows of the same student -- a leakage bug that inflates
apparent held-out accuracy. Splitting on student_id keeps a student's
entire sequence in exactly one split.

Output: data/splits.json -> {"train": [...], "val": [...], "test": [...]}
(lists of student_id, disjoint and covering every student in
data/sequences.csv).
"""
import json
import os
import random

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SEQUENCES_PATH = os.path.join(DATA_DIR, "sequences.csv")
OUT_PATH = os.path.join(DATA_DIR, "splits.json")

TRAIN_FRAC = 0.7
VAL_FRAC = 0.15
# remaining ~0.15 goes to test
SEED = 42


def load_student_ids(path: str = SEQUENCES_PATH) -> list[int]:
    import pandas as pd

    df = pd.read_csv(path, usecols=["student_id"])
    return sorted(df["student_id"].unique().tolist())


def split_students(
    student_ids: list[int],
    train_frac: float = TRAIN_FRAC,
    val_frac: float = VAL_FRAC,
    seed: int = SEED,
) -> dict[str, list[int]]:
    students = list(student_ids)
    rng = random.Random(seed)
    rng.shuffle(students)

    n = len(students)
    n_train = int(n * train_frac)
    n_val = int(n * val_frac)

    train = sorted(students[:n_train])
    val = sorted(students[n_train : n_train + n_val])
    test = sorted(students[n_train + n_val :])
    return {"train": train, "val": val, "test": test}


def main() -> None:
    if not os.path.exists(SEQUENCES_PATH):
        raise FileNotFoundError(
            f"{SEQUENCES_PATH} not found -- run `python preprocess.py` first."
        )
    student_ids = load_student_ids()
    splits = split_students(student_ids)

    with open(OUT_PATH, "w") as f:
        json.dump(splits, f, indent=2)

    print(
        f"{len(student_ids)} students -> "
        f"train={len(splits['train'])} val={len(splits['val'])} test={len(splits['test'])} "
        f"-> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
