# The six remaining features — what this run changed

**2026-10-21. Levels 6–13, branch `claude/elegant-albattani-m3htzn`.**

`ROADMAP-REMAINING.md` audited all seven feature items against the working tree
and found the same shape repeatedly: the code was built and wired, and inert,
because the signals feeding it were never measured. This run repaired the
signals first and then finished the features on top of them.

Every number below was produced in this session, offline: no Supabase, no LLM
API key. What could not be verified here is listed at the end, per item and in
full.

| | Item | Before this run | After |
|---|---|---|---|
| 1 | Explanation-based answers | 0 explain questions, grade discarded | 120 questions, grade decides correctness, text and provenance stored |
| 2 | Reasoning evaluation (rule-based → NLP/LLM) | Done, with nothing to grade | Unchanged, now reachable 120 ways |
| 3 | Correctness + reasoning + behaviour into BKT | Two of three inputs dead | All three live |
| 4 | Modern knowledge tracing (DKT) | Shadow mode, gate blind to growth | Gate refuses a growth regression |
| 5 | Adaptive scheduling beyond SM-2 | Response-time tier dead | Tier restored; behaviour-aware tier in shadow |
| 6 | Behaviour analytics (time, retries, hesitation) | None of the three measured | All three measured at the client |
| 7 | Bloom's taxonomy | Complete as redesigned | Unchanged, by decision |

---

## 0. The two defects found while planning, fixed first (Level 6)

**Placement was entirely inert.** `/learn/diagnostic` sent `{question_id,
skill_id, answer, latency_ms, graph_placement_weight}` and nothing graded
`answer` server-side, so `placeLearner`'s `r.correct ? w : 0` scored every
skill 0, every skill normalised to the 0.05 floor, and
`blocked = prereqs.some(pid => (map.get(pid) ?? 0.05) < 0.40)` made **every
skill with a hard prerequisite start blocked, for every learner**. The
12-question placement test affected nothing.

