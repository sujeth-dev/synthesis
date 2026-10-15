"""BKT EM on tiny fixtures: matches the original per-sequence forward-backward
(Research/dkt/bkt_baseline.py, reproduced below as a reference), improves the
likelihood, and recovers parameters from data simulated with known values."""
import numpy as np

import bkt

EPS = 1e-4


def reference_forward_backward(obs, p_init, p_transit, p_slip, p_guess):
    """Loop version copied from Research/dkt/bkt_baseline.py::_forward_backward."""
    emit = {1: {1: 1 - p_slip, 0: p_slip}, 0: {1: p_guess, 0: 1 - p_guess}}
    T = len(obs)
    alpha, c = np.zeros((T, 2)), np.zeros(T)
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
    beta = np.zeros((T, 2))
    beta[T - 1] = 1.0
    for t in range(T - 2, -1, -1):
        beta[t, 0] = ((1 - p_transit) * emit[0][obs[t + 1]] * beta[t + 1, 0] + p_transit * emit[1][obs[t + 1]] * beta[t + 1, 1]) / c[t + 1]
        beta[t, 1] = (emit[1][obs[t + 1]] * beta[t + 1, 1]) / c[t + 1]
    gamma = alpha * beta
    gamma /= np.clip(gamma.sum(axis=1, keepdims=True), EPS, None)
    return gamma, float(np.sum(np.log(c)))


def simulate(n, T, p, rng):
    seqs = []
    for _ in range(n):
        L = rng.integers(2, T + 1)
        known = rng.random() < p["p_init"]
        obs = []
        for _ in range(L):
            obs.append(int(rng.random() < (1 - p["p_slip"] if known else p["p_guess"])))
            known = known or rng.random() < p["p_transit"]
        seqs.append(np.array(obs))
    return seqs


def test_vectorised_forward_backward_matches_reference():
    rng = np.random.default_rng(1)
    seqs = [rng.integers(0, 2, size=L) for L in (1, 4, 9)]
    obs, mask = bkt.pad(seqs)
    A = bkt.transition(0.15, 0.0)
    gamma, _, ll = bkt.forward_backward(obs, mask, 0.35, A, 0.12, 0.22)
    total = 0.0
    for i, s in enumerate(seqs):
        g_ref, ll_ref = reference_forward_backward(s, 0.35, 0.15, 0.12, 0.22)
        np.testing.assert_allclose(gamma[i, : len(s)], g_ref, atol=1e-10)
        total += ll_ref
    assert abs(ll - total) < 1e-9


def test_em_recovers_known_parameters():
    truth = {"p_init": 0.2, "p_transit": 0.15, "p_slip": 0.08, "p_guess": 0.2}
    seqs = simulate(1500, 12, truth, np.random.default_rng(0))
    fit = bkt.fit_skill_bkt(seqs)
    for k, v in truth.items():
        assert abs(fit[k] - v) < 0.06, (k, fit[k], v)


def test_em_never_decreases_likelihood():
    seqs = simulate(200, 8, {"p_init": 0.4, "p_transit": 0.2, "p_slip": 0.1, "p_guess": 0.3}, np.random.default_rng(3))
    obs, mask = bkt.pad(seqs)
    lls = []
    for iters in (1, 2, 5, 15):
        old = bkt.MAX_EM_ITERS
        bkt.MAX_EM_ITERS = iters
        try:
            p = bkt.fit_skill_bkt(seqs)
        finally:
            bkt.MAX_EM_ITERS = old
        _, _, ll = bkt.forward_backward(obs, mask, p["p_init"], bkt.transition(p["p_transit"], 0.0), p["p_slip"], p["p_guess"])
        lls.append(ll)
    assert all(b >= a - 1e-6 for a, b in zip(lls, lls[1:])), lls


def test_forgetting_variant_learns_a_forget_rate():
    rng = np.random.default_rng(5)
    seqs = []
    for _ in range(1500):  # mastery that is lost with p=0.2 per step
        known, obs = rng.random() < 0.5, []
        for _ in range(10):
            obs.append(int(rng.random() < (0.9 if known else 0.2)))
            known = (rng.random() < 0.3) if not known else (rng.random() >= 0.2)
        seqs.append(np.array(obs))
    plain = bkt.fit_skill_bkt(seqs)
    forget = bkt.fit_skill_bkt(seqs, forgetting=True)
    assert plain["p_forget"] == 0.0
    assert 0.1 < forget["p_forget"] < 0.3
    assert forget["log_likelihood"] > plain["log_likelihood"]


def test_predict_sequence_is_forward_only():
    p = {"p_init": 0.3, "p_transit": 0.1, "p_slip": 0.1, "p_guess": 0.25}
    a = bkt.predict_sequence(np.array([1, 1, 0, 1]), p)
    b = bkt.predict_sequence(np.array([1, 1, 1, 0]), p)
    np.testing.assert_allclose(a[:3], b[:3])
    assert abs(a[0] - (0.3 * 0.9 + 0.7 * 0.25)) < 1e-12
