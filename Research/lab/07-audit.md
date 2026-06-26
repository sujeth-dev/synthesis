# Critical Audit — Lab Documents 00–06

*This document is a critical review of everything in the lab. The purpose is to find what is wrong, inconsistent, or missing — not to confirm what is good. Written after a full read of all 7 documents.*

---

## How to Read This

Each problem is rated:

- **CRITICAL** — blocks architecture or creates a broken foundation. Must be resolved before building.
- **SERIOUS** — wrong direction or significant inconsistency. Should be fixed before the relevant phase begins.
- **NOTABLE** — smaller gap or inconsistency. Fix it, but it won't break the build.

---

## Problems in 00 — Why

---

**NOTABLE — AI has persistent memory now**

The document says "AI cannot hold your history. Every conversation starts fresh."

This was true in 2023. It is increasingly not true. ChatGPT Memory, Claude Projects, Gemini with Google history — these all persist context across sessions to some degree. The claim needs to be qualified: today's AI memory is per-app, opt-in, unsophisticated, and not structured as a learning model. But pretending this gap doesn't exist is dishonest. The moat is narrowing on this specific point. The document should acknowledge it and say why our persistent model is still different.

**NOTABLE — Personalization layers 2 and 4 are not achievable at launch**

Layer 2 (example personalization: cricket analogies, visual learner adjustments) and Layer 4 (learning style — doing vs. theory first) both require:
- Substantial learner history (many sessions before we know how they learn)
- Either LLM-powered generation of varied explanations or a massive authored library

The document presents all 4 layers as if they're part of the same system. Layers 1 and 3 are buildable from Phase 1. Layers 2 and 4 are Phase 5+ aspirations. This should be stated clearly so no one is misled about what Phase 1 actually delivers on personalization.

---

## Problems in 01 — Blueprint

---

**SERIOUS — Knowledge Playground is described as "not sold directly" but research/deep learning is a real niche**

The blueprint says: "A serious, intrinsically motivated learner uses the playground. It works. It is real. But monetizing it directly is difficult — the audience is motivated but narrow."

This framing is wrong. Deep learning / genuine mastery is explicitly one of the three niches. If the platform is "completely devised" for this niche (as it should be), it is absolutely a product in its own right. Treating it as infrastructure-that-happens-to-be-usable is underselling it and will lead to underfunding the content and UX investment for this track.

Fix: The Knowledge track should be described as a product — "for learners who want genuine mastery with no external deadline." The engine-testing framing is still valid, but not at the expense of treating this as a real product with real users.

**NOTABLE — Phase numbering conflict between blueprint and phases document**

In `01-blueprint.md`, the build sequence is:
```
Phase 0-1: Knowledge Playground (engine + 5 subjects)
Phase 1-2: Competitive Exam layer on top
```

In `05-phases.md`, Phase 1 is only Mathematics (one subject). Phase 2 adds the other 4 subjects and JEE foundation.

These don't match. A new reader of both documents gets contradictory information. The blueprint needs to be updated to match the detailed phase plan.

---

## Problems in 02 — Engines

---

**CRITICAL — BKT and SM-2 are not integrated and this will break the session engine**

BKT tracks the probability that a learner knows a concept (p_known). SM-2 tracks when that concept should be reviewed (next_due date based on last recall performance).

The problem: a concept can have p_known = 0.85 in BKT (the learner "knows" it) but if SM-2 says it's overdue for review, the learner may have forgotten it. BKT does not model forgetting — it is a static state unless a new interaction updates it. SM-2 does not update p_known — it only schedules review dates.

This means: the session engine can look at p_known = 0.85 and decide "this concept doesn't need work" — even though it's been 60 days since review and the learner has forgotten it.

This is not an edge case. This is normal behavior for any concept at Stage 3+ in the learning orbit. The two engines must be integrated: when a concept is overdue for review, p_known should be reduced by the predicted decay. Right now, this integration does not exist in the architecture.

This must be resolved in Phase 0, not Phase 5.

**CRITICAL — Session length is a Phase 0 decision left open**

`02-engines.md` lists session length as an open question: "How long should a default session be? Currently undefined."

