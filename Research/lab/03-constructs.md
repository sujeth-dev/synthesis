# Constructs — What They Are, Which to Use, and When

---

## The Critical Distinction

Before listing constructs, this distinction must be clear. Confusing these two categories will produce a product that feels inconsistent.

---

### Type A — Proper Constructs

A proper construct is a **specific mode of interaction** that changes what the learner does, how they engage, and what mental process is activated. It creates a different *feel* and a different *learning flow*. It is not a label — it changes behavior.

A proper construct passes this test:
> If you removed it from the product, a learner who had used it would notice something was missing.

Examples: Feynman Loop, Tapas Mode, Socratic Pressure. Each of these makes the learner do something different. The experience changes.

---

### Type B — Pedagogical Frameworks

A framework is a **structural lens** or underlying principle that shapes *how we design* the constructs and content — but the learner never sees the framework itself. It is used by the system and content designers, not directly experienced by the learner.

A framework passes this test:
> It is a tool for building the product, not a feature of the product.

Examples: Bloom's Taxonomy, Spaced Repetition, SDT. A learner never encounters "Bloom's Level 4." But the system uses Bloom levels to route sessions to the right cognitive challenge. The learner experiences the *result* of the framework, not the framework itself.

---

## The Learning Orbit — The Overarching Frame

This is neither a construct nor a framework. It is the **lifecycle** that every concept passes through. All constructs are placed within this lifecycle. It defines when a construct is appropriate.

```
Stage 1 — ENCOUNTER
First exposure to a concept. No prior knowledge.
Goal: recognition, not retention.
Active constructs: Blueprint Mode (set intent), basic explanation

Stage 2 — PRACTICE
First deliberate attempts. Making and correcting mistakes.
Goal: initial skill formation.
Active constructs: Feynman Loop (verify understanding), Repair Crew (fix gaps)

Stage 3 — RETURN
SM-2 scheduled review. Concept comes back.
Goal: fight forgetting, strengthen the trace.
Active constructs: Ebbinghaus Engine (timing), X-Ray (visibility)

Stage 4 — APPLY
Use the concept in new contexts. Transfer.
Goal: application beyond the original example.
Active constructs: Tapas Mode, Shrink It

Stage 5 — BUILD
Combine this concept with others to construct something.
Goal: integration and synthesis.
Active constructs: Socratic Pressure, Blueprint Mode (review)

Stage 6 — TEACH
Explain it to someone else. Defend it under challenge.
Goal: deepest encoding. Fluency.
Active constructs: Feynman Loop (advanced), Echo Chamber (Vygotsky)

Stage 7 — MASTERY
Durable. Retrievable under pressure. Connections to other concepts visible.
Goal: permanent ownership.
Signal: consistent performance across varied contexts over time.
```

No construct should be activated outside its valid orbit stages. Tapas Mode at Stage 1 = frustration. Feynman at Stage 7 = boring. Stage governs which constructs are available.

---

## Type A — Proper Constructs

### TIER 1 — Non-Negotiable. Platform identity.

---

**Feynman Loop**

*What it does:* After a concept is encountered, the learner must explain it in plain language before the system accepts that they understood it. The explanation is challenged with follow-up questions. The learner cannot skip this step.

*Why it works:* The act of retrieval and re-encoding in your own words is the single highest-impact learning activity studied in cognitive science. It surfaces gaps that passive reading hides.

*When it activates:* Stage 2 (Practice) after initial concept introduction. Stage 6 (Teach) in advanced form.

*Implementation:* After concept explanation is shown, a text prompt asks the learner to explain it without looking. The system evaluates the explanation (keyword matching + semantic similarity initially, LLM-based evaluation later). If gaps are detected, specific follow-up questions are generated targeting those gaps.

*Metric:* % of learners who fail first Feynman attempt (calibrates content clarity). Re-attempt success rate.

*Status:* Planned — Phase 1.

---

**Repair Crew**

*What it does:* When a learner is stuck on a concept (wrong answer rate above threshold, p_known dropping), the system does not repeat the same question. It identifies which prerequisite concept is the actual source of the gap, and drops back to that.

*Why it works:* Most confusion is not about the current concept — it is about a gap in something that should have been learned before. Repeating the same material on a broken foundation is useless.

*When it activates:* Any stage when wrong answer rate exceeds threshold (usually 3+ consecutive failures).

*Implementation:* Prerequisite edge traversal on the knowledge graph. The engine walks backward through the prereq tree, checking p_known for each ancestor concept, until it finds the broken node. Session redirects there.

*Metric:* Time to recovery after hitting a wall. % of learners who recover vs. disengage.

*Status:* Partially implemented in current Synaptic — extend to all subjects.

---

**X-Ray Mode**

