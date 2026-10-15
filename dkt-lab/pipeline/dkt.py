"""Single-layer LSTM Deep Knowledge Tracing (DKT).

Copied from Research/dkt/train_dkt.py (model, 2*S one-hot input, masked BCE on
the next interaction, Adam, grad clipping 5.0, seed 42) and adapted for
dkt-lab:
  * batches are built with tensor indexing instead of Python loops, and
    sequences are bucketed by length to limit padding;
  * options used by the Lab 6 experiments (all off by default, so the default
    model is the original architecture):
      - dropout on the LSTM output,
      - early stopping on validation AUC,
      - `input_time`: 3 time features appended to each input step
        [log1p(days since this skill was last practised),
         log1p(days since the previous answer), log1p(prior attempts on this skill)],
      - `output_time`: the same 3 features for the *upcoming* attempt fed to
        the output layer (DKT-forget style; known before the answer),
      - DKT+ regularisation (Yeung & Yeung, 2018): reconstruction loss on the
        current answer plus L1/L2 waviness penalties.
  * weights_json() writes the same base64 float32 format as
    Research/dkt/export_weights.py ("synaptic-dkt-v1").
"""
from __future__ import annotations

import base64
import math
import time
from dataclasses import dataclass, field, asdict

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score

SEED = 42
GRAD_CLIP = 5.0
N_TIME = 3


@dataclass
class DKTConfig:
    hidden_size: int = 100
    lr: float = 1e-3
    batch_size: int = 32
    epochs: int = 10
    dropout: float = 0.0
    early_stopping: bool = False
    patience: int = 3
    input_time: bool = False
    output_time: bool = False
    lambda_r: float = 0.0
    lambda_w1: float = 0.0
    lambda_w2: float = 0.0
    seed: int = SEED

    def to_dict(self) -> dict:
        return asdict(self)


class DKTModel(nn.Module):
    def __init__(self, num_skills: int, hidden_size: int = 100, dropout: float = 0.0,
                 input_time: bool = False, output_time: bool = False):
        super().__init__()
        self.num_skills = num_skills
        self.input_time = input_time
        self.output_time = output_time
        in_size = 2 * num_skills + (N_TIME if input_time else 0)
        self.lstm = nn.LSTM(input_size=in_size, hidden_size=hidden_size, num_layers=1, batch_first=True)
        self.drop = nn.Dropout(dropout)
        self.output = nn.Linear(hidden_size + (N_TIME if output_time else 0), num_skills)

    def forward(self, x: torch.Tensor, next_time: torch.Tensor | None = None) -> torch.Tensor:
        out, _ = self.lstm(x)
        out = self.drop(out)
        if self.output_time:
            out = torch.cat([out, next_time], dim=-1)
        return torch.sigmoid(self.output(out))


# ── data ────────────────────────────────────────────────────────────────────
@dataclass
class Seq:
    skills: np.ndarray              # (L,) skill indices
    correct: np.ndarray             # (L,) 0/1
    time: np.ndarray | None = None  # (L, 3) time features of attempt t, or None
    rows: np.ndarray | None = None  # (L,) row ids in the source DataFrame (for alignment)
    student: str = ""
    extra: dict = field(default_factory=dict)


def time_features(skills: np.ndarray, t_days: np.ndarray) -> np.ndarray:
    """Per attempt t (known before its answer): log1p(days since this skill was
    last practised; 0 if never), log1p(days since the previous answer; 0 for the
    first), log1p(number of earlier attempts on this skill)."""
    L = len(skills)
    out = np.zeros((L, N_TIME), dtype=np.float32)
    last_seen: dict[int, float] = {}
    count: dict[int, int] = {}
    for t in range(L):
        s = int(skills[t])
        out[t, 0] = math.log1p(t_days[t] - last_seen[s]) if s in last_seen else 0.0
        out[t, 1] = math.log1p(t_days[t] - t_days[t - 1]) if t > 0 else 0.0
        out[t, 2] = math.log1p(count.get(s, 0))
        last_seen[s] = t_days[t]
        count[s] = count.get(s, 0) + 1
    return out


def build_sequences(df, skill_index: dict, with_time: bool = False) -> list[Seq]:
    """One Seq per student (>= 2 interactions), in `order`."""
    out = []
    df = df.sort_values(["student_id", "order"], kind="stable")
    for sid, g in df.groupby("student_id", sort=True):
        if len(g) < 2:
            continue
        skills = g["skill_id"].map(skill_index).to_numpy()
        tf = time_features(skills, g["t_days"].to_numpy()) if with_time else None
        out.append(Seq(skills=skills, correct=g["correct"].to_numpy().astype(np.int64), time=tf,
                       rows=g.index.to_numpy(), student=str(sid)))
    return out


