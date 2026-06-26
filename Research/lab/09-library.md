# The Library — Environments, Characters, and Game Formats

*Engine 6 selects from this library. It can only select what has been built. The quality of every learner experience is directly limited by the quality of what is in this library.*

*This is the hardest part of the platform to build — not because of engineering complexity, but because of creative production complexity. A character that feels fake breaks everything. An environment that feels hollow produces no engagement. The bar is: a real learner sits inside it and forgets they are using an app.*

---

## What the Library Is

Three types of components, built independently, combined into constructs.

```
ENVIRONMENTS  ×  CHARACTERS  ×  GAME FORMATS
     ↓                ↓               ↓
     └──────────────────────────────────┘
                      ↓
               CONSTRUCT = combination of the three
                      ↓
               ENGINE 6 selects the right construct
```

Each component is built once and reused. The Confused Student character runs inside the Classroom environment for Feynman Loop, and inside a different context for Echo Chamber. The environment is the container. The character is the presence inside it. The game format is the rules.

---

## The Draft Space Principle

Every environment — without exception — has a separate draft area.

A draft space is a working area where the learner can think, try, sketch, and fail before committing to a final answer. It is not a scratch pad that disappears. It is part of the artifact.

Why this matters:
- Reduces anxiety of commitment — the learner can think by doing
- Produces richer data — the draft reveals the thinking process, not just the outcome
- Mirrors real work — no professional writes final code first, draws a final diagram first, or gives a final explanation without thinking first
- The draft IS learning — the act of roughing out is where understanding forms

What a draft space looks like per environment:

| Environment | Draft space form |
|---|---|
| Code Editor | A scratch buffer — run code freely before submitting to test suite |
| Diagram Canvas | A rough layer — sketch force arrows, try positions, then commit the final diagram |
| Classroom | Notes panel — rough your explanation before presenting to the character |
| Exam Room | Working space — show your working before entering the final answer |
| Plain Session | Optional scratchpad — space to write thinking before selecting an answer |

The draft is never graded. It is logged — the system learns from how the learner thinks, not just what they produce.

---

## 1. Environments

Each environment is a front-end module. Built once, used by multiple constructs. The environment defines what the learner can physically do — what tools are available, what they interact with, what the space feels like.

---

### Plain Session

**What it is:** Question, answer input, feedback. No special environment — the default state.

**Feel:** Clean, focused, no friction. The question is the whole screen.

**What you can do:** Answer the question. Access optional scratchpad. See feedback.

**Draft space:** Optional scratchpad panel — open/close on demand.

**Used by:** Standard practice, rapid review, Error Journal, spaced repetition sessions.

**Design requirement:** Deceptively simple. The Plain Session is not a fallback — it is a deliberately designed minimal space. Every pixel serves the question. No clutter, no distractions.

---

### Classroom

**What it is:** A space with a character present. The learner and the character face each other. There is a shared canvas between them that both can reference.

**Feel:** Warm, human, slightly informal. Like a study room or a tutoring session — not a lecture hall.

**What you can do:**
- Type or speak your explanation
- Draw on the shared canvas (diagrams, equations, quick sketches)
- See the character react in real time
- Respond to the character's follow-up questions

**Draft space:** A notes panel on the side — rough your explanation before presenting it. The character only sees what you present, not your draft.

**Used by:** Feynman Loop simulation, Echo Chamber, Socratic Pressure, Anamnesis.

**Design requirements:**
- The character must be visually present and responsive — not a floating avatar
- The shared canvas is always visible between learner and character
- The character's reactions are immediate and specific to what was said
- The space feels like it has two people in it

---

### Code Editor

**What it is:** A real in-browser development environment. Code editor, console, test runner panel, output panel.

**Feel:** Professional, focused, slightly high-stakes. Like a real IDE, not a toy.

**What you can do:**
- Write, edit, and run code
- See test results in real time (pass/fail per test case)
- Use the console to log and debug
- See error messages that are real, not simplified

**Draft space:** A scratch buffer — a second editor tab that doesn't connect to the test suite. Run anything here freely. No consequences.

**Used by:** Broken Machine, Interview Room, Live Trace, standard coding practice.

**Design requirements:**
- Syntax highlighting for the relevant language
- Real error messages — not "something went wrong"
- Test suite panel showing each test case, input, expected output, actual output
- The draft buffer must be clearly distinct from the submission buffer — learner should never accidentally submit a draft

---

### Diagram Canvas

**What it is:** An annotatable visual space. A pre-drawn diagram (physics setup, math graph, circuit, system architecture) that the learner can interact with.

