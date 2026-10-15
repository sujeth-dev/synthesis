"""Metrics for next-step predictions, shared by every model in the lab.

Adapted from Research/dkt/evaluate.py: the same "score both models on the
same held-out rows" protocol, extended with log-loss, RMSE, accuracy, ROC
points and per-skill AUC. Rows are aligned by construction in run.py (every
test interaction except each student's first), so no intersection step is
needed here.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import log_loss, roc_auc_score, roc_curve

CLIP = 1e-6


def scores(y: np.ndarray, p: np.ndarray) -> dict:
    y = np.asarray(y, dtype=int)
    p = np.clip(np.asarray(p, dtype=float), CLIP, 1 - CLIP)
    return {
        "auc": float(roc_auc_score(y, p)),
        "log_loss": float(log_loss(y, p, labels=[0, 1])),
        "rmse": float(np.sqrt(np.mean((y - p) ** 2))),
        "accuracy": float(np.mean((p >= 0.5) == (y == 1))),
        "n": int(len(y)),
    }


def roc_points(y: np.ndarray, p: np.ndarray, max_points: int = 101) -> dict:
    fpr, tpr, _ = roc_curve(y, p)
    idx = np.unique(np.linspace(0, len(fpr) - 1, min(max_points, len(fpr))).round().astype(int))
    return {"fpr": [round(float(v), 5) for v in fpr[idx]], "tpr": [round(float(v), 5) for v in tpr[idx]]}


def per_skill_auc(skills: np.ndarray, y: np.ndarray, preds: dict[str, np.ndarray], min_rows: int = 50) -> list[dict]:
    out = []
    for s in np.unique(skills):
        m = skills == s
        if m.sum() < min_rows or len(np.unique(y[m])) < 2:
            continue
        out.append({"skill_id": str(s), "n": int(m.sum()),
                    **{name: float(roc_auc_score(y[m], p[m])) for name, p in preds.items()}})
    return sorted(out, key=lambda r: -r["n"])
