# Levels — step-by-step progress

Each level is one commit whose message starts with `Level N:`. Every level
builds, passes its tests, and its feature works on its own, without anything
from a later level. To demo a level:

```bash
git checkout $(git log --format=%h --grep='^Level 1:' -1 ccr-03eb88e4-wjepi5)   # change the number
npm ci && npm test                                                              # then the level's own command below
git checkout ccr-03eb88e4-wjepi5                                                # back to the latest
```

Level 0 is the merge commit `b94b44e` (`git checkout b94b44e`).

| Level | What it adds | Try it |
|---|---|---|
| 0 | `main` (120-node curriculum) + `v2` (FSRS shadow, DKT benchmark, LLM grader) on one branch | `npm run dev`, `npm test` |
| 1 | Learner simulator: virtual students with a known true memory, driving the real BKT / SM-2 / FSRS code. All its output is **synthetic** | `npm run sim -- --learners 200 --days 60` |
| 2 | DKT trained on Synaptic's own 120 skills (DKT-10), compared with the app's live BKT, a fitted BKT, and a ground-truth ceiling | `npm run sim` then `cd Research/dkt && python3 train_synaptic.py` |
| 3 | DKT runs inside the app in TypeScript (DKT-11), verified against PyTorch; optional shadow logging next to BKT | `npm run dkt:predict` |
| 4 | DKT evaluated against live BKT on unseen learners (DKT-12) + an automatic cutover gate (DKT-13) | `npm run dkt:compare -- --sim` |
| 5 | FSRS vs SM-2 compared on simulated learners (FSRS-4) + a live scheduler switch (FSRS-5) | `npm run sim`, then set `SCHEDULER=fsrs` |
| 6 | Placement actually places (answers graded server-side) and the 38 `order` questions become answerable | `npm run validate`, `npx vitest run src/lib/graph src/lib/ui` |
| 7 | Response time, hesitation (time to first interaction) and revisions measured for real, instead of ~0 / 0 / 0 | `npx vitest run src/lib/timing src/app/api/attempt` |
| 8 | What the dead latency signal cost, measured offline on the real engine modules | `npm run sim:latency` |
| 9 | 120 explain questions (one per skill) and one verdict per free-text attempt — the server's grade | `npm run validate` (963 questions, 120 explain) |
| 10 | The learner's explanation and the grade the engine consumed, stored with full provenance — **requires migration `006`** | `npx vitest run src/lib/db/explanation-grades` |
| 11 | Hesitation- and retry-aware scheduling quality, logged beside the live one — ships **off**, **requires migration `007`** | `npx vitest run src/lib/sm2/adaptive` |
| 12 | The DKT cutover gate can see learning growth, not only ranking | `npm run dkt:compare -- --sim` |
| 13 | `/engine`: every signal above, for one real learner, read from the database | `npm run seed:demo`, then open `/engine` |
| 14 | The bundled DKT retrained with DKT+ reconstruction — better growth fidelity, and still not enough to clear the gate | `npm run dkt:compare -- --sim` |
| 15 | The gate reports every failing condition, not only the first — "dkt not better" no longer hides the growth failure behind it | `npm run dkt:compare -- --sim`, then `/engine` |

## Level details

### Level 1 — simulator
- `src/lib/sim/` — seeded RNG, ground-truth learner model (`learner.ts`: prerequisites gate learning, memory decays and strengthens with spaced recall), simulation loop (`run.ts`), metrics (log-loss, AUC), curriculum adapter (`skills.ts`).
- `scripts/sim-run.ts` — runs SM-2 and FSRS on the same simulated population; writes `Research/sim/results/scheduler-comparison.json` (committed) and full event CSVs to `Research/sim/output/` (gitignored, DKT-ready columns first).
- `src/lib/sm2` functions take an optional `now` so simulated time works; live callers are unchanged.
- Never writes to the database — simulation is in-process only.

### Level 2 — DKT on Synaptic's skills
- `Research/dkt/train_synaptic.py` — trains the existing `DKTModel` on Synaptic's 120-skill graph. Skill index is fixed by `content/graph/nodes.json`, so the app and the model always agree. Input is any `student_id,skill_id,correct,timestamp` CSV: the simulator's log by default, or `npm run dkt:export` real data via `--input`.
- Results: `Research/dkt/results/synaptic_dkt_results.md` — **synthetic** (simulated learners). AUC on 300 held-out simulated students: ceiling 0.839, fitted BKT 0.735, **DKT 0.722**, live app BKT 0.717 (8 epochs, ~3 min on CPU).
- Fixed `train_dkt.py`'s `int(skill_id)` crash on text skill IDs, and `.gitignore` paths that said `research/` while the folder is `Research/` (Linux is case-sensitive, so data files weren't actually ignored).
- Python deps: `pip install -r Research/dkt/requirements.txt`. Tests: `python3 -m pytest Research/dkt/tests`.

