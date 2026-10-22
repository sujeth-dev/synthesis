# DKT on Synaptic's skill space (DKT-10)

**SYNTHETIC RESULT** -- trained and tested on simulated learners (`src/lib/sim`), not real users. It shows the pipeline works on Synaptic's 120 skills and how DKT compares against the app's BKT under a known memory model; it is not evidence about real learners.

Input `Research/sim/output/sm2_events.csv` -- 648609 interactions, 120 skills, students train/val/test = 1400/300/300, 10 epochs (154.4s on CPU).

All models scored on the same held-out test rows.

| Model | AUC | Log-loss | n |
|---|---|---|---|
| Oracle ceiling (true recall, approx.) | 0.8385 | 0.4634 | 96918 |
| DKT (LSTM, this model) | 0.7250 | 0.5949 | 96918 |
| Per-skill fitted BKT (EM) | 0.7345 | 0.5855 | 96918 |
| Synaptic live BKT (app engine) | 0.7168 | 0.6089 | 96918 |
