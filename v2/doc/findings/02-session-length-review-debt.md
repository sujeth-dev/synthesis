# Finding 02 — Session length & review-debt policy undefined

**Severity:** Serious
**Area:** Engine (session selection)

## What's actually happening

`selectNextTask()` (`src/lib/session/engine.ts:33-224`) returns exactly one task per call and has no concept of how many tasks make up "a session" — there's no length cap, no target duration, and no explicit answer to "what happens when overdue reviews exceed what a learner can realistically clear today." Tier 0/2/3 will keep surfacing overdue reviews for as long as they exist; nothing throttles or paces them against session time.

The client (`src/app/learn/page.tsx`) just keeps calling `/api/session` with `action: 'next'` until the engine returns `done: true` — session length is whatever the learner tolerates, not a designed quantity.

## Why it matters

Without a defined session length, there's no way to reason about (or test) whether a session is well-paced, and no way to implement the lab's own "session time remaining" construct-selection modifier (`Research/lab/08-interfaces.md`'s Modifier 3) — that modifier assumes the engine already knows how much time is left, which it currently doesn't track at all. Review debt has the same problem: a learner who's been away for two weeks has no defined experience — they'll just get overdue reviews forever, tier 0/2/3, with no policy for "catch up gradually" vs. "clear it all now."

## Related

Originally sourced from `Research/lab/07-audit.md`'s CRITICAL findings. Confirmed still open — no session-length or review-debt logic exists in `engine.ts` as of this check.

## Fix direction

`v2/doc/basic-guide.md`, Phase 0 item 4 — define both explicitly before building anything that depends on "time remaining" (including the Flow Protection / arc-continuity work in Finding 04).