### Level 3 — DKT inside the app (shadow mode)
- `src/lib/dkt/index.ts` — LSTM forward pass in TypeScript; no Python service. `src/lib/dkt/model/synaptic-dkt.json` is the Level 2 model (2 MB, trained on **simulated** learners, flagged `synthetic: true`).
- Parity: `Research/dkt/export_weights.py --fixture` writes PyTorch outputs; `src/lib/dkt/dkt.test.ts` checks TypeScript matches to 5 decimals on every skill.
- Shadow mode: with `DKT_SHADOW=1` and migration `005_dkt_shadow_log.sql` applied, every attempt logs DKT's prediction, live BKT's, and the outcome to `dkt_shadow_log`. Off by default; fail-open; BKT stays the live model. Learners see no difference.
- Demo without a database: `npm run dkt:predict` prints DKT's per-skill predictions for one simulated learner next to BKT's.
- Retrain and re-export: `python3 train_synaptic.py && python3 export_weights.py` (in `Research/dkt`).

### Level 4 — DKT evaluation and cutover gate
- `src/lib/dkt/compare.ts` — scores DKT vs live BKT on the same attempts; `cutoverDecision()` recommends a switch only with ≥ 5,000 attempts **and** ≥ 0.02 AUC gain **and** no worse log-loss. A recommendation is for a human to review; nothing switches automatically.
- `npm run dkt:compare -- --sim` — 300 fresh simulated learners (seed never used in training) through the app's TypeScript DKT and BKT. Result (**synthetic**): DKT AUC 0.723 vs live BKT 0.718 (ceiling 0.839) → gate says **don't switch**. Matches the Python result, confirming the shipped model end to end.
- `npm run dkt:compare` (no flag) — same report on real `dkt_shadow_log` rows once Level 3's shadow mode has collected data.
- `src/lib/dkt/index.ts` now steps the LSTM incrementally (`stepDkt`, `predictSkill`); `predictNext` is unchanged.

