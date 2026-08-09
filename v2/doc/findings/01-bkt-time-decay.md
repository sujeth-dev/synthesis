# Finding 01 — `p_know` never decays with elapsed time

**Severity:** Critical
**Area:** Engine (BKT ↔ SM-2 integration)

## What's actually happening

`bktUpdate()` (`src/lib/bkt/index.ts:5-13`) is only ever called from `src/app/api/attempt/route.ts:70`, i.e. only in response to an actual answered question. `reconcileBktSm2()` (`src/lib/sm2/index.ts:29-33`) reacts to the *outcome* of that attempt (resets the review interval if mastery was just lost, extends the interval once a skill is very stable) — but nothing anywhere recomputes `p_know` based purely on time having passed since `last_attempted_at` or since the SM-2 `due_at` was missed.

Concretely: if a learner masters a skill and then never returns to it, `p_know` and `mastery_state` stay frozen exactly where they were — indefinitely. The "mastered" badge has no expiry.

## Why it matters

This is the single most consequential gap for the whole engine, because everything downstream trusts `p_know` as if it already models forgetting:

- The dashboard/graph show a skill as "mastered" even if it was last touched months ago.
- `selectNextTask()`'s tiering (`src/lib/session/engine.ts`) only prioritizes a skill for review once SM-2's `due_at` has passed — but even then, `p_know` itself hasn't dropped, so nothing *forces* urgency; a learner could ignore an overdue review indefinitely with no visible consequence to their mastery number.
- Any predictive-accuracy evaluation (the thesis's actual quantitative result) will be measuring a `p_know` that doesn't account for time — understating the value of fixing this.

## Related

Thesis Promise #5 ("strengthen SM-2 with adaptive scheduling"). Originally sourced from `Research/lab/07-audit.md`'s CRITICAL #1 — confirmed still open by direct inspection, not just inherited from the audit.

## Fix direction

`v2/doc/basic-guide.md`, Phase 0 item 1 — apply a decay function to `p_know` keyed off `urgency.ts`'s overdue calculation, evaluated on session/page load, not only on attempt submission.