Session length is not a detail. It determines:
- How many items per session the engine can schedule
- The priority logic (if session = 15 min, you can fit 5-7 tasks max — how do you pick?)
- Content bank sizing (how many questions per concept do you need to never repeat in a session?)
- The motivation engine's intervention window

Without a defined session length, the session engine cannot be designed. This is a Phase 0 blocker.

**SERIOUS — Review debt has no resolution policy**

Open question: "If a learner has 40 items due for review, do we do all of them before introducing anything new?"

40 items overdue is not unusual — a learner who misses 5 days accumulates this easily. If the session engine has no policy, it will either:
a) Spend the entire session on reviews and never introduce new content (demoralizing)
b) Skip reviews and let knowledge decay (wrong)

The correct answer is a capped review policy: a maximum of N reviews per session, then new content. What is N? What happens to the items that get skipped? This must be decided before building the session engine.

**SERIOUS — Motivation engine has no defined input signals**

The 4-state FSM (Active / Struggling / Bored / Disengaged) is documented, but the question "What behavioral signals tell us which state a learner is in?" is still open.

A finite state machine without defined transition conditions is not a machine — it's a diagram. Before Phase 1, the specific signals for each transition must be decided:
- Active → Struggling: e.g., 3+ consecutive wrong answers? p_known dropping below 0.4?
- Active → Bored: e.g., 5+ consecutive correct answers at same difficulty? Speed decreasing (finishing too fast)?
- Any state → Disengaged: e.g., session abandoned? 3+ days without opening?

Without defining these, the motivation engine cannot be built.

**NOTABLE — Error classification in Phase 1 is undefined**

Phase 1 includes wrong answers. The schema has `error_trap_type` field. But Error Classification (Engine 5) is "unimplemented" and planned for Phase 2.

What happens in Phase 1 when a learner gets a wrong answer and the error type is not yet classified? The session engine needs to know: do we log it as unknown and move on? Do we default to "concept gap" and trigger Repair Crew? This behavior must be specified even before the full classification engine is built.

---

## Problems in 03 — Constructs

---

**CRITICAL — Learning Orbit stages are not mapped to BKT p_known**

The Learning Orbit has 7 stages (Encounter → Practice → Return → Apply → Build → Teach → Mastery). These stages determine which constructs activate.

But BKT produces a continuous value p_known (0–1). The two systems are not connected. Which p_known range corresponds to which orbit stage?

Without this mapping:
- The session engine doesn't know which constructs to activate
- The X-Ray dashboard can't show orbit stage to the learner
- The construct system is decorative — it can't be wired to actual behavior

This must be defined in Phase 0. Example (to be validated):
```
Stage 1 (Encounter):  p_known < 0.3, 0 prior interactions
Stage 2 (Practice):   p_known 0.3–0.6, <10 interactions
Stage 3 (Return):     p_known 0.6–0.75, passed first SM-2 interval
Stage 4 (Apply):      p_known 0.75–0.85, 1+ successful review
Stage 5 (Build):      p_known 0.85+, cross-concept application demonstrated
Stage 6 (Teach):      p_known 0.9+, Feynman Loop passed successfully
Stage 7 (Mastery):    p_known 0.9+, stable across 3+ SM-2 cycles
```

This specific mapping is debatable. But some mapping must exist.

**SERIOUS — Ebbinghaus Engine is listed as both a proper construct AND a pedagogical framework**

In the construct tracking table: `Ebbinghaus Engine | Proper (SM-2) | Live`

In the frameworks section: `Spaced Repetition (Ebbinghaus Engine)` — listed as a framework.

This is the same thing listed twice as two different types. SM-2/FSRS is a pedagogical framework — it is the engine that runs in the background. It is not a proper construct (the learner doesn't experience "SM-2 mode"). What the learner experiences is: their due-for-review concepts appearing. That is the X-Ray Mode (showing what's due) and the session selector (surfacing those items).

Fix: Remove Ebbinghaus Engine from the proper construct table. Keep it in frameworks. The learner-facing manifestation is the review queue in X-Ray Mode, not a separate construct.

**SERIOUS — Blueprint Mode is planned for Phase 3. It should be Phase 1.**

