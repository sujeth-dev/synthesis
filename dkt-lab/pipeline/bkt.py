"""Per-skill Bayesian Knowledge Tracing fitted with EM (Baum-Welch).

Copied from Research/dkt/bkt_baseline.py and adapted for dkt-lab:
  * same model, same parameters, same defaults and clipping, same
    forward-only next-step prediction protocol;
  * the forward-backward pass is vectorised across all students of a skill
    (sequences padded into one matrix) instead of looping per student, so EM
    runs on ASSISTments 2015 in seconds;
  * an optional `p_forget` parameter (mastered -> not mastered) for the
    "BKT with forgetting" baseline in the Lab 6 experiments. With
    forgetting=False the transition matrix is exactly the classical
    absorbing-mastery BKT of the original file.

State 0 = not mastered, 1 = mastered.
    p_init     P(L_1 = 1)
    p_transit  P(L_{t+1}=1 | L_t=0)   learn
    p_forget   P(L_{t+1}=0 | L_t=1)   forget (0 unless forgetting=True)
    p_slip     P(incorrect | L=1)
    p_guess    P(correct   | L=0)
"""
from __future__ import annotations

import numpy as np

EPS = 1e-4
MAX_EM_ITERS = 30
CONVERGENCE_TOL = 1e-4
MIN_TRAIN_SEQUENCES = 5
DEFAULT_PARAMS = {"p_init": 0.3, "p_transit": 0.1, "p_slip": 0.1, "p_guess": 0.25, "p_forget": 0.0}
FORGET_INIT = 0.05


def _clip(p: float) -> float:
    return float(min(max(p, EPS), 1 - EPS))


def pad(sequences: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    n, T = len(sequences), max(len(s) for s in sequences)
    obs = np.zeros((n, T), dtype=np.int8)
    mask = np.zeros((n, T), dtype=bool)
    for i, s in enumerate(sequences):
        obs[i, : len(s)] = s
        mask[i, : len(s)] = True
    return obs, mask


def _emissions(obs, mask, p_slip, p_guess):
    """B[n, t, k] = P(obs | state k); 1 on padding (no evidence)."""
    B = np.empty(obs.shape + (2,))
    B[..., 1] = np.where(obs == 1, 1 - p_slip, p_slip)
    B[..., 0] = np.where(obs == 1, p_guess, 1 - p_guess)
    B[~mask] = 1.0
    return B


def forward_backward(obs, mask, p_init, A, p_slip, p_guess):
    """Scaled forward-backward over a padded batch. Returns gamma (n,T,2),
    xi (n,T-1,2,2) zeroed where t+1 is padding, and total log-likelihood."""
    n, T = obs.shape
    B = _emissions(obs, mask, p_slip, p_guess)
    alpha = np.zeros((n, T, 2))
    c = np.ones((n, T))
    alpha[:, 0] = np.array([1 - p_init, p_init]) * B[:, 0]
    c[:, 0] = np.maximum(alpha[:, 0].sum(1), EPS)
    alpha[:, 0] /= c[:, 0, None]
    for t in range(1, T):
        alpha[:, t] = (alpha[:, t - 1] @ A) * B[:, t]
        c[:, t] = np.maximum(alpha[:, t].sum(1), EPS)
        alpha[:, t] /= c[:, t, None]
    beta = np.ones((n, T, 2))
    for t in range(T - 2, -1, -1):
        beta[:, t] = ((B[:, t + 1] * beta[:, t + 1]) @ A.T) / c[:, t + 1, None]
    gamma = alpha * beta
    gamma /= np.maximum(gamma.sum(2, keepdims=True), EPS)
    xi = (alpha[:, :-1, :, None] * A[None, None] * (B[:, 1:] * beta[:, 1:])[:, :, None, :]) / c[:, 1:, None, None]
    xi /= np.maximum(xi.sum((2, 3), keepdims=True), EPS)
    xi *= mask[:, 1:, None, None]
    return gamma, xi, float(np.log(c).sum())


def transition(p_transit: float, p_forget: float) -> np.ndarray:
    return np.array([[1 - p_transit, p_transit], [p_forget, 1 - p_forget]])


def fit_skill_bkt(sequences: list[np.ndarray], forgetting: bool = False) -> dict:
    """Baum-Welch for one skill. `sequences`: one 0/1 array per student."""
    sequences = [np.asarray(s) for s in sequences if len(s) > 0]
    p = dict(DEFAULT_PARAMS)
    if forgetting:
        p["p_forget"] = FORGET_INIT
    if not sequences:
        return p | {"n_train_sequences": 0, "em_iters": 0, "log_likelihood": None}
    obs, mask = pad(sequences)
    prev_ll, it, ll = -np.inf, 0, -np.inf
    for it in range(1, MAX_EM_ITERS + 1):
        A = transition(p["p_transit"], p["p_forget"])
        gamma, xi, ll = forward_backward(obs, mask, p["p_init"], A, p["p_slip"], p["p_guess"])
        g0 = gamma[..., 0] * mask
        g1 = gamma[..., 1] * mask
        has_next = mask[:, 1:]
        p["p_init"] = _clip(gamma[:, 0, 1].mean())
        p["p_transit"] = _clip(xi[:, :, 0, 1].sum() / max((g0[:, :-1] * has_next).sum(), EPS))
        if forgetting:
            p["p_forget"] = _clip(xi[:, :, 1, 0].sum() / max((g1[:, :-1] * has_next).sum(), EPS))
        p["p_slip"] = _clip((g1 * (obs == 0)).sum() / max(g1.sum(), EPS))
        p["p_guess"] = _clip((g0 * (obs == 1)).sum() / max(g0.sum(), EPS))
        if abs(ll - prev_ll) < CONVERGENCE_TOL:
            break
        prev_ll = ll
    return p | {"n_train_sequences": len(sequences), "em_iters": it, "log_likelihood": ll}


def bkt_step(belief: float, correct: int, params: dict) -> tuple[float, float]:
    """One BKT update. Returns (posterior P(L) after seeing `correct`,
    prior P(L) for the next attempt after the learn/forget transition).
    The website's TypeScript port (web/src/models/bkt.ts) mirrors this."""
    s, g = params["p_slip"], params["p_guess"]
    if correct:
        num, den = belief * (1 - s), belief * (1 - s) + (1 - belief) * g
    else:
        num, den = belief * s, belief * s + (1 - belief) * (1 - g)
    post = num / max(den, EPS)
    nxt = post * (1 - params.get("p_forget", 0.0)) + (1 - post) * params["p_transit"]
    return post, nxt


def predict_sequence(obs, params: dict) -> np.ndarray:
    """Forward-only: predicted[t] = P(correct at t | obs[0:t])."""
    preds = np.zeros(len(obs))
    belief = params["p_init"]
    for t, o in enumerate(obs):
        preds[t] = belief * (1 - params["p_slip"]) + (1 - belief) * params["p_guess"]
        _, belief = bkt_step(belief, int(o), params)
    return preds


def predict_with_beliefs(obs, params: dict) -> tuple[np.ndarray, float]:
    """Like predict_sequence, also returns P(L) for the attempt after the last one."""
    preds = np.zeros(len(obs))
    belief = params["p_init"]
    for t, o in enumerate(obs):
        preds[t] = belief * (1 - params["p_slip"]) + (1 - belief) * params["p_guess"]
        _, belief = bkt_step(belief, int(o), params)
    return preds, belief


def p_correct(belief: float, params: dict) -> float:
    return belief * (1 - params["p_slip"]) + (1 - belief) * params["p_guess"]