def encode(batch: list[Seq], S: int, input_time=False, output_time=False):
    """Input at step t encodes attempt t; the target at step t is attempt t+1."""
    lengths = [len(s.skills) - 1 for s in batch]
    n, T = len(batch), max(lengths)
    in_size = 2 * S + (N_TIME if input_time else 0)
    x = torch.zeros(n, T, in_size)
    cur_skill = torch.zeros(n, T, dtype=torch.long)
    cur_correct = torch.zeros(n, T)
    tgt_skill = torch.zeros(n, T, dtype=torch.long)
    tgt_correct = torch.zeros(n, T)
    mask = torch.zeros(n, T)
    next_time = torch.zeros(n, T, N_TIME) if output_time else None
    for i, s in enumerate(batch):
        L = lengths[i]
        sk = torch.from_numpy(s.skills[:L].astype(np.int64))
        co = torch.from_numpy(s.correct[:L].astype(np.int64))
        x[i, torch.arange(L), torch.where(co == 1, sk, S + sk)] = 1.0
        if input_time:
            x[i, :L, 2 * S:] = torch.from_numpy(s.time[:L])
        if output_time:
            next_time[i, :L] = torch.from_numpy(s.time[1:L + 1])
        cur_skill[i, :L] = sk
        cur_correct[i, :L] = co.float()
        tgt_skill[i, :L] = torch.from_numpy(s.skills[1:L + 1].astype(np.int64))
        tgt_correct[i, :L] = torch.from_numpy(s.correct[1:L + 1].astype(np.float32))
        mask[i, :L] = 1.0
    return x, next_time, cur_skill, cur_correct, tgt_skill, tgt_correct, mask


def masked_bce(pred, skill, correct, mask):
    p = torch.gather(pred, 2, skill.unsqueeze(-1)).squeeze(-1).clamp(1e-6, 1 - 1e-6)
    bce = -(correct * torch.log(p) + (1 - correct) * torch.log(1 - p))
    return (bce * mask).sum() / mask.sum().clamp(min=1.0)


def loss_fn(model: DKTModel, cfg: DKTConfig, batch_tensors) -> torch.Tensor:
    x, nt, cs, cc, ts, tc, mask = batch_tensors
    pred = model(x, nt)
    loss = masked_bce(pred, ts, tc, mask)
    if cfg.lambda_r:
        loss = loss + cfg.lambda_r * masked_bce(pred, cs, cc, mask)
    if cfg.lambda_w1 or cfg.lambda_w2:
        diff = (pred[:, 1:] - pred[:, :-1]) * (mask[:, 1:] * mask[:, :-1]).unsqueeze(-1)
        denom = (mask[:, 1:] * mask[:, :-1]).sum().clamp(min=1.0) * model.num_skills
        loss = loss + cfg.lambda_w1 * diff.abs().sum() / denom + cfg.lambda_w2 * (diff ** 2).sum() / denom
    return loss


def batches(seqs: list[Seq], size: int, rng: np.random.Generator | None):
    """Length-bucketed batches: sort by length, chunk, shuffle chunk order."""
    order = np.argsort([len(s.skills) for s in seqs], kind="stable")
    if rng is not None:
        # jitter within similar lengths so batches differ between epochs
        order = order[np.argsort(np.arange(len(order)) + rng.uniform(0, size * 4, len(order)), kind="stable")]
    chunks = [order[i:i + size] for i in range(0, len(order), size)]
    if rng is not None:
        rng.shuffle(chunks)
    return chunks


@torch.no_grad()
def predict(model: DKTModel, seqs: list[Seq], cfg: DKTConfig, batch_size: int = 64):
    """Forward-only next-step predictions. Returns list of (rows[1:], preds) per seq.
    The LSTM is causal, so padding at the end never changes earlier outputs."""
    model.eval()
    S = model.num_skills
    out: list = [None] * len(seqs)
    for idx in batches(seqs, batch_size, None):
        b = [seqs[i] for i in idx]
        x, nt, _, _, ts, _, mask = encode(b, S, cfg.input_time, cfg.output_time)
        p = torch.gather(model(x, nt), 2, ts.unsqueeze(-1)).squeeze(-1)
        for j, i in enumerate(idx):
            L = len(seqs[i].skills) - 1
            out[i] = p[j, :L].numpy().astype(np.float64)
    return out