**Feel:** Technical, spatial, precise. Like working on a physics diagram in an exam — but responsive.

**What you can do:**
- Drag and place force arrows, labels, annotations
- Draw directly on the canvas (free draw + shapes)
- See the diagram update when values change
- Zoom into specific areas

**Draft space:** A rough layer — your annotations start on a draft layer. You commit them to the final diagram when ready. The draft layer is visible but distinct (lighter color, dashed lines).

**Used by:** Tapas Mode (Physics/Math), Thought Experiment, Two Paths, Live Trace (for algorithm visualizations).

**Design requirements:**
- The base diagram must be well-designed — not a rough sketch
- Force arrows must snap to valid positions (on the object, along the surface)
- Annotations must be legible at any zoom level
- The draft layer must be visually obvious — the learner always knows what is draft vs. committed

---

### Exam Room

**What it is:** Full-screen, distraction-free, paper-accurate exam simulation. Timer always visible.

**Feel:** Tense, clean, institutional. The learner should feel like they are in an actual exam.

**What you can do:**
- Answer questions in exam format (MCQ, numerical, multi-select)
- Navigate between questions freely
- Mark questions for review (exam-standard behavior)
- See time remaining prominently

**Draft space:** A working space panel for numerical calculations and working — not connected to the answer input. Like rough work space on an exam paper.

**Used by:** Gauntlet, Mock Test, Countdown Mode sessions.

**Design requirements:**
- No visible navigation to other parts of the platform
- Timer is always visible but not aggressive (no color change until < 5 min)
- The question format must match the actual exam format exactly — font, layout, option labeling
- Working space panel must feel like actual paper — not a digital form

---

### Mock Product

**What it is:** A real-looking but intentionally broken application. A functional UI that has something wrong with it — a search that returns wrong results, a cart that miscalculates, a form that fails silently.

**Feel:** Real-world, professional. This looks like something you'd actually work on at a job.

**What you can do:**
- Use the product as a user would — click, search, interact
- Access the codebase through the Code Editor
- Run the test suite to see what's failing
- Deploy fixes and see them reflected in the product UI

**Draft space:** The scratch buffer in the Code Editor (same as above). Plus a "dev console" that shows live logs from the product.

**Used by:** Broken Machine (applied), Interview Room (senior version).

**Design requirements:**
- The product UI must look professionally designed — not like a homework project
- The broken behavior must be subtle, not obvious — real bugs are not announced
- The codebase must look like real code — real variable names, real structure, real comments
- The fix must visibly change the product — feedback loop must be immediate

---

## 2. Characters

A character is not a dialogue template. A character is a complete creative artifact.

**What a character requires before a single line of code is written:**

1. **Personality document** — who are they, what drives them, what frustrates them, what excites them, how they speak
2. **Visual design** — how they look, what they wear, their expression range (confused, thinking, understanding, challenged, frustrated, excited)
3. **Motion brief** — how they move, how they react physically, idle animations, reaction animations
4. **Dialogue guidelines** — their specific vocabulary, what they say when lost, when they get it, when they're challenging you, cultural grounding
5. **Cultural grounding** — for India-primary audience: they feel like someone you actually know, not a generic international stock character
6. **Emotional range** — they react differently to different levels of explanation quality, not just "confused" or "understanding" binary

The bar: a learner explains something to this character and feels the moment the character gets it. That moment — when the character shifts from confusion to understanding — is the product. If it doesn't feel real, it doesn't work.

---

### The Confused Student

**Who they are:** A Class 11 or 12 student preparing for entrance exams. Genuinely smart but genuinely lost on this specific concept. Not slow — just hasn't had it explained right yet. Slightly anxious, wants to understand, not just pass.

**Name:** To be decided per subject/context. Default: Arjun.

**How they speak:** Casual, conversational, sometimes uses Hindi phrases naturally. Asks "but why?" a lot. When they get something, they say "ohh okay okay" before asking the follow-up that tests if they really got it.

**Expression range:**
- Confused: leaning forward, slight frown, tilted head
- Thinking: looking slightly to the side, hand near chin
- Getting it: eyes widen slightly, slight forward movement
- Still confused after explanation: polite but obviously lost, "haan but..."
- Fully understanding: relaxed, slightly leaning back, "okay I think I get it now"

**Reactions to explanation quality:**
- Vague explanation → "okay but I still don't get the *why* part"
- Analogy that doesn't land → "I don't really follow that example, can you try differently?"
- Correct but over-complicated → "wait, can you say that in simpler words?"
- Clear and complete → tries a problem himself, gets it right or wrong, reports back

