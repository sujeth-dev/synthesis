# DKT vs live BKT (DKT-12) and cutover gate (DKT-13)

**SYNTHETIC** -- 300 fresh simulated learners (seed 9001, never seen in training), run through the app's own TypeScript DKT and BKT. Validates the evaluation pipeline; not evidence about real learners.

| Model | AUC | Log-loss |
|---|---|---|
| DKT (TypeScript, bundled model) | 0.7231 | 0.5978 |
| Live BKT | 0.7175 | 0.6096 |
| Ceiling (true recall, approx.) | 0.8387 | 0.4644 |

Attempts compared: 95585 (decision needs >= 5000).

## Cohort learning curve (growth)

(learner, skill) pairs with at least 10 attempts, restricted to their first 10; the same pairs at every point. Mirrors dkt-lab/pipeline/curves.py.

| | Slope | Slope ratio |
|---|---|---|
| Observed | 0.05374 | 1.0000 |
| DKT | 0.03576 | 0.6654 |
| Live BKT | 0.04682 | 0.8712 |

Cohort pairs: 4532 (growth needs >= 200); curve points: 10.

**Cutover gate:** do not switch (dkt not better).

A live switch must only ever be decided on real-learner rows (run without `--sim`).
