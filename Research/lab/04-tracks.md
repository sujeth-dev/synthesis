# Tracks — What Each Track Is, What It Needs, and What Questions It Raises

---

## Overview

Three tracks. All built on the same engine. Each serves a fundamentally different learner goal.

The tracks are not "courses" or "categories." They are different contracts with the learner.

```
Track 0 — KNOWLEDGE (Playground)
"I want to understand this subject deeply."

Track 1 — COMPETITIVE EXAMS
"I need to crack a specific exam on a specific date."

Track 2 — SKILL + JOB
"I need to be able to do this, and get paid for it."
```

Each track has its own UX, its own definition of progress, its own constructs mix, and its own end state. The engine underneath is shared.

---

## Track 0 — Knowledge / Playground

### What It Is

The foundational track. A learner arrives with curiosity about a subject — Mathematics, Physics, Chemistry, Biology, or Computer Science — and the track takes them from wherever they are to as deep as they want to go. No deadline. No syllabus imposed from outside. The concept graph drives the path.

This is also the platform's research lab. Every construct is tested here first. Every engine improvement is validated here first. The data generated here improves Tracks 1 and 2.

---

### Who It's For

A learner who:
- Wants genuine understanding, not a grade or credential
- Is motivated intrinsically — they find the subject interesting or important
- Has no fixed deadline to perform
- Is willing to go slow and deep
- Is likely 16–25 years old, academically inclined
- Is frustrated with platforms that treat learning as content consumption

---

### What It Contains

- 5 subject knowledge graphs (Mathematics, Physics, Chemistry, Biology, CS)
- Each graph: concept nodes + prerequisite edges + orbit stage tracking per learner
- Adaptive session engine: decides what concept, what depth, what construct
- Spaced repetition running in background: concepts return at the right time
- Full construct library active: Feynman Loop, Repair Crew, X-Ray, Tapas, Socratic, etc.
- No timer. No exam pressure. No rank.

---

### What Progress Looks Like

Not a percentage complete bar. That metric incentivizes rushing.

Progress in the Knowledge track is:
- Orbit stage per concept (where is each concept in the 7-stage lifecycle?)
- Knowledge density (how many concepts are at Stage 5+ out of total graph?)
- Connection visibility (can the learner see how concepts relate to each other?)
- X-Ray: a concept map of the subject, filled in over time, showing depth not just coverage

---

### What Makes It Different from Every Existing Platform

| Platform | Their model | Knowledge Track model |
|---------|------------|----------------------|
| YouTube | Watch passively | Feynman Loop: you must explain it |
| Khan Academy | Watch + basic quiz | Adaptive, concept-graph driven, prerequisite repair |
| Coursera | Course → Certificate | No course structure — pure concept graph |
| Textbooks | Linear, fixed order | Graph-driven, personalized order |
| Anki | Flashcards only | Full concept lifecycle, not just memorization |

---

### Challenges Specific to This Track

- **Motivation without deadline:** Without an exam or job target, some learners drift. The constructs (especially Tapas and Socratic) create intrinsic challenge. Blueprint Mode creates goal-setting structure. But this is the hardest motivation problem.
- **Content depth:** Going from "basic" to "deep" on 5 subjects is a massive content build. This is why we start with one subject (Mathematics) at full depth before expanding.
- **No clear end state:** Unlike Track 1 (pass the exam) or Track 2 (get the job), mastery has no binary finish line. The orbit stage system provides structure, but learners may not know when they're "done." This is by design — but must be communicated clearly.

---

### Open Questions for This Track

- [ ] How do we handle a learner who wants to jump in at an advanced level? (They already know basic calculus — do we test them in or just let them start wherever?)
- [ ] Which subject do we build first at full depth? Mathematics is the strongest choice (foundational to everything else, unambiguous right/wrong, no ambiguity in question answers). Confirm this.
- [ ] How do we present the knowledge graph visually? The city/world metaphor (from TheDen constructs) is compelling — is this Phase 1 or a later enhancement?
- [ ] How do we prevent this from feeling like "another app to open"? The habit-formation problem is severe when there's no external deadline.
- [ ] Should there be a "subject overview" session at the start of a new subject? A way to see the whole map before diving in?