Blueprint Mode (pre-session intent, post-session review) is a session-level habit. If it is not introduced in Phase 1, learners develop a habit of starting sessions without setting intent. Introducing it in Phase 3 means re-training 100+ users who have formed habits without it. A habit you introduce late is much harder to establish than one you introduce from session one.

Blueprint Mode is also simple to implement (two text prompts, log the response). There is no technical reason to defer it.

Move Blueprint Mode to Phase 1, even in a lightweight form.

**NOTABLE — Feynman Loop Phase 1 implementation (keyword matching) is fragile**

The document says: "keyword matching + semantic similarity initially."

Problem: a learner can type "integration is the area under the curve and you use the antiderivative of f(x)" and pass keyword matching without actually understanding anything. Conversely, a learner who explains it differently but correctly could fail keyword matching.

Keyword matching on free-text explanation is a weak signal for the most important construct. This is known — the document flags it. But it should be called out as a known limitation that must be measured from Phase 1, not just noted and moved on.

If keyword matching produces a bad signal, Phase 1 data on Feynman Loop success rates will be useless for evaluating the construct itself.

Alternative for Phase 1: structured self-grading. Ask the learner: "Did your explanation cover these 3 key ideas? Mark each yes/no." This is more reliable than keyword matching and doesn't require LLM.

**NOTABLE — No construct activation logic defined**

When multiple constructs are valid for a given orbit stage, what decides which one activates? The open question flags this but doesn't attempt an answer. Some logic must exist before building the session engine:

Simple first version:
- Tier 1 constructs take priority over Tier 2
- Within the same tier and orbit stage, the least recently used construct activates
- Tapas Mode only activates if motivation state = Active (not Struggling)
- Feynman Loop activates at Stage 2 always, after concept introduction, before proceeding

Even this simple rule set is better than no rule. Define it now.

**NOTABLE — Construct metrics missing for half the constructs**

Shrink It, Echo Chamber, and several Tier 3 constructs have "—" as their metric. The rule says: "A live construct with a flat or declining metric after 30 days gets paused." But no metric = no way to evaluate = no way to enforce the rule.

For every construct, even parked ones, a candidate metric should be identified. If you can't define a metric, it suggests the construct's purpose is not clear enough.

---

## Problems in 04 — Tracks

---

**SERIOUS — IELTS does not fit the concept knowledge graph model**

The competitive exam scope table includes IELTS with a note: "(Skill-based, not concept graph)." But the note understates the problem.

IELTS tests: reading comprehension, listening, writing (essay + letter), speaking. None of these map onto a concept graph with prerequisite edges. IELTS preparation is closer to Track 2 (skill development with practice in a real environment) than Track 1 (exam syllabus covered via concept graph).

Including IELTS in the competitive exam track without a completely different content model is misleading. Either:
a) Remove IELTS from Track 1 scope entirely
b) Explicitly say: "IELTS requires a different content architecture and will be treated as a separate sub-product within Track 1"

**SERIOUS — UPSC cannot be mapped to a concept knowledge graph without major caveats**

UPSC Prelims covers: History, Polity, Economy, Environment, Science & Technology, Current Affairs. Most of these domains do not have the kind of structured concept graphs that Math/Physics/CS do.

- "Current Affairs" changes every month. There is no stable knowledge graph.
- "Polity" is learnable via a concept graph (constitutional articles, committees, etc.). Fits.
- "History" has concepts but heavy interpretation and context — not binary right/wrong.
- "Economy" partially fits.
- UPSC Mains has essays, ethics papers, optional subject — these are completely outside the concept graph model.

UPSC is one of the most requested exam preps in India. But putting it in scope without acknowledging these structural differences creates a false expectation. The concept graph model handles JEE/GATE cleanly. UPSC is a different product.

Fix: Be explicit. UPSC Prelims (some subjects) fits. UPSC Mains does not fit. Set this boundary clearly.

**NOTABLE — Feynman Loop in competitive track is undervalued**

The cross-track table says: "Feynman Loop | Track 1: When time allows."

This is wrong. In competitive exam prep, the ability to explain a concept without looking — which is exactly what Feynman Loop trains — is one of the most exam-relevant skills. JEE theoretical questions test conceptual understanding, not just procedure application.

