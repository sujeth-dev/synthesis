# Interfaces — Constructs as Interactive Experiences

*This document extends `03-constructs.md`. That document defines what constructs are and when they activate. This document defines what they feel like — the interactive layer, the reality grounding, the game format, and the personalization that makes each one specific to the learner and topic.*

---

## The Core Shift

A construct is not a mode toggle. It is a full interactive experience.

Old thinking: "Tapas Mode = hints off, timer on."
New thinking: "Tapas Mode = a specific environment with specific artifacts, a specific challenge format, and a specific feel — shaped by the topic it's running on."

The construct is the mold. The topic, the learner's interest, the subject context — these pour into the mold and create something that feels natural, real, and specific. Two learners doing Tapas Mode on two different concepts experience two completely different things. The rules are the same. The experience is not.

---

## What Every Interface Has

Every construct-as-interface must have all five of these:

| Element | What it means |
|---------|--------------|
| **Reality touch** | Grounded in a real-world context, not an abstract scenario |
| **Day-to-day nuance** | Connected to things the learner actually encounters or cares about |
| **Interactive** | The learner does something — annotates, builds, explains, traces, fixes — not just answers |
| **Construction** | Something is produced: an explanation, a fix, a solution path, a diagram, a code artifact |
| **Gamification** | The activity is engaging in itself — score, trajectory, pressure, character — not a badge system |

---

## How the System Selects Which Construct / Game / Interface

With N constructs, N game formats, and N interfaces, selection is a cascade of filters — not a single rule.

```
All possible constructs (N)
        ↓
Layer 1: Hard constraints      → eliminates ~80% immediately
        ↓
Layer 2: Learner state         → eliminates unsuitable options for this person right now
        ↓
Layer 3: Content fit           → eliminates formats whose assets don't exist for this topic
        ↓
Layer 4: History + variety     → weights remaining options, forces rotation
        ↓
Layer 5: Exploration           → 10–15% of selections try something new
        ↓
        1 construct selected
```

---

### Layer 1 — Hard Constraints

These are non-negotiable. A construct that fails any of these is eliminated before anything else is considered.

| Constraint | What it eliminates |
|---|---|
| **Orbit stage** | Tapas Mode impossible at Stage 1–2. Feynman Loop impossible at Stage 1. Socratic Pressure only at Stage 5–6. Construction tasks only at Stage 4+. |
| **Subject type** | Broken Machine = CS only. Thought Experiment = Physics only. Diagram annotation = Physics/Math only. Interview Room = CS only. Live Trace = CS/Math only. |
| **Motivation state** | If state = Struggling → no Tapas Mode, no Socratic Pressure, no high-challenge formats. Only support/repair constructs active. |
| **Track** | Competitive track forces timed formats for all practice. Knowledge track has no timer by default. Skill track requires real environment with verifiable output. |
| **Session time remaining** | Construction games need 15+ min. Quick reviews fit in 5. The engine checks session time before selecting. |

After Layer 1: from N options → typically 3–5 remain.

---

### Layer 2 — Learner State

Reads what is actually happening with this learner right now.

| Signal | Effect |
|---|---|
| Dominant error type = concept gap | Feynman Loop and Repair Crew weighted higher |
| Dominant error type = application error | Tapas Mode and Broken Machine weighted higher |
| Dominant error type = careless | Speed-pressure format, no hint, strict timer |
| Learner hasn't done Feynman this week | Feynman weight increases |
| Learner abandoned Tapas last 2 sessions | Tapas weight decreases temporarily |
| p_known just crossed 0.75 | Apply-stage construct triggered — new territory |
| p_known high but SM-2 review overdue | Review construct weighted, not new concept |

---

### Layer 3 — Content Fit

A construct needs assets to run. Before selecting, the engine checks whether the topic has what the construct requires.

| Construct needs | Check |
|---|---|
| Teaching simulation (Feynman) | Character template exists + concept has analogy variants authored |
| Annotatable diagram | Diagram asset exists for this specific concept |
| Code environment (Broken Machine) | Broken code problem exists for this concept |
| Gauntlet / challenge | PYQ or authored multi-part challenge exists |
| Thought Experiment | Qualitative scenario authored for this Physics concept |
| Two Paths | Two distinct solution methods authored for this problem |

