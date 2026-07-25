# Build Plan — How We Build This and In What Order

*This document translates the user constraints (06-users.md) and engine design (02-engines.md) into a concrete build sequence.*
*The order is not arbitrary. Each phase unlocks the next. Nothing is built before its dependency is proven.*

---

## The Sequencing Logic

Three rules govern the order:

**Rule 1: Engines before experiences.**
A construct built on a broken engine is entertainment, not learning. BKT + SM-2 + Session Selector must work correctly before any construct is added. The engine is what makes the session alive — the construct makes it visible.

**Rule 2: Hardest constraint first.**
Track 1 (Competitive) has the hardest constraint: a real exam date, an objective score, a national rank. If the engine can handle this constraint correctly — computing the right session for someone with 6 months to JEE — it can handle Track 0 (no deadline) and Track 2 (soft deadline). The reverse is not true. Build for the hardest case first.

**Rule 3: One thing done completely right before expanding.**
One subject, one track, one construct — built completely, calibrated correctly, tested with real users — is worth more than five subjects or three constructs done poorly. Depth before breadth.

---

## The User Constraints That Drive the Sequence

From 06-users.md, each track has different constraints that determine when it can be built:

### Track 1 (Competitive) — Build First
| Constraint | Implication |
|-----------|-------------|
| Hard deadline (exam date) | Session engine must count backward from a fixed date and calibrate daily load accordingly |
| Exam-driven content | Questions must be calibrated to actual PYQs and syllabus weighting — not generic concept coverage |
| Measurable outcome (rank/score) | We can validate the engine: does a user who follows it for 90 days improve measurably? |
| India market (JEE, GATE, UPSC) | 1.5M JEE aspirants/year — large enough to test and iterate quickly |
| High stakes, high engagement | Serious user who will use the platform consistently — good for engine calibration |

**Why first:** Largest market, clearest success metric, hardest constraint (if we solve deadline-constrained sessions, the others are simpler), and the primary user (16–22, serious goal) maps directly here.

### Track 2 (Skill + Job) — Build Third
| Constraint | Implication |
|-----------|-------------|
| Needs code execution environment | Infrastructure cost + security complexity (sandboxed execution) |
| Portfolio artifact must mean something | External validation (employer recognition) takes time to build — a "badge" is worthless without adoption |
| Proof layer requires a standard | Verified output needs either employer partnerships or an established credential format |
| Soft deadline, variable urgency | Session length must be learner-configured (different from fixed exam timeline) |

**Why third:** Depends on infrastructure (code environment) and external credibility (proof layer) that need time to build. The Track 2 engine itself is simpler than Track 1, but the non-engine requirements are harder.

### Track 0 (Knowledge) — Build Last (of the three)
| Constraint | Implication |
|-----------|-------------|
| No deadline | Progress is concept-driven, not time-driven — the session metric changes entirely |
| Knowledge-driven | Concept graph must go much deeper than Track 1 requires |
| No external validation event | We must create our own "orbit level" proof — harder to make meaningful |
| Intrinsic motivation only | No exam pressure — engagement must come entirely from the session quality |

**Why last:** No external forcing function. Track 1 has an exam. Track 2 has a job. Track 0 has neither — everything must come from the product itself. This is the hardest track to make sticky, and requires the library (characters, constructs, environments) to be much more developed before it works.

---

## Phase Breakdown

---

### Phase 0 — The Engine Loop
**Status: Internal only. No real users. No UI.**

**Goal:** Prove the core loop works before any real person touches it.

**What gets built:**
- One subject: JEE Mathematics (algebra, calculus, coordinate geometry, probability)
- Concept graph: ~150–200 concepts, manually built, with prerequisite edges
- BKT: `p_known` tracking per concept per learner, with slip/guess/transit parameters calibrated to JEE difficulty
- SM-2: interval scheduling for concept review — when does a concept come back?
- Session Selector (basic): given a learner's current BKT state and available time, return a session — sequence of items that balances new concepts, weak concepts, and spaced review
- Question bank: 300–500 questions for JEE Math, tagged to concept, difficulty, and question type
- Session simulation: run 20 simulated learners through 60 days, observe BKT convergence

**What does NOT get built:**
- No UI
- No constructs
- No characters
- No real users

**Validation questions:**
- Does `p_known` converge correctly? (Simulated learner who always answers correctly should reach mastery in expected time)
- Does the spaced review trigger at the right intervals?
- Does the session selector produce sessions that are appropriately sized and balanced?
- Are there dead ends in the concept graph? (Concepts with no path forward)

**Exit condition:** Simulated learner data shows plausible BKT progression over 60 days. No dead ends. Session selector produces valid sessions for all starting states.

---

### Phase 1 — First Real Sessions
**Status: Limited real users (5–10 people). Minimal UI. No constructs.**

**Goal:** A real learner logs in, gets a session that was computed for them, completes it, and comes back tomorrow.

