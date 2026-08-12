# DKT vs. BKT baseline -- AUC comparison

Benchmark-dataset result on ASSISTments 2009-2010 (see `README.md`);
not a Synaptic-production result.

| Model | AUC (own full test set) | n |
|---|---|---|
| Per-skill BKT (EM/Baum-Welch) | 0.7296 | 49349 |
| DKT (LSTM) | 0.8299 | 48724 |

## Row-aligned comparison
Restricted to the intersection of (student_id, skill_id, timestamp)
both models produced a prediction for, controlling for each method's
own cold-start convention (see module docstring).

| Model | AUC (aligned subset) | n |
|---|---|---|
| Per-skill BKT | 0.7302 | 48724 |
| DKT | 0.8299 | 48724 |
