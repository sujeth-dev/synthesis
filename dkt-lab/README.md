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
4. **Learning curves** – P(correct) by practice opportunity: actual vs BKT vs DKT. From
   Lab 7–9: a cohort curve that holds the (student, skill) population fixed, a growth-fidelity
   table with no-learning baselines for comparison, the aggregate curve extended to each
   dataset's real maximum with the selection effect quantified, and the mechanism measures.
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

> **These are ranking metrics, and ranking is not the whole story.** Lab 7–9 found
> that on ASSISTments 2009 DKT wins every column above while reproducing only 56% of
> the growth a learner actually shows, against BKT's 82%. AUC cannot see a slope. See
> [`FINDINGS-CURVES.md`](FINDINGS-CURVES.md) and the Learning curves tab.

## Lab 6: DKT tuning on the Synaptic simulator

`pipeline/tune.py` runs the experiments, `pipeline/tuning_report.py` adds the
bootstrap, the per-situation breakdown and the write-up; everything is in
`pipeline/results/dkt_tuning.json` and on the Model comparison tab. Selection
uses validation AUC only; each final model touches the test split once; same
split and seed for every variant; every run is listed.

| Phase | Model | Variant | Val AUC | Test AUC | Test log-loss | Train time |
|---|---|---|---|---|---|---|
| E | BKT | Per-skill BKT (EM) | 0.7267 | 0.7285 | 0.5985 | 5.4s |
| E | BKT | BKT with forgetting (EM, p_forget) | 0.7263 | 0.7282 | 0.5985 | 6.1s |
| E | reference | Synaptic live BKT (app engine, global params) | 0.7150 | 0.7132 | 0.6211 | 0.0s |
| E | reference | Ground-truth ceiling (simulator true recall, approx.) | 0.8432 | 0.8438 | 0.4615 | 0.0s |
| A | DKT | Lab 3 baseline (h100, lr1e-3, 10 epochs, no ES) | 0.7013 | 0.7062 | 0.6181 | 8.3s |
| A | DKT | ES, h50, lr0.001, dropout 0.2 | 0.7199 | 0.7210 | 0.6073 | 26.7s |
| A | DKT | ES, h50, lr0.003, dropout 0.2 | 0.7277 | 0.7287 | 0.6011 | 26.6s |
| A | DKT | ES, h100, lr0.001, dropout 0.2 | 0.7234 | 0.7253 | 0.6033 | 37.6s |
| A | DKT | ES, h100, lr0.003, dropout 0.2 | 0.7234 | 0.7258 | 0.6031 | 25.1s |
| A | DKT | ES, h200, lr0.001, dropout 0.2 | 0.7177 | 0.7192 | 0.6080 | 34.3s |
| A | DKT | ES, h200, lr0.003, dropout 0.2 | 0.7237 | 0.7240 | 0.6042 | 34.4s |
| A | DKT | ES, h50, lr0.003, dropout 0.35 | 0.7274 | 0.7271 | 0.6028 | 15.7s |
| A | DKT | ES, h50, lr0.003, dropout 0.5 | 0.7257 | 0.7271 | 0.6029 | 17.9s |
| B | DKT | best A + time features on input step | 0.7327 | 0.7332 | 0.5979 | 17.2s |
| B | DKT | best A + time features of upcoming attempt (output) | 0.7304 | 0.7318 | 0.5993 | 16.9s |
| B | DKT | best A + time features on input + upcoming attempt | 0.7331 | 0.7356 | 0.5964 | 13.7s |
| C | DKT | best so far + DKT+ (r=0.1, w1=0.003, w2=3.0) | 0.7268 | 0.7304 | 0.5995 | 14.7s |
| C | DKT | best so far + DKT+ (r=0.1, w1=0.003, w2=0.3) | 0.7270 | 0.7302 | 0.6007 | 12.8s |
| C | DKT | best so far + DKT+ (r=0.1, w1=0.0, w2=0.0) | 0.7276 | 0.7293 | 0.6016 | 14.1s |
| D | BKT | Per-skill BKT · 1000 learners | 0.7267 | 0.7285 | 0.5985 | 4.8s |
| D | BKT | BKT with forgetting · 1000 learners | 0.7263 | 0.7282 | 0.5985 | 5.8s |
| D | DKT | DKT best one-hot (phase A) · 1000 learners | 0.7277 | 0.7287 | 0.6011 | 17.7s |
| D | DKT | DKT best overall · 1000 learners | 0.7331 | 0.7356 | 0.5964 | 15.4s |
| D | BKT | Per-skill BKT · 3000 learners | 0.7270 | 0.7282 | 0.6001 | 19.5s |
| D | BKT | BKT with forgetting · 3000 learners | 0.7268 | 0.7279 | 0.6001 | 19.9s |
| D | DKT | DKT best one-hot (phase A) · 3000 learners | 0.7382 | 0.7412 | 0.5921 | 45.8s |
| D | DKT | DKT best overall · 3000 learners | 0.7446 | 0.7474 | 0.5874 | 47.8s |
| D | BKT | Per-skill BKT · 5000 learners | 0.7266 | 0.7283 | 0.5987 | 38.2s |
| D | BKT | BKT with forgetting · 5000 learners | 0.7263 | 0.7280 | 0.5987 | 41.2s |
| D | DKT | DKT best one-hot (phase A) · 5000 learners | 0.7383 | 0.7412 | 0.5904 | 57.4s |
| D | DKT | DKT best overall · 5000 learners | 0.7458 | 0.7479 | 0.5856 | 59.2s |

