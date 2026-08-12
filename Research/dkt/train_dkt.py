"""Train a small single-layer LSTM Deep Knowledge Tracing (DKT) model,
following Piech et al. (2015)'s starting hyperparameters (~200 hidden
units, single LSTM layer).

Input representation (as in the original DKT paper): at each timestep,
a compressed one-hot vector of size 2*num_skills, with a 1 at index
`skill_idx` if the interaction was correct, or at index
`num_skills + skill_idx` if incorrect. The model predicts, at every
timestep, a probability of a correct answer for *every* skill; training
and evaluation only read off the entry for the skill actually practiced
next (the standard DKT "predict next interaction" setup).

Trains on `train` students (per data/splits.json), tracks validation
loss/AUC on `val` students each epoch, and finally produces forward-only
next-step predictions on `test` students in the same
{student_id, skill_id, timestamp, actual, predicted} shape that
bkt_baseline.py emits, so evaluate.py can compare the two directly.

Output:
    data/dkt_model.pt              (state dict + skill index mapping + hyperparams)
    data/dkt_test_predictions.json (test-set next-step predictions)
"""
import json
import os

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SEQUENCES_PATH = os.path.join(DATA_DIR, "sequences.csv")
SPLITS_PATH = os.path.join(DATA_DIR, "splits.json")
MODEL_PATH = os.path.join(DATA_DIR, "dkt_model.pt")
PREDICTIONS_PATH = os.path.join(DATA_DIR, "dkt_test_predictions.json")

HIDDEN_SIZE = 200
NUM_LAYERS = 1
LEARNING_RATE = 1e-3
BATCH_SIZE = 32
NUM_EPOCHS = 8
GRAD_CLIP = 5.0
PAD_VALUE = 0
SEED = 42


class DKTModel(nn.Module):
    def __init__(self, num_skills: int, hidden_size: int = HIDDEN_SIZE, num_layers: int = NUM_LAYERS):
        super().__init__()
        self.num_skills = num_skills
        self.lstm = nn.LSTM(
            input_size=2 * num_skills,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
        )
        self.output = nn.Linear(hidden_size, num_skills)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        return torch.sigmoid(self.output(out))


def build_skill_index(df: pd.DataFrame) -> dict:
    skill_ids = sorted(df["skill_id"].unique().tolist())
    return {skill_id: idx for idx, skill_id in enumerate(skill_ids)}


def build_student_sequences(df: pd.DataFrame, student_ids: set, skill_index: dict) -> list:
    """Returns a list of (skill_idx_array, correct_array) per student, sorted
    by timestamp, restricted to students with >= 2 interactions (need at
    least one input->target transition)."""
    subset = df[df["student_id"].isin(student_ids)].sort_values(["student_id", "timestamp"])
    sequences = []
    for _, group in subset.groupby("student_id"):
        if len(group) < 2:
            continue
        skills = group["skill_id"].map(skill_index).to_numpy()
        corrects = group["correct"].to_numpy()
        sequences.append((skills, corrects))
    return sequences


def encode_batch(batch: list, num_skills: int):
    """Pads a batch of (skills, corrects) to a dense input tensor, a target
    (skill, correct) pair per transition, and a validity mask.

    Input at step t (t = 0..L-2) encodes interaction t; the target at step t
    is (skill[t+1], correct[t+1]) -- the standard DKT "predict the next
    interaction" framing.
    """
    lengths = [len(skills) - 1 for skills, _ in batch]  # number of transitions
    max_len = max(lengths)
    n = len(batch)

    x = np.zeros((n, max_len, 2 * num_skills), dtype=np.float32)
    target_skill = np.full((n, max_len), PAD_VALUE, dtype=np.int64)
    target_correct = np.zeros((n, max_len), dtype=np.float32)
    mask = np.zeros((n, max_len), dtype=np.float32)

    for i, (skills, corrects) in enumerate(batch):
        L = lengths[i]
        for t in range(L):
            s, c = skills[t], corrects[t]
            x[i, t, s if c == 1 else num_skills + s] = 1.0
            target_skill[i, t] = skills[t + 1]
            target_correct[i, t] = corrects[t + 1]
            mask[i, t] = 1.0

    return (
        torch.from_numpy(x),
        torch.from_numpy(target_skill),
        torch.from_numpy(target_correct),
        torch.from_numpy(mask),
    )


