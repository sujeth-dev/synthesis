# Why DKT loses the learning curve it should win

**Status:** diagnosis complete; fixes in progress.
**Reproduce:** `cd pipeline && python datasets.py && python split.py && python diagnose.py && python diagnosis_report.py`
**Every number below is generated** by `diagnosis_report.py` from `results/<dataset>.json["diagnostics"]`. None is typed by hand.

---

## The question

On ASSISTments 2009 the lab's DKT beats per-skill EM-fitted BKT on every aggregate
metric — AUC 0.8167 vs 0.7302, a gain of +0.087 — while the learning curve the lab
publishes for it is nearly flat and sits below the observed curve. The same holds in
weaker form on ASSISTments 2015.

That disagreement matters more than it looks. Synaptic's whole adaptive engine is
built on growth claims: `deriveMasteryState` promotes a skill when `p_know` crosses a
threshold, SM-2/FSRS schedules the next review from how well the learner is doing,
and the DKT cutover gate in `src/lib/dkt/compare.ts` would hand all of that to DKT on
the strength of **+0.02 AUC and no worse log-loss**. AUC is a pure ranking measure. If
a model can win it while being unable to say that a learner improved, then the gate is
measuring the wrong thing, and a future cutover would be made on a number that is
blind to the failure.

So: why does DKT lose the curve, and why worse the more questions a learner answers?

## Answer, in one paragraph

**Most of the published failure was a measurement artefact, and the part that is real
is not what it looked like.** The old curve capped the x-axis at opportunity 20,
stopped at the first thin bucket, and — the serious one — averaged a *different
population* at every point, because the learners still answering a skill for the 15th
time are disproportionately the ones getting it wrong. Measured properly, with the
population held fixed, the observed curve on `assist2009` rises from 0.506 to 0.674
and **DKT does rise with it** — just too slowly, at 56% of the observed rate against
BKT's 82%. DKT is not flat and it has not merely memorised difficulty: it beats the
best no-learning baseline by +0.097 AUC. Its real defect is a *shallow, noisy* growth
signal: it moves the wrong way after about one answer in four, and its predictions for
skills the learner never touched thrash roughly 90× more than BKT's. The under-slope
is the aggregate shadow of that noise.

**A correction to the record.** The committed `curves.json` for `assist2009` shows DKT
going from 0.605 at opportunity 1 to 0.613 at opportunity 20 while the observed rate
rises to 0.713, which reads as "DKT cannot represent learning". That reading is wrong.
Extended past the old cap, the *observed* aggregate curve has a **negative** slope
(−0.0020 over 25 buckets out to opportunity 145) because of the selection effect, and
against that aggregate curve DKT's slope ratio is +1.12 — it tracks the aggregate
curve better than BKT's +0.51. What made DKT look wrong in the chart was a level
offset (it under-predicts by 3.4 points on average), not an inability to track. The
genuine growth deficit only becomes visible once the population is held fixed, and it
is about 1.5× BKT's, not infinite. The old chart overstated the problem and pointed at
the wrong cause.

## What settled each hypothesis

| | Hypothesis | Verdict | The number that settled it |
|---|---|---|---|
| **H1** | The curve measurement is itself confounded | **Confirmed — the main cause** | Observed slope is −0.0020 on the raw curve and **+0.0123** on the cohort curve for the same dataset. The sign of "learning" depends on whether the population is held fixed. |
| **H2** | DKT reconstruction / non-monotonicity pathology | **Confirmed — the real residual defect** | DKT moves the right way after a correct answer only **0.79** of the time (BKT 0.99) and after a wrong answer **0.73** (BKT 0.94); cross-skill thrash `w1` **0.032** vs BKT's **0.0004**. |
| **H3** | DKT learned static difficulty and ability, not growth | **Rejected** | Best no-learning baseline (skill+student) reaches AUC 0.7196 on `assist2009`; DKT reaches **0.8167**. Within one (student, skill) pair DKT's predictions move with SD **0.133**, more than BKT's 0.079, against 0.000 for the static baselines. |
| **H4** | Long-sequence degradation / LSTM state saturation | **Rejected as a general cause; local to `assist2009`** | DKT's ranking does not decay with depth — AUC 0.795 → 0.832 from the first to the last position decile. Its calibration does worsen on `assist2009` (ECE 0.019 → 0.035), but on `assist2015` and the simulator it *improves*. Not the general mechanism. |
| **H5** | Cold start on the first attempt | **Confirmed, and it affects both models** | At opportunity 1 on the cohort curve the observed rate is 0.506 while BKT predicts 0.608 and DKT 0.573. Both over-predict a learner's first attempt; BKT by more. |
| **H6** | Dataset artefacts make a curve meaningless | **Confirmed, two distinct cases** | `synthetic5` has a maximum opportunity of **1** — every (student, exercise) pair is answered exactly once — so the one-point "curve" the lab published for it was never a curve. On `assist2009`, **30%** of raw rows come from problems tagged with several skills, so a share of each "practice opportunity" is re-tagging rather than practice. |

### The decisive test, and why it was worth running first

