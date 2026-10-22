# DKT vs live BKT (DKT-12) and cutover gate (DKT-13)

**SYNTHETIC** -- 300 fresh simulated learners (seed 9001, never seen in training), run through the app's own TypeScript DKT and BKT. Validates the evaluation pipeline; not evidence about real learners.

Bundled model: reconstruction weight lambda_r 0.1, early stopping on, 10 of 10 epochs run, best validation AUC 0.7260.

| Model | AUC | Log-loss |
|---|---|---|
| DKT (TypeScript, bundled model) | 0.7253 | 0.5960 |
| Live BKT | 0.7175 | 0.6096 |
| Ceiling (true recall, approx.) | 0.8387 | 0.4644 |

Attempts compared: 95585 (decision needs >= 5000).

## Cohort learning curve (growth)

(learner, skill) pairs with at least 10 attempts, restricted to their first 10; the same pairs at every point. Mirrors dkt-lab/pipeline/curves.py.

| | Slope | Slope ratio |
|---|---|---|
| Observed | 0.05374 | 1.0000 |
| DKT | 0.03909 | 0.7273 |
| Live BKT | 0.04682 | 0.8712 |

Cohort pairs: 4532 (growth needs >= 200); curve points: 10.

**Cutover gate:** do not switch (dkt not better).

Every condition, not only the one named above:

| Condition | Pass | Measured against the bar |
|---|---|---|
| Sample size | yes | 95585 attempts, needs 5000 |
| Ranking | **NO** | AUC gain 0.0078, needs 0.02; log-loss no worse |
| Growth | **NO** | DKT slope ratio 0.7273 vs BKT 0.8712, may lose at most 0.05 |

A live switch must only ever be decided on real-learner rows (run without `--sim`).
