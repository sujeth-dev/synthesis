# Finding 03 — Explain-back is not graded, and doesn't even save

**Severity:** Critical
**Area:** Reasoning evaluation (Promises #1 / #2 / #3)

## What's actually happening

Both explain-back submission paths send a synthetic `question_id` that can't exist in real content:

- `src/app/learn/page.tsx:544-548` — `question_id: \`${task.question.id}_explain_back\``
- `src/app/learn/skill/[skill_id]/page.tsx:214` — `question_id: \`${skill_id}_explain_back\``

Both also hardcode `correct: true` in the request body.

Server-side, `src/app/api/attempt/route.ts:31-33` looks the `question_id` up in `content/questions/by-skill/${skill_id}.json`. The synthetic ID never matches a real question, so `if (!q) return NextResponse.json({ error: 'Unknown question_id' }, { status: 400 })` fires immediately — before `correct` is even read, before any BKT update, before the attempt is recorded.

Neither client checks this response:
- `learn/page.tsx:541-551` fires the `fetch(...)` and never awaits or reads it.
- `learn/skill/[skill_id]/page.tsx:210-221` does `await fetch(...)` but never checks `r.ok` — a 400 resolves fine, so nothing catches it.

**Net effect: submitting an explanation does nothing.** No grading, no BKT update, no persisted attempt — the UI just advances to the next phase regardless of what was typed or whether the request even succeeded. This is a stronger claim than "ungraded" — it's a complete no-op dressed as a working feature.

## Why it matters

This is the concrete mechanism behind the "leveling up but missing the feel of understanding" complaint. The one place in the product that's supposed to check for real understanding — explaining a concept in your own words — currently has zero effect on anything. It's also the direct blocker for Promise #3 (reasoning quality as BKT input): there's no reasoning signal being produced at all right now, graded or not.

## Related

Thesis Promises #1, #2, #3. User complaint #1 ("missing the feel and understanding"). Companion to the flow diagram published this session (`How Learning Actually Flows`).

## Fix direction

`v2/doc/basic-guide.md`, Phase 1 item 1-2 — build a rule-based classifier (method-only / meaning-included / gap, per the lab's own taxonomy), route explain-back through it server-side instead of trusting the client, and use its output as a weighted-evidence modifier on `bktUpdate()` rather than a hardcoded boolean. (An implementation of the classifier was drafted and then intentionally reverted earlier in this session, pending the broader flow/content planning being settled first — this finding documents the gap, not a fix in progress.)
