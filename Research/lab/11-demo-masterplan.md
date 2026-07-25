# Demo Master Plan — V0 to VN
*The complete build sequence for the platform demo. Each version is a living artifact — it iterates in a loop until locked, then becomes the base for the next version.*
*Goal: by VN, you can see, feel, and navigate the full platform as if it existed.*

---

## Philosophy

The demo is not a prototype. It is a simulation of the real product — visual fidelity, real flows, real content, real feel. The difference between a real product and this demo is only the live engine underneath. Every screen, every interaction, every piece of content should feel like it was built by a product team, not mocked up in a day.

Each version proves one layer of the product. Each layer builds on the last. You do not move to the next version until the current one holds up under your own use — not a checklist, but a gut check: does this feel like the real thing?

---

## The Loop System

Every version runs in three iterations before locking:

```
Alpha → use it yourself → Beta → show someone outside the team → Final → lock → next version
```

Alpha: First build. Rough edges. The structure is right, the content might be placeholder.
Beta: Refined from self-use. Real content, real flows, interaction details fixed.
Final: Locked. This version is the baseline. Do not change it — build the next version on top.

After VN is final, the loop returns to V1 with everything learned from the full platform. The loop never ends — it just gets more accurate.

---

## Design System (runs across all versions)

Before any version is built, the design system is established. These decisions persist across all versions and cannot change mid-sequence without breaking everything.

### Color System
Three tracks, three identities. One shared neutral foundation.

| Layer | Usage | Value |
|-------|-------|-------|
| **Background** | Page base | #0A0A0F (near-black) |
| **Surface** | Cards, panels | #13131A |
| **Surface Raised** | Modals, popovers | #1C1C27 |
| **Border** | Dividers, inputs | #2A2A3A |
| **Text Primary** | Headings, labels | #F0F0F8 |
| **Text Secondary** | Descriptions, metadata | #8888AA |
| **Track 0** | Playground (knowledge) | #6B7CFF (violet-blue) |
| **Track 1** | Competitive | #FF6B35 (exam orange) |
| **Track 2** | Skill + Job | #35D4A0 (skill green) |
| **Mastered** | Orbit stage | #35D4A0 |
| **Confident** | Orbit stage | #6B7CFF |
| **Practicing** | Orbit stage | #FFD166 |
| **Seen** | Orbit stage | #FF9A3C |
| **Unknown** | Orbit stage | #3A3A4A |

### Typography
| Role | Font | Size | Weight |
|------|------|------|--------|
| Display | Inter | 32–48px | 700 |
| Heading | Inter | 20–28px | 600 |
| Body | Inter | 15–16px | 400 |
| Label | Inter | 12–13px | 500 |
| Code | JetBrains Mono | 14px | 400 |

### Spacing System
4px base unit. Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96

### Component Library (built once, used everywhere)
- Orbit Badge (the 5 stages — color dot + label)
- Concept Card (concept name, p_known bar, orbit badge, last practiced)
- Session Card (session type, concept count, estimated time, CTA)
- Progress Ring (circular BKT progress per concept)
- BKT Bar (before/after visualization for a single session)
- Question Block (question text, answer input variants, feedback state)
- Character Frame (character visual + dialogue bubble)
- Countdown Block (days:hours, color shifts as deadline approaches)
- Artifact Card (Track 2 portfolio item — skill, timestamp, test status)
- Track Badge (T0 / T1 / T2 color chip)

### Customizability Layer (planned from V0, introduced progressively)
| Feature | Version introduced | What it controls |
|---------|------------------|-----------------|
| Light / dark mode | V0 | All backgrounds, borders, text |
| Font size (S / M / L) | V0 | Body + question text sizing |
| Density (Compact / Comfortable / Spacious) | V0 | Padding, card sizes, spacing |
| Track color identity | V2 | Active track tints the entire UI |
| Concept map layout | V4 | Radial / Tree / Grid |
| Analogy preference (explicit override) | V6 | Force a specific analogy domain |
| Full theme builder | VN | Brand colors, logo — for future B2B |

