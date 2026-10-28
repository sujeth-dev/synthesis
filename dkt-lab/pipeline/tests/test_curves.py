"""Curve diagnostics and the numpy DKT forward pass.

Two things are being protected here. First, the measurement defects that made
the original learning curve misleading — a hard cap at opportunity 20, and
`break` on the first thin bucket — must not come back; `test_thin_bucket_*`
pins that. Second, the numpy forward pass must agree with PyTorch, which the
committed parity fixture lets us check without importing torch.
"""
import json
import os

import numpy as np
import pandas as pd
import pytest

import curves
import dkt_numpy

FIXTURE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..",
                                       "web", "src", "models", "fixtures", "parity.json"))


# ── buckets ─────────────────────────────────────────────────────────────────
def test_buckets_are_singletons_then_geometric():
    b = curves.buckets(60)
    assert b[:3] == [(1, 1), (2, 2), (3, 3)]
    assert b[19] == (20, 20)                       # the first 20 stay at full resolution
    assert all(hi >= lo for lo, hi in b)
    assert b[-1][1] == 60                          # and the buckets reach the end of the data
    # Tail buckets only get wider, except the last, which is clipped to the data.
    widths = [hi - lo + 1 for lo, hi in b[20:-1]]
    assert widths == sorted(widths)


def test_buckets_reach_far_beyond_the_old_cap():
    """The old curve stopped at opportunity 20, so 'what happens over a lot of
    questions' was never in view."""
    b = curves.buckets(1295)
    assert b[-1][1] == 1295
    assert len(b) < 40                             # still a readable number of points


def test_buckets_shorter_than_the_singleton_run():
    assert curves.buckets(3) == [(1, 1), (2, 2), (3, 3)]


# ── curve points ────────────────────────────────────────────────────────────
def _frame(rows):
    df = pd.DataFrame(rows, columns=["student_id", "skill_id", "correct", "model"])
    df["opportunity"] = curves.opportunity_index(df)
    return df


def test_thin_bucket_is_skipped_not_terminal():
    """The original code did `if len(m) < 30: break`, so one sparse bucket ended
    the whole curve. A thin bucket must be skipped and the rest still returned.

    Note counts per opportunity are necessarily non-increasing — a pair seen at
    opportunity n was seen at n-1 — so a thin bucket mid-curve only arises from
    the bucket list, not from the data. Hence an explicit list with a gap."""
    df = _frame([(f"s{s}", "a", 1, 0.5) for s in range(40) for _ in range(3)])
    pts = curves.curve_points(df, ["model"], [(1, 1), (99, 99), (2, 2), (3, 3)], min_rows=30)
    seen = [p["from"] for p in pts]
    assert 99 not in seen                          # the empty bucket is absent
    assert seen == [1, 2, 3]                       # and every other bucket survived it


def test_curve_survives_a_depressed_first_bucket():
    """The real case: evaluated rows drop each student's first interaction, so
    opportunity 1 is short by one row per student and can fall below the
    threshold. The old `break` would have returned an empty curve."""
    rows = [(f"s{s}", "a", 1, 0.5) for s in range(40) for _ in range(3)]
    df = _frame(rows)
    df = df[~((df["opportunity"] == 1) & (df.index % 1 == 0) & (df["student_id"] != "s0"))]
    pts = curves.curve_points(df, ["model"], curves.buckets(3), min_rows=30)
    assert [p["from"] for p in pts] == [2, 3]


def test_curve_point_values_and_ci():
    df = _frame([(f"s{s}", "a", s % 2, 0.4) for s in range(100)])
    pts = curves.curve_points(df, ["model"], [(1, 1)], min_rows=10)
    assert pts[0]["n"] == 100
    assert pts[0]["actual"] == pytest.approx(0.5)
    assert pts[0]["model"] == pytest.approx(0.4)
    lo, hi = pts[0]["actual_ci"]
    assert lo < 0.5 < hi


# ── cohort curve: the selection-effect control ──────────────────────────────
def test_cohort_curve_holds_the_population_constant():
    """A raw curve's later points average a different, more persistent set of
    learners. The cohort curve must show the same n at every point."""
    rows = []
    for s in range(50):                            # 50 pairs with 6 attempts
        rows += [(f"long{s}", "a", 1, 0.5) for _ in range(6)]
    for s in range(50):                            # 50 pairs with only 2
        rows += [(f"short{s}", "a", 0, 0.5) for _ in range(2)]
    df = _frame(rows)
    c = curves.cohort_curve(df, ["model"], min_opportunities=6, min_rows=10)
    assert c["pairs"] == 50
    assert [p["n"] for p in c["points"]] == [50] * 6
    assert all(p["actual"] == 1.0 for p in c["points"])   # the short, failing pairs are excluded