Fixed by grading in `/api/diagnostic` (`src/lib/diagnostic/grade.ts`), which is
also where it belongs regardless: `/api/diagnostic/questions` ships
`correct_option_id` to the browser, so a client-computed `correct` would be
learner-editable. Measured through the real `placeLearner` with the real 12
questions: all-wrong gives 15/15 probed skills at the floor with their
dependents blocked (today's state for everyone); all-correct gives 12/15 at
≥ 0.45 and blocking drops to 3.

**38 `order` questions were unanswerable** — no widget in `QuestionCard`, no
verification branch in `/api/attempt`, and a submit button disabled for them —
and `pickQuestion` does not filter by format, so learners could be served a
prompt with no way to answer it. All three thirds added.

Also in Level 6, and the reason the suite could not have caught either defect:
ten `require('@/../content/...')` calls were converted to real relative paths.
Vite does not rewrite a runtime CJS `require`, so under Vitest every one of
them threw and every content-reading route silently fell back. That conversion
is what made `placeLearner` and those routes unit-testable for the first time.

## 1. Explanation-based answers (Levels 9 and 10)

**Content.** 120 explain questions, one per skill, authored by a committed
deterministic generator (`scripts/author-explain-questions.ts`) from each
skill's own `explain_back_prompt`, with the beginner `key_insight` as the
reveal. `npm run validate`: **963 questions — 768 mcq, 38 order, 37 fill, 120
explain**, 0 errors. Re-running the generator with `--check` reports 0 edits,
so the committed content matches it. 17 skills had no beginner or mid prompt
authored and drew a templated one from the node label rather than an
expert-depth prompt that would have asked a *Binary Numbers* learner about
two's complement; the generator lists them for a human to replace.

**One verdict per attempt.** `explain` had no verification branch, so an
authored explain question scored `correct = body.correct` — a field the client
never sends — i.e. wrong every time. The Feynman loop had the inverse bug: it
sent `correct: result.resolved` from the *rule-based* classifier while the
server LLM-graded a *different text* for `reasoningQuality`. Both are closed by
one rule: for `question_format === 'explain'` the server's grade is the only
verdict, `correct = category === 'meaning-included'` — the same predicate that
tops out `reasoningQualityFromCategory`, so disagreement is now structurally
impossible rather than merely unlikely.

**Durability.** Migration `006_explanation_grades.sql` stores the learner's
words, the prior explanation, the category, confidence, rationale, prompt
version, serving model, cache hit, grader latency, and the `reasoning_quality`
BKT actually consumed. A side table, not columns on `attempt_events`, because
`insertAttempt`'s unknown-column fallback is all-or-nothing: it retries with
the 001-only column set, dropping 002 and all five 003 analytics columns, so
every optional column widens that blast radius. `confidence: 0` is the sentinel
for "no model produced this grade".

## 2. Reasoning evaluation — unchanged, deliberately

`src/lib/nlp/` was already finished: live free-tier model discovery that
verifies pricing against each provider's catalogue, a failover chain, a 24-hour
cache, per-call logging with the prompt version, and a hard fallback to the
rule-based classifier. 0.962 accuracy / κ 0.943 against human labels versus the
rule-based classifier's 0.670 / κ 0.498. Its value was capped by item 1, which
is what this run changed. Offline, the rule-based fallback is what answers, and
the whole path is tested that way.

## 3. Correctness + reasoning + behaviour into BKT

`evidenceStrength = 0.6 * reasoningQuality + 0.4 * behavior` was running on two
dead inputs: `reasoningQuality` was exactly 1 on every question (no explain
content existed) and `behavior` could only take {1, 0.85} because its latency
arm could not fire. Item 1 supplies the first; Level 7 supplies the second. The
combination logic itself needed no change — it needed inputs.

## 4. Knowledge tracing and the cutover gate (Level 12)

`cutoverDecision` now takes a required `GrowthComparison` and can refuse with
`growth_unmeasured` or `dkt_worse_growth`. The measurement mirrors
`dkt-lab/pipeline/curves.py`: (learner, skill) pairs with ≥ 10 attempts,
restricted to their first 10, buckets thinner than 30 rows skipped rather than
truncating the curve, row-weighted least-squares slope, `slope_ratio` = model
slope / observed slope.

Why it matters, in the lab's own numbers: on ASSISTments 2009 DKT beats BKT by
**+0.087 AUC** while reproducing a slope ratio of **0.560** against BKT's
**0.822**. AUC is rank-only and cannot see that, so the old gate would have
approved a cutover to a model that is worse at the one thing the scheduler
depends on.

`npm run dkt:compare -- --sim` (300 learners, seed 9001): 95,585 attempts,
DKT AUC 0.7231 vs BKT 0.7175; cohort 4,532 pairs over 10 points, observed slope
0.05374, **DKT ratio 0.6654, BKT ratio 0.8712**. At `--learners 1000`: 320,203
attempts, 15,330 pairs, 0.6627 vs 0.8602. The slope-ratio loss (~0.21) is four
times the 0.05 tolerance on both runs. The verdict stays `dkt_not_better`
because the AUC gain (0.006) never clears 0.02 and that condition is checked
first. Nothing switches: the gate only recommends.

### A better DKT, measured against the same gate (Level 14)

The bundled model was trained by `Research/dkt/train_synaptic.py` with a fixed
8-epoch budget and no regularisation. Level 14 ports two options from
`dkt-lab/pipeline/dkt.py` (both default off) and retrains: early stopping on
validation AUC, and the DKT+ reconstruction weight `lambda_r`, which asks the
model to reproduce the answer it has just consumed. `lambda_r = 0.1` was pinned
before any of these numbers existed, because it is the one setting that
generalised across all three of the lab's datasets.

Three arms, same seed, same 648,609-interaction training set, measured by
`npm run dkt:compare -- --sim` (300 fresh learners, seed 9001, 95,585 attempts):

| Arm | DKT AUC | Log-loss | Cohort slope ratio |
|---|---|---|---|
| A — 8 epochs, `lambda_r` 0 (the previously committed model) | 0.7231 | 0.5978 | 0.6654 |
| B — 10 epochs + early stopping | **0.7290** | **0.5933** | 0.6933 |
| C — B + `lambda_r` 0.1 (**now bundled**) | 0.7253 | 0.5960 | **0.7273** |
| Live BKT, for reference | 0.7175 | 0.6096 | **0.8712** |

Read honestly:

- **The reconstruction term does improve growth fidelity, by much less than the
  lab predicted.** +0.034 slope ratio over the same-budget arm B, +0.062 over
  the old model, against the **+0.15** the lab measured on its own simulator.
  The lab's baseline there was an under-trained 0.7062-AUC model; the app's was
  not, and most of the lab's headroom appears to have been training, not
  regularisation.
- **Arm B wins AUC and arm C wins growth.** Anyone selecting on AUC would have
  shipped B and thrown the growth gain away — the exact failure
  `dkt-lab/FINDINGS-CURVES.md` documents. C ships because the pre-stated rule
  said so, at a cost of 0.0037 AUC.
- **Early stopping never fired** in either arm: validation AUC was still rising
  at the last epoch (B 0.7294, C 0.7260). The +0.006 AUC from A to B is the
  epoch budget, not early stopping.
- **The gate still refuses, and both of its conditions still fail.** The AUC
  gain over BKT is 0.0078 against the 0.02 required, and the growth loss is
  0.144 against the 0.05 tolerated. The verdict reads `dkt_not_better` because
  ranking is checked first. No constant was changed after seeing these numbers.
- Per-skill EM-fitted BKT scores **0.7345** on the same held-out rows — above
  every DKT arm, and above the app's live global-parameter BKT at **0.7168**.
  The strongest model measured here is a BKT the app does not run.

## 5. Scheduling (Levels 7, 8 and 11)

**The tier is alive.** `bktToQuality` and `fsrsRatingFromCorrectness` were
rating every correct answer 5/Easy because the client measured JSON
construction, not thinking. Level 8 quantified the cost offline (500 simulated
learners × 90 days, seed 2026): under the crushed signal SM-2 qualities 3 and 4
and FSRS Hard and Good all occur at **0.0%** of attempts while quality 5 / Easy
goes 15.5% → 58.4%; SM-2 reviews per learner 141.61 → 128.65 with retention
0.9181 → 0.9030, FSRS reviews 160.99 → 110.19 with retention 0.9319 → 0.9052,
and scheduler recall log-loss worsens in both arms. `npm run sim:latency`
reproduces it with no database.

**Behaviour-aware quality, in shadow.** `src/lib/sm2/adaptive.ts` demotes the
tier one step on a long time-to-first-interaction or repeated answer changes,
and gives a guided reflection a neutral tier instead of a latency-derived one —
the Feynman loop spans five dialogue steps and two typed explanations, so its
duration carries no fluency signal, and the live mapping rates every one of
them 3/Hard. Migration `007_behavior_quality_shadow.sql` logs both qualities,
both FSRS ratings, the signals, and the interval each would have scheduled.
Off by default (`ADAPTIVE_QUALITY=1`): hesitation and revisions have no
analogue in the simulator's ground-truth learner model, so no offline run can
justify promoting it, and real rows are the evidence it does not have yet.

## 6. Behaviour analytics (Level 7)

Three timestamps per question instead of one — rendered, first interaction,
submitted — in a pure module (`src/lib/timing/answer-timing.ts`) with time as
an explicit parameter, matching `src/lib/sm2`'s discipline, held in a ref so a
keystroke does not re-render the page, and reset by one effect on
`[phase, task?.question.id]` so every path into a question is covered. The
read moved out of the request-body literal, which was the actual bug.

`latency_ms` is now submitted − rendered; `hesitation_ms` is time to first
interaction (the real definition, replacing `max(0, latency − 15000)`), sent by
the client because only the browser can observe it and clamped server-side to
the latency it is a prefix of; `revision_count` is settled answer changes,
counted once per 1.5s burst so keystrokes are not revisions. The Feynman loop's
hardcoded `latency_ms: 5000` is gone.

`deriveBehaviorEvidenceModifier` and `updateMotivationState` were deliberately
**not** touched: their `latency_ms > 15000` and `slow_response_streak >= 3/4`
arms became reachable purely because the client now sends the truth.

## 7. Bloom's taxonomy — unchanged, by decision

Complete as redesigned: a macro layer of 9 phase evaluations and 153 tagged
questions, 25–26 per Bloom level, with skill-level BKT as the micro evaluation.
Per-question tagging was dropped deliberately (`MASTER_PLAN.md:124`) and
BLOOM-5 with it. Item 1 now supplies a per-question cognitive signal, so
revisiting it has become possible — but it is a decision, not code, and it was
left as it is.

---

## Seeing it (Level 13)

- **In the app:** `/engine` — a server component showing, for the signed-in
  learner, per-attempt signals (item 3 and 6), graded explanations with their
  provenance (items 1 and 2), SM-2 beside the FSRS and behaviour-aware shadows
  (item 5), and BKT vs DKT with the growth row and the gate's verdict (item 4).
  Every number is read from the database; nothing is scripted. (`/demo`, the
  existing hardcoded walkthrough, is deliberately its opposite and is
  untouched.)
- **Offline, no database:** `npm run sim:latency`, `npm run dkt:compare -- --sim`,
  `npm run validate`, `npx tsx scripts/seed-demo.ts --dry-run`.
- **Populating `/engine`:** `npm run seed:demo` writes one synthetic learner
  with a full history, reusing the simulator's learner model rather than
  inventing a second one. `--dry-run` builds every row and writes nothing.

## Verified in this session

- `npx vitest run`: **24 files, 172 tests**, all passing (baseline 18 / 101).
- `npm run build`: clean, TS strict.
- `npm run validate`: 963 questions, 0 errors (115 pre-existing warnings).
- `npm run sim:latency`, `npm run dkt:compare -- --sim`, and the seed script's
  dry run all reproduce their reports.

## Not verified in this session, and why

- **Migrations 006 and 007 applying.** `npm run db:migrate` needs
  `SUPABASE_DB_URL`, which this environment does not have. Both levels ship
  fail-open: a missing table loses its log, never the attempt.
- **Any real LLM grade.** `gradeExplanation` needs `OPENROUTER_API_KEY` or
  `GROQ_API_KEY`. The grader is mocked in tests and the rule-based fallback is
  what answers offline.
- **Anything in a browser.** Login needs Supabase, so Playwright's three specs
  are unrun and `/engine` has not been rendered against real rows.
- **`dkt:compare` without `--sim`**, which reads `dkt_shadow_log`.

## Known defects left untouched, and recorded

- `src/app/api/analytics/route.ts` is a no-op stub: it parses the body,
  discards it, and returns `{ ok: true }`, so every `useAnalytics` event is
  dropped.
- `error_type` has a column, a type and no producer; Engine 5 (error
  classification) is unbuilt.
- `src/app/api/skill/route.ts` carries its own mastery thresholds (0.90 / 0.75 /
  0.45) unrelated to `getMasteryTier`'s (0.65 / 0.30), so one learner can be
  labelled differently in two places.
- `entry_node` is still written by placement and read by no selection logic:
  the divide-by-`maxScore` normalisation lets at most one skill reach the 0.65
  threshold, so it stays at the first topological node whatever the learner
  answers. Recorded rather than fixed, because nothing downstream reads it.
- 45 legacy question files at `content/questions/*.json` use a pre-`format`
  shape; nothing loads them.
- `MASTER_PLAN.md`, `PROGRESS.md` and `AUDIT_REPORT.md` remain stale, as
  `ROADMAP-REMAINING.md` already records.
