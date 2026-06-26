# Blueprint — What We Are Building

*Read `00-why.md` first. That document is the foundation. This one is the structure built on top of it.*

---

## The Core Thesis

Most learning platforms teach. This one makes people capable.

The gap in every existing product is this: you can finish a course, pass a quiz, get a certificate — and still not be able to do the thing. The reason is that learning and capability are not the same thing. Learning is exposure. Capability is a proven, durable, retrievable skill that holds up under pressure.

This platform closes that gap. It starts at knowledge and ends at opportunity.

---

## Three Layers — The Full Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   LAYER 0 — KNOWLEDGE PLAYGROUND                                │
│                                                                 │
│   Any subject · Any depth · Zero to mastery                     │
│   Mathematics · Physics · Chemistry · Biology · Computer Science │
│                                                                 │
│   Purpose: build and test the learning engine                   │
│   Role: the lab. Not sold directly. Foundation for all layers.  │
│                                                                 │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                       │
│   LAYER 1                │   LAYER 2                            │
│   COMPETITIVE EXAMS      │   SKILL + JOB TRACK                  │
│                          │                                       │
│   Any exam:              │   Any skill domain:                  │
│   JEE · GATE · UPSC      │   Coding · Design · Writing          │
│   IELTS · GRE · SAT      │   Finance · Marketing · etc.         │
│   10th/12th boards       │                                      │
│   College entrance       │   Flow:                              │
│   Professional certs     │   Learn → Practice → Prove → Opportunity │
│                          │                                       │
│   First commercial       │   Core commercial product            │
│   product                │   Largest addressable market         │
│                          │                                       │
└──────────────────────────┴──────────────────────────────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────┐
                         │   OPPORTUNITY LAYER       │
                         │   Job matching            │
                         │   Freelance marketplace   │
                         │   Skill certification     │
                         └──────────────────────────┘
```

---

## What Each Layer Is

### Layer 0 — Knowledge Playground

This is not a product to sell. It is the engine room.

The playground is where:
- All learning constructs are tested and validated
- The adaptive engine (BKT → DKT, SM-2 → FSRS) is trained and refined
- Subject concept graphs are built for all 5 core subjects
- Metrics are established for what "learning" actually looks like
- The content pipeline and quality standards are set

A serious, intrinsically motivated learner uses the playground. It works. It is real. But monetizing it directly is difficult — the audience is motivated but narrow, and competition from free resources (Khan Academy, YouTube) is high.

The playground pays for itself by making Layers 1 and 2 possible.

**What it contains:**
- 5 subject knowledge graphs (Mathematics, Physics, Chemistry, Biology, Computer Science)
- Concept nodes with prerequisite edges
- Adaptive session engine (knows what you know, knows what's next)
- Spaced repetition (concepts come back at the right time)
- TheDen constructs layered on top (Feynman Loop, Repair Crew, X-Ray, Tapas Mode, etc.)
- Learning Orbit: the 7-stage lifecycle every concept passes through

---

### Layer 1 — Competitive Exams

The playground applied to a specific battle with a specific date.

A student arrives knowing: I need to crack JEE Mains in 8 months. The platform does not need to explain what they need to learn — the exam syllabus defines it. The platform's job is: cover the entire syllabus, fix what's broken, build speed and accuracy, simulate the exam, and track progress toward the target.

**What makes it distinct from the playground:**
- Deadline-driven. Countdown is a first-class concept.
- Breadth required. Full syllabus must be covered, not just what the student finds interesting.
- Speed + accuracy, not just correctness.
- PYQ (Previous Year Questions) database — the most important resource for any exam.
- Mock test engine — full-length, paper-accurate, timed.
- Rank and percentile — the actual metric that matters.
- Strategy layer — when to skip, how to handle negative marking, section sequencing.
- Error typology — concept gap vs. application error vs. careless mistake vs. trap answer.

**Why this is the first commercial product:**
- Use case is completely defined (exam, date, score).
- Feedback loop is tight and binary (cracked it or not).
- Validates the engine against a measurable real-world outcome.

**Scope of exams:**
Any exam fits. The syllabus is an overlay on the knowledge graph. JEE, GATE, UPSC, IELTS, GRE, SAT, 10th boards, 12th boards, college entrance, professional certifications — same system, different layer on top.

---

### Layer 2 — Skill + Job Track

This is the main commercial product. The one that matters at scale.

The insight: the gap in the market is not "more courses." Every platform has courses. The gap is: a person learns a skill but never gets to proving it or landing the opportunity. This platform goes all the way from learning to employment.

**The complete flow:**
```
Identify skill gap (what do I need to be able to do?)
         ↓
Structured learning (from the playground engine)
         ↓
Practice in a real environment (domain-specific)
         ↓
Build proof of skill (project, portfolio, real output)
         ↓
Opportunity (job application, freelance gig, contract)
```

**Why this is hard:**
Every domain has a different practice environment.
- Coding: needs a working code environment, real problems, automated test runners
- Design: needs a canvas, real briefs, critique system
- Writing: needs prompts, real feedback, quality signal
- Finance: needs datasets, real cases, model outputs

The learning methodology (Layer 0) is universal. The practice environment is domain-specific. That is the complexity this layer must solve.

**The opportunity layer — the unlock:**
When skills are proven, the platform connects people to matched opportunities. Not just "here's what you learned" — but: your skill level is verified, here are jobs and freelance gigs matched to it. This transforms the value proposition from education platform to skilling-to-employment pipeline.

---

## The Connection Between Layers

```
Layer 0 knowledge graph
        ↓
Skill = knowledge applied in a domain context
        ↓
Competitive exam = knowledge tested against exam definition
        ↓
Job/freelance = knowledge applied, proven, and matched to opportunity
```

A person learning calculus is in the playground. The same person preparing for JEE is in Layer 1. The same person preparing for a data science role is in Layer 2. The engine is identical. The overlay is different.

Skills are built on subject knowledge. A coding skill is built on CS knowledge + practice. A design skill is built on visual principles + practice. The playground is not separate from the skill track — it is the foundation of it.

---

## What We Are Not Building (Now)

| Segment | Why Not |
|---------|---------|
| Content for children under Class 6 | Different cognitive model, different UX, different safety requirements. Separate product. |
| Casual learners | Wrong motivation model. Platform built for depth will frustrate them. |
| Professional job seekers without an exam target | Different content domain. Add when Skill Track is built. |
| Researchers needing primary literature | Wrong product. Too niche. |
| Teacher / educator tools | B2B product. Different buyer. Add when platform layer exists. |

---

## Build Sequence

```
Phase 0–1:   Knowledge Playground (engine + 5 subjects)
Phase 1–2:   Competitive Exam layer on top
Phase 2–3:   Skill Track, first domain (Coding — most defined practice environment)
Phase 3–4:   Opportunity Layer (skill proof → job/freelance matching)
Phase 4+:    Add domains to Skill Track one by one
             Scale Competitive Exam to all exam types
             Build educator/institution layer
```

---

## The Fundamental Commitment

This is not a feature list. It is a direction.

The commitment is: make people genuinely capable, not just credentialed. Everything designed, built, and measured must answer one question — does this make the learner more capable? If it doesn't, it doesn't belong.

---

*Document: blueprint | Version: 1.0 | Last updated: 2026-06-25*