If the asset doesn't exist → that construct is eliminated regardless of other factors. This is also a content production signal: if a construct is frequently eliminated because assets are missing, those assets should be prioritized.

---

### Layer 4 — History and Variety

- The same construct does not run twice in the same session.
- The same construct does not run more than 3 consecutive sessions on the same concept.
- The system weights toward constructs the learner has not used recently across all concepts.
- The system weights toward constructs that have historically produced better p_known improvement for this specific learner.

---

### Layer 5 — Exploration

10–15% of selections are deliberately random within the valid post-filter set. This is the discovery mechanism.

Reward signal: did p_known improve after this session? Did the learner complete the session? Did they return the next day?

Over time this becomes a bandit model: the system learns which construct × learner profile × topic type combination produces the best outcomes. Each learner's construct affinity profile (`construct_affinities` in the learner profile) is updated by this signal.

---

## Example Flows — All Three Tracks

---

### Track 0 — Deep Knowledge
**Integration (Mathematics) × Feynman Loop**

Orbit Stage 2 (Practice). Motivation: Active. Learner profile: cricket fan, example-first style.

**What loads:**

A classroom scene. A character — Arjun — sitting across from you, confused. Not a text box.

> *"Everyone keeps saying integration is 'area under the curve' but I don't get it. Why would I ever need area under a curve?"*

The learner has tools: a canvas to draw on, a pre-loaded velocity-time graph they can annotate, the ability to write or type freely.

The platform knows this learner understands cricket. A quiet prompt appears in the margin: *"Hint: think about run rate over time — how do you find total runs?"*

Arjun responds to what the learner actually writes. If the explanation is vague, he asks a follow-up:

> *"Okay but I still don't get how adding infinite slices gives the exact area."*

If the intuition is clear, he tries a problem himself. Gets it right. The session registers: explanation was complete.

**What is produced:** A Feynman score update. The concept moves Stage 2 → Stage 3. The explanation quality is logged. If Arjun needed 3 follow-up prompts, that signals the explanation had gaps — and those specific gaps become the next session's focus.

**Reality touch:** You're actually teaching someone. The failure mode is real: if your explanation doesn't land for Arjun, you know exactly where it broke.

---

### Track 1 — Competitive Exam
**Newton's Laws (JEE Physics) × Tapas Mode — "The Gauntlet"**

Orbit Stage 4. Motivation: Active. 4 months to JEE. Mechanics is the weakest section.

**What loads:**

Full-screen. A real JEE-style multi-part problem — not just text. An actual diagram: inclined plane, block, pulley, hanging mass. You can drag force arrows onto the diagram. Annotatable. Timer starts: 12 minutes.

> *Part A (conceptual): Will the system move? Which direction?*

You mark the direction on the diagram with arrows. Binary feedback: correct. No explanation. Timer keeps running.

> *Part B (numerical): What is the acceleration?*

You calculate and enter the number. Wrong. Timer keeps running. No second chance.

> *Part C: What is the tension in the rope?*

Timer hits zero.

**Debrief loads:**

Part B error classified: application error — Newton's second law set up correctly, but the geometry of the incline was wrong. Not a concept gap. You know F=ma. The specific failure was the gravity component along the plane.

The debrief shows the efficient path: 3 steps, target 4 minutes. You took 7 and got Part B wrong.

**Gauntlet record updates:** 24 problems, 67% success, avg 6.1 min per problem. Target: 85% at under 4 min by exam day.

Error journal adds: geometry errors in inclined plane problems. Next session queues a problem of the same type.

**Reality touch:** The annotatable diagram makes this physics, not arithmetic. The error classification is specific enough to act on — not just "wrong."

---

### Track 2 — Skill + Job
**Binary Search (Coding) × Broken Machine → Construction**

Orbit Stage 3. Learner is building toward a software job. p_known for binary search: 0.6 — knows it conceptually, can't apply reliably.

