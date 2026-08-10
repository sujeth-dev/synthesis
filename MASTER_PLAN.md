# MASTER_PLAN.md — Operational Task List

This is the task-by-task execution list for the autonomous development loop (`DEVELOPMENT_LOOP.md`). It is derived from `v2/doc/basic-guide.md` (the strategy/rationale document — read it for *why*, not *what to do next*) and `v2/doc/findings/*.md`. This file is the operational source of truth for *what to do next*; `basic-guide.md` and `findings/` are not re-litigated here, only referenced.

**Do not duplicate rationale here.** If a task's justification isn't obvious from its one-line description, follow the doc reference instead of re-explaining it in this file.

**Status values:** `not_started` | `in_progress` | `blocked` | `done`

**Task ID format:** `<PHASE>-<N>`, stable once assigned — never renumber a task, only append.

---

## Repo baseline (read this before task 0)

- Stack: Next.js 14.2.5, React 18, TypeScript 5 (strict), Supabase, Node v22.17.0.
- Engine code: `src/lib/bkt/index.ts`, `src/lib/sm2/{index,urgency}.ts`, `src/lib/motivation/index.ts`, `src/lib/session/engine.ts`.
- Content: `content/graph/{nodes,edges}.json`, `content/questions/by-skill/`, validated by `scripts/validate-content.js` (`npm run validate`).
- ~~**No test framework is installed.**~~ **Resolved by P0-0 (`95bcb45`):** Vitest is installed with a `test` script and `@/*` alias support.
- No CI config (`.github/` does not exist). The loop is the only verification gate until/unless a human adds CI.
- ~~`v2/` (this planning tree) is currently **untracked** in git.~~ **Resolved by `985b68b`:** the planning tree and loop documents are committed and pushed.

---

## Phase 0 — Foundation (strictly sequential; nothing else starts until this phase is `done`, except the parallel-eligible tracks below)

### P0-0 — Bootstrap a test framework
**Status:** done
**Why:** No test runner exists anywhere in the repo; every later task in this phase requires writing a failing test first. This is a prerequisite the source plan (`basic-guide.md`) assumed was already true and isn't.
**Do:** Add Jest (or Vitest — either is acceptable, pick one and stay consistent) with TypeScript support, wired to run against `src/lib/`. Add a `test` script to `package.json`.
**Acceptance criteria:**
- `npm test` exists and runs.
- A trivial smoke test (e.g. `1 + 1 === 2` or importing one real module) passes.
- Test runner respects `tsconfig.json`'s path aliases (`@/*`).
**Required tests:** the smoke test itself.

### P0-1 — Failing test: `p_know` doesn't decay when overdue
**Status:** done
**Depends on:** P0-0
**Doc ref:** `v2/doc/findings/01-bkt-time-decay.md`, `basic-guide.md` Phase 0 item 1
**Do:** Write a test that simulates an overdue SM-2 review and asserts `p_know`/mastery state should have decayed — and confirm it currently fails against the unmodified code.
**Acceptance criteria:** test is committed in a failing state against current `main`, clearly named (e.g. `sm2/decay.test.ts`), asserts a specific numeric/state expectation, not just "something changed."
**Required tests:** this test IS the deliverable.