Feynman Loop should be "Active, with time constraint" in Track 1 — meaning the construct runs but with a time limit and adapted for speed. Not "when time allows."

**NOTABLE — Track 0 monetization is not addressed**

The challenge section says: "Without an exam or job target, some learners drift." This is true and acknowledged. But there is no answer to the monetization question for Track 0.

Track 1 and Track 2 have clear monetization: high-stakes outcome → learner will pay. Track 0 is harder — the learner has no deadline, no immediate ROI. This is not just a retention problem. It is a revenue problem. Without addressing it, Track 0 risks being funded by Track 1 and 2 revenue indefinitely, which limits its development.

This might be fine. But it should be stated explicitly, not left implicit.

---

## Problems in 05 — Phases

---

**CRITICAL — Phase 1 is unrealistically large**

Phase 1 requires:
- Full Mathematics concept graph (all major nodes through calculus, linear algebra, probability, statistics)
- 10–15 questions per concept × 3 difficulty levels × bloom-tagged
- Explanations per concept (beginner / intermediate / advanced)
- BKT + SM-2 + session engine + motivation FSM running
- Feynman Loop + Repair Crew + X-Ray Mode live
- Full UI: subject landing, session interface, X-Ray dashboard, learner profile

This is 4–8 months of work for a small team. Treating it as a single "phase" means no intermediate validation point. If the concept graph takes longer than expected, everything else blocks behind it.

Phase 1 should be split:
- Phase 1a: Engine working with 5 seed concepts. Math only. Prove the loop (session → answer → BKT update → next session) works end to end. 2 weeks.
- Phase 1b: Expand to 30 concepts. Feynman Loop + Repair Crew live. Real learner validation. 4–6 weeks.
- Phase 1c: Full Math concept graph + X-Ray + all Phase 1 constructs. 8–12 weeks.

**SERIOUS — Phase 2 assumes parallel workstreams without addressing team capacity**

"Two parallel workstreams. Both must complete before Phase 3." For a small team, parallel workstreams means either splitting focus (slower overall) or sequential work that's called parallel (misleading). The plan should acknowledge what team size is assumed and whether the workstreams are truly parallel or sequentially prioritized.

**SERIOUS — Phase 5 (engine upgrades) is placed after Phase 4 (Skill/Job track) — this creates a risk**

If DKT changes how knowledge state is represented, and the entire Skill/Job track was built on BKT representations, the Phase 4 work may need to be partially rebuilt when DKT goes live. The upgrade sequence should plan for this: either make the knowledge state representation upgrade-proof from Phase 0, or explicitly accept that Phase 4 work will need adjustments in Phase 5.

**NOTABLE — No rough timelines, not even order of magnitude**

"Phases are not calendar-fixed." This is philosophically sound. But without even order-of-magnitude estimates, there's no sanity check on the sequence. Is Phase 0→1 a 3-month plan or a 3-year plan? Without a rough answer, it's impossible to know if the sequence is feasible.

Even a rough estimate ("Phase 1: 3–5 months, Phase 2: 4–6 months") gives a reality check without committing to a calendar.

**NOTABLE — Phase 4 validation criterion is a product goal, not a phase gate**

"A learner with zero coding background can reach 'entry-level employable' skill level on the coding track."

This is the product's ultimate promise, not a phase validation criterion. A phase validation should test: "Is the track functional and usable end to end?" — not "Has it achieved the full outcome for real users?" That latter question requires months of real user data, not a phase gate test.

Phase 4 validation should be: "A learner can start the coding track, complete 20+ coding problems, produce verified portfolio outputs, and see matched opportunity listings. The full loop works."

---

## Problems in 06 — Users

---

**NOTABLE — "4 Stage documents" reference is unexplained**

The section "What We Know About How Our User Studies" references "the 4 Stage documents" as the source of research findings. A new reader (or future team member) has no idea what these are.

These should be identified: internal documents, external research papers, specific books, or wherever this information actually comes from.

**NOTABLE — Market size numbers are unverified**

"1.5M JEE aspirants per year. 200,000+ GATE candidates." These numbers are stated without source. Since they are used to justify prioritization decisions, they should be verified.

