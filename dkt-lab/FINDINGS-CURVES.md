# Why DKT loses the learning curve it should win

**Status:** diagnosis complete; fix found and measured.
**Reproduce:** `cd pipeline && python datasets.py && python split.py && python diagnose.py && python improve.py && python diagnosis_report.py --write`
**Every number below is generated** by `diagnosis_report.py` from `results/<dataset>.json["diagnostics"]` and `results/dkt_improve.json`. None is typed by hand.

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


### Fix experiments (Lab 9)

**Selection rule used.** closest validation cohort-curve slope ratio to 1.0, among candidates within 0.005 validation AUC of the Lab 3 baseline

**Candidates, per dataset.** Every variant run is listed, including the ones that do not help.

*`assist2009`*

| variant | val AUC | test AUC | test log-loss | test slope ratio | evidence separation | reconstruction error |
|---|---|---|---|---|---|---|
| per-skill BKT (EM) | 0.7246 | 0.7302 | 0.5567 | 0.82 | — | — |
| Lab 3 baseline (no regularisation) | 0.8093 | 0.8167 | 0.4704 | 0.56 | 0.0776 | 0.2730 |
| early stopping + dropout 0.2 | 0.8149 | 0.8223 | 0.4591 | 0.58 | 0.0586 | 0.2704 |
| DKT+ reconstruction only (r 0.1) | 0.8128 | 0.8202 | 0.4618 | 0.70 | 0.1654 | 0.2122 |
| DKT+ reconstruction strong (r 0.5) | 0.8041 | 0.8113 | 0.4887 | 0.71 | 0.3181 | 0.1347 |
| DKT+ reconstruction only (r 1.0) | 0.7999 | 0.8060 | 0.5234 | 0.74 | 0.3940 | 0.0973 |
| DKT+ published (r 0.1, w1 0.003, w2 3.0) | 0.8148 | 0.8227 | 0.4587 | 0.63 | 0.1432 | 0.2259 |
| DKT+ weak waviness (r 0.1, w1 0.003, w2 0.3) | 0.8129 | 0.8203 | 0.4616 | 0.59 | 0.1595 | 0.2209 |
| DKT+ strong both (r 0.5, w1 0.01, w2 3.0) | 0.8043 | 0.8119 | 0.4835 | 0.68 | 0.3028 | 0.1459 |
| DKT+ smoothness only (w1 0.003, w2 3.0) | 0.8147 | 0.8234 | 0.4592 | 0.54 | 0.0429 | 0.2729 |

*`synaptic_sim`*

| variant | val AUC | test AUC | test log-loss | test slope ratio | evidence separation | reconstruction error |
|---|---|---|---|---|---|---|
| per-skill BKT (EM) | 0.7267 | 0.7285 | 0.5985 | 0.89 | — | — |
| BKT with forgetting | 0.7263 | 0.7282 | 0.5985 | 0.89 | — | — |
| Lab 3 baseline (no regularisation) | 0.7013 | 0.7062 | 0.6181 | 0.56 | 0.0854 | 0.3891 |
| DKT+ reconstruction only (r 0.1) | 0.7182 | 0.7193 | 0.6073 | 0.71 | 0.2545 | 0.2772 |
| DKT+ reconstruction only (r 1.0) | 0.6803 | 0.6856 | 0.6325 | 0.41 | 0.2577 | 0.3067 |
| DKT+ smoothness only (w1 0.003, w2 3.0) | 0.7223 | 0.7249 | 0.6044 | 0.68 | 0.1348 | 0.3455 |

*`assist2015`*

| variant | val AUC | test AUC | test log-loss | test slope ratio | evidence separation | reconstruction error |
|---|---|---|---|---|---|---|
| per-skill BKT (EM) | 0.6996 | 0.7027 | 0.5220 | 0.43 | — | — |
| Lab 3 baseline (no regularisation) | 0.7254 | 0.7244 | 0.5110 | 0.34 | 0.1136 | 0.2729 |
| DKT+ reconstruction only (r 0.1) | 0.7250 | 0.7238 | 0.5131 | 0.33 | 0.1699 | 0.2489 |
| DKT+ reconstruction only (r 1.0) | 0.7048 | 0.7029 | 0.5935 | 0.41 | 0.4609 | 0.1287 |
| DKT+ smoothness only (w1 0.003, w2 3.0) | 0.7277 | 0.7263 | 0.5093 | 0.27 | 0.1009 | 0.2809 |

**Confirmation of the selected variant elsewhere.**

*`assist2015`*

