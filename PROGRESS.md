# PROGRESS.md — Live State

Read this first, then `MASTER_PLAN.md`, then follow `DEVELOPMENT_LOOP.md`. This file is updated at the end of every loop iteration (Step 9). If this file and the actual repo state (`git log`/`git status`) ever disagree, the repo is correct — fix this file to match before doing anything else.

---

## Current task

**P1-1 — Feynman Loop teaching-canvas interaction + rule-based reasoning classifier** is unblocked. Awaiting explicit go-ahead to begin implementation (per this project's standing "discuss before implement" direction).

---

## Next action

Confirm with the human that implementation of P1-1 (combined scope) should begin now, then follow the normal `DEVELOPMENT_LOOP.md` procedure.

---

## Known blockers / risks (not yet acted on)

1. ~~**`v2/` planning tree is untracked in git.**~~ **Resolved:** committed and pushed in `985b68b` before implementation began.
2. ~~**No test framework installed.**~~ **Resolved:** P0-0 installed and configured Vitest in `95bcb45`.
3. **No CI configuration** (`.github/` doesn't exist) — the loop itself is the only verification gate right now. Not currently a blocker, just a noted gap; consider flagging to a human whether CI should be added before or after Phase 0.
4. **`.env.local` exists locally but is gitignored** (confirmed present, contents not inspected — respecting that it may hold secrets). Any task needing an external API key (notably the NLP-\* track's LLM API key) must confirm the relevant variable exists in `.env.local` before starting, per `DEVELOPMENT_LOOP.md`'s blocker rules — do not assume it's there.
5. ~~**P0-1/P0-2 contract was underspecified and conflicted with the loop gates.**~~ **Resolved by human direction on 2026-08-10:** add on-load reconciliation while preserving attempt-time `reconcileBktSm2()`; persist refreshed state/schedule; auto-apply current/active-phase reviews but expose past-phase reviews only through learner-selected review mode. Commit P0-1 red and P0-2 green separately locally, then push both together after P0-2 passes.
6. ~~**P0-4 policy values are unspecified.** ... Recommended default: 10 tasks per normal session, with at most 6 automatic active-phase reviews and at least 4 current/new-topic slots; excess review debt rolls forward by urgency. Explicit review mode may use all 10 slots for reviews.~~ **Resolved by human direction on 2026-08-10 (P0-4):** reviews are consent-based, not force-queued — even current/active-phase reviews are no longer auto-inserted into the task list. At session start, offer a default batch of **5–6 review items** and ask before running them; do not silently run them as mandatory tasks. Once that initial batch is done, continuing further — more reviews, or the rest of the session — requires the learner's voluntary choice each time; nothing auto-continues past the point they were last asked. This supersedes the "automatic active-phase reviews" framing above: reviews are offered, never forced, from the first prompt onward. The 10-task session cap and 4-slot new/current-topic minimum are not overridden by this direction and still stand as the working default; excess review debt still rolls forward by urgency, now simply as more items available to be offered/asked about in future sessions rather than auto-queued.
7. ~~**P0-5 arc completion is qualitative but needs numeric engine thresholds.** The cited docs require genuine mastery/`p_know` movement with a task-count fallback, but specify neither amount. Recommended policy: hold the current skill until it becomes `mastered` or gains at least **0.15 `p_know`** from the arc start; if neither occurs, switch after **4 tasks** on that skill. A switch bridge can state "You've made progress on {old}; now connecting it to {new}."~~ **Superseded by human direction on 2026-08-10 (P0-5):** the task-count fallback is dropped entirely — the automatic in-session flow (`selectNextTask()`'s normal next-question path) never force-switches topics under any circumstance, full stop, no matter how many tasks pass. Instead, once the current topic's `p_know` reaches **0.60**, the learner is offered an explicit choice — continue this topic (framed as the better option, toward full mastery) or switch. If they choose to switch, they pick **any unlocked topic themselves**, not the engine's next algorithmic pick. Manual navigation to any topic via the graph/dashboard remains available at any mastery level regardless of this gate — this policy only governs the automatic in-session next-question flow, not free navigation (assumption stated back to the human and not corrected). The switch prompt/bridge must use tier language (Beginner/Intermediate/Mastered — see new item 8 below and `P0-8`), never a raw percentage.
8. **New direction (2026-08-10): stop showing raw `p_know`/`p_start` percentages to learners anywhere.** Replace with a 3-tier label — Beginner / Intermediate / Mastered — on every learner-facing surface (`SkillDetailPanel.tsx`'s "62% known" text + percentage-labeled mastery bar caption, dashboard mastery percentages, any other raw-percentage display). Proposed mapping, reusing existing engine constants rather than inventing new ones (`src/lib/bkt/index.ts`): Beginner = `p_know < LEARNING_THRESHOLD (0.30)`, Intermediate = `0.30 ≤ p_know < MASTERY_THRESHOLD (0.65)`, Mastered = `p_know ≥ 0.65`. `fragile` state (decayed-from-mastered, `< FRAGILE_THRESHOLD` 0.55) folds into the Intermediate tier for display purposes only — flagged as an assumption, not explicitly confirmed. Filed as new task **P0-8** in `MASTER_PLAN.md`.
9. ~~**P1-1 and P1-2 currently duplicate classifier responsibility.**~~ **Resolved by human direction on 2026-08-10:** combine classifier implementation into P1-1 (rather than keeping the documented split). P1-2 is retired; its scope (pure classifier function + unit tests) now lives inside P1-1. `MASTER_PLAN.md` updated: P1-1 merged, P1-2 marked retired, P1-3/P1-5/NLP-1 dependency edges repointed from P1-2 to P1-1.

---

## Completed work (chronological)

### Prior to this planning pass (from git history, `git log --oneline`)
- Initial engine/content build: BKT, SM-2, motivation FSM, session engine, interactive graph, dashboard (multiple commits, `9e9deed` through `dba14cd`).
- Session implementation with progress/unlocking (`226253c`).
- Review system flow (`e99f587`).
- April 2026 UI/UX accessibility pass: contrast, font sizes, graph minimap, dashboard redesign (`9c85133`).
- Dashboard CTA/animation refinements (`f41e8d2`, `770bb6f`).
- Migrated database from SQLite to Supabase for Vercel deployment (`e659fab`).
- Animated demo page added for portfolio embedding (`655020b`).
- Four `Research/lab/` platform-vision docs added and committed (`1e158bc` through `8a9e8c0`): why/blueprint/engines/constructs/tracks/phases/users/audit, interfaces + Engine 6, library doc, build plan + demo masterplan + design spec + content structure.

### Planning pass (2026-08-09, committed as `985b68b`)
- Read and cross-checked `v2/doc/basic-guide.md` against `v2/doc/findings/00-index.md` through `07-resolved-and-corrected.md` and `v2/doc/vision/discovery-model.md`.
- Corrected two stale claims in `basic-guide.md` (Orbit-mapping "still open" claim was false, already resolved in code; `bloom_level` "already correct" claim was false, doesn't exist in schema) — corrections recorded inline per the project's audit-trail convention (strikethrough + note, not silent deletion).
- Resolved three open scope/sequencing decisions and propagated them into `basic-guide.md` and `discovery-model.md`: Bloom's tagging runs as a parallel-eligible track (not Phase-0-gating); Phase 1 scope is "combination" (build Feynman Loop against existing content now, discovery-first authoring applies to new content going forward); composite puzzles are documented as a Phase 3 future item, not built now.
- Found and fixed two "orphaned findings" — Finding 04 (topic continuity) and Finding 05 (static explanations) were fully written up with fix directions but never actually scheduled into any phase of `basic-guide.md`. Both now have concrete homes (Phase 0 item 4 / P0-5, and Phase 2 item 2 / P2-2 respectively).
- Refined Finding 04's fix per explicit follow-up: the arc-memory switch condition is "topic has reached a good degree of completion" (mastery/`p_know` movement), with a bounded task count only as a fallback cap — not the primary trigger. Reflected in `basic-guide.md`, `findings/04-session-flow-no-continuity.md`, and now `MASTER_PLAN.md` task P0-5.
- Inspected actual repo state (git log/status, `package.json`, `tsconfig.json`, `src/lib/` structure, `.gitignore`, absence of CI/test framework) to ground the plan in verified fact rather than assumption.
- Created `MASTER_PLAN.md` (task-by-task operational list, derived from `basic-guide.md`'s Master Checklist, with acceptance criteria and required tests added per task — including the new P0-0 prerequisite).
- Created `DEVELOPMENT_LOOP.md` (exact autonomous execution loop, retry/blocker rules, commit/push safety rules, resumability contract).
- Created this file.

---

## Loop iteration log

- 2026-08-10 — **P1-1/P1-2 direction received, P1-1 unblocked:** combine the classifier into P1-1 rather than keep the documented split; P1-2 retired, its scope absorbed into P1-1, downstream dependencies (P1-3, P1-5, NLP-1) repointed to P1-1. Docs updated (`MASTER_PLAN.md`, this file); no code changed yet — awaiting explicit go-ahead to implement.
- 2026-08-10 — **P1-1 blocked before implementation:** its operational criteria duplicate P1-2's classifier implementation/tests, while the cited strategy document explicitly separates teaching-canvas capture (Promise #1) from the pure classifier (Promise #2). Awaiting a human choice between preserving that split (recommended) or combining the tasks.
- 2026-08-10 — **Phase 0 complete:** all P0-0 through P0-8 tasks are done; the final 29-test suite and production build are green. End-of-phase scripted checks against the real modules reconfirmed overdue decay (`p_know` 0.90 → 0.4909359 after 30 overdue days) and a measurable combined-evidence posterior change (baseline 0.4333333 vs. degraded 0.3045455).
- 2026-08-10 — **P0-7 done:** removed the retired SQLite init/reset scripts and package commands after confirming the runtime is Supabase-only, corrected migration-era storage documentation, and verified live legacy-script references are grep-clean; 29 tests and the production build remain green (`66941c4`).
- 2026-08-10 — **P0-6 done:** completed direct test coverage for all 20 exported functions across BKT, SM-2/urgency, motivation, and the session engine; added deterministic mastery-boundary, scheduling, urgency, evidence, state-transition, message, and review-consent checks. The full 29-test suite and production build are green (`bddd7bd`).
- 2026-08-10 — **P0-8 done:** replaced learner-facing raw mastery percentages and Ready/Learning/Fragile labels with Beginner/Intermediate/Mastered across session, dashboard, graph, detail-panel, and direct-skill displays; retained non-numeric progress-bar fills; added exact 0.29/0.30 and 0.64/0.65 boundary coverage plus a recursive source-contract check. The full 17-test suite and production build are green, and the required mastery-percentage grep is clean (`f38a79b`).
- 2026-08-10 — **P0-5 done:** pinned normal-session selection to the learner's current topic indefinitely, added the exact 0.60 stay-or-switch gate, exposed every unlocked topic as a free switch destination, and rendered tier-only choice/bridge copy; 15 tests and production build green (`c101479`). The UI criteria were verified through source-path inspection plus the strict production build because no UI test harness exists yet; no browser walkthrough was performed.
- 2026-08-10 — **P0-5 direction received, unblocked; new task P0-8 filed:** no automatic topic-switch under any circumstance (task-count fallback dropped); learner offered an explicit stay/switch choice once `p_know` reaches 0.60; switching lets the learner pick any unlocked topic, not the engine's next pick; free manual navigation via graph/dashboard unaffected. Separately, all raw `p_know`/`p_start` percentages must be replaced with Beginner/Intermediate/Mastered tier labels across learner-facing surfaces — filed as `P0-8`. Docs updated; no code changed yet — awaiting explicit go-ahead to implement.
- 2026-08-10 — **P0-5 blocked before implementation:** arc completion and fallback are not numerically specified; awaiting confirmation of the recommended +0.15 `p_know` / 4-task fallback policy.
- 2026-08-10 — **P0-4 done:** enforced consent before any review, a five-item default batch plus one optional sixth, four protected current-topic slots, a 10-task hard cap, and urgency-preserving debt rollover; 12 tests and production build green (`686b786`). UI behavior was verified through the server gate/client state paths and strict build; no browser walkthrough was available in this iteration.
- 2026-08-10 — **P0-4 direction received:** reviews must be consent-based, not force-queued — offer a default batch of 5–6 review items and ask before running them, and ask again before continuing further (more reviews or the rest of the session) rather than auto-continuing. 10-task session cap and 4-slot new-topic minimum stand unchanged. Ready to resume implementation.
- 2026-08-10 — **P0-4 blocked before implementation:** the plan gives a 25–45 minute target but no task cap/review allocation; awaiting confirmation of the recommended 10-task, 60%-automatic-review policy.
- 2026-08-10 — **P0-3 done:** added weighted reasoning-quality and behavior evidence to BKT, wired existing motivation signals with a neutral reasoning stub, preserved the baseline posterior, and passed 8 tests plus production build (`4d42f0d`).
- 2026-08-10 — **P0-2 done:** added idempotent on-load overdue decay and persistence, preserved attempt-time reconciliation, kept active-phase reviews automatic and past-phase reviews learner-selected; 4 tests and production build green (`44d3613`).
- 2026-08-10 — **P0-1 done locally, not pushed:** committed the intentional red overdue-decay regression test (`b5616f4`); proceeding immediately to P0-2 under the approved red/green procedure.
- 2026-08-10 — **P0-1 blocked before implementation:** the decay API/persistence path is unspecified, and its required failing commit conflicts with the loop's green-suite commit/push gate; awaiting human direction.
- 2026-08-10 — **P0-0 done:** bootstrapped Vitest, added `npm test`, verified the `@/*` alias with a real BKT-module smoke test, and passed `npm test` plus `npm run build` (`95bcb45`).

---

## Notes for the next agent picking this up

- `v2/doc/basic-guide.md` is the *why* document — long, discursive, contains the full reasoning for every phase/task. `MASTER_PLAN.md` is the *what/when* — short, operational, status-tracked. Don't re-derive rationale from scratch; it's already written down.
- The project has a documentation convention worth preserving (established in `findings/07-resolved-and-corrected.md`): when a prior claim in a doc turns out to be wrong, correct it inline with a visible note, don't silently delete it. Apply the same convention to `MASTER_PLAN.md`/`PROGRESS.md` going forward.
- The user (repo owner) has previously asked to settle direction fully in discussion before code gets written, and to wait for an explicit go-ahead even mid-plan. This loop's design assumes that go-ahead has been (or will be) given separately — this run itself was documentation-only per explicit instruction, not that go-ahead.