**What loads:**

A real mock product. A simple e-commerce site. A search bar. You search for a product. Wrong results. Some missing. One product appears when it shouldn't.

> *"The search feature is broken. Here's the codebase. Find and fix it."*

You're in a real in-browser code editor. The code is visible. A test suite panel shows 7 tests — 5 failing, shown in red.

You read the binary search implementation. Add a console log. Run the tests. Watch the outputs. Find it: `while (left < right)` — should be `while (left <= right)`. Off by one. Boundary condition.

You fix it. Run the tests. 7 green.

**What is produced:** The fixed code is verified automatically. It enters your portfolio tagged: *"Binary Search — boundary condition fix."* Skill rating updates: Binary Search 42 → 56. Opportunity matching refreshes: 3 new entry-level backend roles now appear as matches.

The debrief classifies this: boundary condition error — one of the three most common binary search failure patterns. Two more problems of this exact type are queued.

**Reality touch:** You worked in a real environment. The broken search feature is a real product experience. The fix has a test suite that proves it. It went into your portfolio automatically — not a certificate, a real artifact.

---

## The Personalization Layer

Constructs and game formats become genuinely personal through a **learner profile** that builds across every session. Some fields are set explicitly at onboarding. Most are inferred from behavior.

```
Learner Profile {
  interest_tags:         ["cricket", "finance", "cooking"]
  explanation_style:     "example_first" | "theory_first" | "problem_first"
  language_level:        1 → 5  (per subject — can differ across subjects)
  challenge_affinity:    "high" | "medium" | "low"
  hint_behavior:         "never_asks" | "sometimes" | "always_asks"
  construct_affinities:  { feynman: 0.8, tapas: 0.3, socratic: 0.6, ... }
  feedback_preference:   "immediate_detailed" | "minimal" | "self_discovered"
  session_depth:         "deep_single_concept" | "broad_multi_concept"
}
```

---

### Dimension 1 — Language

Not just difficulty level. The register, vocabulary, and abstraction level of every explanation.

| Level | Integration explained as... |
|---|---|
| 1 | "Adding up tiny pieces to find a total" |
| 3 | "Accumulating a quantity over a continuous domain using antiderivatives" |
| 5 | "The Riemann integral as the limit of a partition sum over the domain" |

The level is per-subject, not per-learner globally. A learner can be Level 4 in CS vocabulary and Level 1 in Chemistry vocabulary simultaneously.

**How the system infers level:**
- Time spent re-reading the same explanation
- Vocabulary used in Feynman Loop responses
- Whether they click through to "explain this differently" options
- Self-reported confusion signals

---

### Dimension 2 — Interest (The Analogy Layer)

The same concept explained through analogies that match what the learner actually relates to.

Content authors write 3–5 analogy variants per concept. The system selects based on interest_tags.

| Concept | Cricket | Finance | Cooking |
|---|---|---|---|
| Integration | Total runs from a run-rate graph | Revenue from price curve over time | Total ingredient dripped in over time |
| Normal distribution | Score distribution across players | Stock return distribution | Recipe variation around the ideal ratio |
| Recursion | Replay of a replay of a match review | Compound interest calling itself | A recipe that references its own sub-recipe |

**How interest_tags are built:**
- Explicit onboarding: 4-question setup at start ("what do you relate to?")
- Inferred: in Feynman responses, the learner used "like compound interest" → finance tag strengthens
- Explicit feedback: thumbs up/down on specific analogies ("this clicked" / "this didn't land")
- Over sessions: the system discovers which analogy variant produced faster p_known growth

---

### Dimension 3 — Explanation Style

Three types of learners:

| Style | What they need | How the session opens |
|---|---|---|
| **Theory-first** | Understand the concept before touching a problem | Definition → worked example → practice problem |
| **Example-first** | See a concrete case before the abstraction | Real example → what it demonstrates → formal definition |
| **Problem-first** | Try the problem, fail, then understand why | Practice attempt → failure → explanation of why |

