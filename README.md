# Synaptic — Adaptive AI Engineering Learning Platform

Adaptive learning platform built with **Next.js 14 + TypeScript + Tailwind CSS**.
Primary storage: **Supabase**.

---

## What it does

- **Adaptive sessions** — the engine picks the next question based on weakest skills, overdue reviews, and confidence
- **Prerequisite graph** — 31+ skill nodes connected by hard/soft edges; skills unlock as you progress
- **Spaced repetition** — SM-2 schedules reviews at optimal intervals; BKT tracks knowledge probability per skill
- **8-phase curriculum** — Computer Basics → CS & Data → Intro AI → ML → Deep Learning → Modern AI → Real-World → Mastery
- **Diagnostic placement** — 12-question onboarding test to initialise your starting point
- **Explanation depth** — each correct answer surfaces beginner/mid/advanced explanations with key insight, build tasks, and explain-back prompts
- **Interactive skill graph** — full prerequisite map with search, minimap, and node detail panel

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Add JWT_SECRET and your Supabase project credentials

# 3. Start development server
npm run dev
# Opens at http://localhost:3000

# 4. Validate content files
npm run validate
```

---

## Storage Architecture

Synaptic uses Supabase for application data and bcryptjs + JWT cookies for authentication.
Copy `.env.local.example`, provide the three Supabase credentials it lists, and run every SQL file in
`supabase/migrations/` in numeric order through the Supabase SQL Editor before starting the app.

---

## Project Structure

```
synaptic/
├── content/
│   ├── graph/
│   │   ├── nodes.json          ← Skill nodes (intuition, analogy, phase, question_ids)
│   │   └── edges.json          ← Prerequisite edges (hard / soft)
│   ├── questions/
│   │   ├── by-skill/           ← JSON question files per skill
│   │   └── diagnostic/         ← Placement quiz questions
│   ├── explanations/           ← beginner/mid/advanced.json per skill
│   └── templates/              ← Authoring templates
│
├── src/
│   ├── app/
│   │   ├── page.tsx            ← Landing — 8-phase curriculum overview
│   │   ├── dashboard/          ← Progress, active phase skill path, reviews
│   │   ├── learn/              ← Study session (MCQ, fill, explain formats)
│   │   ├── learn/skill/[id]/   ← Per-skill deep-dive with learn→practice→apply→review flow
│   │   ├── graph/              ← Interactive prerequisite graph with search + minimap
│   │   ├── profile/            ← Stats, streaks, session history
│   │   └── api/                ← attempt, session, explanation, diagnostic, graph routes
│   │
│   ├── components/
│   │   ├── layout/Navbar.tsx                 ← Sticky nav with SVG theme toggle
│   │   ├── learning/
│   │   │   ├── QuestionCard.tsx              ← MCQ, fill-in, explain formats
│   │   │   ├── FeedbackBanner.tsx            ← Post-answer correct/incorrect feedback
│   │   │   ├── ExplanationPanel.tsx          ← Tabbed: explanation, real-world, build task, explain-back
│   │   │   └── MotivationBanner.tsx          ← Adaptive motivation overlay
│   │   ├── graph/
│   │   │   ├── GraphView.tsx                 ← ReactFlow canvas + Dagre layout + Minimap
│   │   │   └── SkillDetailPanel.tsx          ← Node detail: prereqs, unlocks, mastery, CTA
│   │   └── ui/                              ← Badge, ProgressBar, Spinner
│   │
│   └── lib/
│       ├── bkt/index.ts         ← Bayesian Knowledge Tracing
│       ├── sm2/index.ts         ← SM-2 spaced repetition + BKT sync
│       ├── session/engine.ts    ← 4-priority adaptive task selection
│       ├── graph/index.ts       ← DAG: topological sort, prereq checks
│       └── motivation/index.ts  ← 4-state motivation FSM
│
├── scripts/
│   ├── validate-content.js      ← CI content validator (run before every commit)
│   └── seed.js                  ← Seed curriculum data into Supabase
│
├── AUDIT_REPORT.md              ← Full system audit + gap analysis
└── README.md
```

---

## Adaptive Engine — How It Works

```
selectNextTask(learnerId)
  │
  ├─ 1. Overdue SM-2 reviews    (highest priority)
  ├─ 2. Weak-area reinforcement (p_know < 0.4)
  ├─ 3. Varied practice         (confidence boost)
  └─ 4. Random exploration      (new ready skills)
       │
       └─ For each candidate: prerequisite check via DAG
          → Select question at appropriate difficulty tier
          → Return task with skill context + reason label