### Level 5 — FSRS: comparison and switch
- `npm run sim` now also writes `Research/sim/results/scheduler-comparison.md` (**synthetic**, 2,000 learners × 90 days): FSRS uses ~14% more reviews and cuts forgotten skills from 4.7% to 3.1%; it ranks recall better than SM-2 (AUC 0.62 vs 0.52) but default parameters are over-confident.
- `SCHEDULER=fsrs` makes FSRS set live review due dates (`src/lib/fsrs/scheduler.ts`). Default stays SM-2. SM-2's bookkeeping is always updated so switching either way is instant; any FSRS failure falls back to SM-2. FSRS shadow logging is unchanged.
- Not done: FSRS-6 (refitting FSRS's parameters) needs real review logs, which a simulator can't stand in for.

### Level 6 — placement and the unanswerable questions
- `src/lib/diagnostic/grade.ts` + `/api/diagnostic` grade the 12 placement answers server-side. Before this, nothing did: `placeLearner` scored every skill 0, every skill normalised to the 0.05 floor, and **every skill with a hard prerequisite started blocked, for every learner**. Server-side because `/api/diagnostic/questions` ships `correct_option_id` to the browser.
- `src/lib/ui/order-answer.ts`, an `order` branch in `QuestionCard`, and `order` verification in `/api/attempt`: 38 authored questions were reachable through `pickQuestion` with no widget and a disabled submit button.
- Ten `require('@/../content/...')` calls became relative paths. Vite does not rewrite a runtime CJS `require`, so under Vitest every one threw and every content-reading route silently fell back — which is why no test could have caught either defect.

### Level 7 — measuring the response honestly
- `src/lib/timing/answer-timing.ts` — pure, total, time as an explicit parameter (the discipline `src/lib/sm2` already uses). `latency = submitted − rendered`, `hesitation = firstInteraction − rendered`, revisions counted once per 1.5s settled burst.
- The read moved out of the request-body literal, which was the bug: `Date.now() - start` measured JSON construction. `hesitation_ms` is now client-sent (only the browser can see it) and clamped server-side to the latency it is a prefix of. The Feynman loop's hardcoded `latency_ms: 5000` is gone.
- `deriveBehaviorEvidenceModifier` and `updateMotivationState` are untouched: their slow arms became reachable purely because the client now sends the truth.

### Level 8 — what the dead signal cost
- `npm run sim:latency` — the same population under a measured and a crushed (100 ms) latency signal, through the real `bktToQuality` / `fsrsRatingFromCorrectness` / `reconcileBktSm2` / `computeFsrsSchedule`. The clock is deliberately unchanged: the bug destroyed the signal, not the time.
- **Synthetic** (500 learners × 90 days, seed 2026): crushed, SM-2 qualities 3 and 4 and FSRS Hard and Good all occur at 0.0% while 5/Easy goes 15.5% → 58.4%; SM-2 reviews/learner 141.61 → 128.65, retention 0.9181 → 0.9030; FSRS 160.99 → 110.19, 0.9319 → 0.9052.
- Section 3 replays the real motivation model: the reachable behaviour-modifier range collapses from {1, 0.85, 0.8, 0.65} to {1, 0.8}, and the four-attempt slow streak can never fire.

### Level 9 — explain questions, graded server-side
- 120 questions from `scripts/author-explain-questions.ts`, deterministic and committed, built from each skill's own `explain_back_prompt`; `--check` reports 0 edits against the committed content.
- For `question_format === 'explain'` the server's grade is the only verdict: `correct = category === 'meaning-included'`. Closes both halves of a real defect — an authored explain question used to be wrong every time, and the Feynman loop used to send a rule-based verdict while the server LLM-graded a different text.
- No UI work: `QuestionCard` already renders the textarea. `pickGuidedQuestion` stays MCQ-only, so the guided arc is unchanged.

### Level 10 — storing the explanation and its grade
- Migration `006_explanation_grades.sql`: the learner's words, the prior explanation, category, confidence, rationale, prompt version, serving model, cache hit, grader latency, and the `reasoning_quality` BKT consumed.
- A side table, not columns on `attempt_events`: `insertAttempt`'s unknown-column fallback retries with the 001-only column set, so every optional column there risks dropping the 002/003 analytics on a deployment that is behind.
- Fail-open at both ends — the insert throws, the route swallows. `confidence: 0` marks a grade no model produced.

### Level 11 — behaviour-aware scheduling quality (shadow)
- `src/lib/sm2/adaptive.ts`: one tier, two projections (SM-2 quality and FSRS rating), demoted one step on a long time to first interaction or repeated answer changes, and never below the slowest correct tier.
- A guided reflection takes the middle tier rather than one derived from its duration — the Feynman loop is designed to take minutes, and the live mapping rates every one of them 3/Hard. This is the policy question Level 7 raised.
- Migration `007_behavior_quality_shadow.sql` logs both qualities, both ratings, the signals, and the interval each would have scheduled. Ships **off**; `ADAPTIVE_QUALITY=1` is a live cutover needing human sign-off.

### Level 12 — a gate that can see growth
- `cutoverDecision(comparison, growth)` — growth is required, so TS strict finds any caller still using the AUC-only gate. New refusals: `growth_unmeasured`, `dkt_worse_growth`.
- `compareGrowth` mirrors `dkt-lab/pipeline/curves.py`: pairs with ≥ 10 attempts restricted to their first 10, thin buckets skipped rather than truncating the curve, row-weighted least-squares slope, ratio against the observed slope.
- Why: on ASSISTments 2009 DKT wins by +0.087 AUC with a slope ratio of 0.560 against BKT's 0.822. `npm run dkt:compare -- --sim` (300 learners): 4,532 cohort pairs, DKT 0.6654 vs BKT 0.8712 — a loss four times the 0.05 tolerance.

### Level 13 — `/engine`
- A server component following `src/app/dashboard/page.tsx`: cookie → `verifyToken` → query helpers, no new API route and no client fetch. Four sections, each naming the feature item it closes.
- `npm run seed:demo` writes one **synthetic** learner with a full history, reusing `src/lib/sim/learner.ts` rather than inventing a second learner model; `--dry-run` builds every row and writes nothing.
- `/demo` is a hardcoded walkthrough and is untouched; `/engine` is deliberately its opposite — every number comes from the database.

### Level 14 — a better DKT, judged by the same gate
- `Research/dkt/train_dkt.py` gains `lambda_r` (DKT+ reconstruction) and early stopping, both **off by default**: a pytest reproduces the old loop step for step and asserts identical weights at `lambda_r = 0`, and a default retrain reproduced the committed weights bit-for-bit.
- The bundled model is retrained at `lambda_r = 0.1` (pinned in advance — the one setting that generalised across the lab's three datasets) and records its own configuration in `synaptic-dkt.json`, which the comparison report now names.
- **Synthetic** (300 learners, seed 9001, 95,585 attempts): slope ratio 0.6654 → **0.7273**, AUC 0.7231 → 0.7253. The same-budget arm without `lambda_r` scored *higher* AUC (0.7290) and *lower* growth (0.6933) — selecting on AUC would have discarded the gain. The lab predicted +0.15 slope ratio and the app got +0.034; most of the lab's headroom was training, not regularisation.
- The gate still refuses (`dkt_not_better`): +0.0078 AUC against 0.02 required, 0.144 growth loss against 0.05 tolerated. No constant was retuned after the measurement.

### Level 15 — the gate names one reason and reports all of them
- `CutoverDecision` gains `checks` (sample size, ranking, growth), each with its own `pass` and the numbers it was judged on. The refusal precedence and every `reason` string are unchanged, so nothing downstream reads differently.
- Why: the simulator's verdict read `dkt_not_better` and said nothing about growth, which also fails by ~3× the tolerance. Closing the AUC gap would have revealed a second failure nobody had been shown — the same single-scalar mistake the lab diagnosed, one level up.
- `npm run dkt:compare -- --sim` and `/engine` now print all three rows: sample size yes (95,585 ≥ 5,000), ranking **NO** (AUC gain 0.0078 < 0.02), growth **NO** (0.7273 vs BKT 0.8712, tolerance 0.05).
- The existing tests keep their exact `toEqual` assertions on `reason` and `recommend` and gained an assertion about which conditions failed; nothing was relaxed.
