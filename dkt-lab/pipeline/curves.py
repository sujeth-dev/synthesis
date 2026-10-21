"""Learning-curve diagnostics: does a model represent *learning*, or only
difficulty and ability?

Why this module exists. The lab's headline metrics (AUC, log-loss, RMSE,
accuracy) are all computed over a flat pool of next-step predictions. They
reward a model for ranking answers correctly, which a model can do by learning
only two static things: which skills are hard, and which students are strong.
Neither of those is learning. A learning curve — P(correct) against the n-th
attempt at a skill — is the measurement that separates them, and on assist2009
it exposes a model that wins every aggregate metric while its curve is flat.

So the aggregate metrics and the curve are asking different questions, and the
curve is the one an adaptive tutor actually depends on: every mastery and
scheduling decision in Synaptic is a claim that a learner improved.

What was wrong with the old measurement (run.py's `learning_curves`):

  1. `CURVE_MAX_OPP = 20` — the question "what happens over a lot of questions"
     was never in view. assist2009 sequences run to 1,295 interactions.
  2. `if len(m) < 30: break` — one thin bucket ended the curve. synthetic5 has
     exactly one attempt per (student, exercise), so its curve was one point,
     and that was reported as a curve rather than as a dataset that cannot have
     one.
  3. No confidence intervals, so a 0.01 wiggle and a real effect looked alike.
  4. No control for the fact that **each bucket is a different population**.
     Students who are still answering a skill for the 15th time are the ones who
     keep getting it wrong. Aggregate curves therefore flatten for reasons that
     have nothing to do with the model, which `cohort_curve` fixes by holding the
     population constant.

The measures here fall into three groups:

  * **Curves** — `raw_curve` (every opportunity, geometric buckets into the tail)
    and `cohort_curve` (same students at every point).
  * **Curve fidelity** — `curve_fidelity`: how closely a model's curve follows the
    observed one (`mae`) and whether it reproduces its *growth* (`slope_ratio`,
    where 1.0 tracks learning and 0.0 is flat). These are the numbers to tune
    against when AUC cannot see the problem.
  * **Mechanism** — `evidence_response` (does the predicted probability for a
    skill move after an answer on that skill?), `waviness` and
    `reconstruction_error` (Yeung & Yeung 2018's measures of a DKT that thrashes
    or fails to reflect the answer it just saw), and `position_slices` (does
    accuracy decay deep into a long sequence?).

Plus `baseline_predictions`, the control that makes the whole argument
falsifiable: static difficulty-and-ability predictors that contain no learning
by construction. If a model's curve looks like theirs, it has not learned
learning.

Nothing here imports torch. Predictions come from dkt_numpy or from run.py.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

MIN_BUCKET_ROWS = 30
BOOT_REPS = 400
BOOT_SEED = 42
SINGLE_OPPORTUNITIES = 20       # opportunities 1..20 get their own bucket
TAIL_GROWTH = 1.5               # then geometric ranges, so the tail stays readable


# ── buckets ─────────────────────────────────────────────────────────────────
def opportunity_index(df: pd.DataFrame) -> pd.Series:
    """1-based n-th attempt of this student on this skill. Assumes df is already
    sorted by (student_id, order), as run.py's `load` leaves it."""
    return df.groupby(["student_id", "skill_id"]).cumcount() + 1


def buckets(max_opportunity: int) -> list[tuple[int, int]]:
    """Singleton buckets over the first 20 opportunities, then geometric ranges
    out to `max_opportunity`. Unlike the old fixed cap this reaches the end of
    the data, and unlike a uniform binning it keeps the early curve — where the
    learning happens — at full resolution."""
    out = [(n, n) for n in range(1, min(SINGLE_OPPORTUNITIES, max_opportunity) + 1)]
    lo = SINGLE_OPPORTUNITIES + 1
    while lo <= max_opportunity:
        hi = max(lo, int(round(lo * TAIL_GROWTH)) - 1)
        out.append((lo, min(hi, max_opportunity)))
        lo = hi + 1
    return out