def flat_auc(seqs: list[Seq], preds) -> float:
    y = np.concatenate([s.correct[1:] for s in seqs])
    p = np.concatenate(preds)
    return float(roc_auc_score(y, p))


def train(train_seqs: list[Seq], val_seqs: list[Seq], S: int, cfg: DKTConfig, log=print):
    """Returns (model, history). With early_stopping, restores the epoch with
    the best validation AUC; otherwise keeps the last epoch."""
    torch.manual_seed(cfg.seed)
    rng = np.random.default_rng(cfg.seed)
    model = DKTModel(S, cfg.hidden_size, cfg.dropout, cfg.input_time, cfg.output_time)
    opt = torch.optim.Adam(model.parameters(), lr=cfg.lr)
    history, best, best_state, bad = [], -1.0, None, 0
    t0 = time.time()
    for epoch in range(1, cfg.epochs + 1):
        model.train()
        total, nb = 0.0, 0
        for idx in batches(train_seqs, cfg.batch_size, rng):
            bt = encode([train_seqs[i] for i in idx], S, cfg.input_time, cfg.output_time)
            opt.zero_grad()
            loss = loss_fn(model, cfg, bt)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
            opt.step()
            total += loss.item()
            nb += 1
        val_auc = flat_auc(val_seqs, predict(model, val_seqs, cfg))
        history.append({"epoch": epoch, "train_loss": total / max(nb, 1), "val_auc": val_auc,
                        "seconds": round(time.time() - t0, 1)})
        log(f"  epoch {epoch:2d}  loss={total / max(nb, 1):.4f}  val_auc={val_auc:.4f}  ({time.time() - t0:.0f}s)")
        if val_auc > best + 1e-5:
            best, bad = val_auc, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if cfg.early_stopping and bad >= cfg.patience:
                break
    if cfg.early_stopping and best_state is not None:
        model.load_state_dict(best_state)
    return model, history


# ── export (same format as Research/dkt/export_weights.py) ─────────────────
def b64(t: torch.Tensor) -> str:
    return base64.b64encode(t.detach().cpu().numpy().astype("<f4").tobytes()).decode("ascii")


def weights_json(model: DKTModel, skills: list, synthetic: bool) -> dict:
    lstm = model.lstm
    out = {
        "format": "synaptic-dkt-v1",
        "synthetic": synthetic,
        "skills": [str(s) for s in skills],
        "hidden_size": lstm.hidden_size,
        "weight_ih": b64(lstm.weight_ih_l0),
        "weight_hh": b64(lstm.weight_hh_l0),
        "bias_ih": b64(lstm.bias_ih_l0),
        "bias_hh": b64(lstm.bias_hh_l0),
        "out_weight": b64(model.output.weight),
        "out_bias": b64(model.output.bias),
    }
    if model.input_time or model.output_time:
        out["format"] = "dkt-lab-time-v1"
        out["time_features"] = {
            "input": model.input_time, "output": model.output_time,
            "features": ["log1p(days since this skill was last practised; 0 if never)",
                         "log1p(days since the learner's previous answer; 0 for the first)",
                         "log1p(number of earlier attempts on this skill)"],
            "weight_ih_layout": "(4H, 2S + 3) if input, else (4H, 2S): one-hot columns then the 3 features",
            "out_weight_layout": "(S, H + 3) if output: hidden units then the 3 features of the upcoming attempt",
        }
    return out


@torch.no_grad()
def torch_predict_all(model: DKTModel, history: list[tuple[int, int]]) -> list[float]:
    """P(correct) for every skill after `history` (zero state if empty) --
    the contract the browser's predictNext() must match."""
    S = model.num_skills
    if not history:
        h = torch.zeros(model.lstm.hidden_size)
    else:
        x = torch.zeros(1, len(history), 2 * S)
        for t, (s, c) in enumerate(history):
            x[0, t, s if c else S + s] = 1.0
        out, _ = model.lstm(x)
        h = out[0, -1]
    return torch.sigmoid(model.output(h)).tolist()


@torch.no_grad()
def hidden_trajectory(model: DKTModel, history: list[tuple[int, int]]) -> np.ndarray:
    S = model.num_skills
    x = torch.zeros(1, len(history), 2 * S)
    for t, (s, c) in enumerate(history):
        x[0, t, s if c else S + s] = 1.0
    out, _ = model.lstm(x)
    return torch.sigmoid(model.output(out[0])).numpy()