### Responsive Breakpoints
| Breakpoint | Width | Priority |
|-----------|-------|----------|
| Desktop | 1440px | Primary build target |
| Laptop | 1024px | V1 |
| Tablet | 768px | V2 |
| Mobile | 375px | V3 (session view first) |

---

## V0 — The Shell
**Goal:** The visual foundation. No content, no engine. Just the system that everything runs inside.

**What gets built:**
- Layout: Sidebar (track + navigation) + Main area + Right panel (context)
- Empty state for every major panel (dashboard, concept map, session, summary)
- Full component library (all components from design system, rendered in all states: default, hover, active, disabled, loading, error)
- Light mode + dark mode both working
- Density switcher working
- Font size switcher working
- Navigation between sections (dashboard / map / session / profile) — no content yet, just the routing
- Mobile layout: collapsible sidebar, stacked panels

**Screens:**
1. Shell — sidebar + empty main + empty right panel
2. Component reference — all components in all states (internal use)
3. Empty dashboard — "No session yet. Set up your track to begin."
4. Empty concept map — grid with placeholder nodes
5. Settings panel — light/dark, font, density

**Exit condition:** The shell looks like a real product with nothing in it. Every component is in the library. Switching density and font size feels instant and correct.

---

## V1 — The Core Loop
**Goal:** The fundamental promise. The platform looks at a learner and tells them what to do today. No track, no constructs. Just the engine, visualized.

**What gets built:**

### Screen 1 — Dashboard
- Learner greeting: "Good morning, Arjun."
- Computed session card: session type (Plain Session), concepts covered (3), estimated time (32 min), start CTA
- Reasoning line: "2 concepts are overdue for review. 1 is ready to advance." — the engine shows its work
- Concept map mini-view: thumbnail of the full map with orbit stage colors
- Stats row: Streak / Concepts mastered / Review due today / Days active

### Screen 2 — Concept Map (Full View)
- Full graph of concepts for one subject (JEE Math — algebra section, ~30 concepts visible)
- Each concept node: color = orbit stage, size = concept weight
- Hover state: concept name, p_known (e.g. 0.47), orbit stage, last practiced date, next due date
- Click: open concept detail panel (prerequisites, dependents, BKT history, all questions practiced)
- Zoom + pan
- Filter bar: show only Unknown / Seen / Practicing / Confident / Mastered
- "Your weakest area" highlight: top 3 blocking concepts called out

### Screen 3 — Plain Session
- Session header: concept name, orbit stage badge, question N of M, timer (running, not pressure — just awareness)
- Question block: question text (real JEE-style math question), MCQ options
- On answer: immediate feedback — correct/incorrect, explanation shown below, BKT update animation (bar moves)
- Between questions: micro-transition (0.2s) showing next concept incoming
- Session pause: saves state, resumes from exact question
- Abandon: confirms, saves partial BKT update

### Screen 4 — Session Summary
- "Session complete" — time taken, questions answered, accuracy
- Concepts moved: before → after orbit stage for each concept touched (animated)
- BKT highlight: biggest single-session gain
- Review schedule: next 3 concepts due and when ("Integration by parts — back in 4 days")
- Tomorrow's session preview: "Tomorrow: 2 new concepts + 1 review. ~28 min."
- Return CTA: "See you tomorrow."

**UX Adaptive — V1:**
- Session pauses if tab is inactive for 5+ min (saves state)
- Question difficulty adapts within session (if 3 correct in a row, next question is harder)
- Session length adjusts if learner is going faster than estimated (adds a concept)

**Exit condition:** A real session can be completed start-to-finish. Concept map shows real orbit stage movement after the session. The summary tells you something true about what happened.

---

## V2 — Track 1 Overlay (Competitive / JEE)
**Goal:** Everything V1 has, plus the deadline-driven, exam-calibrated Track 1 experience.

**New screens:**