---

## Track 1 — Competitive Exams

### What It Is

A learner arrives with: I need to crack [specific exam] on [specific date]. Everything else is defined by that. The syllabus is the exam syllabus. The metrics are score and rank. The timeline is the countdown to exam day.

This track takes the same engine as Track 0 and wraps it in a completely different contract: total coverage of the required syllabus, speed and accuracy training, previous year question analysis, mock tests, rank simulation, and a strategy layer that goes beyond just knowledge.

---

### Who It's For

A learner who:
- Has a specific exam and a specific date
- Needs breadth coverage, not just depth
- Is measured by score and rank, not understanding
- Is in Class 11, 12, or early college (for JEE/GATE type exams)
- Is in any phase of life for professional exams (UPSC, IELTS, GRE)
- Is under real pressure and needs structured, countdown-aware preparation

---

### What It Contains

**Syllabus Layer:**
- Exam syllabus mapped onto the subject knowledge graph
- Which concept nodes are in scope for this exam, which are not
- Concept coverage tracker: what % of the syllabus is at a sufficient knowledge level

**PYQ (Previous Year Questions) Database:**
- Last 10–15 years of questions for each exam, tagged by concept + difficulty + year
- PYQ analysis: which concepts appear most frequently? Which are high-difficulty?
- PYQ as primary practice material (more valuable than synthetic questions)

**Timed Practice:**
- Every question has a timer
- Session tracks time-per-question, not just correctness
- Speed benchmarks per question type

**Error Typology:**
- Every wrong answer classified: concept gap / application error / careless mistake / trap answer
- Error Journal surfaces the learner's dominant error pattern
- Different intervention per error type

**Mock Test Engine:**
- Full-length, paper-accurate timed mock tests
- Auto-scored, auto-analyzed
- Post-mock breakdown: subject-wise, concept-wise, error-type-wise
- Comparison to target score / percentile

**Rank Simulation:**
- Estimates percentile and rank from practice data
- Not random — calibrated to actual exam score distributions
- Updated as practice data accumulates

**Strategy Layer:**
- When to skip (negative marking strategy)
- Section sequencing (which sections to attempt in which order)
- Time allocation per section
- Guessing strategy (how to guess when partially informed)

**Countdown Mode:**
- Activates when exam date is < 45 days away
- Shifts session composition: more rapid review, less new content
- Prioritizes high-frequency PYQ concepts
- Simulates exam conditions more aggressively

---

### What Progress Looks Like