*What it does:* The learner can see their own knowledge state at any time. Not a score — a concept-level map showing what is known, what is shaky, what is missing, and what is due for review.

*Why it works:* Metacognition (knowing what you know) is one of the strongest predictors of learning outcomes. Learners who can accurately assess their own knowledge state study more effectively.

*When it activates:* On demand, always available.

*Implementation:* Visual knowledge graph overlay. Each concept node colored by p_known level (0–1 range). Review queue visible. Orbit stage visible per concept. Error type breakdown per concept (for competitive track).

*Metric:* Frequency of X-Ray access (do learners use it?). Correlation between X-Ray access and learning outcomes.

*Status:* Planned — Phase 1.

---

**Tapas Mode**

*What it does:* Hard problem. No hints. No safety net. Full time pressure (competitive track). The system does not intervene. The learner must sit with difficulty.

*Why it works:* Productive struggle — the cognitive effort of working through a genuinely hard problem without assistance produces stronger encoding than guided practice. Named after the Sanskrit concept of tapas: disciplined effort through discomfort.

*When it activates:* Stage 4 (Apply) or Stage 5 (Build) only. Never at Stage 1 or 2.

*Implementation:* A session mode where hints are disabled, explanations are withheld until attempt is complete, timer is always running. Activate manually or when system detects learner is in Apply/Build stage and motivation state = Active.

*Metric:* Success rate in Tapas Mode vs. normal mode. Learning velocity before and after Tapas sessions.

*Status:* Planned — Phase 2.

---

**Blueprint Mode**

*What it does:* Before a session, the learner states what they want to understand by the end. At the end of the session, the system asks whether they achieved it. A goal-setting loop.

*Why it works:* Intentional learning — having a stated goal before a session focuses attention and improves transfer. The review at the end activates metacognitive self-assessment.

*When it activates:* Beginning and end of each session. Optional at first, default later.

*Implementation:* Pre-session prompt: "What do you want to understand by the end of this session?" Post-session prompt: "Did you get there? What's still unclear?" Responses stored and used to shape next session's opening.

*Metric:* Goal achievement rate (self-reported). Correlation with return rate.

*Status:* Planned — Phase 3.

---

### TIER 2 — High Value. Add One at a Time.

---

**Socratic Pressure**

*What it does:* Before an answer is accepted as correct, the system challenges it. "Why does that work?" "What would happen if X changed?" "Can you think of a case where this breaks?" The learner must defend their answer.

*Orbit stages:* 5 (Build) and 6 (Teach). Not earlier.

*Metric:* Defense success rate. Concept retention 7 days after Socratic sessions vs. standard.

*Status:* Planned — Phase 3.

---

**Shrink It**

*What it does:* The learner must explain a complex concept in exactly one sentence. Not a teaching exercise — a compression exercise. Forces identification of the essential idea.

*Different from Feynman:* Feynman is "teach it fully." Shrink It is "what is the core?" Both are needed.

*Orbit stages:* 4 (Apply) and 5 (Build).

*Status:* Planned — Phase 4.

---

**Error Journal**

*What it does:* Every wrong answer is logged and classified (concept gap / application error / careless / trap). The learner can view their error breakdown. The system uses it to shape future sessions.

*Why it matters especially in competitive track:* JEE/GATE failures are rarely random. Most learners have a dominant error pattern. Making it visible is the first step to changing it.

*Orbit stages:* All stages (runs in background always).

*Metric:* Error type distribution shift over time (careless errors decreasing = good signal).

*Status:* Planned — Phase 2 (competitive track).

---

**Echo Chamber (Vygotsky Construct)**

*What it does:* The learner teaches a simulated peer. The peer asks naive questions. The learner must respond. If the explanation is insufficient, the peer says so.

*Why it works:* Social learning theory — explaining to someone at a lower level of understanding forces the clearest possible encoding. The simulated peer can be LLM-powered.

*Orbit stages:* 6 (Teach). Only at this stage.

*Status:* Planned — Phase 4. Requires LLM integration.

---

### TIER 3 — Interesting. Not Now.

These constructs are real, have pedagogical grounding, and belong in the product eventually. They are parked here so they are not lost.

| Construct | What it is | When |
|-----------|-----------|------|
| **Anamnesis** (Plato) | System guides learner to discover the answer themselves through questions, never stating it directly | Phase 5+ |
| **Interview Room** (CS-specific) | Simulate a technical interview. Learner must code under pressure and explain while coding. | Phase 4, CS subject only |
| **Thought Experiment** (Physics) | Present a scenario with no numbers. Learner must reason qualitatively about what would happen. | Phase 4, Physics only |
| **Broken Machine** (CS) | Show code that is wrong. Learner must find the bug and explain why it's a bug. | Phase 2, CS |
| **Two Paths** | Two different solutions to the same problem. Learner must explain why both work and which is better. | Phase 4 |
| **Knowledge Gravity** | Concepts pull related concepts — learner sees the web of connections and must explain at least 3. | Phase 5 |
| **Live Trace** | Step through an algorithm execution live. Learner predicts each step before it's revealed. | Phase 3, CS + Math |