### Screen 1 — Track Setup (Track 1)
- Track selector: three cards (Track 0 / Track 1 / Track 2) with brief descriptions
- Track 1 selected: exam picker (JEE Main / JEE Advanced / GATE / UPSC / Custom)
- Exam date set: calendar picker
- Daily availability: slider (30 min → 3 hours)
- Subject selection: Math ✓ / Physics / Chemistry (start with Math)
- "Set up my blueprint" CTA

### Screen 2 — Dashboard (Track 1 Version)
All of V1 dashboard + new elements:
- Countdown banner: "287 days to JEE Advanced 2027" — color shifts as deadline approaches (green → yellow → red)
- Daily target: "3 concepts today to stay on track" — derived from blueprint
- Pace indicator: "On track / Ahead / Behind" with what that means for rank
- Rank projection: "Current trajectory: top 12% in Math" — with sparkline showing trend
- Intensity phase badge: "Phase: Balanced" — changes as exam approaches

### Screen 3 — Blueprint Mode
- Full study plan generated from BKT state + exam date + daily availability
- View: This Week / This Month / Full Timeline tabs
- Week view: day-by-day breakdown (Mon: Calculus + review, Tue: Probability + review…)
- Month view: concept clusters by week (Week 1: Algebra complete, Week 2: Trigonometry…)
- Full timeline: Gantt-style, all concepts mapped to target completion dates
- Gap analysis panel: "At current pace, you will not cover Permutations & Combinations before exam. Adjust?"
- Adjust CTA: increase daily time OR deprioritize lower-weight topics

### Screen 4 — Session (Track 1 Version)
V1 session + Track 1 additions:
- Intensity mode toggle: Timed (Tapas pressure) / Untimed (plain)
- Timed mode: countdown per question (90 seconds), penalty for timeout
- Question weight shown: "This concept is 8% of JEE paper weight"
- After wrong answer: "You've gotten this wrong 3 times. The engine is flagging this as a conceptual gap."

**UX Adaptive — V2:**
- Countdown banner pulses when inside 30 days
- Rank projection updates after every session (not just daily)
- Blueprint auto-adjusts when learner falls behind (without asking — shows notification "Blueprint adjusted")
- Near-exam mode auto-activates at 14 days: UI shifts to minimal, exam-focused layout

**Exit condition:** Someone with a JEE exam date can set up the platform, get a blueprint, run a session, and come back to a dashboard that tells them exactly where they stand. The countdown feels real.

---

## V3 — First Construct (Experience Layer)
**Goal:** The session stops being a quiz. The first construct — Feynman Loop — fires for the first time. The Confused Student enters.

**New screens:**

### Screen 1 — Construct Trigger
- Mid-session: concept is "Seen" (p_known 0.38) — plain session has been running for 2 questions
- Engine decision card appears: "You've seen this concept but it's not sticking. Let's try something different."
- Transition animation (0.4s) — session environment shifts
- Construct type revealed: "Feynman Loop" with brief description ("Teach it to understand it")

### Screen 2 — Feynman Loop — Setup
- Reality touch intro: "Arjun is studying with his friend who just started learning Math. His friend is confused about Integration."
- Context card: Cricket run-rate scenario — "Your friend is calculating average run rate but keeps mixing up integration with just averaging."
- The Confused Student appears: character visual (static illustration), name, personality tag ("Always asks 'but why?'")
- Instruction: "Explain Integration to your friend. Use any words you want."

### Screen 3 — Teaching Canvas
- Large open text area: "Explain integration in your own words"
- Character visible in corner (listening state expression)
- No MCQ. No hints. Just: explain.
- Word count indicator (minimum viable explanation: 50 words)
- Formatting tools: bullet points, emphasis, diagrams (draw tool)
- Submit: "My friend is ready to hear this"

### Screen 4 — Character Response (Confused)
- Character expression shifts to confused
- Character asks a specific follow-up: "Okay but — what does the area under the curve actually mean? Like, in real life?"
- This is the hard question. The one that breaks surface understanding.
- Response area: learner must answer the follow-up
- If response is vague: character asks again, more specific ("No I mean — what does it feel like to integrate something?")