- Syllabus coverage % (what portion of the exam syllabus is at sufficient knowledge level)
- Mock test score trajectory (is the simulated score increasing?)
- Estimated rank / percentile (updated continuously)
- Error type breakdown (is the dominant error pattern shifting toward careless from concept gaps? That's progress.)
- Days remaining vs. coverage gap (the core countdown signal)

---

### Exam Scope

Any exam fits the same system. The layer on top changes. Core system stays.

| Exam Type | Syllabus Source | PYQ Available? | Time Pressure Level |
|-----------|----------------|----------------|---------------------|
| JEE Mains + Advanced | NCERT-based, defined | Yes, 20+ years | Very high |
| GATE | Branch-specific CS/ECE/etc. | Yes, 15+ years | High |
| UPSC (Prelims) | GS syllabus | Yes, 30+ years | Moderate |
| IELTS | Skill-based (not concept graph) | Practice sets | High |
| SAT / GRE | Math + Verbal | Yes | Moderate |
| 10th / 12th Board | NCERT chapters | Yes | Moderate |
| College entrance (BITS, IIIT) | JEE-adjacent | Limited | High |
| Professional certs (AWS, CFA, etc.) | Vendor-defined | Limited | Moderate |

---

### Challenges Specific to This Track

- **PYQ collection is manual and legal:** Sourcing, tagging, and formatting 10+ years of PYQs for multiple exams is a massive content task. Must be done carefully to avoid copyright issues.
- **Exam accuracy matters:** If our mock test format doesn't match the real exam format exactly, the practice doesn't transfer. Format fidelity is critical.
- **Breadth vs. depth tension:** The exam requires full syllabus coverage. But the adaptive engine naturally wants to go deep on what's weak. These goals can conflict — a learner 3 weeks before JEE should be covering all topics, not going 5 levels deep on integration.
- **Emotional state:** Exam prep is psychologically intense. The motivation engine must be much more sensitive here than in Track 0. Burnout is real. Anxiety is real.

---

### Open Questions for This Track

- [ ] Which exam do we build first? JEE is the strongest choice — largest motivated user base, best-defined syllabus, 20+ years of PYQs, well-understood format. Confirm.
- [ ] How do we handle the breadth/depth tension in session selection as exam date approaches?
- [ ] How do we handle negative marking in practice sessions? Do we apply it to practice too, or only in mocks?
- [ ] How granular is the strategy layer in Phase 1? Does it start as content (articles/guides) or as an active decision engine?
- [ ] When a learner has both JEE Mains and Advanced, how do we manage two overlapping but different targets?
- [ ] What happens post-exam? Does the learner transition to Track 0 (subject mastery) or Track 2 (job track)? How do we handle this?

---

## Track 2 — Skill + Job

### What It Is

A learner arrives knowing: I need to be able to do X, and I want to get paid for it. The goal is not an exam score or subject mastery — it is demonstrable, applicable capability that leads to a job or freelance opportunity.

This is the hardest track to build correctly. It requires not just learning content but a domain-specific practice environment, a way to prove skill, and a connection to actual opportunities.

This track is also the largest commercial opportunity — it is not bounded by age, location, or academic calendar. Any working-age person who wants to level up professionally is a potential user.

---

### Who It's For

A learner who:
- Wants to learn a skill with a specific career outcome in mind
- May be a student (final year, just graduated), a working professional switching domains, or someone entering the workforce for the first time
- Defines progress as "can I do this work and get paid for it"
- Has limited time (working adults: 1–2 hours/day) or intense focus (full-time job seekers)

---

### What It Contains

**Skill Definition Layer:**
- Each skill is decomposed into: knowledge components + capability components
- Knowledge components: handled by Track 0 engine (same adaptive learning)
- Capability components: require practice in a real environment, not just answering questions

**Domain-Specific Practice Environments:**

*Coding:*
- In-browser code editor with test runner
- Real problems (not toy exercises) with automated pass/fail
- Progression: syntax → algorithms → system design → project

*Design:*
- Brief-based tasks with a canvas
- Peer + automated critique system
- Portfolio artifact as output

*Writing:*
- Prompt → output → structured feedback (grammar, clarity, argumentation)
- Gradually increases in complexity

*(Other domains to be added one at a time)*

**Proof of Skill:**
- Portfolio: a collection of verified outputs (real code that runs, real designs, real writing samples)
- Skill assessment: structured evaluation that produces a verifiable rating
- Not a certificate — a demonstrated output that a potential employer or client can see

**Opportunity Layer:**
- Matched job listings based on skill level and verified portfolio
- Matched freelance gigs (short-term contracts)
- The platform does not just certify — it connects to actual work
- This layer is the core differentiator from every existing edtech platform

---

### The Fundamental Difference from Track 1

| Track 1 (Competitive) | Track 2 (Skill + Job) |
|-----------------------|-----------------------|
| Outcome: exam score | Outcome: employment / income |
| Progress: rank + coverage | Progress: portfolio + opportunity match |
| Content: subject knowledge | Content: knowledge + applied practice |
| End state: binary (crack/not crack) | End state: ongoing skill development + career growth |
| Deadline: exam date | Deadline: learner-defined (job search, project deadline) |

---

### Why This Track Is Hard

**Every domain is different.** A code environment is not a design canvas. A design canvas is not a writing prompt tool. Each domain requires a custom-built practice environment. This is expensive to build and easy to build badly (half-finished environments are worse than none).

**Skill proof is harder than knowledge proof.** You can test whether someone knows what a binary search is. Testing whether they can actually write clean, maintainable code under real conditions is a much harder problem.

**The opportunity layer requires supply.** Matching to jobs and freelance gigs means either building a marketplace (hard) or integrating with existing ones (simpler first step). This layer is the most complex part of the product.

---

### Domain Prioritization

We cannot build all domains at once. One domain must be first.

**Coding is the right first domain:**
- Most defined practice environment (code either passes tests or it doesn't — objective)
- Largest job market
- Freelance opportunity density is highest (Upwork, Toptal, etc.)
- Community of learners is already technically literate — lower barrier to engagement
- Automated grading is possible — scales without human reviewers

After coding: Design. Then Writing. Then domain-by-domain.

---

### Connection to Track 0 (Knowledge)

Skills are built on knowledge. A coding skill is built on CS knowledge (algorithms, data structures, systems). The Track 0 CS knowledge graph is the foundation of the coding skill track.

The relationship:
```
Track 0 CS knowledge graph
            ↓
Track 2 Coding skill track (adds: practice environment + proof layer)
```

A learner can move between tracks. Someone in Track 0 studying CS concepts might move to Track 2 to apply those concepts to real coding problems. The engine knows where they are in the knowledge graph and doesn't repeat what they already know.

---

### What Progress Looks Like

- Skill level (a continuous rating, not a binary pass/fail)
- Portfolio completeness (how many verified outputs exist)
- Opportunity match rate (how many jobs/gigs match current skill level)
- Learning velocity (rate of skill level increase)

---

### Open Questions for This Track

- [ ] What is the exact definition of "skill level" for coding? How do we rate it in a way that is meaningful to employers?
- [ ] How do we build the opportunity layer first — integrate with existing job boards, or build a native marketplace? Existing integration (LinkedIn jobs API, Upwork) is faster but gives less control.
- [ ] How do we handle domains where output is subjective (design, writing)? Do we use peer review? Expert review? LLM evaluation? A hybrid?
- [ ] How do we scope the coding practice environment — build our own code runner or use an existing service (Piston, Judge0)?
- [ ] What is the minimum viable portfolio? How many verified outputs does a learner need before the opportunity matching is meaningful?
- [ ] How do we handle working professionals with 1 hour/day? Does the session engine change significantly for their time constraints?
- [ ] When does a learner "graduate" from Track 2? Or is this ongoing, with the skill level continuously increasing?

---

## Cross-Track Considerations

### Learner Movement Between Tracks

A learner is not locked into one track. The same person might:
- Study CS foundations in Track 0
- Prepare for GATE (CS) in Track 1
- Build coding skills for a job in Track 2

The knowledge state is shared. If they learned binary search trees in Track 0, Track 1 and Track 2 both know this and don't re-teach it.

This is the key advantage of a unified engine. Most platforms have walls between their products. This platform has shared knowledge.

---

### What Is Shared Across All Tracks

| Component | Track 0 | Track 1 | Track 2 |
|-----------|---------|---------|---------|
| Knowledge graph | Core | Used (with syllabus overlay) | Foundation |
| BKT / DKT | Active | Active | Active |
| SM-2 / FSRS | Active | Active (compressed near exam) | Active |
| Session engine | Active | Active (extended) | Active (extended) |
| Feynman Loop | Always | When time allows | When relevant |
| Repair Crew | Always | Always | Always |
| X-Ray Mode | Always | Always | Always |
| Error classification | Background | First-class feature | Background |
| Tapas Mode | Available | Available | Available |
| Mock test | Not applicable | Core feature | Optional (assessment) |
| Timed mode | Off by default | Always on | Coding challenges only |
| Opportunity layer | Not applicable | Not applicable | Core feature |

---

### Future Tracks (Not Now)

| Track | What it would be | When |
|-------|-----------------|------|
| **Research Track** | Deep domain knowledge for graduate students and researchers | Phase 6+ |
| **Educator Track** | Teachers using the platform to build and assign content | Phase 5+ |
| **Young Learner Track** | Class 6–10 students — different UX, different constructs, safety layer | Separate product |

---

*Document: tracks | Version: 1.0 | Last updated: 2026-06-25*
