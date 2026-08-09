# PROGRESS.md — Live State

Read this first, then `MASTER_PLAN.md`, then follow `DEVELOPMENT_LOOP.md`. This file is updated at the end of every loop iteration (Step 9). If this file and the actual repo state (`git log`/`git status`) ever disagree, the repo is correct — fix this file to match before doing anything else.

---

## Current task

**None — the development loop has not started executing tasks yet.** This run (2026-08-09) was INSPECT → PLAN → DOCUMENT only, per explicit instruction not to begin implementation.

---

## Next action

Start at `MASTER_PLAN.md` task **P0-0 — Bootstrap a test framework**. This is a new prerequisite task (not present in the original `v2/doc/basic-guide.md` plan) discovered during repo inspection: no test runner exists in this repo at all, and Phase 0's very first real task (P0-1) requires writing a failing test — which needs a framework to run it.

---

## Known blockers / risks (not yet acted on)

1. **`v2/` planning tree is untracked in git.** `git status` shows the entire `v2/` directory (containing `basic-guide.md`, `findings/`, `vision/`) as untracked. Until it's committed, a fresh `git clone` of this repo would not include it. Recommendation: the loop's first commit should include `v2/`, `MASTER_PLAN.md`, `DEVELOPMENT_LOOP.md`, and `PROGRESS.md` together as a "docs: add planning system" commit, before P0-0's actual code work begins. Not committed automatically in this run — plan-doc commits weren't explicitly requested yet.
2. **No test framework installed** — see Next action above. P0-0 exists specifically to resolve this.
3. **No CI configuration** (`.github/` doesn't exist) — the loop itself is the only verification gate right now. Not currently a blocker, just a noted gap; consider flagging to a human whether CI should be added before or after Phase 0.
4. **`.env.local` exists locally but is gitignored** (confirmed present, contents not inspected — respecting that it may hold secrets). Any task needing an external API key (notably the NLP-\* track's LLM API key) must confirm the relevant variable exists in `.env.local` before starting, per `DEVELOPMENT_LOOP.md`'s blocker rules — do not assume it's there.

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

### This planning pass (2026-08-09, not yet committed)
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

*(Append one entry per completed or blocked task, most recent first. Empty until the loop actually starts executing.)*

---

## Notes for the next agent picking this up

- `v2/doc/basic-guide.md` is the *why* document — long, discursive, contains the full reasoning for every phase/task. `MASTER_PLAN.md` is the *what/when* — short, operational, status-tracked. Don't re-derive rationale from scratch; it's already written down.
- The project has a documentation convention worth preserving (established in `findings/07-resolved-and-corrected.md`): when a prior claim in a doc turns out to be wrong, correct it inline with a visible note, don't silently delete it. Apply the same convention to `MASTER_PLAN.md`/`PROGRESS.md` going forward.
- The user (repo owner) has previously asked to settle direction fully in discussion before code gets written, and to wait for an explicit go-ahead even mid-plan. This loop's design assumes that go-ahead has been (or will be) given separately — this run itself was documentation-only per explicit instruction, not that go-ahead.
