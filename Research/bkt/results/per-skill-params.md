# Live BKT vs per-skill fitted BKT (Level 16)

**SYNTHETIC** -- 300 simulated learners (seed 9001) over the real 120-skill curriculum, both arms traced inside one run through the app's own `bktUpdate`. Not evidence about real learners.

Parameters: 62 of 120 skills fitted by EM from `Research/sim/output/sm2_events.csv` (648609 rows, 2000 learners, **synthetic**); skills with fewer than 5 sequences keep the global set.

The live engine uses one parameter set for every skill: p_transit 0.15, p_slip 0.1, p_guess 0.2, initial p_know 0.1.

Attempts: 95885.

| Model | AUC | Log-loss | Cohort slope | Slope ratio |
|---|---|---|---|---|
| Live BKT (one global set) | 0.7184 | 0.6094 | 0.04731 | 0.8666 |
| Per-skill fitted BKT | 0.7293 | 0.5898 | 0.04707 | 0.8621 |

Observed cohort slope 0.05460 over 10 points, 4542 (learner, skill) pairs.

Both arms are traced inside one simulator run, so they see the identical attempts in
the identical order and take the identical overdue `p_know` decay; only the parameters
differ. The shadow arm never influences which skill is served or when.

Nothing is switched by this report. `BKT_PER_SKILL=1` applies the fitted set, and
`src/lib/bkt/params.ts` refuses even then while the parameter file is fitted on
simulator output -- those parameters describe the simulator's memory model, not
learners. A live switch needs a file fitted from real `attempt_events` rows and
human sign-off (`DEVELOPMENT_LOOP.md:113`).