**Cultural grounding:** Feels like the smart student from your batch who sits next to you in coaching class. Not a character from a Western edtech product.

**Used by:** Feynman Loop simulation, Echo Chamber.

---

### The Skeptic

**Who they are:** A peer at exactly your level. Smart, sharp, doesn't accept things at face value. Not hostile — genuinely challenges because they want the right answer, not just your answer.

**How they speak:** Direct. "Why does that work?" "What if the conditions change?" "Can you give me a case where this breaks?" Never says "wrong" — says "I'm not convinced."

**Expression range:**
- Neutral: arms crossed, thinking expression — starting position
- Challenging: leaning forward, engaged
- Partially convinced: "okay, that makes sense for this case, but..."
- Convinced: "alright, I'll accept that" — gives it, doesn't gush

**Used by:** Socratic Pressure.

---

### The Interviewer

**Who they are:** A senior engineer or subject matter expert conducting a technical assessment. Professional, fair, evaluates on thinking process not just correctness. Has seen a thousand candidates and can tell immediately when someone is bluffing vs. genuinely thinking.

**How they speak:** Formal but not cold. Asks follow-up questions that probe depth. "Walk me through your thinking." "What's the time complexity?" "How would you handle edge case X?"

**Used by:** Interview Room.

---

### The Mentor

**Who they are:** Someone who knows the answer but will not give it. Asks questions that make you find it yourself. Patient, never frustrated, never condescending.

**How they speak:** Always in questions. "What do you think happens if...?" "What does this remind you of?" "You're close — what are you missing?"

**Used by:** Anamnesis, guided Repair Crew.

---

## 3. Game Formats

The rules, structure, and pressure of the activity. The game format defines what the learner is trying to do and how they know if they succeeded.

---

### The Gauntlet

**Rules:** Multi-part problem. Timer running from start. Each part answered in sequence. Binary feedback (right/wrong) after each part — no explanation until all parts complete. Full debrief at the end.

**Pressure:** The timer is the primary pressure. Knowing you cannot go back to Part A after moving to Part B is the secondary pressure.

**Win condition:** Correct answers within the target time.

**Debrief:** Error type per part, efficient solution path, time comparison (your time vs. target), Gauntlet record update.

**Used by:** Tapas Mode, Mock Test, Countdown Mode.

---

### Teaching Simulation

**Rules:** You explain a concept to the character. The character responds to what you actually say. Follow-up questions are generated from gaps in your explanation. The session ends when the character successfully solves a problem using what you taught them.

**Pressure:** You cannot move on until the character demonstrates understanding. The pressure is intellectual, not time-based.

**Win condition:** The character solves a problem correctly, demonstrating that your explanation was complete.

**Debrief:** Which parts of your explanation were complete, which had gaps, what the character needed to hear that you didn't say.

**Used by:** Feynman Loop simulation, Echo Chamber, Socratic Pressure.

---

### Debug the Machine

**Rules:** A broken system is in front of you. No instructions on what is broken. You must find it and fix it. The test suite is the only feedback mechanism.

**Pressure:** No hints. No error description. The only information is what the failing tests reveal.

**Win condition:** All tests pass.

**Debrief:** The specific class of error, how common it is, which test revealed it, the fix annotated with explanation.

**Used by:** Broken Machine.

---

### Two Paths

**Rules:** Two solutions to the same problem are shown. Both correct. You must explain why both work and which is better, and why.

**Pressure:** No pressure — this is a reflection format, not a time-pressured one.

**Win condition:** A defensible argument for one path with specific reasoning (not preference).

**Used by:** Two Paths construct.

---

### Live Trace

**Rules:** An algorithm is executing step by step. Before each step is revealed, you predict the next state. The trace pauses after your prediction and shows whether you were right.

**Pressure:** The pause. The moment of commitment before the reveal.

**Win condition:** Correct predictions across all steps. Partial credit for identifying which steps you got wrong and why.

**Used by:** Live Trace construct.

---

### Compression

**Rules:** Explain this concept in exactly one sentence. Not a summary — the essential idea only. Word limit enforced.

**Pressure:** The constraint itself. Every word has to earn its place.

**Win condition:** A sentence that captures the core idea without losing it.

**Used by:** Shrink It construct, quick Feynman check.

---

## How They Combine — The Full Matrix

