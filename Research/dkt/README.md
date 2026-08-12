# DKT benchmark (research-only)

**This directory is a standalone research benchmark. It is not part of the Synaptic
application, does not touch `src/`, `package.json`, or the Next.js runtime, and does
not change how Synaptic's live BKT engine schedules or scores anything.**

It compares a small LSTM Deep Knowledge Tracing (DKT) model against a properly-fit
per-skill Bayesian Knowledge Tracing (BKT) baseline, evaluated on the same
student-level held-out split of a public benchmark dataset. Results feed the
thesis results package (`PF-3` in `MASTER_PLAN.md`) as a benchmark-dataset
comparison, not a production result. Live cutover of Synaptic's own engine to a
DKT-style model is a separate, far-future, explicitly gated task (`P3-3`, 50k+ real
sessions) and is out of scope here.

## Dataset

**ASSISTments 2009-2010 "skill builder" dataset.**

- Original source / official page:
  https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data/skill-builder-data-2009-2010
- Mirror used by `download_data.py` (Figshare, stable direct-download link):
  https://figshare.com/articles/dataset/skill_builder_data_csv/25309000
  (file `skill_builder_data.csv`, MD5 `9410c31fadc7ad6518d296ce254ec4ab`, ~83 MB, 525,534 rows)
- **License:** CC BY 4.0 (as published by the Figshare mirror) —
  https://creativecommons.org/licenses/by/4.0/
- **Citation:** Please cite the ASSISTments platform and dataset per the terms on
  the official page above, e.g.:

  > Feng, M., Heffernan, N., & Koedinger, K. (2009). Addressing the assessment
  > challenge with an online system that tutors as it assesses. *User Modeling
  > and User-Adapted Interaction*, 19(3), 243-266.

  and acknowledge the ASSISTments platform (Worcester Polytechnic Institute) as
  the data source. Known caveat (documented on the official page and by
  downstream users of this dataset): the raw export contains some duplicate
  interaction rows; `preprocess.py` deduplicates before building sequences (see
  its module docstring for the exact rule).

The raw CSV is **never committed to this repo** (`research/dkt/data/` is
`.gitignore`d at the repo root). Anyone reproducing this benchmark must run
`download_data.py` themselves.

## Setup

```bash
cd research/dkt
python3 -m venv .venv
./.venv/Scripts/activate    # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python download_data.py
```

## Pipeline

Run in order; each stage writes its output under `research/dkt/data/` (also
gitignored) for the next stage to consume:

```bash
python download_data.py     # -> data/skill_builder_data.csv (raw, gitignored)
python preprocess.py        # -> data/sequences.csv (student_id, skill_id, correct, timestamp rows)
python split.py             # -> data/splits.json (student_id -> train/val/test)
python bkt_baseline.py       # -> data/bkt_results.json (per-skill BKT params + test predictions)
python train_dkt.py         # -> data/dkt_model.pt + data/dkt_test_predictions.json
python evaluate.py          # -> results/auc_comparison.md + results/roc_comparison.png
```

`tests/test_training_loop.py` covers `train_dkt.py`'s training loop against a
synthetic tiny batch (no real data required — safe to run standalone via
`pytest research/dkt/tests/`).

## Methodology notes

- **Split is by `student_id`, not by interaction row** (`split.py`) — splitting by
  row would leak a student's future interactions into their own training data via
  shared sequence context, inflating apparent accuracy. This is the leakage bug
  flagged in `basic-guide.md`'s DKT section.
- The BKT baseline (`bkt_baseline.py`) is a **from-scratch, per-skill EM/Baum-Welch
  fit**, distinct from Synaptic's live single-global-parameter BKT
  (`src/lib/bkt/index.ts`). It exists purely as an academic baseline for this
  benchmark, not as a replacement for the production engine.
- No specific AUC target is set; the goal is simply to report DKT vs. BKT AUC on
  the same held-out test split (`basic-guide.md` §"DKT / FSRS / NLP", section A).