**What gets built:**
- Authentication + learner profile (minimal: name, exam target, exam date, daily time available)
- Session delivery interface: Plain Session only — question shown, answer entered, result recorded, next question
- BKT update after each session
- SM-2 scheduling: the system knows when each concept needs to come back
- Deadline integration: exam date → count backward → daily concept targets → session calibrated to timeline
- Progress display: concept map showing orbit stages (Unknown / Seen / Practicing / Confident / Mastered), review queue
- Session summary: what was covered, what moved, what's due tomorrow
- No constructs, no characters, no environments other than Plain Session

**What does NOT get built:**
- Constructs
- Characters
- Multiple environments
- Multiple subjects
- Motivation FSM
- Error Classification

**Validation questions:**
- Does the user come back on Day 2? Day 7? Day 30?
- Does their `p_known` actually move across sessions?
- Do they feel that the session was calibrated to them? (qualitative feedback)
- Is the session length right? (target: 25–45 min for primary user)
- Does the deadline-awareness feel real or arbitrary?

**Exit condition:** At least 5 real users have used the platform for 30+ days. Day 30 retention ≥ 60%. Users report sessions feel relevant to their actual gaps.

---

### Phase 2 — The First Construct
**Status: Same user group. Adding the first qualitative leap.**

**Goal:** The session becomes alive. The construct is the differentiator — not just a quiz.

**What gets built:**
- One construct: **Feynman Loop** (built completely — all 5 elements: reality touch, nuance, interactive, construction, gamification)
- One character: **The Confused Student** (personality document, visual design, expression range, dialogue library — built completely before shipping)
- Engine 6 (lite, rule-based): trigger Feynman Loop when BKT shows a concept is Seen but not Practicing — i.e., the learner has encountered it but hasn't internalized it
- Construct session summary: different from plain session — shows what the character misunderstood, what the learner explained, where the explanation broke down
- Construct ROI gate: if a learner's BKT trajectory post-construct is not better than plain session baseline, fall back to plain session for that concept

**What does NOT get built:**
- Second construct
- Second character
- More environments
- Multiple subjects

**Validation questions:**
- Does BKT move faster (or more stably) after a Feynman Loop session than after a plain session on the same concept?
- Do users prefer the construct? (qualitative — but this must not override the BKT question)
- Does The Confused Student feel real and consistent, or annoying and hollow?
- Is the construct ROI gate working? (Some concepts should not trigger Feynman Loop — is it correctly not triggering?)

**Exit condition:** Feynman Loop sessions show measurably better BKT movement than plain sessions for the concepts it covers. The Confused Student is rated positively by ≥ 70% of users.

---

### Phase 3 — Track 1 Complete
**Status: Expanded user group. Full competitive exam experience.**

**Goal:** Track 1 works end-to-end. A user starts from zero and can reach rank-predictable readiness for JEE.

**What gets built:**
- **Tapas Mode construct** — timed, under pressure, annotatable. For Track 1: this is the exam construct. Triggers when a concept is Confident but not yet tested under time pressure.
- **Exam Room environment** — exam interface, timer, annotation tools, question paper feel
- **Mock test mode** — full exam simulation (3 hours, 75 questions, full paper) with detailed debrief
- **Blueprint Mode** — given exam date and current BKT state, generate a study plan: what to cover, in what order, by when. Week-by-week.
- **Error Classification (Engine 5)** — careless / conceptual / gap / overload. Post-session, errors are classified and fed back into the session selector.
- **Motivation FSM (Engine 4)** — plateau detection, peak state detection, engagement signals. Adjusts session intensity and construct selection.
- **Engine 6 (full cascade)** — 5-layer construct selection: hard constraints → learner state → content fit → history → exploration
- **Second subject** — Physics (Track 1 JEE covers Math, Physics, Chemistry — start with Math + Physics)

**What does NOT get built:**
- Track 2 or Track 0
- Code Editor environment
- Working professional features

**Validation questions:**
- Does a user who follows the Blueprint for 90 days show rank-predictable improvement on mock tests?
- Does error classification correctly identify the type of mistake 80%+ of the time?
- Does the Motivation FSM detect real plateaus without too many false positives?
- Does Engine 6 choose constructs that the learner retroactively agrees were appropriate?

**Exit condition:** Users who complete a full 90-day Track 1 cycle show measurable improvement on mock test rank simulations. The system can explain why it chose each session.

---

### Phase 4 — Track 2 Online
**Status: New user segment. New infrastructure. New proof layer.**

**Goal:** Skill + Job track works. Learn a skill → practice it → prove it → feel ready to apply.

**What gets built:**
- **Code Editor environment** — sandboxed code execution, test suite runner, real compiler
- **Debug the Machine construct** — broken code, real error messages, diagnosis before fixing, explanation after
- **Portfolio artifact** — verified output from session (code that ran, problem solved with documented approach) stored as evidence
- **Proof layer** — session outputs accumulate into a portfolio. Each artifact is timestamped, tagged to skill, and linked to the session that produced it.
- **Track 2 session type** — project-based, not concept-graph-based. Sessions contribute to a project milestone rather than a concept mastery level.
- **Session length configuration** — user sets available time (30 min / 60 min / 90 min), system adapts session to it
- **Skill track definition** — what skills are covered (start with: Python fundamentals, data structures + algorithms, SQL). Each skill has a concept graph + project milestones.

