# Finding 04 — Session flow has no topic continuity

**Severity:** Critical
**Area:** Session / UX

## What's actually happening

`selectNextTask()` (`src/lib/session/engine.ts:33-224`) re-scores every skill from scratch on every single call. The only continuity guard is a soft interleaving penalty (`engine.ts:97-107`) that down-weights a skill if it's appeared 2+ times in the last 5 questions — there is no concept of "we are in the middle of this topic, stay here."

`src/app/learn/page.tsx`'s `loadNext()` (`learn/page.tsx:272-308`) calls `/api/session` with `action: 'next'` after every single question, gets back whatever the tier-scoring pool ranks best *right now*, and renders it — which can be a completely different skill than the one just answered. The only UI acknowledgment of a topic change is a full-page reset to a loading spinner ("Selecting next skill…").

## Why it matters

This is the direct mechanism behind the "moving, abrupt jump to the next one" complaint. A learner can be mid-way through genuinely engaging with one concept and have the very next question be an unrelated overdue review from a different topic, with no transition, narrative, or acknowledgment that a switch happened. It also undermines Finding 03's fix — even a well-graded explanation doesn't build "flow" if the topic never gets to breathe before the engine yanks attention elsewhere.

## Related

User complaints #3 and #4 ("abrupt jump," "topics connected through flow, not just nodes"). Partially informed by `Research/lab/08-interfaces.md`'s Flow Protection modifier, but the actual arc/continuity mechanism is original work — even the lab's own concept-transition spec (`Research/lab/13-content-structure.md:243-247`) is just a 600ms label, not a real solution. Diagrammed in full in the `How Learning Actually Flows` artifact published this session.

## Fix direction

`v2/doc/basic-guide.md`, Phase 0 item 4 (added 2026-08-09 — this finding was written up in full but not actually scheduled in the phase plan until flagged) — give `selectNextTask()` arc memory. Refined 2026-08-09: the switch condition is "this topic's arc has genuinely reached a good degree of completion" (mastery/`p_know` movement, or the concept's practice sequence resolving), not just a bounded task count — a fixed count is only a fallback cap in case completion never triggers. Surface a one-line bridge when it does switch, instead of a bare reload. Sequenced after Phase 0 item 3 (session length/review-debt policy), which it depends on per Finding 02 — that policy also now needs to accommodate letting a topic finish rather than cutting it off on a fixed count.
