# Phase-Wise Plan

---

## How to Read This

Each phase has:
- A clear goal — what exists and works by the end of this phase
- What gets built — specific modules and systems
- What gets validated — the metric that tells us the phase succeeded
- What is not in scope — explicit boundaries so scope doesn't creep
- Open questions that must be answered before the next phase

Phases are not calendar-fixed. A phase ends when its goal is validated, not when a deadline arrives.

---

## Phase 0 — Architecture Lock

**Goal:** Make every foundational decision before building anything. No ambiguity about schemas, engine interfaces, or content structure. All future phases build on this.

**Why this phase exists:** The most expensive mistake in product development is building on the wrong foundation. A wrong schema change in Phase 3 means rewriting everything built in Phases 1 and 2. Spending 2–3 weeks in Phase 0 saves months later.

---

### What Gets Decided

**Content schema — final:**
```
concept node: {
  id, subject, name, description, bloom_level,
  prerequisites: [concept_id],
  orbit_stage_default: 1
}

question: {
  id, concept_id, subject, bloom_level, difficulty (1-3),
  time_expected_seconds, question_type (mcq/numerical/trace/explain/construct),
  is_pyq, pyq_exam, pyq_year,
  error_trap_type (concept_gap/application/careless/trap),
  cross_subject_tags: []
}

learner_state per concept: {
  concept_id, learner_id,
  p_known (BKT), avg_speed_seconds, speed_trend,
  error_breakdown: {concept_gap, application, careless, trap},
  bloom_ceiling, orbit_stage,
  last_seen, next_due (SM-2)
}
```

**Multi-subject namespacing:** All content, graph, and question paths namespaced by subject from day one.

**Track data model:** How the system knows which track a learner is in, what their target is (exam date, skill goal), and what overlays are active.

**Engine interfaces:** Clean API contracts between all engines so they can be upgraded independently.

---

### What Does Not Get Built

No learner-facing features. No UI. No content. Phase 0 is design, not build.

---

### Validation

A developer can describe, without ambiguity, where any piece of data lives, what schema it has, and which engine reads or writes it. All 5 subject paths exist (empty but namespaced). All schemas are documented and agreed upon.

---

## Phase 1 — Knowledge Playground MVP

**Goal:** One subject (Mathematics) fully working. A learner can open Math, get placed correctly in the knowledge graph, run adaptive sessions that respond to them, and return the next day to continue. End to end, for real.

This is the template for all five subjects. Get it right here.

---

### What Gets Built

**Content:**
- Mathematics concept graph: all major nodes through calculus, linear algebra, probability, statistics
- Prerequisite edges complete
- Question bank: 10–15 questions per concept, 3 difficulty levels, bloom-tagged
- Explanations: beginner / intermediate / advanced per concept

**Engine:**
- BKT running per concept, updating on every answer
- SM-2 scheduling review dates
- Session engine: 4-priority rule-based selector live
- Motivation FSM: 4 states with behavioral triggers

**Constructs (live for Phase 1):**
- Repair Crew (prerequisite backtrack on repeated failure)
- X-Ray Mode (concept-level knowledge map visible to learner)
- Feynman Loop (basic: free-text explanation after concept introduction, keyword validation)
- Ebbinghaus Engine (SM-2 review scheduling, visible in X-Ray)

**UI:**
- Subject landing page (Math)
- Session interface (question → answer → feedback → next)
- X-Ray dashboard
- Basic learner profile (orbit stage per concept)

---

### What Is Not in Scope

- Physics, Chemistry, Biology, CS content
- Timed mode
- Mock tests
- PYQ database
- Competitive exam overlay
- Skill/job track anything
- Advanced constructs (Tapas, Socratic, Blueprint)

---

### Validation

A real learner (not a developer) can use the Math track for 5 consecutive days and report: it knew what I knew, it gave me what was next, it brought back things I was forgetting, and I understood more on day 5 than day 1. Session completion rate > 70%. Next-day return rate > 40%.

---

## Phase 2 — All 5 Subjects + Competitive Exam Foundation

**Two parallel workstreams. Both must complete before Phase 3.**

---

### Workstream A — All 5 Subjects

**Goal:** Replicate Phase 1 for Physics, Chemistry, Biology, Computer Science.