**How the system detects your style:**
- In early sessions, it tries all three styles across different concepts at the same orbit stage
- It measures: time to first correct answer, p_known growth rate after the session, Feynman Loop success rate
- Whichever style produces the best outcome for this learner becomes the default
- This is invisible to the learner — the session just opens in the way that works for them

---

### Dimension 4 — Challenge Affinity

Some learners are energized by difficulty. Others need consistent success to stay motivated. Both are valid. The system should serve each correctly.

**How it's detected:**
- Do they opt into Tapas Mode when offered a choice?
- Do they abandon sessions with high error rates?
- Does next-day return rate correlate with hard sessions (positive = high affinity) or soft sessions (positive = low affinity)?
- Do they request hints early or persist through difficulty?

**What changes:**

| High challenge affinity | Low challenge affinity |
|---|---|
| Tapas Mode introduced earlier in the orbit | Tapas Mode introduced only at Stage 5+ |
| Harder difficulty questions selected | Questions kept at the ZPD lower bound |
| New concepts introduced faster | More reinforcement cycles before moving on |
| Less scaffolding offered | Repair Crew triggers earlier |

---

### Dimension 5 — Feedback Preference

Three types:

1. **Immediate detailed** — after every question: what was wrong, why, what to do next
2. **Minimal** — right/wrong signal only, let me continue
3. **Self-discovered** — don't even tell me wrong immediately, let me review my own work first

**How it's detected:** Do they click through to explanations? Do they rate explanations as useful? Do they close the debrief screen quickly? Do they explicitly ask to turn off feedback?

---

### Dimension 6 — Construct Affinity

The system tracks which constructs produce the best outcomes for each learner and weights selection accordingly.

`construct_affinities` is a per-learner dictionary that updates after every session:
- If Feynman Loop sessions consistently produce high p_known growth → feynman score increases
- If Tapas Mode sessions produce low completion and low next-day return → tapas score decreases for this learner

This is the bandit signal. Over time, the system discovers each learner's optimal construct mix — not globally, but per orbit stage and per error type.

---

## Everything Coming Together — One Learner, One Session

**Learner:** Rahul. Cricket fan, finance interest secondary. Example-first style. High challenge affinity. CS vocabulary Level 3, Math vocabulary Level 2. Concept: Integration. Orbit Stage 3 (Return). Motivation: Active.

**Session computation:**

1. Orbit Stage 3 → valid constructs: Ebbinghaus review, Feynman Loop, Tapas Mode (if challenge affinity high)
2. Motivation = Active → Tapas Mode is unlocked
3. Challenge affinity = high → Tapas Mode weighted up
4. Last session used Feynman Loop → Feynman deprioritized today
5. Content check: does a Tapas problem exist for integration? Yes — a real physics-of-motion scenario.
6. Language level 2 for Math → plain language, minimal notation
7. Interest = cricket → the scenario is framed in cricket terms (ball velocity over time → total distance)
8. Example-first style → brief example opens before the challenge problem loads

**What Rahul sees:**

The session opens with a cricket match clip framing. A velocity-time graph of a ball. One sentence: "The area under this graph is the total distance the ball traveled." Then the Tapas challenge loads — a real problem using the same graph format. No hints. Timer running. He's solving a real problem, in terms he relates to, at a level that challenges him.

This is the session the engine computed for Rahul at this moment. A different learner on the same concept gets a different scene, different analogy, different construct, different opening. Both are right.

---

## Content Requirements This Creates

Every construct-as-interface generates a content production requirement. The platform's content is not just questions. It is:

| Content type | Needed for |
|---|---|
| Concept explanations × 3–5 language levels | Language personalization |
| Analogy variants × 3–5 per concept | Interest personalization |
| Diagram assets per concept (Physics/Math) | Annotatable construct formats |
| Broken code problems per concept (CS) | Broken Machine construct |
| Character templates per construct type | Teaching simulation constructs |
| Multi-part challenge scenarios per concept | Gauntlet / Tapas format |
| Worked solution paths (efficient) | Debrief after Tapas |

This is what makes content production genuinely hard. It is not writing questions. It is building the material for a rich, adaptive experience. The quality of the interface is directly limited by the quality of the content backing it.

