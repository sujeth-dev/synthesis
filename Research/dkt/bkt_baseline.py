"""Fit a proper per-skill Bayesian Knowledge Tracing (BKT) baseline via
EM (Baum-Welch), evaluated on the same student-level split as the DKT
model.

This is a from-scratch, academic 2-state/2-observation HMM fit
(state = {not-mastered, mastered}, no forgetting -- mastered is an
absorbing state, matching the classical Corbett & Anderson formulation).
It is intentionally distinct from Synaptic's live single-global-parameter
BKT engine (`src/lib/bkt/index.ts`); this exists purely as a benchmark
baseline for comparison against DKT, not as a production component.

Per skill, four parameters are fit by EM:
    p_init     P(L_1 = mastered)                 ("prior knowledge")
    p_transit  P(L_{t+1}=mastered | L_t=not)      ("learn rate")
    p_slip     P(incorrect | mastered)            ("slip")
    p_guess    P(correct | not mastered)          ("guess")

E-step: forward-backward (with scaling for numerical stability) over
each student's interaction sequence for the skill. M-step: closed-form
re-estimation from the posterior state/transition probabilities,
standard Baum-Welch for this HMM structure.

Fitting uses only `train` students (per data/splits.json). Test-set AUC
is computed with a forward-only pass (no peeking at future outcomes):
at each test interaction, predict P(correct) from the state distribution
accumulated from that student's *prior* interactions on the same skill,
then compare against the actual label -- the same next-step prediction
protocol used for the DKT model, so the two AUCs are comparable.

Output: data/bkt_results.json
    {"skills": {<skill_id>: {"p_init", "p_transit", "p_slip", "p_guess",
                              "n_train_sequences"}},
     "test_predictions": [{"student_id", "skill_id", "timestamp",
                            "actual", "predicted"}]}
"""
import json
import os

import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SEQUENCES_PATH = os.path.join(DATA_DIR, "sequences.csv")
SPLITS_PATH = os.path.join(DATA_DIR, "splits.json")
OUT_PATH = os.path.join(DATA_DIR, "bkt_results.json")

EPS = 1e-4
MAX_EM_ITERS = 30
CONVERGENCE_TOL = 1e-4
MIN_TRAIN_SEQUENCES = 5

DEFAULT_PARAMS = {"p_init": 0.3, "p_transit": 0.1, "p_slip": 0.1, "p_guess": 0.25}


def _clip(p: float) -> float:
    return float(min(max(p, EPS), 1 - EPS))


def _emit_table(p_slip: float, p_guess: float) -> dict:
    return {1: {1: 1 - p_slip, 0: p_slip}, 0: {1: p_guess, 0: 1 - p_guess}}


def _forward_backward(obs: np.ndarray, p_init: float, p_transit: float, emit: dict):
    """Scaled forward-backward for the absorbing-mastered 2-state HMM.
    Returns (gamma, xi01, log_likelihood) where gamma[t, k] = P(L_t=k | obs)
    and xi01[t] = P(L_t=0, L_{t+1}=1 | obs) for t in 0..T-2."""
    T = len(obs)
    alpha = np.zeros((T, 2))
    c = np.zeros(T)

    alpha[0, 1] = p_init * emit[1][obs[0]]
    alpha[0, 0] = (1 - p_init) * emit[0][obs[0]]
    c[0] = max(alpha[0].sum(), EPS)
    alpha[0] /= c[0]

    for t in range(1, T):
        pred0 = alpha[t - 1, 0] * (1 - p_transit)
        pred1 = alpha[t - 1, 0] * p_transit + alpha[t - 1, 1]
        alpha[t, 0] = pred0 * emit[0][obs[t]]
        alpha[t, 1] = pred1 * emit[1][obs[t]]
        c[t] = max(alpha[t].sum(), EPS)
        alpha[t] /= c[t]

    log_likelihood = np.sum(np.log(c))

    beta = np.zeros((T, 2))
    beta[T - 1] = 1.0
    for t in range(T - 2, -1, -1):
        beta[t, 0] = (
            (1 - p_transit) * emit[0][obs[t + 1]] * beta[t + 1, 0]
            + p_transit * emit[1][obs[t + 1]] * beta[t + 1, 1]
        ) / c[t + 1]
        beta[t, 1] = (emit[1][obs[t + 1]] * beta[t + 1, 1]) / c[t + 1]

    gamma = alpha * beta
    gamma /= np.clip(gamma.sum(axis=1, keepdims=True), EPS, None)

    xi01 = np.zeros(max(T - 1, 0))
    for t in range(T - 1):
        denom = (
            alpha[t, 0] * (1 - p_transit) * emit[0][obs[t + 1]] * beta[t + 1, 0]
            + alpha[t, 0] * p_transit * emit[1][obs[t + 1]] * beta[t + 1, 1]
            + alpha[t, 1] * emit[1][obs[t + 1]] * beta[t + 1, 1]
        )
        denom = max(denom, EPS)
        xi01[t] = (alpha[t, 0] * p_transit * emit[1][obs[t + 1]] * beta[t + 1, 1]) / denom

    return gamma, xi01, log_likelihood