**What gets built:**
- 4 additional subject knowledge graphs (full concept nodes + edges)
- Question banks per subject
- Subject-specific constructs wired: Broken Machine (CS), Thought Experiment (Physics)
- Cross-subject prerequisite edges (Physics ← Math, CS ← Math, Chemistry ← some Physics)
- Subject selector UI (learner picks their subject world)

**Validation:** All 5 subjects independently functional with adaptive sessions at same quality level as Math in Phase 1.

---

### Workstream B — Competitive Exam Foundation

**Goal:** JEE Mains prep working end to end.

**What gets built:**

*Syllabus layer:*
- JEE Mains syllabus mapped onto Math + Physics + Chemistry concept graphs
- In-scope / out-of-scope tagging per concept
- Syllabus coverage tracker (% of JEE concepts at sufficient knowledge level)

*PYQ database:*
- Last 10 years JEE Mains questions tagged by concept, difficulty, year
- PYQ integrated into practice sessions (flagged as PYQ, same adaptive session flow)

*Timed mode:*
- Timer running per question during sessions
- Speed tracking: avg time per question by concept and difficulty level

*Error Journal:*
- 4-type error classification (author-tagged on wrong answer options)
- Learner-facing Error Journal dashboard

*Basic mock test:*
- Single mock paper, paper-accurate format
- Timed (3 hours), auto-scored, concept-wise breakdown after

**Validation:** A JEE student can run timed practice sessions, see their error breakdown, view their syllabus coverage, and complete one full mock test. The system's practice score correlates directionally with their performance on actual PYQs.

---

### What Is Not in Scope (Phase 2)

- Advanced constructs (Tapas, Socratic, Blueprint, Echo Chamber)
- Rank simulation / percentile
- Strategy layer
- Countdown mode
- Any other exam besides JEE Mains
- Skill + Job track
- LLM-powered Feynman evaluation

---

## Phase 3 — Competitive Exam Full + Constructs Depth

**Goal:** The competitive exam track is fully functional for JEE. Advanced constructs live in the Knowledge track.

---

### Competitive Exam: JEE Complete

**What gets built:**
- JEE Advanced syllabus and PYQ database
- Rank / percentile simulator (calibrated to real score distributions)
- Strategy module: negative marking logic, section sequencing guide, time allocation
- Countdown mode: activates at 45 days before exam, shifts session composition
- Full mock test suite (5+ papers, Mains + Advanced)
- Post-mock deep analysis: time per question, error type breakdown, topic-wise heat map

---

### New Exams Added

- GATE (CS/ECE branches first)
- 10th / 12th board exams (NCERT-aligned)

Each exam: syllabus layer + PYQ database + basic mock. Full features added over time.

---

### Constructs Depth (Knowledge Track)

**What gets built:**
- Tapas Mode: hard problem, no hints, full pressure — activated at Stage 4+
- Blueprint Mode: pre-session goal setting, post-session review
- Socratic Pressure: answer challenge before acceptance — activated at Stage 5+
- Feynman Loop upgraded: LLM-based evaluation of explanations (not just keyword matching)

---

### What Is Not in Scope (Phase 3)

- Skill + Job track
- Opportunity layer
- Educator tools
- Social / cohort features

---

### Validation

A JEE student can use the platform from scratch to exam day with full feature set. Mock test scores and self-reported exam performance correlate. Knowledge track learners using Tapas Mode show higher 7-day retention than those who don't (A/B signal if user base exists).

---

## Phase 4 — Skill + Job Track MVP

**Goal:** The coding skill track is live. A learner can learn coding, practice in a real environment, build a portfolio, and be matched to opportunities.

This is the hardest phase to build. Domain-specific practice environment must be real, not a simulation.

---

### What Gets Built

**Knowledge foundation:**
- CS knowledge graph from Track 0 is the base — no rebuild needed
- Skill definition: coding skill decomposed into knowledge components (algorithms, DS, systems) + capability components (write working code)

**Practice environment — coding:**
- In-browser code editor with test runner (integrate with Judge0 or Piston API — do not build from scratch)
- Real problem set: 200+ problems across difficulty levels (easy → medium → hard)
- Automated grading: code either passes tests or it doesn't
- Progression: syntax basics → data structures → algorithms → system design → project

**Proof of skill:**
- Portfolio: verified code outputs (passed test suites = verified)
- Skill level rating: continuous (0–100), updated on each solved problem
- Shareable portfolio link

**Opportunity layer — v1:**
- Integrate with existing job boards (LinkedIn, Naukri APIs) for matched listings
- Integrate with freelance platforms (Upwork listings API) for matched gigs
- Match based on skill level + portfolio quality
- No native marketplace in v1 — integration only

