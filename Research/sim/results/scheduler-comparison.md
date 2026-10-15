# SM-2 vs FSRS on simulated learners (FSRS-4)

**SYNTHETIC** -- 2000 simulated learners x 90 days over the real 120-skill curriculum, seed 2026. Both schedulers see the identical population (same learners, same luck); only the scheduler driving review due dates differs. The ground-truth memory model is `src/lib/sim/learner.ts`. Not evidence about real learners.

| | SM-2 (live today) | FSRS |
|---|---|---|
| Reviews per learner | 139.9 | 160.0 |
| Skills learned per learner | 27.2 | 26.8 |
| True retention at end (learned skills) | 91.8% | 93.2% |
| Learned skills forgotten at end (recall < 70%) | 4.7% | 3.1% |

**Recall prediction on review attempts** (how well each scheduler's own memory estimate predicts the answer; SM-2's is the conventional 0.9^(elapsed/interval) reading). Run under SM-2 scheduling:

| | AUC | Log-loss |
|---|---|---|
| SM-2 | 0.519 | 0.655 |
| FSRS (default parameters) | 0.622 | 0.735 |

## Reading this
- FSRS spends 14.3% more reviews and in return cuts forgotten skills from 4.7% to 3.1%; skills learned per learner move from 27.2 to 26.8 (the extra reviews take some time from new topics).
- FSRS ranks recall better (higher AUC) but its default parameters are over-confident here (worse log-loss). Fitting its parameters to real review logs (FSRS-6) is what fixes calibration; that needs real data.
- Recommendation: FSRS is ready to switch on (`SCHEDULER=fsrs`) if more reviews for better retention is the trade-off you want. Keep shadow logging on either way, so the real-data comparison (`npm run fsrs:compare`) accumulates.