### P0-2 — Fix: generalize `reconcileBktSm2()` decay
**Status:** done
**Depends on:** P0-1
**Doc ref:** `basic-guide.md` Phase 0 item 1, Promise #5, corrected Critical Fixes item 3
**Do:** Add on-load BKT/SM-2 reconciliation in `src/lib/sm2/index.ts` so `p_know` decay applies on every session load keyed off `urgency.ts`'s overdue calculation. Keep the existing attempt-time `reconcileBktSm2()` behavior unchanged. Persist refreshed learner state/schedule before task selection. ~~Active-phase/current-flow overdue topics remain automatic candidates; past-phase topics become optional.~~ **Superseded by the P0-4 consent decision:** every review is optional, including active-phase reviews.
**Acceptance criteria:**
- P0-1's test now passes.
- Any existing mastery-loss-edge-case behavior is unchanged (add a regression test for it if one doesn't exist).
- Manual/scripted check: simulate an overdue review and confirm `p_know` visibly decreases.
- Normal-mode selection does not force a past-phase topic back into the session solely because decay made it overdue/weak; explicit review mode can still select it.
**Required tests:** P0-1's test + a regression test for the pre-existing edge case.

### P0-3 — Combined-evidence BKT update
**Status:** done
**Depends on:** P0-2
**Doc ref:** `basic-guide.md` Phase 0 item 2, Promise #3 (fully original — no lab equivalent)
**Do:** Extend `bktUpdate()` to accept correctness (existing) + a reasoning-quality modifier + a behavior modifier (from `motivation/index.ts`'s existing signals) as weighted adjustments to the evidence used in the update — not just downstream UX routing. Note: the reasoning-quality modifier's real input (Phase 1's gap-detection classifier) doesn't exist yet — build this task's plumbing to accept a modifier value, and use a stub/neutral value until Phase 1 lands; do not block this task on Phase 1.
**Acceptance criteria:** unit test proving a degraded reasoning-quality/behavior signal produces a measurably different posterior than plain correctness alone, for the same correctness input.
**Required tests:** `bkt` unit tests covering at least: baseline correctness-only, degraded-reasoning-modifier, degraded-behavior-modifier, combined.

### P0-4 — Session length + review-debt policy
**Status:** done
**Depends on:** P0-2 (needs real decay to define debt meaningfully)
**Doc ref:** `basic-guide.md` Phase 0 item 3, Critical Fixes items 2 & 4, `v2/doc/findings/02-session-length-review-debt.md`
**Do:** Define the policy as named constants/config in `src/lib/session/engine.ts`: 10-task cap, at least 4 current/new-topic slots, a consent-gated initial offer of up to 5 reviews, and one optional sixth review after renewed consent. No review—active or past phase—is selected in normal mode. Excess debt rolls forward by urgency.
**Acceptance criteria:** policy is named/documented in code; tests cover at-capacity and over-capacity debt; session start reports the bounded review offer; no review runs before consent; normal sessions cap at 10; review mode pauses after its initial batch and requires renewed consent for each additional item.
**Required tests:** `session/engine.ts` tests for at-capacity and over-capacity review-debt scenarios.

### P0-5 — Arc memory for `selectNextTask()`
**Status:** done
**Depends on:** P0-4
**Doc ref:** `basic-guide.md` Phase 0 item 4, `v2/doc/findings/04-session-flow-no-continuity.md` (Critical, refined 2026-08-09); thresholds resolved by human direction 2026-08-10, see `PROGRESS.md` item 7
**Do:** Give `selectNextTask()` continuity: the automatic next-question flow never force-switches topics, under any circumstance — no task-count fallback, no exceptions. Once the current topic's `p_know` reaches **0.60**, surface an explicit choice to the learner: continue this topic (framed as the better path, toward full mastery) or switch. If they choose to switch, let them pick **any unlocked topic themselves** — do not auto-select the destination via the algorithm's next pick. Free manual navigation to any topic (already possible via the graph/dashboard) is unaffected by this gate at any mastery level — this task only governs the automatic in-session next-question flow. Replace the bare "Selecting next skill…" reload with the stay/switch choice UI, using tier language (Beginner/Intermediate/Mastered, per `P0-8`) — never a raw percentage.
**Acceptance criteria:**
- Test proving the automatic flow returns tasks from the same skill across consecutive calls indefinitely — both below and above the 0.60 threshold — unless the learner explicitly chooses to switch.
- Test proving no automatic switch ever occurs regardless of task count (confirms the fallback cap is genuinely gone, not just raised).
- Test/manual check proving the stay/switch choice is offered once `p_know` crosses 0.60 and not before.
- UI: choosing "switch" lets the learner pick any unlocked topic, not a single engine-suggested one (manual check acceptable if no UI test harness exists yet — note this explicitly in the commit/PROGRESS entry rather than silently skipping it).
- UI: the choice/bridge uses tier labels, never a raw `p_know` number.
**Required tests:** `session/engine.ts` tests for hold-indefinitely-below-threshold, hold-indefinitely-above-threshold-until-chosen, and threshold-crossing-unlocks-choice paths.

### P0-8 — Replace raw mastery percentages with tier labels
**Status:** not_started
**Depends on:** none (can run in parallel with P0-6/P0-7; not gating P0-5, but P0-5's switch-choice UI consumes this task's labels)
**Doc ref:** human direction 2026-08-10, see `PROGRESS.md` item 8
**Do:** Remove every learner-facing raw `p_know`/`p_start` percentage display — including `SkillDetailPanel.tsx`'s "62% known" text and the percentage-labeled mastery-bar caption, and dashboard mastery percentages — and replace with a 3-tier label: **Beginner / Intermediate / Mastered**. Reuse existing engine constants (`src/lib/bkt/index.ts`) rather than inventing new thresholds: Beginner = `p_know < LEARNING_THRESHOLD (0.30)`, Intermediate = `0.30 ≤ p_know < MASTERY_THRESHOLD (0.65)`, Mastered = `p_know ≥ 0.65`. The `fragile` state folds into the Intermediate tier for display purposes only (assumption, not explicitly confirmed — flag if wrong).
**Acceptance criteria:**
- No component renders a raw `p_know`/`p_start`-derived percentage to the learner (grep-clean check across `src/components/`, `src/app/dashboard`, `src/app/graph`, `src/app/learn`).
- Every mastery display shows one of the three tier labels instead.
- Existing visual progress-bar width (proportional fill) may remain, but its numeric caption is removed.
- Unit test confirming the tier-mapping function returns the correct label at each threshold boundary (0.29/0.30, 0.64/0.65).
**Required tests:** unit tests for the tier-mapping function at boundary values; component check confirming no raw percentage text renders.

### P0-6 — Core test suite
**Status:** not_started
**Depends on:** P0-0 (P0-1 through P0-5 will have already seeded partial coverage)
**Doc ref:** `basic-guide.md` Phase 0 item 5
**Do:** Fill in remaining test coverage for `bkt/`, `sm2/`, `motivation/`, `session/engine.ts` beyond what P0-1..P0-5 already added, so all four modules have direct test coverage of their exported functions.
**Acceptance criteria:** every exported function in these four modules has at least one direct test; `npm test` green.
**Required tests:** this task's deliverable is the tests themselves.

### P0-7 — Remove dead Supabase-migration debris
**Status:** not_started
**Depends on:** none (can run anytime in Phase 0, sequenced last only to avoid churn during the engine work above)
**Doc ref:** `basic-guide.md` Phase 0 item 6
**Do:** Remove `scripts/init-db.js`, `scripts/reset-db.js` if confirmed dead (Supabase migration is complete per `basic-guide.md`'s stated current state). Verify nothing references them first (`package.json` scripts `db:init`/`db:reset`, any docs).
**Acceptance criteria:** files removed, `package.json` scripts referencing them removed or repointed, `npm run build` clean, no remaining references (`grep` clean).
**Required tests:** none beyond build passing — this is a deletion task.

**Phase 0 is `done` when:** P0-0 through P0-8 are all `done`, `npm test` is fully green, `npm run build` is clean, and the Phase 0 items in the Verification section of `basic-guide.md` (p_know visibly decays; combined-evidence BKT posterior differs measurably) have been manually re-confirmed once at the end of the phase.

---

## Parallel-eligible tracks

These do not block Phase 0 completion and may be worked whenever the loop has bandwidth, but **the default loop always prefers the next sequential Phase 0/1/2/3 task over a parallel track** unless a human explicitly redirects it — treat these as lower priority, not equal priority. Their *live cutover* points (a track actually changing production behavior) remain gated to the phase noted in each track.

### Content classification & Bloom's tagging (Promise #7)
Doc ref: `v2/doc/findings/06-content-classification-gaps.md`, `basic-guide.md`'s Bloom's checklist.

| ID | Task | Depends on |
|---|---|---|
| BLOOM-1 | Define checkable skill-granularity rules (when two sub-concepts = one `skill_id` vs. two) | none |
| BLOOM-2 | Add `bloom_level` to `Question`/`SkillNode` schema (`src/types/index.ts`) as closed, versioned vocabulary | BLOOM-1 |
| BLOOM-3 | Extend `scripts/validate-content.js`: bank-size minimums, tier coverage, tag-vocabulary closure | BLOOM-2 |
| BLOOM-4 | Retrofit `bloom_level` onto the 45 currently-populated skills | BLOOM-2, BLOOM-3 |
| BLOOM-5 | Wire `bloom_level` into `engine.ts`'s tier/difficulty selection | BLOOM-4 |
| BLOOM-6 | Gate — confirm Phase 2 content authoring (P2-3) uses this vocabulary from creation | BLOOM-5, must be done before P2-3 starts |

**Acceptance per item:** matches its one-line "Do" above; BLOOM-3's acceptance additionally requires `npm run validate` to actually enforce the new checks (fail on violation, not just warn).

### DKT benchmark (Promise #4 — benchmark only, not a live cutover)
Doc ref: `basic-guide.md` §"DKT / FSRS / NLP", section A.
**Constraint:** lives entirely under `research/dkt/` (Python), never touches `package.json` or the Next.js runtime. Do not commit raw datasets — `.gitignore` them, commit only scripts + results.

| ID | Task |
|---|---|
| DKT-1 | Download ASSISTments 2009-2010, record license/citation terms in `research/dkt/README.md` |
| DKT-2 | Preprocess into `(student_id, skill_id, correct, timestamp)` sequences |
| DKT-3 | Split by student, not by interaction |
| DKT-4 | Fit a proper per-skill BKT baseline on the same split |
| DKT-5 | Train a small LSTM DKT on train/val |
| DKT-6 | Evaluate DKT AUC vs. BKT AUC on held-out test set |
| DKT-7 | Unit-test the DKT training loop against a synthetic tiny batch (loss decreases, no mask leakage, correct output shapes) |
| DKT-8 | Write up the result, labeled explicitly as a benchmark-dataset result, not a Synaptic-production result |

**Live cutover** (switching Synaptic's own engine to DKT) is Phase 3 item P3-3, gated at 50k+ real sessions — do not do this as part of this track.

### FSRS (start anytime after P0-2's SM-2 behavior is well-tested)
Doc ref: `basic-guide.md` §"DKT / FSRS / NLP", section B.

| ID | Task | Depends on |
|---|---|---|
| FSRS-1 | Pull FSRS's published default parameters from a reference implementation (e.g. `ts-fsrs`) | none |
| FSRS-2 | Test FSRS interval output against the reference implementation for known inputs | FSRS-1 |
| FSRS-3 | Run FSRS in shadow mode alongside SM-2 for ≥1 full review cycle (compute + log both, serve SM-2 live) | FSRS-2, P0-2 done |
| FSRS-4 | Compare shadow-mode logs; decide on cutover | FSRS-3 |
| FSRS-5 | Switch live scheduling to FSRS (only after FSRS-4 looks right — human sign-off recommended before this one, see `DEVELOPMENT_LOOP.md` blocker rules) | FSRS-4 |
| FSRS-6 | *(Optional, needs 5k+ real review events)* Refit FSRS's 17 parameters to Synaptic's own users | FSRS-5 |

### NLP/LLM reasoning grader (start once P1-2's rule-based classifier exists)
Doc ref: `basic-guide.md` §"DKT / FSRS / NLP", section C.

| ID | Task | Depends on |
|---|---|---|
| NLP-1 | Collect 50-200 labeled real/hand-authored explanation examples | P1-2 |
| NLP-2 | Design the rubric-based grading prompt for the LLM API, versioned | NLP-1 |
| NLP-3 | Run the API grader against the validation set; measure agreement (e.g. Cohen's kappa) vs. human labels | NLP-2 |
| NLP-4 | Wire in the rule-based classifier as a hard fallback on API failure/timeout | NLP-3 |
| NLP-5 | Add caching for repeated/near-identical explanations | NLP-4 |
| NLP-6 | Log every graded call (input, output, rubric/prompt version) | NLP-4 |

---

## Phase 1 — Explanation & Reasoning Evaluation (Promises #1, #2; contributes #8)

Scope decision (2026-08-09, see `basic-guide.md` Phase 1 header and `v2/doc/vision/discovery-model.md` §7): build against **existing** explanation-first content. Discovery-first authoring applies to new content starting at P2-3.

### P1-1 — Feynman Loop teaching-canvas interaction
**Status:** not_started · **Depends on:** Phase 0 done
**Do:** Build the rule-based branching interaction per `13-content-structure.md`'s Feynman Loop transcript (the concrete spec) — classifies free-text explanation into method-only / meaning-included / gap.
**Acceptance criteria:** running the transcript from `13-content-structure.md` through the built interaction produces the same branch outcomes it specifies (acceptance script, see Verification below).
**Required tests:** classifier unit tests for each of the 3 categories + at least one ambiguous/edge input.

### P1-2 — Rule-based reasoning classifier
**Status:** not_started · **Depends on:** P1-1
**Do:** Implement the classifier function (method-only / meaning-included / gap) consuming P1-1's captured free text.
**Acceptance criteria:** same as P1-1's acceptance script; classifier is a pure function with direct unit tests (not bundled invisibly into UI code).
**Required tests:** unit tests, one per category minimum.

### P1-3 — Wire gap-detection into BKT reasoning-quality modifier
**Status:** not_started · **Depends on:** P1-2, P0-3
**Do:** Replace P0-3's stub/neutral reasoning-quality modifier with P1-2's real classifier output.
**Acceptance criteria:** P0-3's combined-evidence test suite now exercises a real (non-stub) reasoning-quality signal end to end; add a test confirming a "gap" classification measurably differs from "meaning-included" in the resulting posterior.
**Required tests:** integration test, classifier → `bktUpdate()`.

### P1-4 — Real BKT-movement comparison (Promise #8)
**Status:** not_started · **Depends on:** P1-1
**Do:** Compute plain-session vs. Feynman-session BKT movement from actual engine/session data, not hardcoded illustrative numbers.
**Acceptance criteria:** the computed comparison is traceable to real attempt records in a test fixture, not a literal constant in the code.
**Required tests:** unit test with a fixture session proving the computed comparison matches hand-calculated expected movement.

### P1-5 — Document NLP/LLM upgrade trigger
**Status:** not_started · **Depends on:** P1-2
**Do:** Document (in code comments near the classifier, and in this repo's docs) the condition under which P2's classifier gets replaced/augmented by the NLP-track grader — not a build task, a documented trigger.
**Acceptance criteria:** a markdown note or code comment stating the trigger condition exists and is findable from the classifier's source location.
**Required tests:** none (documentation task).

**Phase 1 is `done` when:** P1-1 through P1-5 are `done`, `npm test` green, acceptance script from `13-content-structure.md` passes.

---

## Phase 2 — Analytics & Content Completion (Promise #6)

### P2-1 — Persist motivation-FSM signals
**Status:** not_started · **Depends on:** Phase 1 done
**Do:** Persist latency/streak/retry/hesitation signals (already computed live in `motivation/index.ts`) into a queryable analytics layer, per attempt — not just live FSM state.
**Acceptance criteria:** querying the persisted store for a known simulated session returns the same signal values the live FSM computed during that session.
**Required tests:** integration test comparing live-computed vs. persisted-and-reread signal values.

### P2-2 — Re-skin to Seven Worlds design spec + Finding 05 fix
**Status:** not_started · **Depends on:** Phase 1 done
**Doc ref:** `v2/doc/12-design-spec.md`, `v2/doc/findings/05-explanation-content-static.md`
**Do:** Re-skin `dashboard`, `graph`, `learn/skill/[skill_id]` to the locked Seven Worlds design spec. Fold in Finding 05's progressive-disclosure fix in the same pass: `LearnPanel`/`ExplanationPanel` show a short `key_insight`-led opening with full body on demand, instead of rendering the full body immediately.
**Acceptance criteria:** manual walkthrough confirms all three re-skinned pages match the design spec's Priority-1 screens and don't regress the April UI/UX audit's contrast/size baseline; progressive disclosure verified by confirming full `body` is not rendered until explicitly expanded.
**Required tests:** component test (or manual, documented in PROGRESS.md if no component-test harness exists yet) confirming `key_insight` renders first and full body is gated behind an explicit action.

### P2-3 — Complete Phases 4-8 content, discovery-first
**Status:** not_started · **Depends on:** BLOOM-6, Phase 1 done
**Do:** Author remaining JEE Math content (Phases 4-8) via the existing validated pipeline (`content/graph/nodes.json`, `content/questions/by-skill/`), authored discovery-first per `v2/doc/vision/discovery-model.md` §1 (problem/scenario opening, not explanation-first), tagged with `bloom_level`.
**Acceptance criteria:** `npm run validate` passes with Phases 4-8 populated; spot-check confirms discovery-first framing (problem before explanation) on new content.
**Required tests:** `npm run validate` is the gate; no unit tests needed for content itself.

**Phase 2 is `done` when:** P2-1 through P2-3 are `done`, `next build` is clean (0 TypeScript errors), `npm run validate` passes.

---

## Phase 3 — Later-phase items (do not start until Phase 0-2 are all `done`)

| ID | Task | Doc ref |
|---|---|---|
| P3-1 | Promise #10 — adopt Learner Profile schema (6 dimensions) + V6/V7 dashboard concepts | `08-interfaces.md`, `11-demo-masterplan.md` |
| P3-2 | Promise #9 — build Code Editor + Debug the Machine construct (Track 2) | `09-library.md`, `13-content-structure.md` |
| P3-3 | Promise #4 — DKT live cutover, gated at 50k+ real sessions (prior art: DKT-1..8 above) | `basic-guide.md` |
| P3-4 | Composite puzzles (`vision/discovery-model.md` §5) — needs BLOOM track done + redesigned `insertAttempt()` | `discovery-model.md` §5 |

Each item's acceptance criteria is its own lab-doc's acceptance script, evaluated when the item is actually started (not defined in detail here to avoid staleness — re-derive from the cited doc at start time).

---

## Final verification & thesis defense prep (after Phase 3)

| ID | Task |
|---|---|
| PF-1 | Full regression pass: `next build` clean, `npm run validate` passes, full test suite green |
| PF-2 | Manual walkthrough: dashboard → concept map → session flow, confirming reasoning line + Orbit badges reflect real engine state |
| PF-3 | Compile thesis results package: DKT-vs-BKT benchmark, real-data predictive-accuracy AUC, before/after BKT-movement comparison |
| PF-4 | Final reconciliation pass on `v2/doc/basic-guide.md` and this file against what was actually shipped |

---

## Changelog

- 2026-08-09 — Initial creation, derived from `v2/doc/basic-guide.md`'s Master Checklist + `v2/doc/findings/*.md`. Added P0-0 (test framework bootstrap) as a new prerequisite not present in the source plan.
- 2026-08-10 — P0-5 rewritten per human direction: dropped the task-count fallback switch entirely (no automatic switching, ever), set the stay/switch choice point at `p_know` 0.60, and made switch destination a free learner choice rather than the algorithm's next pick. Added **P0-8** (new task, not in the original source plan) to replace raw `p_know`/`p_start` percentages with Beginner/Intermediate/Mastered tier labels across learner-facing surfaces. Set P0-5 status back to `not_started`.