The cheapest way to kill the "DKT only learned which skills are hard and which
students are strong" story is to build predictors that contain *nothing else* and
score them on the identical rows. Four were added: a constant global rate, a per-skill
rate (difficulty only), a causal running per-student accuracy (ability only), and the
two combined in log-odds. By construction none of them has any notion of practice on a
skill, and their cohort-curve slope ratios confirm it — 0.00, 0.01, −0.17, −0.16.

They put a ceiling on what difficulty-and-ability alone can buy, and DKT clears it
comfortably on every dataset. That is why H3 is rejected rather than merely doubted,
and it is why the remaining question is about the *quality* of DKT's growth signal
rather than its existence.

### What "fails over more questions" actually means

Not a loss of ranking power. DKT's AUC is flat-to-rising with depth into a sequence on
all three public datasets. What degrades is the **probability**: the per-answer update
is right on average but wrong in direction roughly a quarter of the time, so the more
answers accumulate, the more of that noise is baked into a curve built by averaging
predictions. A model can be an excellent ranker and a poor estimator of "how much has
this learner improved", and only the second is what a tutor schedules on.

One more asymmetry worth recording, because it cuts against BKT and matters for
Synaptic's live engine: on the simulator, BKT moves *down* after a wrong answer only
**0.54** of the time. Classical BKT has no forgetting — mastery is absorbing — so once
`p_know` is high, a wrong answer barely dents it. Synaptic's live BKT
(`src/lib/bkt/index.ts`) has exactly that structure.

---

<!-- BEGIN GENERATED TABLES -->

### Public benchmarks

**Growth fidelity** — the cohort curve holds the population fixed, so a flat line here is a real
absence of growth rather than a change of who is being averaged. A slope ratio of 1.00 reproduces
the observed growth; 0.00 is flat.

| dataset | pairs | observed slope | BKT slope ratio | DKT slope ratio | BKT curve MAE | DKT curve MAE |
|---|---|---|---|---|---|---|
| `assist2009` | 1685 | 0.01225 | 0.82 | 0.56 | 0.0272 | 0.0200 |
| `assist2015` | 2220 | 0.02498 | 0.43 | 0.34 | 0.1254 | 0.1170 |
| `synthetic5` | 0 | — | — | — | — | — |

- `synthetic5` has no cohort curve: every (student, skill) pair is answered exactly once, so there is no n-th attempt to plot.

**AUC against no-learning baselines** — identical held-out rows. The baselines contain no notion of
practice on a skill, so they bound what difficulty and ability alone can buy.

| dataset | n | BKT | DKT | global rate | skill rate | student rate | skill+student |
|---|---|---|---|---|---|---|---|
| `assist2009` | 48724 | 0.7302 | 0.8167 | 0.5000 | 0.6302 | 0.6884 | 0.7196 |
| `assist2015` | 99850 | 0.7027 | 0.7244 | 0.5000 | 0.6427 | 0.6231 | 0.6631 |
| `synthetic5` | 29400 | 0.6312 | 0.8267 | 0.5000 | 0.6312 | 0.6309 | 0.6710 |

**Mechanism** — does the prediction for a skill move the right way after an answer on that skill,
and do the untouched skills stay still?

| dataset | model | moves up after correct | moves down after wrong | separation | w1 (cross-skill thrash) | reconstruction error |
|---|---|---|---|---|---|---|
| `assist2009` | BKT | 0.99 | 0.94 | +0.0878 | 0.00036 | 0.3354 |
| `assist2009` | DKT | 0.79 | 0.73 | +0.0776 | 0.03211 | 0.2730 |
| `assist2015` | BKT | 1.00 | 0.92 | +0.1015 | 0.00053 | 0.2987 |
| `assist2015` | DKT | 0.97 | 0.81 | +0.1136 | 0.02601 | 0.2729 |
| `synthetic5` | BKT | 1.00 | 1.00 | +0.2850 | 0.00266 | 0.3086 |
| `synthetic5` | DKT | 0.74 | 0.78 | +0.0532 | 0.02329 | 0.3024 |

**Ranking vs calibration with depth into the sequence** — first and last position decile.

| dataset | position decile (first / last) | DKT AUC | DKT ECE | BKT AUC | BKT ECE |
|---|---|---|---|---|---|
| `assist2009` | 1–9 / 516–1168 | 0.7947 → 0.8321 | 0.0191 → 0.0352 | 0.7217 → 0.7118 | 0.0186 → 0.0162 |
| `assist2015` | 1–3 / 100–496 | 0.6974 → 0.7151 | 0.0374 → 0.0184 | 0.6938 → 0.6855 | 0.0082 → 0.0148 |
| `synthetic5` | 1–4 / 45–49 | 0.6291 → 0.8607 | 0.0185 → 0.0210 | 0.5539 → 0.5814 | 0.0044 → 0.0164 |

**Dataset audit** — whether a learning curve is measurable at all.