def test_cohort_curve_empty_when_no_pair_is_long_enough():
    df = _frame([(f"s{s}", "a", 1, 0.5) for s in range(50)])
    c = curves.cohort_curve(df, ["model"], min_opportunities=10, min_rows=5)
    assert c["pairs"] == 0 and c["points"] == []


# ── fidelity ────────────────────────────────────────────────────────────────
def test_fit_slope_recovers_a_known_line():
    x = np.arange(10, dtype=float)
    assert curves.fit_slope(x, 3.0 * x + 1.0) == pytest.approx(3.0)


def test_slope_ratio_is_one_for_a_perfect_tracker_and_zero_for_a_flat_line():
    pts = [{"opportunity": n, "n": 100, "actual": 0.4 + 0.02 * n,
            "perfect": 0.4 + 0.02 * n, "flat": 0.5} for n in range(1, 11)]
    f = curves.curve_fidelity(pts, ["perfect", "flat"])
    assert f["models"]["perfect"]["slope_ratio"] == pytest.approx(1.0)
    assert f["models"]["perfect"]["mae"] == pytest.approx(0.0)
    assert f["models"]["flat"]["slope_ratio"] == pytest.approx(0.0)


def test_slope_ratio_is_negative_for_a_curve_running_backwards():
    pts = [{"opportunity": n, "n": 100, "actual": 0.4 + 0.02 * n, "backwards": 0.7 - 0.02 * n}
           for n in range(1, 11)]
    f = curves.curve_fidelity(pts, ["backwards"])
    assert f["models"]["backwards"]["slope_ratio"] == pytest.approx(-1.0)


# ── calibration ─────────────────────────────────────────────────────────────
def test_ece_is_zero_when_calibrated_and_positive_when_not():
    y = np.array([0, 1] * 500)
    assert curves.ece(y, np.full(1000, 0.5)) == pytest.approx(0.0, abs=1e-9)
    assert curves.ece(y, np.full(1000, 0.95)) > 0.4


# ── baselines: the control that makes the diagnosis falsifiable ─────────────
def test_baselines_contain_no_learning():
    train = pd.DataFrame({"student_id": ["a"] * 6, "skill_id": ["x", "x", "x", "y", "y", "y"],
                          "correct": [1, 1, 1, 0, 0, 1]})
    ev = pd.DataFrame({"student_id": ["b", "b", "b", "b"], "skill_id": ["x", "x", "y", "y"],
                       "correct": [1, 0, 1, 1]})
    b = curves.baseline_predictions(train, ev)
    assert np.allclose(b["global_rate"], 4 / 6)
    # Difficulty only: one value per skill, identical across repeats of that skill.
    assert b["skill_rate"][0] == b["skill_rate"][1] == pytest.approx(1.0)
    assert b["skill_rate"][2] == b["skill_rate"][3] == pytest.approx(1 / 3)
    # Ability only, and strictly causal: the first row cannot use its own answer.
    assert b["student_rate"][0] == pytest.approx(4 / 6)
    assert b["student_rate"][1] == pytest.approx(1.0)          # after one correct
    assert b["student_rate"][2] == pytest.approx(0.5)          # after 1 of 2
    assert set(b) == {"global_rate", "skill_rate", "student_rate", "skill_and_student"}


def test_skill_rate_falls_back_for_an_unseen_skill():
    train = pd.DataFrame({"student_id": ["a", "a"], "skill_id": ["x", "x"], "correct": [1, 0]})
    ev = pd.DataFrame({"student_id": ["b"], "skill_id": ["never_trained"], "correct": [1]})
    assert curves.baseline_predictions(train, ev)["skill_rate"][0] == pytest.approx(0.5)


# ── mechanism ───────────────────────────────────────────────────────────────
def test_evidence_response_detects_direction_and_indifference():
    """A model that updates on evidence separates correct from wrong. One that
    ignores the answer has zero separation — which is what a flat curve looks
    like from the inside."""
    skills = np.array([0, 0, 0, 0])
    correct = np.array([1, 1, 0, 0])
    responsive = np.array([[0.5, 0.5], [0.6, 0.5], [0.5, 0.5], [0.4, 0.5]])
    r = curves.evidence_response([{"traj": responsive, "skills": skills, "correct": correct}])
    assert r["after_correct"]["mean_delta"] > 0
    assert r["after_wrong"]["mean_delta"] < 0
    assert r["separation"] > 0

    indifferent = np.full((4, 2), 0.5)
    flat = curves.evidence_response([{"traj": indifferent, "skills": skills, "correct": correct}])
    assert flat["separation"] == pytest.approx(0.0)


def test_waviness_is_zero_for_a_still_model():
    skills = np.array([0, 1, 0])
    correct = np.array([1, 1, 1])
    still = np.full((3, 4), 1.0)
    w = curves.waviness_and_reconstruction([{"traj": still, "skills": skills, "correct": correct}])
    assert w["w1"] == pytest.approx(0.0) and w["w2"] == pytest.approx(0.0)
    assert w["reconstruction_error"] == pytest.approx(0.0)     # predicts 1, answer was 1


