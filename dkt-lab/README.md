# DKT Lab

A standalone research dashboard comparing **Bayesian Knowledge Tracing (BKT)** and
**Deep Knowledge Tracing (DKT)** on public knowledge-tracing datasets, with an
interactive, in-browser explainer of how each model works.

Everything lives in `dkt-lab/`. It does not import from, or change, the Synaptic
app (`src/`, `content/`, `Research/`, `scripts/`, root `package.json`). The style
and tab structure follow the *Adaptive Learning System Lab* reference, but with
real datasets and a static-site architecture instead of a Flask server.

```
dkt-lab/
├── package.json          convenience scripts (delegates to web/ and pipeline/)
├── requirements.txt      Python deps for the offline pipeline
├── pipeline/             Python, run offline (never on Vercel)
│   ├── datasets.py       download + convert each dataset to student_id,skill_id,correct,order
│   ├── split.py          70/15/15 split by student (seeded)
│   ├── bkt.py            per-skill BKT fitted with EM
│   ├── dkt.py            single-layer LSTM DKT (PyTorch)
│   ├── evaluate.py       metrics on the same held-out rows
│   ├── export.py         writes web/public/data/*.json (committed)
│   ├── results/          per-dataset result JSON (committed; the website must match these)
│   └── tests/            pytest
└── web/                  Vite + TypeScript static site (this is what Vercel deploys)
    ├── public/data/      JSON written by pipeline/export.py
    └── src/              dashboard + in-browser BKT/DKT inference
```

## Website tabs

1. **Overview** – dataset picker, headline tiles, one-line verdict chosen from the numbers.
2. **Datasets** – stats table, sequence-length distributions, full provenance, skipped datasets.
3. **Model comparison** – BKT vs DKT on AUC / log-loss / RMSE / accuracy, ROC curves, per-skill AUC, cross-dataset table (and, from Lab 6, the DKT tuning section).
4. **Learning curves** – P(correct) by practice opportunity: actual vs BKT vs DKT.
5. **Skill heatmap** – predicted P(correct) per skill for 20 held-out students, BKT and DKT side by side.
6. **How BKT & DKT work** – the live explainer: step through a held-out student or build a sequence; BKT's Bayes update per step vs the LSTM's hidden state, all-skill predictions and transfer; running AUC.
7. **Scheduling** – SM-2 vs FSRS from `Research/sim/results/scheduler-comparison.json` (copied unchanged; synthetic).
8. **Report outputs** – `[VALUE]`, `[TABLE]`, `[GRAPH]`, `[TEXT]` placeholders filled with this lab's numbers, copy buttons, graphs as PNG via `canvas.toDataURL`.
9. **Method & limitations** – pipeline and caveats.

BKT is always blue and DKT always rust; light and dark themes; works at 400 px; `prefers-reduced-motion` disables animation.

## Datasets

| Dataset | Type | Retrieved from | Licence |
|---|---|---|---|
| ASSISTments 2009-2010 skill builder | real | Figshare (`ndownloader.figshare.com/files/44732737`, CC BY 4.0) is tried first; it is blocked in the build environment, so the official *corrected* release is taken from a pinned GitHub mirror (`LegionKing/Dynamic-Cognitive-Diagnosis@fbc29da`, MD5 `a8c89f7c…`). After `Research/dkt/preprocess.py`'s cleaning it has exactly the counts of the Figshare file in `Research/dkt/RESULTS.md` (338,001 rows, 4,163 students, 123 skills). | Figshare copy CC BY 4.0; ASSISTments terms (cite Feng, Heffernan & Koedinger 2009) |
| ASSISTments 2015 skill builder | real | DKVMN preprocessed copy (`jennyzhang0215/DKVMN@96c2834`); the official Google Sites/Drive download is blocked here. No student ids or timestamps. | ASSISTments research terms, citation required; mirror has no licence file |
| Synthetic-5 (Piech et al. 2015) | synthetic (paper benchmark) | `chrispiech/DeepKnowledgeTracing@5973a6c`, `naive_c5_q50_s4000_v0.csv` | No licence file; used for research, raw file not redistributed |
| Synaptic simulator (1,000 learners × 60 days) | synthetic (Synaptic simulator) | `npm run sim -- --learners 1000 --days 60` (read-only use; the committed `Research/sim/results/*` files it rewrites are restored byte-for-byte by `datasets.py`) | this repository |

