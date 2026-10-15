# DKT on Synaptic's skill space (DKT-10)

**SYNTHETIC RESULT** -- trained and tested on simulated learners (`src/lib/sim`), not real users. It shows the pipeline works on Synaptic's 120 skills and how DKT compares against the app's BKT under a known memory model; it is not evidence about real learners.

Input `Research/sim/output/sm2_events.csv` -- 648609 interactions, 120 skills, students train/val/test = 1400/300/300, 8 epochs (181.2s on CPU).

All models scored on the same held-out test rows.

| Model | AUC | Log-loss | n |
|---|---|---|---|
| Oracle ceiling (true recall, approx.) | 0.8385 | 0.4634 | 96918 |
| DKT (LSTM, this model) | 0.7224 | 0.5969 | 96918 |
| Per-skill fitted BKT (EM) | 0.7345 | 0.5855 | 96918 |
| Synaptic live BKT (app engine) | 0.7168 | 0.6089 | 96918 |

## Reading this result
- DKT beats the app's live BKT (single global parameter set) but not a per-skill fitted BKT, and every model sits well below the ground-truth ceiling.
- The simulator's learners forget over *time*, and neither model sees elapsed time: BKT has no forgetting at all, and DKT's input is only (skill, correct). Adding time-since-last-practice features to DKT is the obvious next step if this gap matters.
- This is the same pattern seen in the literature: DKT's edge over well-fitted BKT is often small; its main advantage here is cross-skill transfer (predicting skills not yet practiced), which BKT cannot do.