**What does NOT get built:**
- Employer partnerships
- External credential validation
- Working professional session customization (that's Phase 6)

**Validation questions:**
- Does a user who completes a Track 2 cycle feel confident enough to apply for a job? (qualitative)
- Are the portfolio artifacts legible to someone outside the platform? (show to 3 developers — do they understand what the learner did?)
- Does the proof layer produce something the learner actually wants to share?
- Is the session actually engaging with real code, or does it feel like a toy?

**Exit condition:** Users who complete Track 2 cycle produce portfolio artifacts rated as "demonstrates real competence" by external reviewers. Day 30 retention ≥ 50%.

---

### Phase 5 — Track 0 Online + Library Expansion
**Status: Third track. Deeper library. More subjects.**

**Goal:** Knowledge track works. Intrinsic learner has a home. Library is rich enough to sustain long-term engagement.

**What gets built:**
- **Track 0 session type** — no deadline, concept-driven, depth-first. Progress measured in orbit levels, not exam readiness.
- **Track 0 proof layer** — Orbit Map: a visual record of every concept the learner has mastered, when they reached each level, their full knowledge history. This is the Track 0 "credential" — not exam-ready, but genuinely mastered.
- **More subjects** — Chemistry (completing JEE), Computer Science (data structures, algorithms, OS, networks)
- **More constructs** — Two Paths (parallel versions of the same concept), Socratic Pressure (reasoning under questioning), Live Trace (step-through execution)
- **More characters** — The Skeptic, The Interviewer, The Mentor (each built completely: visual design, dialogue library, personality document)
- **More environments** — Diagram Canvas, Mock Product
- **Personalization deepened** — analogy variant library live (cricket, cooking, geography — learner-specific), style preferences tracked across sessions, construct affinity matrix built from history

**Validation questions:**
- Do Track 0 users continue after 60 days without an external deadline?
- Does the Orbit Map feel like a meaningful record of knowledge, or just a progress bar?
- Are the new constructs producing the same ROI as Feynman Loop and Tapas Mode?
- Is the personalization visible — do users notice that examples are chosen for them?

**Exit condition:** Track 0 Day 60 retention ≥ 40% (harder without external deadline). Personalization A/B shows users with analogy preferences receive matched examples ≥ 80% of the time.

---

### Phase 6+ — Secondary Users
**Status: Expansion beyond core.**

These are not extensions of the current product — they are distinct user segments with different requirements. They are not added until the core platform is validated at scale.

**Working Professional (Track 2 extension):**
- Session length: ≤ 60 min (limited time, employed)
- Motivation: career ROI, not academic interest
- Content: more industry-practical, less theoretical
- Added when: Track 2 is validated and stable

**Educator Portal (B2B):**
- Assign adaptive content to students
- Class-level X-Ray (concept gap distribution across a class)
- Monitor, report, customize content sets
- Different buyer (institution, not individual)
- Added when: platform has critical mass of content and proven engagement metrics

**Graduate / Researcher:**
- Depth beyond current concept graph (research-level)
- Connection to primary sources and papers
- Collaborative knowledge building
- Added when: Phase 6+. Audience is small; content requirements are extreme.

---

## What Each Phase Proves

| Phase | What you prove |
|-------|----------------|
| 0 | The engine logic is correct. BKT + SM-2 + Session Selector work together. |
| 1 | Real users come back. The computed session is better than nothing. |
| 2 | Constructs move BKT faster than plain sessions. The differentiator is real. |
| 3 | Track 1 works end-to-end. Users improve measurably. The full engine stack works together. |
| 4 | Track 2 works. The proof layer produces real artifacts. Non-competitive learning is served. |
| 5 | All three tracks live. The library sustains long-term engagement. Personalization is visible. |
| 6+ | Scale. Secondary users. B2B. |

---

## Non-Negotiables at Every Phase

Before any phase ends, these must be true:

1. **No concept graph dead ends.** Every concept has a path forward and a path back to prerequisites.
2. **BKT must move.** If a user studies for 30 days and `p_known` has not changed, the engine is broken.
3. **Session must be explainable.** We must be able to articulate why the system chose this session for this user today.
4. **Construct must earn its place.** No construct ships without showing BKT ROI over plain session baseline.
5. **The session length must be right.** A session that runs 90 minutes when the user has 40 minutes available is a broken product.

---

## What We Are Not Building (and When We Revisit)

| Thing | Status | When it changes |
|-------|--------|----------------|
| Class 6–10 product | Never in this product | Separate product, different company decision |
| Enterprise / corporate L&D | Not in scope | Long-term, only if there's a strategic reason |
| Arbitrary domain coverage | Never | This platform is for structured knowledge domains with concept graphs |
| Social / peer features | Deferred | Could add in Phase 5+ (peer study, construct comparison) but not core |
| Content generation by AI | Deferred | Questions and concept graphs are human-curated for Phase 0–2. AI-assisted from Phase 3. |

---

*Document: buildplan | Version: 1.0 | Last updated: 2026-06-26*
*Read alongside: 06-users.md (user constraints), 02-engines.md (engine design), 09-library.md (library build sequence)*