def test_waviness_counts_untouched_skills_thrashing():
    """The point of w1: a model whose predictions for skills the learner never
    touched swing about does not hold a stable picture of what they know."""
    skills = np.array([0, 0])
    correct = np.array([1, 1])
    thrash = np.array([[0.5, 0.1, 0.9, 0.5], [0.5, 0.9, 0.1, 0.5]])
    w = curves.waviness_and_reconstruction([{"traj": thrash, "skills": skills, "correct": correct}])
    assert w["w1"] == pytest.approx((0.0 + 0.8 + 0.8 + 0.0) / 4)


def test_within_pair_spread_is_zero_for_a_static_predictor():
    df = _frame([(f"s{s}", "a", 1, 0.5) for s in range(20) for _ in range(5)])
    df["moving"] = df["opportunity"] * 0.1
    out = curves.within_pair_spread(df, ["model", "moving"], min_opportunities=5)
    assert out["models"]["model"]["mean_within_pair_sd"] == pytest.approx(0.0)
    assert out["models"]["moving"]["mean_within_pair_sd"] > 0


# ── numpy DKT vs PyTorch ────────────────────────────────────────────────────
@pytest.mark.skipif(not os.path.exists(FIXTURE), reason="parity fixture not generated")
def test_numpy_forward_pass_matches_pytorch():
    """The fixture holds PyTorch's own outputs (export.py --fixture), so this
    pins the numpy pass to PyTorch without importing torch."""
    with open(FIXTURE) as f:
        fx = json.load(f)
    path = os.path.join(os.path.dirname(FIXTURE), "_tmp_weights.json")
    with open(path, "w") as f:
        json.dump(fx["weights"], f)
    try:
        w = dkt_numpy.load_weights(path)
    finally:
        os.remove(path)

    checked = 0
    for case in fx["cases"]:
        hist = case["history"]
        if not hist:
            continue                               # empty history is the cold start, not a trajectory
        skills = np.array([w.skill_index[h["skill"]] for h in hist])
        correct = np.array([int(h["correct"]) for h in hist])
        got = dkt_numpy.all_skill_trajectory(w, skills, correct)[-1]
        assert np.allclose(got, case["expected"], atol=1e-5), f"history length {len(hist)}"
        checked += 1
    assert checked >= 2


@pytest.mark.skipif(not os.path.exists(FIXTURE), reason="parity fixture not generated")
def test_next_step_predictions_read_out_the_following_skill():
    """predict_next_step[t] must be P(correct on skills[t+1]) given 0..t, which
    is run.py's protocol; checked against the trajectory read-out."""
    with open(FIXTURE) as f:
        fx = json.load(f)
    path = os.path.join(os.path.dirname(FIXTURE), "_tmp_weights2.json")
    with open(path, "w") as f:
        json.dump(fx["weights"], f)
    try:
        w = dkt_numpy.load_weights(path)
    finally:
        os.remove(path)

    rng = np.random.default_rng(0)
    skills = rng.integers(0, w.S, size=12)
    correct = rng.integers(0, 2, size=12)
    nxt = dkt_numpy.predict_next_step(w, [(skills, correct)])[0]
    traj = dkt_numpy.all_skill_trajectory(w, skills, correct)
    assert len(nxt) == 11
    for t in range(11):
        assert nxt[t] == pytest.approx(traj[t, skills[t + 1]], abs=1e-12)


def test_load_weights_rejects_the_time_feature_format():
    """Time-feature models carry extra input and output columns; reading them
    with the one-hot layout would silently produce wrong numbers."""
    path = os.path.join(os.path.dirname(__file__), "_tmp_bad.json")
    with open(path, "w") as f:
        json.dump({"format": "dkt-lab-time-v1", "skills": ["a"], "hidden_size": 1}, f)
    try:
        with pytest.raises(ValueError, match="synaptic-dkt-v1"):
            dkt_numpy.load_weights(path)
    finally:
        os.remove(path)


def test_batched_prediction_matches_one_at_a_time():
    """predict_next_step sorts and pads sequences into batches; padding must not
    change any earlier output."""
    with open(FIXTURE) as f:
        fx = json.load(f)
    path = os.path.join(os.path.dirname(__file__), "_tmp_w3.json")
    with open(path, "w") as f:
        json.dump(fx["weights"], f)
    try:
        w = dkt_numpy.load_weights(path)
    finally:
        os.remove(path)

    rng = np.random.default_rng(7)
    seqs = [(rng.integers(0, w.S, size=n), rng.integers(0, 2, size=n)) for n in (3, 17, 2, 9)]
    together = dkt_numpy.predict_next_step(w, seqs, batch_size=4)
    for i, s in enumerate(seqs):
        alone = dkt_numpy.predict_next_step(w, [s])[0]
        assert np.allclose(together[i], alone, atol=1e-12)