def _boot_ci(x: np.ndarray, reps: int = BOOT_REPS, seed: int = BOOT_SEED) -> tuple[float, float]:
    """Percentile bootstrap 95% CI for a mean. Returns (lo, hi)."""
    if len(x) < 2:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    means = x[rng.integers(0, len(x), size=(reps, len(x)))].mean(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def curve_points(ev: pd.DataFrame, model_cols: list[str], bucket_list: list[tuple[int, int]],
                 min_rows: int = MIN_BUCKET_ROWS, ci: bool = True) -> list[dict]:
    """One point per bucket that clears `min_rows`. Thin buckets are skipped, not
    treated as the end of the curve."""
    opp = ev["opportunity"].to_numpy()
    points = []
    for lo, hi in bucket_list:
        m = ev[(opp >= lo) & (opp <= hi)]
        if len(m) < min_rows:
            continue
        y = m["correct"].to_numpy(dtype=float)
        p = {
            "opportunity": lo if lo == hi else (lo + hi) / 2,
            "from": lo, "to": hi,
            "label": str(lo) if lo == hi else f"{lo}–{hi}",
            "n": int(len(m)),
            "actual": float(y.mean()),
            **{c: float(m[c].mean()) for c in model_cols},
        }
        if ci:
            p["actual_ci"] = [round(v, 5) for v in _boot_ci(y)]
        points.append(p)
    return points


# ── curves ──────────────────────────────────────────────────────────────────
def raw_curve(ev: pd.DataFrame, model_cols: list[str], min_rows: int = MIN_BUCKET_ROWS) -> dict:
    """The aggregate curve, measured properly: all the way to the data's maximum
    opportunity, skipping thin buckets instead of stopping at the first one.

    Still subject to the selection effect — later points are a different, more
    persistent population. `cohort_curve` is the controlled version."""
    max_opp = int(ev["opportunity"].max())
    return {
        "kind": "raw",
        "note": "every held-out row, bucketed by opportunity. Later buckets average "
                "a different, more persistent population than earlier ones — see the cohort curve.",
        "max_opportunity_in_data": max_opp,
        "min_rows": min_rows,
        "points": curve_points(ev, model_cols, buckets(max_opp), min_rows),
    }


def cohort_curve(ev: pd.DataFrame, model_cols: list[str], min_opportunities: int = 10,
                 min_rows: int = MIN_BUCKET_ROWS) -> dict:
    """The selection effect removed: keep only (student, skill) pairs observed at
    least `min_opportunities` times, then plot their first `min_opportunities`
    opportunities. Every point describes the same pairs, so a flat line here is
    a real absence of growth rather than a change of population.

    This is the curve to judge a model on."""
    counts = ev.groupby(["student_id", "skill_id"])["opportunity"].transform("max")
    keep = ev[(counts >= min_opportunities) & (ev["opportunity"] <= min_opportunities)]
    pairs = keep.groupby(["student_id", "skill_id"]).ngroups if len(keep) else 0
    return {
        "kind": "cohort",
        "note": f"only (student, skill) pairs with at least {min_opportunities} attempts, "
                f"restricted to their first {min_opportunities}. Same population at every point.",
        "min_opportunities": min_opportunities,
        "pairs": int(pairs),
        "min_rows": min_rows,
        "points": curve_points(keep, model_cols, [(n, n) for n in range(1, min_opportunities + 1)], min_rows)
        if len(keep) else [],
    }


# ── curve fidelity ──────────────────────────────────────────────────────────
def fit_slope(x: np.ndarray, y: np.ndarray, weights: np.ndarray | None = None) -> float:
    """Weighted OLS slope of y on x. Used as a single summary of how fast a curve
    rises, so a model's growth can be compared with the observed growth."""
    if len(x) < 2:
        return float("nan")
    w = np.ones_like(x, dtype=float) if weights is None else np.asarray(weights, dtype=float)
    xm = np.average(x, weights=w)
    ym = np.average(y, weights=w)
    var = np.average((x - xm) ** 2, weights=w)
    if var <= 0:
        return float("nan")
    return float(np.average((x - xm) * (y - ym), weights=w) / var)


def curve_fidelity(points: list[dict], model_cols: list[str]) -> dict:
    """How well each model's curve matches the observed one.

    `mae` is the row-weighted mean absolute gap — calibration along the curve.
    `slope_ratio` is the model's fitted slope divided by the observed slope: 1.0
    reproduces the observed growth, 0.0 is a flat line, negative runs backwards.
    `slope_ratio` is the one that answers "does this model represent learning".
    """
    if len(points) < 2:
        return {"n_points": len(points), "models": {}}
    x = np.array([p["opportunity"] for p in points], dtype=float)
    n = np.array([p["n"] for p in points], dtype=float)
    actual = np.array([p["actual"] for p in points], dtype=float)
    actual_slope = fit_slope(x, actual, n)
    out = {}
    for c in model_cols:
        v = np.array([p[c] for p in points], dtype=float)
        slope = fit_slope(x, v, n)
        out[c] = {
            "mae": float(np.average(np.abs(v - actual), weights=n)),
            "bias": float(np.average(v - actual, weights=n)),
            "slope": slope,
            "slope_ratio": float(slope / actual_slope) if actual_slope not in (0.0,) and np.isfinite(actual_slope) else float("nan"),
        }
    return {"n_points": len(points), "actual_slope": actual_slope, "models": out}


def per_skill_fidelity(ev: pd.DataFrame, model_cols: list[str], min_opportunities: int = 8,
                       min_rows_per_skill: int = 200, max_skills: int = 40) -> list[dict]:
    """Curve fidelity per skill, to tell a uniform failure from one driven by a
    handful of high-volume skills."""
    out = []
    for skill, g in ev.groupby("skill_id", sort=False):
        if len(g) < min_rows_per_skill:
            continue
        pts = curve_points(g, model_cols, [(n, n) for n in range(1, min_opportunities + 1)],
                           min_rows=MIN_BUCKET_ROWS, ci=False)
        if len(pts) < 3:
            continue
        f = curve_fidelity(pts, model_cols)
        out.append({"skill_id": str(skill), "n": int(len(g)), "n_points": f["n_points"],
                    "actual_slope": f["actual_slope"],
                    **{c: {k: f["models"][c][k] for k in ("mae", "slope", "slope_ratio")} for c in model_cols}})
    return sorted(out, key=lambda r: -r["n"])[:max_skills]


# ── mechanism ───────────────────────────────────────────────────────────────
def within_pair_spread(ev: pd.DataFrame, model_cols: list[str], min_opportunities: int = 5) -> dict:
    """Standard deviation of a model's predictions *within* one (student, skill)
    pair, averaged over pairs. A model that only encodes static difficulty and
    ability barely moves as a learner practises, so this is near zero; a model
    that tracks learning has to move."""
    counts = ev.groupby(["student_id", "skill_id"])["opportunity"].transform("max")
    keep = ev[counts >= min_opportunities]
    if not len(keep):
        return {"pairs": 0, "models": {}}
    g = keep.groupby(["student_id", "skill_id"])
    return {
        "pairs": int(g.ngroups),
        "min_opportunities": min_opportunities,
        "models": {c: {"mean_within_pair_sd": float(g[c].std(ddof=0).mean()),
                       "mean_first_to_last_change": float(g[c].last().mean() - g[c].first().mean())}
                   for c in model_cols},
    }


def evidence_response(trajectories: list[dict]) -> dict:
    """Does the predicted probability for a skill move in the right direction
    after an answer on that skill?

    For each interaction t on skill s, the change is P_t(s) - P_{t-1}(s), where
    P_t is the whole-skill prediction vector after consuming answer t. A model
    that updates on evidence lifts P(s) after a correct answer and lowers it
    after a wrong one. Near-zero means the answer changed nothing — the model is
    reading off a static estimate, which is exactly what a flat learning curve
    looks like from the inside.

    `trajectories` entries: {"traj": (L, S), "skills": (L,), "correct": (L,)}.
    """
    up, down = [], []
    for item in trajectories:
        traj, skills, correct = item["traj"], item["skills"], item["correct"]
        if len(skills) < 2:
            continue
        # Change at t (t >= 1) in the prediction for the skill answered at t.
        delta = traj[np.arange(1, len(skills)), skills[1:]] - traj[np.arange(0, len(skills) - 1), skills[1:]]
        c = correct[1:].astype(bool)
        up.append(delta[c])
        down.append(delta[~c])
    up = np.concatenate(up) if up else np.zeros(0)
    down = np.concatenate(down) if down else np.zeros(0)
    return {
        "after_correct": {"n": int(len(up)), "mean_delta": float(up.mean()) if len(up) else float("nan"),
                          "fraction_positive": float((up > 0).mean()) if len(up) else float("nan")},
        "after_wrong": {"n": int(len(down)), "mean_delta": float(down.mean()) if len(down) else float("nan"),
                        "fraction_negative": float((down < 0).mean()) if len(down) else float("nan")},
        "separation": float(up.mean() - down.mean()) if len(up) and len(down) else float("nan"),
    }


def waviness_and_reconstruction(trajectories: list[dict]) -> dict:
    """Yeung & Yeung (2018) consistency measures.

    `w1` / `w2` are the mean L1 / L2 change in the *whole* prediction vector from
    one answer to the next, per skill. High values mean predictions for skills
    the learner never touched are thrashing — the model's state is not a stable
    picture of what they know.

    `reconstruction_error` is the gap between the prediction for the skill just
    answered and that answer. A model that cannot reproduce the answer it has
    just consumed is not representing that answer's evidence, which is the
    mechanism behind a flat curve.
    """
    w1, w2, recon = [], [], []
    for item in trajectories:
        traj, skills, correct = item["traj"], item["skills"], item["correct"]
        if len(skills) < 2:
            continue
        d = traj[1:] - traj[:-1]
        S = traj.shape[1]
        w1.append(np.abs(d).sum(axis=1) / S)
        w2.append((d ** 2).sum(axis=1) / S)
        recon.append(np.abs(traj[np.arange(len(skills)), skills] - correct))
    if not w1:
        return {"w1": float("nan"), "w2": float("nan"), "reconstruction_error": float("nan"), "n_steps": 0}
    w1 = np.concatenate(w1)
    w2 = np.concatenate(w2)
    recon = np.concatenate(recon)
    return {"w1": float(w1.mean()), "w2": float(np.sqrt(w2.mean())),
            "reconstruction_error": float(recon.mean()), "n_steps": int(len(w1))}


def position_slices(ev: pd.DataFrame, model_cols: list[str], n_bins: int = 10) -> dict:
    """Metrics by absolute position in the learner's sequence, in deciles.

    Tests long-sequence degradation directly: if an LSTM's hidden state saturates
    as a sequence runs on, its accuracy and calibration should fall off in the
    later deciles even though the aggregate number stays healthy."""
    from evaluate import scores
    pos = ev.groupby("student_id").cumcount() + 1
    ev = ev.assign(_pos=pos)
    edges = np.unique(np.quantile(pos, np.linspace(0, 1, n_bins + 1)).round().astype(int))
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = ev[(ev["_pos"] >= lo) & (ev["_pos"] < hi)] if hi != edges[-1] else ev[ev["_pos"] >= lo]
        if len(m) < MIN_BUCKET_ROWS * 2:
            continue
        y = m["correct"].to_numpy(dtype=int)
        row = {"from": int(lo), "to": int(m["_pos"].max()), "n": int(len(m)), "actual": float(y.mean())}
        for c in model_cols:
            p = m[c].to_numpy(dtype=float)
            s = scores(y, p) if len(np.unique(y)) > 1 else {"auc": float("nan"), "log_loss": float("nan")}
            row[c] = {"auc": s["auc"], "log_loss": s["log_loss"], "mean_pred": float(p.mean()),
                      "ece": ece(y, p)}
        out.append(row)
    return {"note": "held-out rows sliced by absolute position in the student's sequence",
            "bins": out}


def ece(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    """Expected calibration error: mean |predicted - observed| over equal-width
    probability bins, weighted by bin size."""
    y = np.asarray(y, dtype=float)
    p = np.asarray(p, dtype=float)
    idx = np.clip((p * bins).astype(int), 0, bins - 1)
    total = 0.0
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        total += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(total)


# ── baselines: the control ──────────────────────────────────────────────────
def baseline_predictions(train_df: pd.DataFrame, ev: pd.DataFrame) -> dict[str, np.ndarray]:
    """Static predictors that contain no learning by construction, scored on the
    same held-out rows as the real models.

    These are what makes the diagnosis falsifiable. If a model's AUC is close to
    `skill_and_student`'s, then it has learned which skills are hard and which
    students are strong and little else — and if its *curve* is as flat as these
    curves, it has not learned learning at all.

      global_rate       the training set's overall correct rate. One number.
      skill_rate        per-skill training correct rate. Difficulty only.
      student_rate      the learner's running accuracy so far, computed causally
                        over their own earlier answers. Ability only.
      skill_and_student  the two combined in log-odds. Difficulty and ability,
                        with no notion of practice on a skill.
    """
    g = float(train_df["correct"].mean())
    by_skill = train_df.groupby("skill_id")["correct"].mean()

    skill_rate = ev["skill_id"].map(by_skill).fillna(g).to_numpy(dtype=float)

    # Causal running accuracy: mean of this student's strictly earlier answers,
    # falling back to the global rate before they have any.
    prior_sum = ev.groupby("student_id")["correct"].cumsum() - ev["correct"]
    prior_n = ev.groupby("student_id").cumcount()
    student_rate = np.where(prior_n > 0, prior_sum / prior_n.replace(0, 1), g).astype(float)

    def logit(x, eps=1e-6):
        x = np.clip(x, eps, 1 - eps)
        return np.log(x / (1 - x))

    combined = 1.0 / (1.0 + np.exp(-(logit(skill_rate) + logit(student_rate) - logit(g))))
    return {
        "global_rate": np.full(len(ev), g),
        "skill_rate": skill_rate,
        "student_rate": student_rate,
        "skill_and_student": combined,
    }
