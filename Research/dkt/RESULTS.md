# DKT vs. BKT benchmark results

**This is a benchmark-dataset result on the public ASSISTments 2009-2010
"skill builder" dataset (see `README.md` for license/citation and dataset
details). It is not a Synaptic-production result** — Synaptic's live BKT
engine (`src/lib/bkt/index.ts`) is untouched by this track, and this result
does not by itself justify any live cutover. Any future cutover of
Synaptic's own engine to a DKT-style model is a separate, explicitly gated
task (`P3-3`, 50k+ real sessions) — this benchmark is prior art for that
decision, not the decision itself. It also feeds the thesis results
package (`PF-3`).

## Setup

- Dataset: ASSISTments 2009-2010 skill-builder data, 338,001 interactions
  / 4,163 students / 123 skills after cleaning (`preprocess.py`).
- Split: 70/15/15 train/val/test **by student_id** (`split.py`), so no
  student's interactions appear in more than one split.
- BKT baseline: from-scratch per-skill 2-state HMM fit via scaled
  forward-backward EM on `train` students (`bkt_baseline.py`) — distinct
  from Synaptic's live single-global-parameter BKT.
- DKT: single-layer LSTM, 200 hidden units, compressed 2×skill one-hot
  input, trained on `train`, monitored on `val` (`train_dkt.py`) — Piech
  et al. (2015)-style starting hyperparameters, no additional tuning.
- Both models are evaluated with the same **next-step prediction**
  protocol on the held-out `test` split: predict P(correct) using only a
  student's *prior* interactions, then score against the actual outcome.

## Result

| Model | AUC (own full test set) | n |
|---|---|---|
| Per-skill BKT (EM/Baum-Welch) | 0.7296 | 49,349 |
| DKT (LSTM) | 0.8299 | 48,724 |

**Row-aligned comparison** — restricted to the intersection of
(student_id, skill_id, timestamp) both models produced a prediction for,
controlling for each method's own cold-start convention (BKT predicts
from its prior even before any evidence for a student/skill; DKT — one
LSTM per student across all skills, not per skill — has no prediction for
a student's very first interaction overall):

| Model | AUC (aligned subset, n=48,724) |
|---|---|
| Per-skill BKT | 0.7302 |
| DKT | 0.8299 |

DKT training converged over 8 epochs with no tuning beyond the Piech et
al. (2015) starting hyperparameters: validation AUC rose monotonically
from 0.6841 (epoch 1) to 0.8224 (epoch 8), and training loss fell
monotonically from 0.630 to 0.461. See `results/auc_comparison.md` and
`results/roc_comparison.png` for the full report and ROC curves.

## Interpretation

On this held-out, student-level split of ASSISTments 2009-2010, the LSTM
DKT model outperforms the properly-fit per-skill BKT baseline by roughly
0.10 AUC (0.83 vs. 0.73), consistent with the gap reported in Piech et al.
(2015) for the same dataset family. This is a single benchmark-dataset
run with no hyperparameter search on either side, so the exact magnitude
of the gap should be read as directional, not a precise effect size. As
stated above, this result is a benchmark-dataset observation feeding the
thesis results package (`PF-3`) and prior art for the `P3-3` live-cutover
decision — it is not itself a recommendation to change Synaptic's live
BKT engine, which remains untouched.

## Reproducing this result

```bash
cd research/dkt
python3 -m venv .venv && ./.venv/Scripts/activate && pip install -r requirements.txt
python download_data.py
python preprocess.py
python split.py
python bkt_baseline.py
python train_dkt.py
python evaluate.py   # -> results/auc_comparison.md, results/roc_comparison.png
```