| variant | val AUC | test AUC | test log-loss | test slope ratio | evidence separation | reconstruction error |
|---|---|---|---|---|---|---|
| per-skill BKT (EM) | 0.6996 | 0.7027 | 0.5220 | 0.43 | — | — |
| Lab 3 baseline (no regularisation) | 0.7254 | 0.7244 | 0.5110 | 0.34 | 0.1136 | 0.2729 |
| DKT+ strong both (r 0.5, w1 0.01, w2 3.0) | 0.7137 | 0.7118 | 0.5424 | 0.34 | 0.3340 | 0.1807 |
| per-skill BKT (EM) | 0.6996 | 0.7027 | 0.5220 | 0.43 | — | — |
| Lab 3 baseline (no regularisation) | 0.7254 | 0.7244 | 0.5110 | 0.34 | 0.1136 | 0.2729 |
| DKT+ strong both (r 0.5, w1 0.01, w2 3.0) | 0.7137 | 0.7118 | 0.5424 | 0.34 | 0.3340 | 0.1807 |

*`synaptic_sim`*

| variant | val AUC | test AUC | test log-loss | test slope ratio | evidence separation | reconstruction error |
|---|---|---|---|---|---|---|
| per-skill BKT (EM) | 0.7267 | 0.7285 | 0.5985 | 0.89 | — | — |
| Lab 3 baseline (no regularisation) | 0.7013 | 0.7062 | 0.6181 | 0.56 | 0.0854 | 0.3891 |
| DKT+ strong both (r 0.5, w1 0.01, w2 3.0) | 0.6905 | 0.6942 | 0.6269 | 0.47 | 0.2528 | 0.3044 |
| per-skill BKT (EM) | 0.7267 | 0.7285 | 0.5985 | 0.89 | — | — |
| Lab 3 baseline (no regularisation) | 0.7013 | 0.7062 | 0.6181 | 0.56 | 0.0854 | 0.3891 |
| DKT+ strong both (r 0.5, w1 0.01, w2 3.0) | 0.6905 | 0.6942 | 0.6269 | 0.47 | 0.2528 | 0.3044 |

**The reconstruction term as a dose.** Variants with no waviness penalty, ordered by strength.

| dataset | lambda_r | test slope ratio | test AUC | test log-loss | evidence separation | reconstruction error | w1 |
|---|---|---|---|---|---|---|---|
| `assist2009` | 0.00 | 0.56 | 0.8167 | 0.4704 | 0.0776 | 0.2730 | 0.03211 |
| `assist2009` | 0.00 | 0.58 | 0.8223 | 0.4591 | 0.0586 | 0.2704 | 0.03962 |
| `assist2009` | 0.10 | 0.70 | 0.8202 | 0.4618 | 0.1654 | 0.2122 | 0.05435 |
| `assist2009` | 0.50 | 0.71 | 0.8113 | 0.4887 | 0.3181 | 0.1347 | 0.06749 |
| `assist2009` | 1.00 | 0.74 | 0.8060 | 0.5234 | 0.3940 | 0.0973 | 0.08925 |
| `assist2015` | 0.00 | 0.34 | 0.7244 | 0.5110 | 0.1136 | 0.2729 | 0.02601 |
| `assist2015` | 0.10 | 0.33 | 0.7238 | 0.5131 | 0.1699 | 0.2489 | 0.03222 |
| `assist2015` | 1.00 | 0.41 | 0.7029 | 0.5935 | 0.4609 | 0.1287 | 0.05349 |
| `synaptic_sim` | 0.00 | 0.56 | 0.7062 | 0.6181 | 0.0854 | 0.3891 | 0.00810 |
| `synaptic_sim` | 0.10 | 0.71 | 0.7193 | 0.6073 | 0.2545 | 0.2772 | 0.03034 |
| `synaptic_sim` | 1.00 | 0.41 | 0.6856 | 0.6325 | 0.2577 | 0.3067 | 0.01778 |

<!-- END GENERATED TABLES -->

---

## The fix (Lab 9)

If the defect is that DKT's per-answer response is too weak and too noisy, the lever is
the one term in DKT+ that asks the model to reproduce the answer it has just consumed:
the **reconstruction** penalty `lambda_r`. The waviness penalties `lambda_w1` / `lambda_w2`
do something different — they ask the prediction vector to *move less* between steps —
and the diagnosis gives no reason to expect those to help a curve.

Lab 6 ran DKT+ already and recorded that it "did not help". It was selected on
validation **AUC**. Run against the curve instead, on `assist2009`:

| `lambda_r` | test slope ratio | test AUC | evidence separation | reconstruction error |
|---|---|---|---|---|
| 0.0 (Lab 3 baseline) | 0.56 | 0.8167 | 0.0776 | 0.2730 |
| 0.1 | **0.70** | **0.8202** | 0.1654 | 0.2122 |
| 0.5 | 0.71 | 0.8113 | 0.3181 | 0.1347 |
| 1.0 | **0.74** | 0.8060 | 0.3940 | 0.0973 |
| 0.0, waviness only (w1 0.003, w2 3.0) | **0.54** | 0.8234 | 0.0429 | 0.2729 |