def fit_skill_bkt(sequences: list[np.ndarray]) -> dict:
    """Fit one skill's BKT params via Baum-Welch on a list of 0/1 arrays
    (one array per student's ordered correctness sequence for this skill)."""
    p_init = DEFAULT_PARAMS["p_init"]
    p_transit = DEFAULT_PARAMS["p_transit"]
    p_slip = DEFAULT_PARAMS["p_slip"]
    p_guess = DEFAULT_PARAMS["p_guess"]

    prev_ll = -np.inf
    for _ in range(MAX_EM_ITERS):
        emit = _emit_table(p_slip, p_guess)

        init_num, n_seqs = 0.0, 0
        transit_num, transit_den = 0.0, 0.0
        slip_num, slip_den = 0.0, 0.0
        guess_num, guess_den = 0.0, 0.0
        total_ll = 0.0

        for obs in sequences:
            if len(obs) == 0:
                continue
            n_seqs += 1
            gamma, xi01, ll = _forward_backward(obs, p_init, p_transit, emit)
            total_ll += ll

            init_num += gamma[0, 1]

            transit_num += xi01.sum()
            transit_den += gamma[:-1, 0].sum() if len(obs) > 1 else 0.0

            correct_mask = obs == 1
            slip_num += gamma[~correct_mask, 1].sum()
            slip_den += gamma[:, 1].sum()
            guess_num += gamma[correct_mask, 0].sum()
            guess_den += gamma[:, 0].sum()

        if n_seqs == 0:
            break

        p_init = _clip(init_num / n_seqs)
        p_transit = _clip(transit_num / max(transit_den, EPS))
        p_slip = _clip(slip_num / max(slip_den, EPS))
        p_guess = _clip(guess_num / max(guess_den, EPS))

        if abs(total_ll - prev_ll) < CONVERGENCE_TOL:
            break
        prev_ll = total_ll

    return {
        "p_init": p_init,
        "p_transit": p_transit,
        "p_slip": p_slip,
        "p_guess": p_guess,
        "n_train_sequences": len(sequences),
    }


def predict_sequence(obs: np.ndarray, params: dict) -> np.ndarray:
    """Forward-only next-step prediction: predicted[t] = P(correct at t)
    using only obs[0:t] (no peeking at obs[t] itself)."""
    p_init = params["p_init"]
    p_transit = params["p_transit"]
    p_slip = params["p_slip"]
    p_guess = params["p_guess"]

    T = len(obs)
    preds = np.zeros(T)
    belief1 = p_init  # P(L_t = mastered), before seeing obs[t]

    for t in range(T):
        preds[t] = belief1 * (1 - p_slip) + (1 - belief1) * p_guess

        if obs[t] == 1:
            post1 = belief1 * (1 - p_slip)
            post0 = (1 - belief1) * p_guess
        else:
            post1 = belief1 * p_slip
            post0 = (1 - belief1) * (1 - p_guess)
        denom = max(post1 + post0, EPS)
        post1 /= denom

        belief1 = post1 + (1 - post1) * p_transit

    return preds


def build_sequences_by_skill(df: pd.DataFrame, student_ids: set) -> dict:
    subset = df[df["student_id"].isin(student_ids)]
    out: dict[int, dict[int, np.ndarray]] = {}
    for (skill_id, student_id), group in subset.groupby(["skill_id", "student_id"]):
        group = group.sort_values("timestamp")
        out.setdefault(int(skill_id), {})[int(student_id)] = group["correct"].to_numpy()
    return out


def main() -> None:
    if not os.path.exists(SEQUENCES_PATH) or not os.path.exists(SPLITS_PATH):
        raise FileNotFoundError(
            "Missing data/sequences.csv or data/splits.json -- run "
            "preprocess.py then split.py first."
        )

    df = pd.read_csv(SEQUENCES_PATH)
    with open(SPLITS_PATH) as f:
        splits = json.load(f)

    train_ids = set(splits["train"])

    train_by_skill = build_sequences_by_skill(df, train_ids)
    test_by_skill = build_sequences_by_skill(df, set(splits["test"]))

    skill_results = {}
    test_predictions = []

    all_skills = sorted(set(train_by_skill) | set(test_by_skill))
    for skill_id in all_skills:
        train_sequences = list(train_by_skill.get(skill_id, {}).values())

        if len(train_sequences) >= MIN_TRAIN_SEQUENCES:
            params = fit_skill_bkt(train_sequences)
        else:
            params = dict(DEFAULT_PARAMS)
            params["n_train_sequences"] = len(train_sequences)

        skill_results[str(skill_id)] = params

        for student_id, obs in test_by_skill.get(skill_id, {}).items():
            preds = predict_sequence(obs, params)
            group = df[
                (df["student_id"] == student_id) & (df["skill_id"] == skill_id)
            ].sort_values("timestamp")
            for ts, actual, predicted in zip(group["timestamp"], obs, preds):
                test_predictions.append(
                    {
                        "student_id": int(student_id),
                        "skill_id": int(skill_id),
                        "timestamp": int(ts),
                        "actual": int(actual),
                        "predicted": float(predicted),
                    }
                )

    with open(OUT_PATH, "w") as f:
        json.dump({"skills": skill_results, "test_predictions": test_predictions}, f)

    print(
        f"Fit BKT for {len(skill_results)} skills, "
        f"{len(test_predictions)} test predictions -> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