| dataset | max opportunity | mean attempts per (student, skill) | pairs with one attempt | longest sequence | rows from multi-skill problems |
|---|---|---|---|---|---|
| `assist2009` | 290 | 8.05 | 0.20 | 1295 | 0.30 |
| `assist2015` | 130 | 5.49 | 0.03 | 618 | — |
| `synthetic5` | 1 | 1.00 | 1.00 | 50 | — |

**Reproduction check** — predictions were reproduced from the committed weights, not retrained.

| dataset | largest absolute difference vs committed metrics | within tolerance |
|---|---|---|
| `assist2009` | 1.1e-09 | yes |
| `assist2015` | 6.2e-09 | yes |
| `synthetic5` | 1.2e-08 | yes |


### Synaptic simulator (synthetic — not evidence about real learners)

**Growth fidelity** — the cohort curve holds the population fixed, so a flat line here is a real
absence of growth rather than a change of who is being averaged. A slope ratio of 1.00 reproduces
the observed growth; 0.00 is flat.

| dataset | pairs | observed slope | BKT slope ratio | DKT slope ratio | BKT curve MAE | DKT curve MAE |
|---|---|---|---|---|---|---|
| `synaptic_sim` | 1298 | 0.05212 | 0.89 | 0.56 | 0.0806 | 0.0798 |

**AUC against no-learning baselines** — identical held-out rows. The baselines contain no notion of
practice on a skill, so they bound what difficulty and ability alone can buy.

| dataset | n | BKT | DKT | global rate | skill rate | student rate | skill+student |
|---|---|---|---|---|---|---|---|
| `synaptic_sim` | 29609 | 0.7285 | 0.7062 | 0.5000 | 0.5533 | 0.5628 | 0.5887 |

**Mechanism** — does the prediction for a skill move the right way after an answer on that skill,
and do the untouched skills stay still?

| dataset | model | moves up after correct | moves down after wrong | separation | w1 (cross-skill thrash) | reconstruction error |
|---|---|---|---|---|---|---|
| `synaptic_sim` | BKT | 1.00 | 0.54 | +0.0971 | 0.00167 | 0.3534 |
| `synaptic_sim` | DKT | 1.00 | 0.85 | +0.0854 | 0.00810 | 0.3891 |

**Ranking vs calibration with depth into the sequence** — first and last position decile.

| dataset | position decile (first / last) | DKT AUC | DKT ECE | BKT AUC | BKT ECE |
|---|---|---|---|---|---|
| `synaptic_sim` | 1–19 / 197–367 | 0.6612 → 0.6928 | 0.0369 → 0.0293 | 0.6884 → 0.7316 | 0.0371 → 0.0472 |

**Dataset audit** — whether a learning curve is measurable at all.

| dataset | max opportunity | mean attempts per (student, skill) | pairs with one attempt | longest sequence | rows from multi-skill problems |
|---|---|---|---|---|---|
| `synaptic_sim` | 74 | 10.09 | 0.00 | 368 | — |

**Reproduction check** — predictions were reproduced from the committed weights, not retrained.

| dataset | largest absolute difference vs committed metrics | within tolerance |
|---|---|---|
| `synaptic_sim` | 2.6e-08 | yes |

<!-- END GENERATED TABLES -->

---

## What this changes

1. **The cutover gate is measuring the wrong thing.** `src/lib/dkt/compare.ts` requires
   `n ≥ 5000 ∧ ΔAUC ≥ 0.02 ∧ log-loss no worse`. On `assist2009` DKT passes that
   comfortably while reproducing only 56% of observed growth. A gate for an adaptive
   tutor needs a growth term — a cohort-curve slope ratio floor — alongside the
   ranking term. Proposed, not applied: nothing here switches anything live, per
   `DEVELOPMENT_LOOP.md`'s human-sign-off rule.
2. **`synthetic5` should stop being shown with a learning curve.** It cannot have one.
3. **The published `assist2009` curve should be corrected, not deleted**, with the
   selection effect made visible instead of mentioned in prose.
4. **The fixes to try are now aimed at the right target** — the noisy, shallow growth
   signal (H2), not a supposed inability to represent learning (H3, rejected).

## Method and limits

- Held-out test students, 70/15/15 split by student, seed 42. Evaluated rows are every
  test interaction except each student's first — identical rows for both models, the
  same protocol as `metrics.json`.
- DKT predictions are **reproduced from the committed weights** with a numpy forward
  pass (`pipeline/dkt_numpy.py`), not retrained, and the run aborts unless they match
  the committed metrics. BKT is refitted by EM on the training split.
- The mechanism measures (`evidence_response`, `w1`/`w2`, reconstruction error) need
  the prediction vector over *all* skills at every step, so they run on a sample of 150
  held-out students with at least 20 interactions, not the full split.
- `w1`, `w2` and reconstruction error follow Yeung & Yeung (2018), "Addressing Two
  Problems in Deep Knowledge Tracing via Prediction-Consistent Regularization".
- Bootstrap CIs on curve points are percentile bootstraps over rows (400 resamples),
  which treats rows as independent; they understate uncertainty where one student
  contributes many rows.
- The simulator results are reported separately and are **not evidence about real
  learners** — its ground truth is only as good as its own assumptions.