---

### What Is Not in Scope (Phase 4)

- Design track, writing track (Coding first)
- Native job marketplace (integration only)
- Educator tools
- Social features

---

### Validation

A learner with zero coding background can reach "entry-level employable" skill level on the coding track (defined as: can solve easy-medium LeetCode level problems consistently, has 5+ verified portfolio projects). The opportunity layer surfaces at least 10 matched opportunities for a learner at this level.

---

## Phase 5 — Intelligence Upgrade

**Goal:** All engines get smarter. The platform becomes meaningfully more accurate in every decision.

**Not new features. Better brains behind existing features.**

---

### What Gets Upgraded

**Knowledge Tracing:**
- DKT introduced in parallel with BKT (if data threshold met: 50,000+ sessions, 10,000+ learners with 100+ sessions)
- A/B comparison: DKT vs. BKT on held-out prediction
- DKT promoted to primary if AUC-ROC is meaningfully higher (>0.02 improvement)

**Spaced Repetition:**
- SM-2 → FSRS migration (if 5,000+ review events exist)
- FSRS fitted per individual learner
- Target retrievability set per track (90% default, compressed near exam date in Track 1)

**Session Selection:**
- Rule-based → Bandit (if 20,000+ sessions with measurable outcomes)
- Exploration: try different task type mixes for each learner state
- Exploitation: weight toward mixes that produce better next-day return and 7-day retention

**Motivation Engine:**
- 4-state FSM → SDT-grounded model
- Competence (p_known), Autonomy (choice behavior), Relatedness (cohort layer — added here)
- Personalized difficulty calibration: system learns each learner's optimal challenge level

**Behavioral Signals (new data collected):**
- Time per question (already in Phase 2, but now used in more models)
- Hesitation patterns (time before first keystroke)
- Retry behavior (do they try again immediately or give up?)
- Hint request frequency (not just whether they got it right)

---

### Validation

Each engine upgrade is gated by a metric improvement on held-out data before it goes live. No upgrade goes to production just because it theoretically should be better.

---

## Phase 6 — Platform and Scale

**Goal:** Beyond individual learners. Institution layer, educator tools, API access.

---

### What Gets Built

**Educator / Tutor Portal:**
- Assign content to individual learners or groups
- See learner X-Ray: knowledge state, error pattern, motivation state
- Create custom sessions targeting specific concepts
- Not building the content pipeline — using the existing knowledge graph

**Institution Dashboard:**
- A coaching centre or school sees class-wide knowledge gaps
- Which concepts are the class's weakest? Which constructs are most effective?
- Aggregate X-Ray across a cohort

**API Layer:**
- The adaptive engine (BKT + session selector + SM-2) available as an API
- Other applications can plug in their content and get adaptive session selection
- This is the long-term business model component — licensing the engine

**Cohort / Community Layer:**
- Accountability pairs
- Shared milestones
- Peer learning (Echo Chamber construct at scale)

**Outcome Tracking:**
- Track 1: did the learner crack the exam? What score? Feed this back into the model.
- Track 2: did they get the job? What role? At what salary? This data improves opportunity matching.

---

## Cross-Phase Decisions That Apply Throughout

| Decision | Rule |
|---------|------|
| Content first | No engine feature ships without content to run it on. |
| Metric before upgrade | No engine gets upgraded without a clear metric showing the upgrade works. |
| One construct at a time | Never ship two new constructs in the same phase. Validate one before adding another. |
| Schema is sacred | Content schema changes are backward-compatible or require full migration plan. |
| Validate is mandatory | `npm run validate` passes before every content commit. |

---

## What Phase We Are In Now

**Phase 0.** Architecture decisions are being documented. No building has started for the new multi-subject, multi-track architecture.

The current Synaptic codebase has:
- Phase 1–2 complete for AI engineering content (not one of the 5 core subjects)
- BKT + SM-2 + session engine (4-priority) live
- Single-subject architecture

What needs to happen before Phase 1 of this new plan:
1. Lock content schema (with all new fields: bloom_level, time_expected, is_pyq, error_trap_type, etc.)
2. Set up multi-subject namespacing in content/ directory
3. Begin Mathematics concept graph
4. All decisions in this document finalized

---

*Document: phases | Version: 1.0 | Last updated: 2026-06-25*