def masked_bce_loss(predictions: torch.Tensor, target_skill: torch.Tensor, target_correct: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """predictions: (batch, T, num_skills). Gathers the predicted probability
    for the actually-practiced next skill at each timestep, then computes
    BCE against target_correct, averaged over valid (masked) positions only."""
    pred_for_target = torch.gather(predictions, 2, target_skill.unsqueeze(-1)).squeeze(-1)
    pred_for_target = torch.clamp(pred_for_target, 1e-6, 1 - 1e-6)
    bce = -(
        target_correct * torch.log(pred_for_target)
        + (1 - target_correct) * torch.log(1 - pred_for_target)
    )
    bce = bce * mask
    return bce.sum() / mask.sum().clamp(min=1.0)


def predict_and_collect(model: DKTModel, sequences: list, num_skills: int):
    """Runs forward-only next-step prediction over each sequence individually
    (batch size 1, so padding never influences another student's predictions)
    and returns flat arrays of (predicted, actual)."""
    model.eval()
    all_actual, all_predicted = [], []
    with torch.no_grad():
        for skills, corrects in sequences:
            x, target_skill, target_correct, mask = encode_batch([(skills, corrects)], num_skills)
            preds = model(x)
            pred_for_target = torch.gather(preds, 2, target_skill.unsqueeze(-1)).squeeze(-1)
            L = int(mask.sum().item())
            all_actual.extend(target_correct[0, :L].tolist())
            all_predicted.extend(pred_for_target[0, :L].tolist())
    return all_actual, all_predicted


def train(model: DKTModel, train_sequences: list, val_sequences: list, num_skills: int) -> None:
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    rng = np.random.default_rng(SEED)

    for epoch in range(NUM_EPOCHS):
        model.train()
        order = rng.permutation(len(train_sequences))
        total_loss, n_batches = 0.0, 0

        for start in range(0, len(order), BATCH_SIZE):
            batch_idx = order[start : start + BATCH_SIZE]
            batch = [train_sequences[i] for i in batch_idx]
            x, target_skill, target_correct, mask = encode_batch(batch, num_skills)

            optimizer.zero_grad()
            preds = model(x)
            loss = masked_bce_loss(preds, target_skill, target_correct, mask)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
            optimizer.step()

            total_loss += loss.item()
            n_batches += 1

        val_actual, val_predicted = predict_and_collect(model, val_sequences, num_skills)
        val_auc = roc_auc_score(val_actual, val_predicted) if len(set(val_actual)) > 1 else float("nan")
        print(
            f"epoch {epoch + 1}/{NUM_EPOCHS}  train_loss={total_loss / max(n_batches, 1):.4f}  val_auc={val_auc:.4f}"
        )


def main() -> None:
    if not os.path.exists(SEQUENCES_PATH) or not os.path.exists(SPLITS_PATH):
        raise FileNotFoundError(
            "Missing data/sequences.csv or data/splits.json -- run "
            "preprocess.py then split.py first."
        )

    torch.manual_seed(SEED)

    df = pd.read_csv(SEQUENCES_PATH)
    with open(SPLITS_PATH) as f:
        splits = json.load(f)

    skill_index = build_skill_index(df)
    num_skills = len(skill_index)

    train_sequences = build_student_sequences(df, set(splits["train"]), skill_index)
    val_sequences = build_student_sequences(df, set(splits["val"]), skill_index)
    test_sequences_raw = build_student_sequences(df, set(splits["test"]), skill_index)

    print(
        f"{num_skills} skills; sequences: train={len(train_sequences)} "
        f"val={len(val_sequences)} test={len(test_sequences_raw)}"
    )

    model = DKTModel(num_skills)
    train(model, train_sequences, val_sequences, num_skills)

    torch.save(
        {
            "state_dict": model.state_dict(),
            "skill_index": skill_index,
            "num_skills": num_skills,
            "hidden_size": HIDDEN_SIZE,
            "num_layers": NUM_LAYERS,
        },
        MODEL_PATH,
    )

    # Rebuild test predictions with (student_id, skill_id, timestamp) attached
    # for evaluate.py, using the same forward-only protocol as bkt_baseline.py.
    index_to_skill = {idx: skill_id for skill_id, idx in skill_index.items()}
    test_df = df[df["student_id"].isin(set(splits["test"]))].sort_values(
        ["student_id", "timestamp"]
    )

    model.eval()
    predictions = []
    with torch.no_grad():
        for student_id, group in test_df.groupby("student_id"):
            if len(group) < 2:
                continue
            skills = group["skill_id"].map(skill_index).to_numpy()
            corrects = group["correct"].to_numpy()
            timestamps = group["timestamp"].to_numpy()

            x, target_skill, target_correct, mask = encode_batch(
                [(skills, corrects)], num_skills
            )
            preds = model(x)
            pred_for_target = torch.gather(preds, 2, target_skill.unsqueeze(-1)).squeeze(-1)
            L = int(mask.sum().item())

            for t in range(L):
                predictions.append(
                    {
                        "student_id": int(student_id),
                        "skill_id": int(index_to_skill[skills[t + 1]]),
                        "timestamp": int(timestamps[t + 1]),
                        "actual": int(corrects[t + 1]),
                        "predicted": float(pred_for_target[0, t].item()),
                    }
                )

    with open(PREDICTIONS_PATH, "w") as f:
        json.dump(predictions, f)

    print(f"Saved model -> {MODEL_PATH}")
    print(f"Saved {len(predictions)} test predictions -> {PREDICTIONS_PATH}")


if __name__ == "__main__":
    main()