### Screen 5 — Breakdown Moment
- Character response: "I think I sort of get it but I'm still confused about [specific part learner got wrong]"
- Gap identified on screen: "You explained the method but not the meaning."
- Callout: exact sentence from learner's explanation where the gap showed up
- No judgment. Just: here is where the understanding stopped.

### Screen 6 — Rebuild
- "Try again. This time, start with what integration actually means — not how you do it."
- Second explanation attempt
- Character reaction: "Oh. That makes sense now." (if explanation improved) OR another follow-up
- Construct ends when character says "I think I get it" — or after 3 attempts max

### Screen 7 — Construct Summary
- "Feynman Loop complete"
- What you explained well (quoted from learner's text)
- Where you got stuck (the gap)
- BKT comparison: "Concept moved 0.22 in this session vs typical 0.09 in plain session"
- Gap targeted: "Next session: we're going back to the meaning of integration, not the method."
- Character farewell: The Confused Student character with a "got it" expression

### Character Sheet (internal reference panel, accessible from any construct)
- The Confused Student: visual design, personality summary, dialogue style, what they ask and why
- Visible to the designer/team during construction; optional "about this character" in the learner UI

**UX Adaptive — V3:**
- If learner abandons construct mid-flow, BKT partial update applied
- If same learner has abandoned 2 constructs: construct frequency reduced for 7 days
- Construct ROI comparison shown in session summary (plain vs construct BKT movement)

**Exit condition:** A full Feynman Loop session can be completed. The character feels like a character, not a chat window. The breakdown moment is recognizable — you know when you hit it. The BKT movement after construct is visibly larger than plain session.

---

## V4 — Track 0 (Playground)
**Goal:** Same engine, no predefined curriculum. The learner brings any subject. The engine structures it.

**New screens:**

### Screen 1 — Playground Onboarding
- Track 0 selected from track picker
- "What do you want to learn?" — open text input
- Learner types: "Thermodynamics" (or anything)
- Suggestion: "Here's how others have mapped Thermodynamics. Want to start with this?" — optional scaffold shown
- Two options: Start from scaffold / Build from scratch

### Screen 2 — Concept Graph Builder
- Blank canvas with grid
- "Add a concept" button — types concept name, places node
- Connect nodes: drag from one to another, label the relationship ("is prerequisite of")
- Auto-suggest: as learner types "First Law" — suggests "Second Law" as a related concept
- Node states: all start Unknown (grey)
- Save and start: "Ready to learn this"

### Screen 3 — Track 0 Session
- Visually identical to V1 Plain Session BUT:
- No countdown. No deadline. No intensity indicator.
- Unhurried typography: slightly larger, more breathing room
- Session header: "Following your map — today: Laws of Thermodynamics"
- Question source: learner-uploaded questions OR AI-generated from concept definition
- No exam-style pressure. Just: learn.

### Screen 4 — Orbit Map
- The Track 0 proof layer
- Full chronological record: every concept, its orbit stage, when it reached each stage
- Time-to-mastery per concept: "First Law of Thermodynamics: 18 days from Unknown to Mastered"
- Visual: timeline across the top, concepts on the left, orbit stage history as a heat map
- Export view: "What this looks like as a document" — concept transcript format
- No rank, no exam, no employer. This is yours.

**UX Adaptive — V4:**
- Concept map auto-suggests missing prerequisites when a concept is added ("You've added Entropy but haven't added Heat yet — add it?")
- Session adjusts depth based on how the learner built their map (more connections = deeper sessions)
- Orbit Map highlights longest time-to-mastery concepts (hardest things for this learner)

**Exit condition:** A learner can open Track 0, bring any subject, build a map, run a session on it, and see the orbit map update. The experience feels qualitatively different from Track 1 — slower, deeper, without pressure.

---

## V5 — Track 2 (Skill + Job)
**Goal:** Learn a skill, practice it in a real environment, prove it, build a portfolio.

**New screens:**

### Screen 1 — Track 2 Setup
- Track 2 selected
- Skill browser: tree structure — Programming → Python → Data Structures → Binary Search
- Skill selected: "Binary Search and its variants"
- Prerequisite check: "You need Array Indexing and Recursion first. You have Array Indexing. Recursion is missing." — two options: learn recursion first / continue without it (flagged)
- Soft deadline: optional ("When do you want to apply for a job?")
- Session length preference: 30 / 60 / 90 min

### Screen 2 — Code Editor Environment
- Split layout: left (problem description) / center (code editor) / right (test results)
- Problem: "Implement binary search. Handle: empty array, single element, target not found, duplicate elements."
- Code editor: syntax highlighting, line numbers, JetBrains Mono font, real-looking
- Test suite panel: 5 tests listed, each with expected input/output, pass/fail status
- Run button: test execution animation (0.8s), results update
- Error messages: real Python traceback style
- Hint system: 3 hints available, each reveals one more layer (first: approach, second: pseudocode, third: structure)

### Screen 3 — Debug the Machine Construct
- Broken code given: a binary search implementation with 2 bugs
- "Something is wrong. Figure out what before you fix it."
- Diagnosis phase: learner types diagnosis (not code — explanation of what's wrong)
- Fix phase: edit the code to fix the bugs
- Test results: was the diagnosis correct? Did the fix work?
- Explain phase: "Why did these bugs cause this behavior? Write one sentence per bug."
- Construct summary: "You identified the off-by-one error but missed the infinite loop condition."

### Screen 4 — Portfolio Panel
- Right sidebar becomes portfolio tracker
- Artifact card generated at session end: "Binary Search — implemented, tested, explained — 2026-07-02"
- Artifact detail: Skill tag / timestamp / test result (3/3 passing) / explanation snippet / session that generated it
- Portfolio view: all artifacts by skill, chronological
- Share view: what this looks like to an external person (employer-facing version)
- Proof score: aggregate measure of portfolio completeness for the skill track

**UX Adaptive — V5:**
- Code editor adjusts to available screen width (laptop: side by side; mobile: tabs)
- Test suite shows which tests pass first (easiest → hardest order)
- Debug construct difficulty scales: first attempt gives 3 bugs (easier), repeat attempt gives 1 bug (harder to spot)
- Portfolio automatically flags incomplete artifacts (passed tests but no explanation)

**Exit condition:** A complete Debug the Machine session can be run. The artifact generated at the end looks like something worth showing someone. The portfolio panel shows a real accumulation of work, not just checkmarks.

---

## V6 — Personalization in Action
**Goal:** The same concept, two learners, two completely different sessions. The personalization layer becomes visible.

**New screens:**

### Screen 1 — Learner Profile
- Interest domains: grid of 12 options (cricket, cooking, cinema, geography, music, finance, biology, architecture, history, physics, gaming, literature) — learner picks up to 3
- Learning style: 3 paired choices (Theory first vs Example first / Read vs Do / Solo vs Guided)
- Pace: historical data shown after 5 sessions ("You're a morning learner. Your accuracy is 23% higher before noon.")
- Analogy affinity matrix: visual grid showing which domain × subject combinations have worked best

### Screen 2 — Analogy in Action (Split View)
- Concept: Integration
- Left: Learner A (cricket, visual, example-first)
- Right: Learner B (cinema, analytical, theory-first)
- Same concept, same orbit stage, same session type
- Left session: run-rate scenario, visual diagram, build-up approach
- Right session: scene-pacing analogy, formula-first, symbolic notation
- Toggle: watch how different learners experience the same concept

### Screen 3 — Adaptation Moment
- Mid-session notification (subtle): "Switching to a cricket analogy — this has worked better for you before."
- The question rewrites itself in real time (with a brief shimmer effect)
- Learner can override: "Use a different analogy" — dropdown of available variants
- If overridden: "Noted. We'll remember this." — analogy affinity matrix updates

### Screen 4 — Personalization History
- Per concept: which analogy was used and what BKT movement it produced
- Line chart: analogy A vs analogy B vs no analogy for this learner
- When the preference was locked in (session number)
- Pace profile: session length, time of day, day of week — patterns surfaced

**UX Adaptive — V6:**
- All personalization updates silently after each session (no user action required)
- User can inspect any personalization decision ("Why did you choose this analogy?")
- User can reset any preference ("Forget this and start fresh")

**Exit condition:** You can switch between two learner profiles and clearly see different sessions for the same concept. The explanation feels like it was written for that specific person, not just the concept.

---

## V7 — Full Platform
**Goal:** All three tracks active for one learner. The shared engine is visible. The track-specific overlays are clearly distinct.

**New screens:**

### Screen 1 — Multi-Track Dashboard
- Three track panels side by side
- Track 0: Thermodynamics — orbit map progress thumbnail, next session: "Laws of Thermodynamics"
- Track 1: JEE Math — countdown (287 days), rank projection, blueprint status
- Track 2: Python — portfolio completeness, next skill, last artifact
- Daily budget: "You've allocated 60 min to Track 1, 30 min to Track 2 today. Track 0 is unscheduled."
- What's common: the session queue, BKT state, SM-2 schedule — shown once at the top

### Screen 2 — Track Switcher
- Top navigation: T0 / T1 / T2 pills
- Switch animation: 0.3s crossfade, context panel updates
- State preserved: mid-session state saved when switching
- Active track tints the entire UI: violet (T0), orange (T1), green (T2)

### Screen 3 — Cross-Track Signals Panel
- Right panel (new): "Cross-track intelligence"
- "Your Python logic work is strengthening your JEE Probability concepts. p_known on Conditional Probability moved 0.08 without a dedicated session."
- "Your Thermodynamics entropy understanding may unlock Second Law of Thermodynamics in JEE Physics faster."
- These are signals, not sessions — the engine surfacing connections across tracks

### Screen 4 — Motivation FSM View
- Accessible from profile
- Current engagement state per track
- State history: line chart of engagement score over last 30 days
- Engine actions taken: "On Day 12, you showed plateau signals in Track 1. Engine increased construct frequency for 7 days."
- What's next: "You're in peak state on Track 2. Engine will push harder this week."

**UX Adaptive — V7:**
- Daily budget auto-adjusts if one track is behind (notification: "Track 1 is behind blueprint — switch some time from Track 0 this week?")
- Motivation FSM visible state shown as a quiet indicator in each track header
- Cross-track signals can be dismissed or expanded

**Exit condition:** All three tracks run simultaneously without feeling like three separate products. The shared engine is visible. The track-specific overlays feel like variations of one system, not different systems.

---

## VN — The Complete Library Explorer
**Goal:** See the full creative scope. Explore every construct, character, environment, and game format. Understand what's built, what's designed, what's planned.

**What this is:** Not a user-facing feature. A design and strategy tool. You use it to validate that the library is rich enough, identify which combinations are the highest value to build first, and understand the full creative scope of the platform.

**New screens:**

### Screen 1 — Library Overview
- Three columns: Environments / Characters / Game Formats
- Each item: name, brief description, status chip (Planned / In Design / Built / Tested)
- Status at a glance: how much of the library exists vs is planned

### Screen 2 — Construct Composer
- Left: three dropdowns — Environment / Character / Game Format
- Right: live preview panel
- Select: Code Editor + Interviewer + Two Paths → preview renders showing what that session looks like
- Every combination is previewable — even unbuilt ones show a designed "preview state" (what it would look like if built)
- Recipe card below: "This construct is best for Track 2 / Skill level: Confident / Best trigger: concept ready to advance"

### Screen 3 — Full Construct Matrix
- Grid: Environments (rows) × Characters (columns) × Game Formats (layers)
- Each cell: built status, ROI estimate, track affinity
- Click any cell: open the construct preview from Screen 2
- Filter: show only Track 1 / Track 2 / Track 0 combinations
- Filter: show only Built / show only High-ROI

### Screen 4 — Compare View
- Pick two constructs
- Same concept, same learner, both constructs run side by side
- Shows: different environment feel, different character tone, different game pressure
- Shows: what's the same (the BKT integration point, the session wrapper, the summary)
- This is where you see the common layer vs the creative layer split

### Screen 5 — Build Roadmap (Library)
- Which items to build in what order (prioritized by track coverage and ROI)
- Phase 2 library: Confused Student + Plain Session + Feynman Loop (minimum viable)
- Phase 3 library: +Skeptic + Exam Room + Tapas Mode + Classroom
- Phase 4 library: +Interviewer + Code Editor + Debug the Machine + Live Trace
- Phase 5 library: everything else
- Visual timeline: when each item enters the platform

**UX Adaptive — VN:**
- Compose mode: auto-suggests combinations the platform hasn't tried yet (highest exploration value)
- Status updates sync with the actual build (once built in product, status chip updates here)
- Export: generate a library status report (for team review)

**Exit condition:** You can sit with VN for 30 minutes, explore the full library, and walk away knowing: what's the creative vision, what's built, what's next, and what you're NOT going to build. The explorer makes the scope feel real and manageable, not infinite.

---

## What's Common Across All Versions

Every version shares these — they never change:

| Element | Where it lives | What it does |
|---------|---------------|-------------|
| Session computation | Dashboard | The engine decides what to do today |
| Concept map + orbit stages | Map view | The visual representation of what you know |
| BKT tracking per concept | Engine (invisible) | p_known updates after every response |
| SM-2 scheduling | Engine (invisible) | Concepts come back at the right time |
| Session summary | Post-session | What moved, what's next |
| Personalization layer | Across all sessions | Analogy, pace, style adapt per learner |
| Motivation FSM | Engine (invisible) | Engagement tracked, engine responds |
| Construct wrapper | Session layer | The shell that holds any construct |
| Track switcher | Navigation | Move between tracks without losing state |

---

## What Is Track-Specific

| Element | Track 0 | Track 1 | Track 2 |
|---------|---------|---------|---------|
| Curriculum | User-built | Expert-curated (JEE) | Skill tree |
| Deadline | None | Hard (exam date) | Soft (optional) |
| Proof layer | Orbit Map | Rank projection + mock test | Portfolio artifacts |
| Session intensity | Unhurried, depth-first | Phases (balanced → exam mode) | Skill-milestone-based |
| Construct set | Feynman Loop, Two Paths, Compression | Tapas Mode, Exam Room, Gauntlet | Debug the Machine, Live Trace, Mock Product |
| Character set | Confused Student, Mentor | Skeptic, Confused Student | Interviewer, Skeptic |
| Environment | Plain Session, Classroom, Diagram Canvas | Plain Session, Exam Room | Code Editor, Mock Product |
| Primary metric | Orbit stage mastery | Rank / readiness | Portfolio completeness |

---

## Build Sequence

```
V0  →  V1  →  V3  →  V2  →  V4  →  V5  →  V6  →  V7  →  VN
```

Note: V3 (construct) comes before V2 (Track 1 overlay) — get the experience layer working before stacking deadline features.

---

## Loop Cadence

| Stage | Iteration | What triggers the next loop |
|-------|-----------|----------------------------|
| Alpha | 1–3 days | You can use it yourself without breaking |
| Beta | 3–7 days | Someone outside the team can use it without guidance |
| Final | Locked | You would show this to a potential user |
| Return | After VN | Revisit V1 with everything learned — the core loop gets sharper |

---

*Document: demo-masterplan | Version: 1.0 | Last updated: 2026-07-02*
*Read alongside: 10-buildplan.md (product build sequence), 09-library.md (library design), 08-interfaces.md (construct design)*