---

## Type B — Pedagogical Frameworks

These are not features. They are lenses used to design and route content and sessions.

---

**Bloom's Taxonomy**

*What it is:* Six cognitive levels: Remember → Understand → Apply → Analyze → Evaluate → Create.

*How the system uses it:* Every question is tagged with a Bloom level. Sessions can be routed to target a specific cognitive level. The session engine uses Bloom levels to ensure a learner progresses from lower to higher cognitive demand as orbit stage increases.

*The learner never sees:* "Bloom Level 4." They see: a harder, different kind of question.

---

**Spaced Repetition (Ebbinghaus Engine)**

*What it is:* SM-2 / FSRS algorithm. Mathematical model of memory decay and strengthening.

*How the system uses it:* Sets the due date for every concept in every learner's queue. Runs in background permanently.

*The learner sees:* "Due for review" in their X-Ray. Not the algorithm.

---

**Self-Determination Theory (SDT)**

*What it is:* Autonomy + Competence + Relatedness = intrinsic motivation.

*How the system uses it:* Motivation engine is modeled on SDT dimensions. Competence = p_known. Autonomy = learner choice signals. Relatedness = social layer (Phase 4+).

*The learner sees:* Adaptive difficulty. Control over their learning path. Not "SDT."

---

**Zone of Proximal Development (Vygotsky)**

*What it is:* Optimal learning happens just above current capability. The ZPD is the band where challenge is real but success is still achievable.

*How the system uses it:* Question difficulty selection targets the ZPD — questions that are hard enough to require effort but not so hard that they produce only failure.

*The learner sees:* Questions that feel hard but possible. Not "ZPD."

---

**Error Typology Framework**

*What it is:* Four-type classification of wrong answers: concept gap / application error / careless mistake / trap answer.

*How the system uses it:* Every wrong answer is classified. The intervention is determined by the type. The Error Journal surfaces patterns.

*The learner sees:* The Error Journal. Not the classification framework.

---

## Construct Tracking

Every construct has a status. This table is the master tracking record.

| Construct | Type | Status | Phase | Primary Metric |
|-----------|------|--------|-------|----------------|
| Learning Orbit (frame) | Frame | Planned | 1 | Concept orbit stage distribution |
| Feynman Loop | Proper | Planned | 1 | Re-attempt success rate |
| Repair Crew | Proper | Partial | 1 | Recovery rate after wall |
| X-Ray Mode | Proper | Planned | 1 | Usage frequency + outcome correlation |
| Ebbinghaus Engine | Proper (SM-2) | Live | 1 | Retention at review |
| Tapas Mode | Proper | Planned | 2 | Learning velocity change |
| Error Journal | Proper | Planned | 2 | Error type shift over time |
| Blueprint Mode | Proper | Planned | 3 | Goal achievement rate |
| Socratic Pressure | Proper | Planned | 3 | 7-day retention post-session |
| Shrink It | Proper | Planned | 4 | — |
| Echo Chamber | Proper | Planned | 4 | — |
| Broken Machine | Proper | Planned | 2 | — |
| Live Trace | Proper | Planned | 3 | — |
| Anamnesis | Proper | Parked | 5+ | — |
| Interview Room | Proper | Parked | 4 | — |
| Bloom's Taxonomy | Framework | In use | 0 | Bloom level distribution in sessions |
| SDT Model | Framework | Partial | 1 | Motivation state distribution |
| Spaced Repetition | Framework | Live | 0 | Retention rate |
| ZPD | Framework | In use | 0 | Difficulty appropriateness |
| Error Typology | Framework | Planned | 2 | Classification accuracy |

**Rule:** A live construct with a flat or declining metric after 30 days gets paused and investigated before continuing.

---

## Open Questions on Constructs

- [ ] How does the system decide which Tier 1 construct to activate in a given moment? (When multiple constructs are valid for a given orbit stage, what picks?)
- [ ] Can constructs be combined? (Blueprint Mode + Tapas Mode in one session?) Or is one construct per session a cleaner product?
- [ ] How do we measure construct quality vs. just session outcome? (The construct might be great but the question was bad — how do we separate these signals?)
- [ ] Should learners be able to request a construct? ("I want a Feynman session on this concept today.") Or is it always engine-decided?
- [ ] For the competitive track, Tapas Mode and Error Journal are the most critical. Do we ship these before others in that track?

---

*Document: constructs | Version: 1.0 | Last updated: 2026-06-25*