Time features (log1p days since this skill was last practised, log1p days
since the previous answer, log1p prior attempts on this skill) exist only for
the simulator; none of the three real/paper datasets has timestamps.

**Conclusion.** DKT now ranks first on the Synaptic simulator, but only narrowly: its best variant (“best A + time features on input + upcoming attempt”) reaches test AUC 0.7356 against 0.7285 for the best BKT (“Per-skill BKT (EM)”), a gain of +0.0071 (95% bootstrap interval over test learners +0.0032 to +0.0109) with log-loss 0.5964 vs 0.5985. That is below the +0.02 AUC the app's gate (src/lib/dkt/compare.ts) requires, so the gate's answer is still “don't switch”. The evidence: the untuned Lab 3 DKT lost (0.7062) mainly because it was under-trained — early stopping with a higher learning rate alone lifted it to 0.7287 (validation 0.7277, level with BKT's 0.7285). Time features, the suspected cause, helped but only a little (0.7356, +0.0055 on validation), because the simulator's learners forget slowly over 60 days and most of the remaining error is elsewhere: on first attempts at a skill (2,801 test answers) BKT scores 0.504 and DKT 0.493; on repeats after a day or more (10,925) 0.638 vs 0.651. DKT+ regularisation did not help (best 0.7276 validation). More data is the lever that matters: per-skill BKT stays flat while DKT keeps improving, so the gap goes +0.0071 at 1,000, +0.0192 at 3,000, +0.0196 at 5,000 learners, flattening between 3,000 and 5,000 and still just short of +0.02 at 5,000. Both models remain far below the simulator's own ground-truth ceiling (0.8438), which knows each learner's hidden memory state; that gap, not BKT vs DKT, is where the headroom is.

**App export.** No app-format export: the best DKT variant does not beat tuned BKT by ≥ 0.02 test AUC, so the condition for exporting it to the app's synaptic-dkt.json format is not met. The app is unchanged. If a later variant does pass, the
app would need: (1) a loader for the `dkt-lab-time-v1` weights format
(`weight_ih` has 2S+3 columns, the output layer H+3), (2) the three time
features computed from `learner_skill_states`/attempt timestamps at prediction
time, and (3) the DKT-13 gate re-run on real shadow-log rows. Nothing in `src/`
was changed.

**Next steps, ranked by expected gain**

1. **Collect real shadow-log data, and plenty of it, before deciding anything** — decisive (the only way to know). Every number here is from simulated learners whose memory model was written by hand, and the ranking flips between datasets (DKT +0.09 on ASSISTments 2009, −0.02 untuned here). Phase D shows DKT's lead grows with volume while BKT's does not, so the decision should be taken on a large real log (the app's gate already demands ≥ 5,000 attempts).
2. **Per-learner memory parameters (learner ability, per-learner decay) in either model** — largest modelled gain. The ground-truth ceiling (0.844) sits ~0.1 AUC above every model; the simulator draws per-learner learn, stability, slip and guess, which neither per-skill BKT nor DKT's input represents directly.
3. **Richer time modelling: exponential per-skill decay with learnable rates (DKT-forget / HLR-style), not log-gap features** — small to moderate. Log-gap time features were the single biggest gain after training fixes (+0.0055 validation AUC).
4. **Attention model (SAKT/AKT) as a second deep baseline, once there is more data** — small. At 1,000 learners capacity was not the bottleneck (hidden 200 was no better than 50 on validation); larger models were not re-tuned at 3,000-5,000 learners.
5. **Drop DKT+ regularisation and BKT forgetting-per-attempt from further work** — none observed. Phase C (DKT+) did not beat plain early-stopped DKT on validation, and BKT with p_forget matched plain BKT at every data size: forgetting in the simulator is driven by elapsed days, which a per-attempt forget rate cannot see.

## Reproduce the pipeline

```bash
cd dkt-lab/pipeline
pip install -r ../requirements.txt
python datasets.py && python split.py && python stats.py   # data/ (gitignored)
python run.py                                              # BKT + DKT, results/*.json
python export.py && python export.py --fixture             # web/public/data + parity fixture
python check_web.py                                        # site numbers == results
python -m pytest -q tests
python tune.py && python tuning_report.py && python export.py   # Lab 6 (about 15 min on 4 CPUs)
python diagnose.py && python diagnosis_report.py --write        # Lab 7-8 curve diagnosis (~2 min, no torch)
python improve.py                                               # Lab 9 fix sweep (about 20 min on 4 CPUs)
```

`diagnose.py` needs no training and no torch: it reproduces the committed DKT
predictions from `web/public/data/<dataset>/dkt_weights.json` with a numpy forward
pass, and refuses to run if they do not match the committed metrics.

Or everything at once: `python run_all.py --tuning`.

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