---

## When Interactivity Hurts: The ROI Gate

Interactivity is not always better. Every interactive construct has a cost — time consumed, cognitive mode switched, flow potentially broken. The benefit must clear a threshold or plain practice is the right choice.

**The core tension:**

```
DEPTH          ←————————————————→  COVERAGE
(understand it fully)              (cover more ground)

FLOW           ←————————————————→  INTERVENTION
(don't break momentum)             (break the rut before it deepens)

LONG TERM      ←————————————————→  SHORT TERM
(mastery)                          (pass the exam in 60 days)
```

The correct side of each axis depends on context. The interactivity ROI gate is Engine 6's check before any construct is selected.

---

### The Four Context Modifiers

**Modifier 1 — Exam Countdown**

| Time to exam | What is available |
|---|---|
| 180+ days | Full construct and environment library |
| 90 days | Heavy interactive constructs (teaching simulation, Broken Machine) weight down 40% |
| 45 days | Countdown Mode. Heavy constructs locked. Only Tapas, Repair Crew, Blueprint, Error Journal. |
| 30 days | Near-pure practice. Sub-5-minute constructs only. |
| 7 days | Mock test mode only. No constructs. |

The reasoning: at 45 days, what the exam demands is speed and accuracy on known material — not the ability to teach it to someone. The construct that was essential 3 months ago becomes a liability today.

**Modifier 2 — Flow Protection**

If the learner is in flow, the engine does not interrupt it.

Flow signals (all must be present):
- Correct answer rate > 70% over last 5 questions
- Time per question within learner's normal range
- No hint requests, no pauses, no abandonment signals

Rule: if flow signals are active → no construct activates mid-session. A construct can only appear at a natural breakpoint: end of a concept, start of a new one, or after a clear failure pattern emerges.

**Modifier 3 — Session Time Remaining**

| Time remaining | What is available |
|---|---|
| 20+ min | Full construct library (within other constraints) |
| 10–20 min | Medium constructs only (Tapas, Blueprint, Repair Crew) |
| < 10 min | No constructs. Rapid review only. |

Starting a Feynman teaching simulation with 8 minutes left is wrong — the learner is cut off mid-construct, which is worse than not starting it.

**Modifier 4 — Motivation State**

| State | Construct restriction |
|---|---|
| Active | Full library available |
| Struggling | No challenge constructs (no Tapas, no Socratic). Repair Crew or Blueprint only. |
| Bored | Increase challenge — Tapas Mode or a new concept. No review constructs. |
| Disengaged | No construct. Shortest possible session. Return the next day. |

---

### When to Use vs. When Not To

```
Is the learner in flow?
    YES → Do not interrupt. Wait for natural breakpoint.
    NO  ↓

Is exam in < 45 days?
    YES → Only Tapas, Repair, Blueprint, Error Journal
    NO  ↓

Is session time > 15 min remaining?
    NO  → No heavy constructs
    YES ↓

Is motivation state = Struggling?
    YES → No Tapas, no Socratic. Repair Crew or Blueprint only.
    NO  ↓

Does the topic have required content assets?
    NO  → Construct eliminated regardless
    YES ↓

Has this construct run recently for this concept?
    YES → Suppress it, pick next best
    NO  ↓

Does construct ROI clear the threshold for this learner?
    NO  → Plain practice
    YES → Construct activates
```

---

### The Underlying Principle

The construct is always in service of the session goal. The session goal changes by context.

- 180 days from exam: goal is deep understanding → constructs serve this directly
- 45 days from exam: goal is coverage and speed → depth constructs are off-goal
- Knowledge track, no deadline: goal is mastery → constructs are the primary mechanism, not an interruption

The construct is not good or bad. It is right or wrong for this session goal at this moment.

---

*Document: interfaces | Version: 1.1 | Last updated: 2026-06-26*
*Extends: `03-constructs.md` (what constructs are) and `06-users.md` (learner profile dimensions)*
*Informs: Engine 6 (02-engines.md), library production (09-library.md), content pipeline*