On `assist2009` alone this looks like a clean dose: the slope ratio rises monotonically
with `lambda_r`, the model's response to an answer grows five-fold, and its
reconstruction error falls by two-thirds. **That reading does not survive the other two
datasets**, and the corrected version is below.

> **Correction.** An earlier revision of this section claimed "it is a dose, and the
> response is monotone" and "the waviness penalties make it worse", on `assist2009`
> evidence only. Neither generalises. The claim that does survive is narrower and is
> stated below. The superseded text is left described rather than silently replaced,
> per `PROGRESS.md`'s convention.

### What the same candidates do on all three datasets

Change in test cohort-curve slope ratio and test AUC, each against that dataset's own
Lab 3 baseline:

| variant | `assist2009` | `assist2015` | `synaptic_sim` |
|---|---|---|---|
| `lambda_r` 0.1 | **+0.14** slope, +0.0034 AUC | −0.01 slope, −0.0005 AUC | **+0.15** slope, +0.0131 AUC |
| `lambda_r` 1.0 | +0.18 slope, −0.0107 AUC | +0.07 slope, −0.0214 AUC | **−0.15** slope, −0.0206 AUC |
| waviness only | −0.01 slope, +0.0066 AUC | −0.07 slope, +0.0020 AUC | **+0.12** slope, +0.0188 AUC |

**`lambda_r = 0.1` is the one result that holds up.** It improves growth fidelity
substantially on two datasets and is neutral on the third, and it never costs more than
0.0005 AUC — on `synaptic_sim` it *gains* 0.0131. That is a recommendation worth acting
on, and it is the lab's new default DKT configuration.

**Stronger reconstruction is not better.** `lambda_r = 1.0` is the best variant on
`assist2009` (+0.18) and the worst on the simulator (−0.15). The monotone dose-response
was an `assist2009` property, not a property of the method. Anyone reading only that
dataset would have tuned `lambda_r` upward and made the simulator worse.

**The waviness penalties are inconsistent, not uniformly harmful.** They hurt growth on
both real datasets (−0.01, −0.07) and help on the simulator (+0.12). No recommendation
either way; the earlier "makes it worse" was over-generalised from one dataset.

**Why Lab 6 missed `lambda_r = 0.1` is unchanged and still the point.** Against plain
early stopping on `assist2009` its AUC difference is −0.002 — noise — while its slope
difference is +0.12. Selected on AUC, it looked like nothing.

### The honest bottom line: the gap narrows, it does not close

| dataset | per-skill BKT | DKT baseline | DKT at `lambda_r` 0.1 |
|---|---|---|---|
| `assist2009` | **0.82** | 0.56 | 0.70 |
| `assist2015` | **0.43** | 0.34 | 0.33 |
| `synaptic_sim` | **0.89** | 0.56 | 0.71 |

Even fixed, DKT tracks learning worse than a per-skill EM BKT on **every** dataset
tested, while beating it on AUC on two of the three. So the fix is real and worth
shipping in the lab, and it does not make DKT ready to own scheduling. That conclusion
is the same one the cutover gate should be reaching, and currently cannot.

### A prediction of mine that failed

The diagnosis said reconstruction would fix the wrong-way updates. It does not — on
`assist2009` the fraction of updates in the right direction barely moves (0.79 → 0.74
after correct answers; 0.73 → 0.74 after wrong ones). What changes is the *magnitude* of
the response. So DKT was not mostly updating the wrong way; it was updating too faintly.

That account is itself incomplete: on `assist2015` the baseline's evidence separation is
already higher than `assist2009`'s (0.1136 vs 0.0776) and its slope ratio is lower (0.34
vs 0.56), so response magnitude alone does not determine curve fidelity either. What
`assist2015` is limited by is not established here.

### A flaw in this experiment's own selection rule

The rule was fixed in advance: closest validation slope ratio to 1.0, among candidates
within 0.005 validation AUC of the baseline. It selected "DKT+ strong both
(r 0.5, w1 0.01, w2 3.0)", and that choice does not deserve much weight:

- The AUC floor landed at 0.80428. The winner scored 0.80428 and the better-growth
  `lambda_r = 0.5` variant scored 0.80413 — excluded by 0.00015, which is noise.
- Confirmed on the other datasets, the selected variant does not generalise: on
  `assist2015` its slope ratio matches the baseline's (0.34) with worse AUC, and on the
  simulator it is worse than the baseline on both (0.47 vs 0.56; AUC 0.6942 vs 0.7062).

So the rule's winner is an artefact of a knife-edge threshold, and the variant it chose
is not the recommendation. `lambda_r = 0.1` is, on the cross-dataset evidence above. The
rule is left as it was written rather than retuned after seeing the results, and this
paragraph is the correction.

