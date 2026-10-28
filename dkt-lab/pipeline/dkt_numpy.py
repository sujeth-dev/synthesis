"""DKT inference from an exported weights file, in numpy — no torch, no training.

Why this exists: run.py writes data/<name>/predictions.npz, but that file is
gitignored, so a diagnosis run would otherwise have to retrain every model just
to look at its predictions again. The trained weights *are* committed
(web/public/data/<name>/dkt_weights.json), so re-running the forward pass is
enough, and it is cheap.

The forward pass mirrors dkt.DKTModel exactly: a single-layer LSTM with
PyTorch's gate order (i, f, g, o) and layouts, then a linear read-out over
every skill. src/lib/dkt/index.ts is the same pass in TypeScript; this is the
same pass in numpy, and diagnose.py checks it against the committed metrics
before trusting any of it.

Only the one-hot "synaptic-dkt-v1" format is supported. The time-feature format
("dkt-lab-time-v1") carries extra input/output columns and is rejected rather
than silently mis-read.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass

import numpy as np

SUPPORTED_FORMAT = "synaptic-dkt-v1"


def _decode(b64: str, shape: tuple[int, ...], name: str) -> np.ndarray:
    a = np.frombuffer(base64.b64decode(b64), dtype="<f4")
    want = int(np.prod(shape))
    if a.size != want:
        raise ValueError(f"{name}: got {a.size} floats, expected {want} for shape {shape}")
    return a.reshape(shape).astype(np.float64)


@dataclass
class DktWeights:
    skills: list[str]
    skill_index: dict[str, int]
    S: int
    H: int
    w_ih: np.ndarray    # (4H, 2S)
    w_hh: np.ndarray    # (4H, H)
    b: np.ndarray       # (4H,) bias_ih + bias_hh, pre-summed as the LSTM adds both
    out_w: np.ndarray   # (S, H)
    out_b: np.ndarray   # (S,)


def load_weights(path: str) -> DktWeights:
    with open(path) as f:
        d = json.load(f)
    if d["format"] != SUPPORTED_FORMAT:
        raise ValueError(f"{path}: format {d['format']!r} is not {SUPPORTED_FORMAT!r} "
                         "(time-feature models have extra columns and need their own reader)")
    skills = [str(s) for s in d["skills"]]
    S, H = len(skills), int(d["hidden_size"])
    return DktWeights(
        skills=skills,
        skill_index={s: i for i, s in enumerate(skills)},
        S=S, H=H,
        w_ih=_decode(d["weight_ih"], (4 * H, 2 * S), "weight_ih"),
        w_hh=_decode(d["weight_hh"], (4 * H, H), "weight_hh"),
        b=_decode(d["bias_ih"], (4 * H,), "bias_ih") + _decode(d["bias_hh"], (4 * H,), "bias_hh"),
        out_w=_decode(d["out_weight"], (S, H), "out_weight"),
        out_b=_decode(d["out_bias"], (S,), "out_bias"),
    )


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _step(w: DktWeights, h: np.ndarray, c: np.ndarray, columns: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """One LSTM step for a batch. `columns` is the one-hot input column per row,
    so the input-to-hidden product is a column lookup rather than a matmul."""
    H = w.H
    gates = w.w_ih[:, columns].T + h @ w.w_hh.T + w.b
    i = _sigmoid(gates[:, 0:H])
    f = _sigmoid(gates[:, H:2 * H])
    g = np.tanh(gates[:, 2 * H:3 * H])
    o = _sigmoid(gates[:, 3 * H:4 * H])
    c_next = f * c + i * g
    return o * np.tanh(c_next), c_next


def _columns(w: DktWeights, skills: np.ndarray, correct: np.ndarray) -> np.ndarray:
    """One-hot column index per interaction: skill if correct, S + skill if not.
    Matches dkt.encode's `torch.where(co == 1, sk, S + sk)`."""
    return np.where(correct == 1, skills, w.S + skills)


def predict_next_step(w: DktWeights, sequences: list[tuple[np.ndarray, np.ndarray]],
                      batch_size: int = 256) -> list[np.ndarray]:
    """Next-step P(correct) for each sequence: element t is P(correct on
    skills[t+1]) given interactions 0..t, so each result has length L-1.

    Matches dkt.predict: input at step t encodes attempt t, the target at step t
    is attempt t+1. Sequences shorter than 2 interactions yield an empty array,
    as build_sequences drops them.
    """
    out: list[np.ndarray] = [np.empty(0)] * len(sequences)
    order = sorted(range(len(sequences)), key=lambda i: -len(sequences[i][0]))
    for start in range(0, len(order), batch_size):
        idx = order[start:start + batch_size]
        batch = [sequences[i] for i in idx]
        lengths = np.array([len(s[0]) for s in batch])
        steps = int(lengths.max()) - 1           # predictions per sequence at most
        if steps < 1:
            continue
        n = len(batch)
        cols = np.zeros((n, steps), dtype=np.int64)
        tgt = np.zeros((n, steps), dtype=np.int64)
        for j, (sk, co) in enumerate(batch):
            L = len(sk) - 1
            if L < 1:
                continue
            cols[j, :L] = _columns(w, sk[:L], co[:L])
            tgt[j, :L] = sk[1:L + 1]
        h = np.zeros((n, w.H))
        c = np.zeros((n, w.H))
        preds = np.zeros((n, steps))
        for t in range(steps):
            h, c = _step(w, h, c, cols[:, t])
            # Read out only the target skill of the next attempt.
            preds[:, t] = _sigmoid(np.einsum('ij,ij->i', h, w.out_w[tgt[:, t]]) + w.out_b[tgt[:, t]])
        for j, i in enumerate(idx):
            L = len(batch[j][0]) - 1
            out[i] = preds[j, :L].copy() if L >= 1 else np.empty(0)
    return out


def all_skill_trajectory(w: DktWeights, skills: np.ndarray, correct: np.ndarray) -> np.ndarray:
    """P(correct) for *every* skill after each interaction: shape (L, S), where
    row t is the state after consuming interactions 0..t.

    This is what the reconstruction and waviness measures need — they ask how
    the whole prediction vector moves from one answer to the next, which
    next-step predictions alone cannot show.
    """
    L = len(skills)
    cols = _columns(w, skills, correct)
    h = np.zeros((1, w.H))
    c = np.zeros((1, w.H))
    traj = np.zeros((L, w.S))
    for t in range(L):
        h, c = _step(w, h, c, cols[t:t + 1])
        traj[t] = _sigmoid(h[0] @ w.out_w.T + w.out_b)
    return traj