Actual figures (approximate, 2024): JEE Main registrations ~14 lakh (1.4M), GATE registrations ~10 lakh (1M). The JEE number in the document is roughly right. The GATE number is significantly understated. Both numbers should be sourced.

---

## Cross-Document Inconsistencies

---

**CRITICAL — Orbit stage system is mentioned in 4 documents but never algorithmically defined anywhere**

`03-constructs.md` defines the 7 stages. `04-tracks.md` references orbit stages in its progress section. `05-phases.md` includes `orbit_stage` in the learner state schema. `02-engines.md` never mentions orbit stages at all.

But nowhere in any document is the mapping defined: what BKT value, what interaction history, what SM-2 cycle count corresponds to what orbit stage?

This is a foundational data model question. It cannot be left unresolved in Phase 0.

**SERIOUS — Error classification flow is assumed but never specified end to end**

Error classification appears in: Engine 5 (`02-engines.md`), Error Journal construct (`03-constructs.md`), Track 1 content (`04-tracks.md`), and the question schema (`05-phases.md`). But the data flow — wrong answer → classify → who reads it → what changes in the session — is never spelled out in one place.

The complete flow needs to be defined: 
```
Wrong answer selected
→ author-tagged error_trap_type on that answer option is read
→ error logged with type to learner's error_breakdown
→ session engine checks: if 3+ consecutive same error type → which intervention?
→ motivation engine is also informed
```

Without this being written down, the engine implementations will make different assumptions and the system will be incoherent.

**NOTABLE — "Research" as a niche is mentioned in conversation but not reflected in the documents**

Today's conversation explicitly named "competitive, jobs, research" as three valid niches. The documents have "competitive, jobs, knowledge playground." Knowledge playground and research are not the same thing. The playground is broad (all 5 subjects, zero to mastery). Research is specific (deep expertise in one domain, graduate level, no deadline).

Whether this means Research becomes a named sub-track of Track 0, or a distinct Track 3 added later, needs to be decided and reflected in `04-tracks.md`.

---

## Summary — Blockers Before Phase 1 Can Start

These are CRITICAL issues that must be resolved before any code is written:

| # | Problem | Which docs affected |
|---|---------|---------------------|
| 1 | BKT and SM-2 not integrated — knowledge state doesn't model forgetting | 02, 05 |
| 2 | Orbit stages not mapped to BKT p_known values — construct system cannot be wired | 03, 05 |
| 3 | Session length undefined — session engine cannot be designed | 02 |
| 4 | Review debt policy not defined — session engine behavior undefined | 02 |
| 5 | Motivation FSM has no defined transition signals | 02 |
| 6 | Phase 1 is too large — needs to be split for intermediate validation | 05 |

These are SERIOUS issues to fix before the relevant phases, but don't block Phase 1 start:

| # | Problem | When to fix |
|---|---------|-------------|
| 7 | Knowledge track framed as "not sold" — should be treated as a real product | Before Phase 1 build |
| 8 | Blueprint Mode should be Phase 1, not Phase 3 | Before Phase 1 build |
| 9 | IELTS and UPSC in scope without structural caveats | Before Phase 2 |
| 10 | Phase 5 engine upgrade may break Phase 4 work — need upgrade-proof design | Phase 0 |
| 11 | Error classification flow never specified end to end | Phase 0 |

---

## What the Documents Get Right

This is a critical audit, not a dismissal. These things are solid and should not be changed:

- The foundational "why" is correct: continuity, structure, proof
- BKT → DKT upgrade trigger logic (data threshold before switching) is sound
- SM-2 → FSRS upgrade trigger logic is sound
- The decision to author-tag error types at content creation time is right
- The Learning Orbit 7-stage model is pedagogically grounded
- The distinction between proper constructs and pedagogical frameworks is critical and correct
- The primary user definition (serious 16–22, India-primary, real goal) is right
- The decision NOT to build for casual learners, under-12s, or enterprise is right
- Starting with Mathematics only (not all 5 subjects) is right
- Starting with JEE only (not all exams) is right
- The content schema design (bloom_level, time_expected, is_pyq, error_trap_type) is right

---

*Document: audit | Version: 1.0 | Last updated: 2026-06-26*
*This document should be updated as issues are resolved. When a critical issue is resolved, move it to a resolved section at the bottom.*
