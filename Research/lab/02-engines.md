# Engines — Technical Decisions, Alternatives, and Upgrade Paths

---

## What This Document Is

For every core engine in the platform:
- What it is and what problem it solves
- Every alternative that exists
- Why we chose what we chose
- When and why we upgrade
- The metrics that tell us if it's working
- Open questions that need to be answered over time

An engine is a system that runs continuously, adapts to data, and drives behavior. Not a feature — a decision machine.

---

## Engine 1 — Knowledge Tracing

**Problem it solves:** At any moment, for any concept, what is the probability that this specific learner knows it?

This is the core signal everything else depends on. Get this wrong and the session selector, the spaced repetition, the content routing — all of it breaks.

---

### Alternatives

| Engine | How It Works | Best For | Weakness |
|--------|-------------|----------|----------|
| **BKT** (Bayesian Knowledge Tracing) | Hidden Markov Model. Binary per-concept knowledge state (known / unknown). Updates on each answer. | Cold start. Small data. Interpretable. | Binary state only. Treats concepts as independent. Can't model cross-concept learning. |
| **IRT** (Item Response Theory) | Models student ability + item difficulty as continuous values on the same scale. | Question calibration. Understanding item difficulty. | Assumes static ability — doesn't capture learning over time. Not adaptive in real sense. |
| **PFA** (Performance Factor Analysis) | Extends IRT with learning and forgetting terms. Linear regression on interaction history. | Practice effects over time. | Still linear. Misses complex concept relationships. |
| **DKT** (Deep Knowledge Tracing) | LSTM neural network. Reads full interaction sequence. Outputs knowledge state across all concepts simultaneously. | Data-rich environment. Cross-concept learning. Maximum accuracy. | Needs 100+ interactions per student. Black box. Hard to debug. Requires GPU for training. |
| **DKVMN** (Dynamic Key-Value Memory Network) | Memory-augmented neural net. Explicit memory slots per concept. | Bridges interpretability and accuracy. | Very data-hungry. Extremely complex to implement. |
| **Elo / Glicko** | Rating system adapted from chess. Adjusts concept-level rating based on right/wrong. | Simple alternative when interactions are sparse. | No time dimension. Doesn't model learning trajectory. |

---

### Decision: BKT now

**Why BKT:**
Cold start problem is the dominant constraint at launch. A new student has zero history. BKT produces a useful signal from interaction 1. DKT produces noise until there is substantial history (typically 100+ interactions per learner). For a platform starting from zero users with zero data, BKT is the only practical choice.

BKT is also interpretable. We can look at any learner's state and understand exactly why the system thinks what it thinks. That is essential for debugging and for the learner-facing X-Ray feature.

**Why not IRT:** It doesn't capture learning. It's good for calibrating question difficulty (we will use IRT for that), not for tracking individual knowledge trajectories.

**Why not DKT now:** We don't have the data. DKT with insufficient data produces worse predictions than BKT. We will revisit this.

---

### Upgrade to DKT: when and why

Trigger: 50,000+ learning sessions in the database, with at least 10,000 learners having 100+ sessions each.

At that point, the data exists to train DKT properly. DKT's advantage is cross-concept learning — it knows that a learner who struggles with integration probably has a gap in differentiation, without being explicitly told. BKT cannot do this.

The upgrade is not a replacement. BKT runs as fallback for new users. DKT activates when enough history exists.

**Metrics to track:**
- AUC-ROC on held-out interactions (does the model correctly predict whether the next answer will be correct?)
- Calibration: if model says p_known = 0.8, does the learner get ~80% correct on subsequent items?
- Learning curve fit: does p_known increase at a realistic rate as practice accumulates?

---

### Open Questions for Knowledge Tracing