| Construct | Environment | Character | Game Format |
|---|---|---|---|
| Feynman Loop (basic) | Plain Session | None | Compression |
| Feynman Loop (simulation) | Classroom | Confused Student | Teaching Simulation |
| Tapas Mode (Math/Physics) | Diagram Canvas | None | Gauntlet |
| Tapas Mode (CS) | Code Editor | None | Gauntlet |
| Broken Machine | Code Editor / Mock Product | None | Debug the Machine |
| Socratic Pressure | Classroom | Skeptic | Teaching Simulation |
| Echo Chamber | Classroom | Confused Student | Teaching Simulation |
| Interview Room | Code Editor | Interviewer | Gauntlet |
| Live Trace | Code Editor / Diagram Canvas | None | Live Trace |
| Shrink It | Plain Session | None | Compression |
| Thought Experiment | Diagram Canvas | None | Thought Experiment |
| Two Paths | Diagram Canvas / Plain | None | Two Paths |
| Anamnesis | Classroom | Mentor | Teaching Simulation |
| Standard Practice | Plain Session | None | — |
| Mock Test | Exam Room | None | Gauntlet |

---

## Build Sequence — The Right Order

**The rule:** One thing done completely right before moving to the next. Never build a character quickly. Never build an environment as a placeholder. A placeholder environment becomes the permanent environment — it is never rebuilt.

```
Phase 1 — Foundation (one of everything)

  Environment:   Plain Session (fully designed)
                 Classroom (fully designed — this is the hardest one)
  Character:     Confused Student (fully designed — this is the hardest one)
  Game format:   Compression (simple)
                 Teaching Simulation (for Classroom)
                 Gauntlet (basic, no diagram)

  Enables:
    → Feynman Loop (basic + simulation)
    → Tapas Mode (text-based only)
    → Standard Practice
    → Repair Crew (rule-based, no environment)

Phase 2 — Technical Environments

  Environment:   Code Editor
                 Exam Room
  Character:     Skeptic
  Game format:   Debug the Machine
                 Gauntlet (full, with timer and debrief)

  Enables:
    → Broken Machine
    → Socratic Pressure
    → Tapas Mode (CS)
    → Mock Test
    → Interview Room (basic)

Phase 3 — Visual and Advanced

  Environment:   Diagram Canvas
                 Mock Product
  Character:     Interviewer
                 Mentor
  Game format:   Live Trace
                 Two Paths
                 Thought Experiment

  Enables:
    → Tapas Mode (Physics with diagram)
    → Thought Experiment
    → Live Trace
    → Interview Room (full)
    → Anamnesis
    → Two Paths
```

---

## The Creative Production Challenge

Building this library is the hardest work on the platform. Not the hardest engineering — the hardest production.

Engineering estimates are predictable. Creative production is not. A character that doesn't feel real must be redesigned — there is no shortcut. An environment that feels hollow must be rebuilt from the design stage, not the code stage.

**What is required that is not engineering:**

| What | Who does it |
|---|---|
| Character concept and personality | Writer + designer |
| Character visual design and expression sheets | Concept artist |
| Character motion and animation | Motion designer / animator |
| Character dialogue — subject-specific reaction scripts | Dialogue writer |
| Environment visual design and mood | UX designer + visual designer |
| Environment interaction design | Product designer |
| Game format design — rules, pressure, debrief structure | Learning designer |
| Artifact design — diagrams, code presentation, graph rendering | Visual designer + engineer |

**The scale:** One character done completely — designed, animated, written, tested with real users — is months of work. This is not an estimate to be optimistic about.

**The approach:**
1. Choose the first character before choosing the first construct to build
2. Design the character completely before building it
3. Test the character with real users before building a second one
4. Never parallelize character builds in the early phases — quality requires focus

---

## What Engine 6 Actually Selects From

When Engine 6 makes a selection, it is selecting a specific combination from this library:

```
Engine 6 output = {
  environment: one of the environments above,
  character: one character or null,
  game_format: one game format,
  draft_space: true (always),
  reason: why this combination was selected
}
```

Engine 6 cannot select what does not exist. If the Classroom environment is not built, it cannot select Feynman Loop simulation. If the Confused Student character is not designed, it cannot activate any teaching simulation.

**The library is the ceiling.** Engine 6's intelligence is bounded by what is in it.

Build the library with more care than any other part of the platform.

---

*Document: library | Version: 1.0 | Last updated: 2026-06-26*
*Directly feeds: Engine 6 (02-engines.md), Constructs (03-constructs.md), Interfaces (08-interfaces.md)*
*Creative production is the primary constraint, not engineering. Plan accordingly.*
