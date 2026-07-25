# Synaptic — Design Brief for Claude Design
*Hand this file directly to Claude Design. It has everything needed to generate the right screens.*
*References the Seven Worlds system by name — Claude Design already has those definitions.*

---

## What You Are Designing

**Product:** Synaptic — an adaptive learning platform. The engine decides what a learner should study today. The learner doesn't choose. The platform computes the session based on what they know, what they're forgetting, how much time they have, and how far they are from their goal.

**Primary user:** Arjun Sharma, 18, preparing for JEE Advanced 2027 (India's top engineering entrance exam). 321 days to exam. Studies Math. Wants to crack top 5%. Currently tracking top 12%.

**Three tracks, one engine:**
- Track 0 — Knowledge Playground: learn any subject, no deadline, user-built concept graph
- Track 1 — Competitive: crack a specific exam on a specific date (JEE, GATE, UPSC)
- Track 2 — Skill + Job: learn a skill, prove it with portfolio artifacts, get a job

**The feeling this design must produce:** A serious instrument. Not a learning app. Not gamified. The user opens this and feels the platform knows what it's doing. Calm, intelligent, precise. Like a tool built by people who take learning seriously. References: Linear, Vercel dashboard, Raycast.

---

## World Selection

**Base:** World 04 — Future Craft  
Apply the full World 04 identity: bg, accent (safety orange), Space Grotesk display, blueprint grid texture, technical rules.

**Borrow from World 07 — Modern Scholar:**
- Replace World 04's ink (#1c1a17) with World 07's deep forest green (#1f3a2e)
- Add World 07's gold (#9c7b3a) as a second accent — used specifically for mastery, achievement, and milestone states
- Use Cormorant Garamond 600 (from 07) for display headings, concept names, session titles, and feature text

**Borrow from World 01 — Editorial Intelligence:**
- Use Newsreader 300 (from 01, also the shared default body serif) for all reading text: question text, explanations, construct dialogue, body copy
- Apply the heavy top-border rule (from 01's editorial texture) on section headers

**Shared skeleton (always present):**
- Spline Sans Mono for all labels, index numbers, tags, eyebrows, metadata — uppercase, ~0.25em letter-spacing
- Section tags in the format: 01 / 07, In situ, etc. — Spline Sans Mono, all caps
- Thin rule lines between sections

**Result:** World 04 technical precision + World 07 classical depth + World 01 reading comfort. Blueprint grid underneath. Cormorant for what matters. Space Grotesk for what works. Newsreader for what you read.

---

## Orbit Stage System
*This is core to the product — it appears on almost every screen.*

Five stages of mastery, each with a color and meaning:

| Stage | Color | Meaning |
|-------|-------|---------|
| Unknown | warm grey #a8a49c | Never studied |
| Seen | orange #d96e34 (accent primary) | Encountered, not solidified |
| Practicing | amber #e8a84a | Actively learning |
| Confident | gold #9c7b3a (accent secondary) | Strong grasp |
| Mastered | forest green #2f5d3a | Fully internalized |

Orbit badges appear as: [colored dot 8px] + [stage name in Spline Sans Mono, uppercase, xs size].

---

## Demo Data (use this on all screens)

```
Learner:    Arjun Sharma, 18
Track:      Track 1 — Competitive (JEE Advanced 2027)
Exam:       321 days away
Subject:    Mathematics
Streak:     14 days

10 concepts on the map (use these for concept nodes):
  Functions Basics      — Mastered    (p=0.97)
  Limits                — Confident   (p=0.81)
  Continuity            — Confident   (p=0.78)
  Differentiation Rules — Practicing  (p=0.62)
  Chain Rule            — Practicing  (p=0.54)
  Integration Basics    — Seen        (p=0.38)   ← today's session focus
  Integration by Parts  — Unknown     (p=0.12)
  Definite Integrals    — Unknown     (p=0.08)
  Applications          — Unknown     (p=0.04)
  Differential Equations— Unknown     (p=0.02)

Today's session: "Review + First Look"
Reasoning shown: "Integration Basics is overdue. Chain Rule is ready to advance."
Estimated time: 34 min · 3 concepts
```

---

## What to Design — Priority Order

Design in this exact order. Do not skip ahead.

---

### PRIORITY 1 — Design These First
*These four screens contain every significant design decision. Everything else follows from them.*

---

**SCREEN 1: Dashboard**

Context: The first thing Arjun sees when he opens Synaptic. The platform has already decided what he's doing today — he didn't choose. This screen must make that feel powerful, not presumptuous.

Design this:
- Greeting: "Good morning, Arjun." — Cormorant Garamond display size, left-aligned
- Subline: "Wednesday, July 2 · JEE Advanced 2027" — Spline Sans Mono, muted
- Session card (the hero element — this is the CTA):
  - Top: track badge [T1] + session type label "Plain Session" — Spline Sans Mono
  - Title: "Review + First Look" — Cormorant Garamond heading
  - Reasoning line: "Integration Basics is overdue. Chain Rule is ready to advance." — Newsreader, muted, this is the engine showing its logic
  - Stats row: [3 concepts] [34 min] [Medium difficulty] — Space Grotesk numbers
  - CTA button: "Start today's session" — primary, accent orange
- Countdown block: "321 days to JEE Advanced" — large Space Grotesk number, label in Spline Sans Mono
- Pace indicator: "On track · Blueprint week 3 of 46" — small, muted
- Rank projection: "Current trajectory: Top 12%" — medium callout, with trending arrow
- Stats row below: [14 streak] [3 mastered] [2 due today] [21 days active]
- Mini concept map preview: thumbnail of 10-node map with orbit stage colors, "View full map →" link
- SM-2 queue: 3 rows showing upcoming reviews, each with orbit badge + concept name + "due tomorrow / in 3 days"

Key design decisions in this screen:
The session card must be the dominant element — the eye should go there first. The countdown block should feel like weight, not urgency. The reasoning line is the most important piece of copy — it must feel intelligent, not algorithmic.

---

**SCREEN 2: Concept Map**

Context: Arjun's full knowledge map for JEE Mathematics. He can see where he is, what he knows, what's locked, what's next. This is the spatial view of his mind.

Design this:
- Full canvas with blueprint grid texture as background
- 10 concept nodes, positioned in a logical spatial layout (left: foundational, right: advanced):
  - Functions → Limits → Continuity → Differentiation → Chain Rule → Integration Basics → Integration by Parts → Definite Integrals → Applications → Differential Equations
  - Each node: circle, color = orbit stage, size roughly equal (~40px)
  - Connecting lines (edges): thin 1px lines following prerequisite relationships
  - Cluster watermark labels behind node groups: "DIFFERENTIATION" / "INTEGRATION" — Cormorant Garamond, large, very muted (10% opacity ink)
- Hover state on Integration Basics node:
  - Node expands slightly, soft glow ring in node color
  - Label card appears: concept name (Cormorant) / orbit badge / p_known: 38% / Last: 2 days ago / Next: Tomorrow
- Right panel (concept detail for Integration Basics, panel slid in):
  - Heading: "Integration — Basics" — Cormorant Garamond
  - Orbit badge large: [Seen]
  - p_known bar: 38% fill, colored in Seen orange
  - "You've encountered this — it hasn't solidified yet." — Newsreader body
  - Prerequisites: Chain Rule ✓ (Confident)
  - Unlocks: Integration by Parts (locked), Definite Integrals (locked)
  - Stats: 12 questions · 58% accuracy · 3 sessions
  - CTA: "Practice this concept"
- Top toolbar: [Search concepts] [Filter by orbit stage — pill toggles] [Layout toggle]

Key design decisions in this screen:
The map must feel like a navigable space, not a flowchart. The cluster watermarks should orient without dominating. The orbit stage colors should be the primary visual signal — the eye should immediately read the knowledge state from color distribution alone.

---

**SCREEN 3: Session — Question States**

Context: Arjun is in the middle of today's session. This is the core interaction — everything else supports this moment.

Design these four states of the question block for the same question:

**Question:** "Which of the following represents the integral of f(x) = 2x with respect to x?"
Options: A. x² + C · B. 2x² + C · C. x + C · D. 2 + C

State A — Unanswered:
- Session header: [← Back] [Integration Basics · Seen badge] [Q 1 of 8] [Timer: 14:23]
- Progress bar: thin, accent orange, 0% filled
- Question number: "01" — Spline Sans Mono, label style, muted
- Question text: Newsreader 300, 18px, generous line-height — this must feel like reading, not UI
- Four options: each a card with option letter + text, clean border
- No submit button needed — selecting an option confirms

State B — Answered Correct (chose A):
- Option A highlighted in success state (forest green border + light green tint)
- Check icon on option A
- Border of question block shifts to success green
- Explanation slides in below: "The integral of 2x is x² + C..." — Newsreader italic, muted
- BKT bar appears below explanation: "Integration Basics: 38% → 44%" with animated fill
- "Next question →" appears bottom right

State C — Answered Incorrect (chose B):
- Option B highlighted in error state (red border + light red tint)
- Option A highlighted as correct (green tint, no drama)
- Border of question block shifts to error red
- Explanation slides in: same content, but "Not quite —" prefix
- BKT bar: "38% → 34%" — bar decreases slightly
- Error type label: "Conceptual — the division step in integration" — Spline Sans Mono, small

State D — Revealed (skipped):
- All options shown, correct highlighted (A, green)
- "Skipped" label in Spline Sans Mono, muted, top right of block
- Explanation shown immediately

Key design decisions in this screen:
Question text in Newsreader must feel like reading a textbook, not clicking a quiz. Correct/incorrect feedback must be clear but not celebratory (no green confetti, no red X slam). The BKT bar update is information — it should feel like the engine just told you something true about your knowledge.

---

**SCREEN 4: Feynman Loop — Teaching Canvas + Construct Summary**

Context: The engine decided that Integration Basics needs depth, not more MCQs. It triggers a Feynman Loop — Arjun must explain the concept to Rohan (The Confused Student). This is the highest-stakes design moment in the product. If this looks good, the construct experience is validated.

Design two states:

**State A — Teaching Canvas (Step 3 of the construct):**
- Construct intro bar at top: "Feynman Loop · Integration Basics" — Spline Sans Mono label
- Left side (30% width): Character frame
  - Rohan illustration: circular crop, 100px, soft border in Seen orange
  - Expression: Confused
  - Dialogue bubble to the right of character: "I've been stuck on integration for an hour. What even is it?"
  - Character name below: "Rohan" — Spline Sans Mono, small
- Right side (70% width): Teaching canvas
  - Prompt: "Explain integration to Rohan. Use any words, any example." — Newsreader, slightly muted
  - Large open textarea: Newsreader 300 for typing, generous padding, minimal border
  - Word count: "0 / 50 minimum" — bottom right, Spline Sans Mono, muted
  - Submit button: "Rohan is ready to hear this" — secondary style, not primary
- Step indicator at top: 3 of 7 — Spline Sans Mono

**State B — Construct Summary (Step 7, final):**
- Rohan small at top-left in Satisfied expression (he got it)
- Section header with heavy top rule: "Feynman Loop Complete" — Cormorant Garamond
- Two-column layout:
  - Left column: "You explained well" — Spline Sans Mono label, followed by quoted excerpt from explanation in Newsreader italic
  - Right column: "The gap" — Spline Sans Mono label, followed by "You explained the method but not the meaning. Rohan needed a real-world reason before the formula made sense." — Newsreader
- BKT comparison (below the two columns):
  - Section rule above
  - "Plain session average: +0.08 per session" — muted
  - "This session (Feynman): +0.21" — large, accent orange
  - "2.6× faster" — Cormorant Garamond display size, gold color
- Engine decision note at bottom: "Next session will target the meaning-first gap for this concept." — Newsreader, italic, muted
- CTA: "Continue" — primary button

Key design decisions in this screen:
The character must feel like a character — not a chat window. The teaching canvas must feel like a blank page you're writing on, not a form you're filling in. The breakdown moment (the gap callout) must land emotionally — it's the moment the learner realizes something about their own understanding. The BKT comparison is the reward — "2.6×" in Cormorant Garamond gold should feel like a meaningful achievement, not a gamification metric.

---

### PRIORITY 2 — Design During Build

Design these screens during the HTML build phase. Layout decisions matter; pixel-perfect can be loose.

**Session Summary** — Concepts moved table (before → after orbit badges, animated), biggest gain callout, review schedule, tomorrow's preview, "See you tomorrow." close.

**Blueprint Mode** — Tab navigation (This Week / This Month / Full Timeline). This Week view most critical: 7-day grid with concept names per day, today highlighted, overdue days flagged.

**Track Setup Flow** — Three track selection cards side by side (T0 Playground / T1 Competitive / T2 Skills), each with brief description. Then: exam picker, daily time slider, subject selection.

**Code Editor Environment (Track 2)** — Three-column layout: problem description (left, 300px) / code editor (center, dark bg #1a1814) / test results (right, 260px). Syntax highlighting uses warm palette (keywords in accent orange, strings in forest green, comments muted). Test pass/fail states.

**Portfolio Artifact Card** — Left border accent in forest green (Track 2 color). Skill name, test result "3/3 passing", timestamp, one-line explanation excerpt. Hover state.

---

### PRIORITY 3 — Design for Later Versions

These are valid but don't block the demo. Design when the relevant version is being built.

- Learner Profile (interest domains, style sliders, analogy affinity matrix)
- Multi-Track Dashboard (all three tracks, daily budget allocation)
- Library Explorer (construct composer, full matrix, compare mode)
- Track 0 Orbit Map (chronological mastery record, heat map)

---

## Character Illustration Brief

*For Rohan — The Confused Student. Pass this to an illustrator or use for AI image generation.*

```
Style:    Flat vector · clean lines · warm palette (World 04 tones) · no bright primaries
Subject:  18-year-old Indian male, Mumbai, casual (t-shirt or college hoodie)
Build:    Average, slightly slouched when confused, sits up when understanding

6 expressions needed (deliver as separate SVGs, 200×200px each):
  1. Neutral    listening, arms loosely crossed, one eyebrow slightly raised
  2. Curious    leaning forward, eyebrows up, head slightly tilted
  3. Confused   furrowed brow, hand on chin, mild frown
  4. Thinking   looking up/away, processing, distant
  5. Aha        eyes wide, sitting upright, small open-mouth smile
  6. Satisfied  nodding, relaxed, "okay I get it" energy

Display format in UI: circular crop at 96–120px · soft drop shadow · border 2px in Seen orange
```

---

## What Claude Design Should Produce

When generating designs from this brief:

1. Apply World 04 as the base — the bg, the orange accent, the blueprint grid, Space Grotesk for UI numbers and buttons
2. Swap World 04's flat ink for World 07's deep green (#1f3a2e)
3. Add World 07's gold as the second accent — mastery states, the "2.6×" moment, milestone achievements
4. Use Cormorant Garamond 600 (from 07) for all display headings and concept names
5. Use Newsreader 300 (from 01/shared) for all reading text — questions, explanations, dialogue
6. Spline Sans Mono (shared) for all labels, section tags, metadata
7. Blueprint grid texture on canvas areas (concept map, code editor background)
8. Heavy top-border rule (from 01) on all section headers
9. Orbit stage colors as defined in the Orbit Stage System table above

Generate Priority 1 screens in order: Dashboard → Concept Map → Session States → Feynman Loop.

---

*File: design-spec v2.0 · Read alongside 11-demo-masterplan.md (build sequence) and 13-content-structure.md (all copy and demo data)*