- [ ] How do we handle concept decay? (BKT assumes binary state, no forgetting — SM-2 compensates but the models aren't integrated)
- [ ] How do we model partial knowledge? (A student can partially understand integration — binary BKT misses this)
- [ ] When exactly do we trigger DKT transition? What's the exact data threshold test?
- [ ] Should we use IRT in parallel now purely for question difficulty calibration?
- [ ] How do we handle new concepts added to the graph — cold start within BKT for new nodes?

---

## Engine 2 — Spaced Repetition

**Problem it solves:** When does a concept come back for review? Too early = waste of session time. Too late = forgotten and must be relearned.

This engine governs the timing of every review. The goal is 85–90% recall at review time — the Ebbinghaus-optimal window where the effort of recall is high (reinforcing the memory trace) but the learner still succeeds.

---

### Alternatives

| Algorithm | How It Works | Strengths | Weakness |
|-----------|-------------|-----------|---------|
| **SM-2** (SuperMemo 2) | Interval × ease_factor. Ease adjusts based on recall quality (0–5 scale). | Battle-tested (Anki). Simple. Predictable. Works without training. | Ease factor drifts down (penalizes hard cards permanently). No stability model. Fixed multiplier doesn't fit individual memory profiles. |
| **FSRS** (Free Spaced Repetition Scheduler) | DSR model: Difficulty, Stability, Retrievability. Memory is a continuous decay function. Calibrates per learner. | More accurate. Accounts for forgetting curve shape. Per-learner calibration. | More complex to implement. Needs some history to fit parameters. |
| **Leitner System** | Box-based. Wrong answer → box 1. Correct → next box. Fixed intervals per box. | Very simple. Intuitive UI. | Not personalized. Fixed intervals ignore individual differences. Coarse. |
| **HLR** (Half-Life Regression, Duolingo) | Regresses on features to predict each item's half-life. Trains model per user. | Adapts to individual. Accounts for multiple features beyond just recall. | Needs substantial history to fit. Complex to debug. |
| **Fixed interval** | Same interval for all concepts, all learners. | Simple. | Wrong. No basis in memory science. |

---

### Decision: SM-2 now → FSRS next

**Why SM-2 now:**
SM-2 is proven. The platform needs to function before it needs to be optimally calibrated. SM-2 works from day one with zero data. It is the right choice for launch.

**Why FSRS next:**
The DSR model is a more accurate representation of how human memory actually works. Stability (how long a memory lasts), Retrievability (probability of recall at a given moment), and Difficulty (how hard this concept is to retain) are the three real variables. SM-2 approximates this but with a simpler model that has known failure modes (ease factor drift being the main one).

The FSRS upgrade is non-breaking — same interface, same inputs, better output. It can be introduced as a parallel system and switched once validated.

**Trigger for FSRS upgrade:**
When enough review data exists to fit FSRS parameters. Approximately 5,000+ review events. This can happen in parallel with BKT, independently.

**Metrics to track:**
- Retention rate at review: % recalled correctly at scheduled review time
- Over-review rate: % of reviews that happen before they're needed (waste)
- Under-review rate: % of concepts forgotten before scheduled review (failure)
- Target: 85–90% retention at review

---

### Open Questions for Spaced Repetition

- [ ] How does the Ebbinghaus Engine interact with the BKT p_known signal? Currently they're separate — they should inform each other.
- [ ] How do we handle "first review" interval? SM-2 default is 1 day. Should this be adaptive based on concept difficulty?
- [ ] In the competitive exam track, should review intervals be compressed as exam date approaches? (Countdown mode implies faster cycling.)
- [ ] How do we schedule reviews when a concept is interconnected with many others? (Learning calculus integration affects 12 other downstream concepts — does reviewing integration count as partial review for those?)
- [ ] FSRS needs a retrievability target (default 90%). Should this be per-learner? Per-exam-proximity?

---

## Engine 3 — Session Task Selection

**Problem it solves:** Given everything we know about this learner right now, what is the exact next task in this session?

The session engine is the interface between the learner and all other engines. It reads the knowledge state, the review queue, the motivation state, the session context, and decides: do we do a new concept, a review, a repair, a challenge, a construct-driven activity?

---

### Alternatives

| Approach | How It Works | Strengths | Weakness |
|---------|-------------|-----------|---------|
| **Rule-based priority** | Fixed priority order: urgent reviews first → repair if stuck → new concept → reinforcement | Predictable. Debuggable. Works without data. Fully controllable. | Rigid. Can't discover better sequences. Cannot optimize for long-term outcomes. |
| **Multi-armed Bandit** | Treat each task type as an "arm." Explore different sequences. Exploit what produces better outcomes (higher retention, higher return rate). | Self-optimizing. Handles exploration/exploitation. | Delayed reward problem — does today's task selection cause better outcomes next week? Hard to attribute causally. |
| **Curriculum Learning** | Pre-defined optimal sequence from concept graph topology. | Works well for strongly ordered domains (math prerequisites are clear). | Doesn't adapt to individual. Assumes everyone follows same path. |
| **Reinforcement Learning** | Agent learns optimal task selection policy by maximizing long-term learning outcome. | Theoretically optimal. | Requires massive data. Reward is weeks-delayed. Very hard to trust and debug. |

---

### Decision: Rule-based now → Bandit later

**Why rule-based now:**
Zero data means no algorithm can learn anything. The rule-based engine is the data generator. It runs sessions, produces outcomes, builds the history that future, smarter engines will need. It is also fully debuggable — when something goes wrong, we can trace exactly why the engine made the decision it made.

**Why Bandit next:**
The bandit doesn't need to solve the full problem. It just needs to discover which of the ~8 task types (new concept, review, repair, challenge, Feynman loop, Tapas mode, mock test, etc.) to prioritize for which learner in which state. That is a tractable bandit problem. The reward signal can be: did the learner return the next day? Did retention improve at next review?

**Trigger for Bandit:**
When we have 20,000+ sessions with measurable outcomes (next-day return, 7-day retention). Probably late Phase 3 or Phase 4.

**Metrics:**
- Session completion rate (do learners finish sessions?)
- Next-day return rate (do they come back?)
- 7-day retention on items reviewed in session
- Learning velocity (rate of p_known increase across concepts)

---

### Current Priority Logic (Rule-Based)

```
Priority 1: Urgent reviews (SM-2 due date passed or p_known dropping)
Priority 2: Repair (stuck learner — prerequisite backtrack triggered)
Priority 3: New concept introduction (next in learning orbit)
Priority 4: Reinforcement (strengthen shaky known concepts)
Priority 5: Challenge (Tapas mode — Apply or Build stage concepts)
Priority 6: Construct activity (Feynman loop, Blueprint mode, etc.)
```

Extensions needed for competitive track:
- Timed mode flag (every task gets a countdown timer)
- Exam-mode flag (all questions in exam format, no hints)
- Countdown-mode flag (activates as exam date < 30 days — shifts to breadth coverage + rapid review)
- Error-focus flag (session drills dominant error type for this learner)

---

### Open Questions for Session Selection

- [ ] How long should a default session be? Currently undefined. Should this be learner-controlled or engine-decided?
- [ ] How do we handle session abandonment? (Learner stops mid-session — does that count as negative signal? Do we resume next time?)
- [ ] How do we balance review debt vs. new learning? If a learner has 40 items due for review, do we do all of them before introducing anything new?
- [ ] Should sessions have a "theme" (all one concept today) or be mixed?
- [ ] How does the session engine interact with the motivation engine? (If motivation state = struggling, does the session become easier / shorter / more supportive?)

---

## Engine 4 — Motivation and Behavioral State

**Problem it solves:** A learner who knows the right answer but gives up doesn't learn anything. The engine must model the learner's psychological state and adapt accordingly.

This is the least algorithmic and most human engine. It cannot be purely data-driven — it must be grounded in motivation psychology.

---

### Alternatives

| Model | Foundation | What it tracks | Limitation |
|-------|-----------|---------------|-----------|
| **4-state FSM** | Behavioral observation | Active / Struggling / Bored / Disengaged | Too coarse. No nuance within states. |
| **SDT** (Self-Determination Theory) | Psychological research | Autonomy · Competence · Relatedness separately | Harder to measure autonomy and relatedness from interaction data. |
| **Flow Theory** | Csikszentmihalyi | Challenge-skill balance. Zone of proximal development. | Flow is moment-to-moment — hard to measure from data signals. |
| **Behavioral Economics** | Loss aversion, streaks, social proof | Engagement levers | Can be manipulative. Doesn't inherently improve learning. |
| **Expectancy-Value Theory** | Academic motivation research | Expectancy of success × perceived value of task | Complex to operationalize. |

---

### Decision: Extend 4-state FSM toward SDT dimensions

**Why not pure SDT now:**
Autonomy and relatedness are hard to measure from interaction data. Competence is measurable (p_known). The other two require richer signals (what the learner says, social layer, choices they make). We don't have those signals yet.

**The extension path:**
- Competence = BKT p_known signal (already tracked)
- Autonomy = give learner choices about what to work on, track when they override the recommendation
- Relatedness = social/cohort layer (Phase 4+)

The 4-state FSM maps onto this:
- Active → Competence is growing
- Struggling → Competence signal dropping, need intervention
- Bored → Competence too high relative to challenge (Flow theory: skill > challenge)
- Disengaged → Multiple signals failing simultaneously

**Metrics:**
- Session abandonment rate (by state)
- Return rate (by state)
- Time-in-state distribution (how long do learners spend in each state?)

---

### Open Questions for Motivation Engine

- [ ] What behavioral signals tell us which state a learner is in? (Time per question? Error rate? Hint requests? Skip frequency?)
- [ ] When learner is "Bored," do we automatically increase difficulty or do we ask?
- [ ] How do we model motivation decay across days (not within a session)?
- [ ] What interventions exist for each state? These need to be defined concretely.
- [ ] How does the motivation engine interact with TheDen constructs? (Tapas Mode is a high-challenge construct — should it only activate when motivation state = Active?)

---

## Engine 5 — Error Classification

**Problem it solves:** A wrong answer is not just a wrong answer. Why it was wrong determines what happens next.

This engine is especially critical for the Competitive Exam track but applies everywhere.

---

### The Four Error Types

| Type | What It Means | Intervention |
|------|--------------|-------------|
| **Concept gap** | Student doesn't know the underlying concept | Repair Crew — backtrack to prerequisite |
| **Application error** | Knows the concept but can't apply it to this problem type | More varied practice problems at same concept |
| **Careless mistake** | Knows it, could apply it, made execution error | Flag pattern. Don't re-teach. Monitor frequency. |
| **Trap answer** | Chose the distractor designed to catch common misconceptions | Targeted misconception correction |

---

### How Classification Works

Current state: unimplemented. The engine needs to be built.

Approach options:
1. **Rule-based tagging** — content authors tag each wrong answer with its error type at question creation time
2. **Pattern-based inference** — detect which wrong answer was chosen + performance on related concepts → infer error type
3. **ML classifier** — train on interaction history to classify error type automatically

Start with option 1 (author-tagged). It requires more content work but is immediately accurate. Add pattern inference in Phase 3.

**Metrics:**
- Error type distribution per learner (what's their dominant error pattern?)
- Error type distribution per concept (what's the most common failure mode for this concept?)
- Error reduction rate per type over time (is the intervention working?)

---

### Open Questions for Error Classification

- [ ] How do we handle questions where the error type is ambiguous?
- [ ] How do we track careless mistakes specifically? (If same mistake 3x in a row, it's not careless — it's a pattern)
- [ ] How does error type influence session selection? (High careless error rate = slow down, more careful execution problems?)
- [ ] For Competitive track: do we surface the learner's error breakdown dashboard? How granular?

---

*Document: engines | Version: 1.0 | Last updated: 2026-06-25*