```

After each answer:
- BKT updates `p_know` (Bayesian posterior)
- SM-2 updates next review interval
- Motivation FSM updates state (neutral / winning / bored / frustrated)
- On correct: explanation served at depth matching `p_know` band (beginner < 0.4 / mid < 0.7 / advanced)

---

## Design System

All colours are CSS custom properties toggling between dark (default) and light mode via `html.light` class.
Theme persists in `localStorage` key `synaptic-theme`.

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--bg` | `#0a0a0f` | `#f0f0f8` | Page background |
| `--bg2` | `#111118` | `#f8f8ff` | Card background |
| `--text` | `#e8e8f0` | `#1a1820` | Primary text |
| `--text-muted` | `#b4b4cc` | `#3e3c54` | Secondary text |
| `--text-faint` | `#9090b0` | `#606080` | Tertiary / label text |
| `--text-ghost` | `#707090` | `#8888a8` | Hint / disabled text |
| `--purple` | `#7c6eff` | `#5544dd` | Primary action |
| `--green` | `#34d399` | `#158a5e` | Mastered / correct |
| `--yellow` | `#fbbf24` | `#a87000` | Fragile / overdue |
| `--red` | `#f87171` | `#c43030` | Error / incorrect |
| `--blue` | `#60a5fa` | `#2563eb` | Info / explain-back |

---

## Content Status

| Phase | Skills | Questions | Explanations |
|---|---|---|---|
| Phase 1 — Computer & Python Basics | 12 | Complete | Complete (beginner/mid/advanced) |
| Phase 2 — CS & Data Thinking | 9 | Complete | Complete |
| Phase 3 — Intro to AI | 5 | Stub | Stub |
| Phase 4 — Machine Learning | 2 | Stub | Stub |
| Phase 5–8 | 3 | Stub | Stub |

See [AUDIT_REPORT.md](AUDIT_REPORT.md) for the full gap analysis and content authoring guide.

---

## Adding Content

For Phase 3–8 skills, follow `content/CONTENT_GUIDE.md`. Summary:

1. Copy `content/templates/question_file.json` → `content/questions/by-skill/{skill_id}.json`
2. Copy `content/templates/explanation_file.json` → `content/explanations/{skill_id}/beginner.json` (repeat for mid/advanced)
3. Update `content/graph/nodes.json` — add question IDs to the skill's `question_ids` array
4. Run `npm run validate` — must show 0 errors, 0 warnings

---

## Invariants — Never Break These

```
✗ NEVER delete nodes from nodes.json → set "deprecated": true
✗ NEVER edit existing migration files → create a new 003_*.sql
✗ NEVER trust body.correct in /api/attempt → server-side verify always
✓ ALWAYS run npm run validate before committing
✓ ALWAYS sync question_ids in nodes.json when adding question files
✓ ALWAYS use require() not fetch() for loading JSON content in Next.js
```

---

## UI/UX — April 2026 Accessibility Pass

A complete UI/UX audit and overhaul was applied. Key changes:

**Contrast & Visibility**
- All `--text-faint` and `--text-ghost` values raised to pass WCAG AA in both themes
- Light mode background changed from warm beige `#f2f0eb` → cool neutral `#f0f0f8` (eliminates purple clash)
- Card border opacity increased so cards are visually distinct from the page background

**Font Sizes (global scale-up)**
- Question stem 15→17px · MCQ options 13→15px · Explanation body 13→14px
- Navbar links 12→13px · Graph node label 11→13px · Graph % badge 9→11px · Monospace labels 10→12px

**Graph (most impacted area)**
- Nodes 175×52 → 210×64px, edges thicker, viewport fills screen height
- Minimap added (pannable + zoomable)
- Search input for real-time skill filtering
- "Go to active" button jumps to current learning node
- Node spacing increased so labels do not crowd

**Dashboard**
- Skill path circles 48→64px with SVG checkmarks; active nodes pulse
- Scroll fade hints on path edges; phase icons are now SVGs
- Stats cards get a left accent bar; progress bars thicker

**Learn page**
- Container widened (`max-w-2xl→3xl`); all buttons taller
- ModeBar step circles enlarged with SVG checkmarks
- Feedback banner uses `border-2` and stronger background tint

**Navbar**
- Theme toggle: unicode `○/◑` → proper SVG sun/moon icons
- All tap targets raised to minimum 36px height