Skipped (recorded in `pipeline/data/skipped.json` and shown on the Datasets tab):
ASSISTments 2017 (Google Drive + request form, blocked; no verifiable mirror),
EdNet KT1 (data on Google Drive, blocked), Statics 2011 (PSLC DataShop needs a login, blocked).
No dataset had more than 300 skills, so no skill trimming was needed (the code path exists and is tested).

## Results (held-out test students, identical rows for both models)

| Dataset | Type | n | BKT AUC | DKT AUC | Δ AUC | BKT log-loss | DKT log-loss |
|---|---|---|---|---|---|---|---|
| ASSISTments 2009-2010 skill builder | real | 48,724 | 0.7302 | 0.8167 | +0.0865 | 0.5567 | 0.4704 |
| ASSISTments 2015 skill builder | real | 99,850 | 0.7027 | 0.7244 | +0.0216 | 0.5220 | 0.5110 |
| Synthetic-5 (Piech et al. 2015) | synthetic (paper benchmark) | 29,400 | 0.6312 | 0.8267 | +0.1955 | 0.6404 | 0.4927 |
| Synaptic simulator (1,000 learners x 60 days) | synthetic (Synaptic simulator) | 29,609 | 0.7285 | 0.7062 | -0.0223 | 0.5985 | 0.6181 |

BKT: per-skill EM. DKT: LSTM, hidden 100, lr 1e-3, 10 epochs, no tuning. These
numbers are `pipeline/results/*.json`; `python pipeline/check_web.py` verifies the
website's JSON equals them exactly.

## Reproduce the pipeline

```bash
cd dkt-lab/pipeline
pip install -r ../requirements.txt
python datasets.py && python split.py && python stats.py   # data/ (gitignored)
python run.py                                              # BKT + DKT, results/*.json
python export.py && python export.py --fixture             # web/public/data + parity fixture
python check_web.py                                        # site numbers == results
python -m pytest -q tests
```

Copied-and-adapted files carry a note at the top saying where they came from
(`Research/dkt/split.py`, `bkt_baseline.py`, `train_dkt.py`, `evaluate.py`,
`export_weights.py`, `preprocess.py`); nothing is imported across folders.

## Deploy on Vercel (separately from the Synaptic app)

1. In Vercel, **Add New → Project** and import the `sujeth-dev/synthesis` repository
   (a second project; the existing Synaptic project is unaffected).
2. **Root Directory:** `dkt-lab/web` (click *Edit* next to Root Directory). Leave
   "Include files outside the root directory" at its default; nothing outside
   `dkt-lab/web` is needed.
3. **Framework Preset:** `Vite` (or `Other`).
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Install Command:** `npm install` (the default).
7. No environment variables are needed. Click **Deploy**.

`dkt-lab/web/vercel.json` pins the same settings, so steps 3–6 are already
filled in once the root directory is set. The build runs `tsc --noEmit` and then
`vite build`; it does not run Python. All model results are pre-computed and
committed under `web/public/data/`.

Optional: under *Settings → Git → Ignored Build Step*, use
`git diff --quiet HEAD^ HEAD -- .` so the lab only redeploys when `dkt-lab/web`
changes.

## Run locally

```bash
cd dkt-lab/web
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: DKT parity with PyTorch, BKT update maths
npm run build      # type-check + production build into dist/
```

## Isolation from the Synaptic app

- The lab has its own `package.json`, `package-lock.json`, `.gitignore`,
  `tsconfig.json` and `requirements.txt`.
- The repo root `tsconfig.json` globs `**/*.ts`, so the lab's TypeScript is also
  seen by the main app's type-check. The lab therefore keeps its build config in
  plain `.mjs`, and imports no npm package from `.ts` files except `chart.js`
  (one import, in `src/ui/charts.ts`) and `vitest` (tests only). See the comment
  there.
- Check before merging: `git diff --stat main -- . ':!dkt-lab'` must be empty.