The wider lesson is the same one the whole investigation keeps producing: a single
scalar criterion, applied to one dataset, picks the wrong model. That is true of AUC
(which hid the growth defect) and it is true of the slope-ratio rule written to replace
it (which picked a variant that fails elsewhere). The cross-dataset table is the
evidence; neither single number is.

## What this changes

### 1. The cutover gate is measuring the wrong thing

`src/lib/dkt/compare.ts` currently requires `n ≥ 5000 ∧ ΔAUC ≥ 0.02 ∧ log-loss no worse`.
On `assist2009` DKT clears that comfortably while reproducing 56% of observed growth
against BKT's 82%. **A cutover approved by that gate would hand scheduling to a model
that is worse at the one thing scheduling depends on.**

Proposed addition — a do-no-harm term on growth, stated relatively so it does not depend
on what any particular dataset makes attainable:

```
cutover requires, in addition to the existing conditions:
    cohortPairs           >= 200                       // the curve means something
    candidateSlopeRatio   >= incumbentSlopeRatio - 0.05 // growth must not get worse
```

Why relative rather than an absolute floor: the attainable slope ratio varies a great
deal by dataset — BKT reaches 0.82 on `assist2009` and 0.89 on the simulator but only
0.43 on `assist2015` — so any fixed number would be arbitrary. "Do not make growth
fidelity materially worse than the model you are replacing" is the property that
actually matters, and it is measurable from shadow-log rows with
`curves.cohort_curve` plus `curves.curve_fidelity`.

The 200-pair minimum matters: with `DKT_SHADOW=1` and 416 real attempt rows today, there
are nowhere near enough repeat attempts per (learner, skill) to measure a cohort slope
at all. Until there are, the honest answer the gate should give is "not enough data to
judge growth", not "approved on AUC".

**This is a proposal, not a change.** No file under `src/` is modified by Labs 7–9, and
`DEVELOPMENT_LOOP.md:113` requires human sign-off before any live cutover.

> **Update (Synaptic Levels 12, 14 and 15).** Everything in this section was a
> proposal when written; the app has since acted on it, and measured the result.
>
> - **The gate is built.** `cutoverDecision` now takes a required growth
>   comparison with exactly the thresholds proposed above (200 cohort pairs, a
>   0.05 relative tolerance), and since Level 15 returns every condition's state
>   rather than only the first failure.
> - **The app's DKT was retrained at `lambda_r = 0.1`**, this lab's
>   recommendation. On the app's own simulated population the cohort slope ratio
>   rose 0.665 → 0.727 (+0.062), against the +0.15 this lab measured on its own
>   simulator. The lab's baseline there was an under-trained model; the app's
>   was not, so most of that headroom was training rather than regularisation.
> - **It still does not clear the gate**, on both conditions: AUC gain 0.0078
>   against the 0.02 required, and a growth loss of 0.144 against the 0.05
>   tolerated. The numbers are on the Synaptic app tab.
> - **Per-skill BKT is the better upgrade on that data**: AUC 0.7184 → 0.7293
>   with growth fidelity unchanged (0.8666 vs 0.8621).
>
> **Correction to a figure.** The app's own Python evaluation
> (`Research/dkt/train_synaptic.py`) reports the live BKT at 0.7168 against
> 0.7345 for a fitted one. That pair is confounded: the live arm carries the
> overdue `p_know` decay and the fitted arm has none, so it compared parameters
> and forgetting together. Traced inside one simulator run with identical decay
> the gap is 0.7184 against 0.7293. The direction holds; the size does not. The
> superseded figures are left in the committed results rather than edited away.

### 2. Other consequences

- **`synthetic5` should stop being shown with a learning curve.** It cannot have one —
  maximum opportunity 1. *(Done: the tab now says so.)*
- **The published `assist2009` curve needed correcting, not deleting**, with the
  selection effect made visible rather than mentioned in prose. *(Done.)*
- **`lambda_r = 0.1` becomes the lab's default DKT configuration.** It improves growth
  fidelity on two of three datasets (+0.14, +0.15) and is neutral on the third, at no
  meaningful AUC cost. Stronger settings do not generalise and should not be used.
- **No recommendation on the waviness penalties.** They help growth on the simulator and
  hurt it on both real datasets.
- **Even fixed, DKT tracks learning worse than per-skill BKT on every dataset tested.**
  The gap narrows; it does not close. Whatever else the cutover gate requires, that is
  the fact it has to confront.
- **Synaptic's live BKT has a related weakness of its own.** It is classical absorbing
  BKT — `src/lib/bkt/index.ts` has no forgetting term — and on the simulator that model
  moves *down* after a wrong answer only 54% of the time. Whatever happens with DKT, a
  learner who has been marked mastered is hard to un-master on current evidence.

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
