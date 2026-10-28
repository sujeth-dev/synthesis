# Plain-language copy pass: dashboard, profile, exam debrief

Goal: learner pages should use short, plain English. Where a small caption adds nothing, it
is **removed** rather than reworded. Only words change; logic and data stay the same, and
every `data-testid` is kept.

Status: **applied 2026-10-28**. tsc clean, 360/360 unit tests pass.

Decisions so far:
- "Fragile" becomes **"Needs review"**.
- The review-timing card stays, folded into a dropdown with one plain sentence.
- The exam debrief is included.

---

## 1. Remove: small captions that add nothing

Dashboard
- [x] "Tap any open skill to study it directly, or start the session above and let the engine choose." (under the skill path)
- [x] "Not what you know: how you answer, read from every attempt." (under "How you work"). It's replaced by **"Last 30 days"**, and the footnote at the bottom of the cards goes.
- [x] The grey "from latency_ms…", "from behavior_modifier…" footer on every "How you work" card. These are database field names.
- [x] "Median seconds per answer, by week. Medians, so one abandoned tab does not set it." The chart already says it.
- [x] "Close call: X and Y scored almost the same."
- [x] "The old rule order would have started with X."
- [x] "Chosen by the weighted score from the skills the rules make eligible." The "See every decision →" link stays.

Profile
- [x] The three group notes beside Needs attention / Still learning / Solid. The titles say it.
- [x] "recent answers agree" on every healthy row. It only says "fine"; nothing shows instead.
- [x] "3 scored, 2 explained". Only "1 counted less" stays, and only when it's above 0.
- [x] The "Awaiting first review" badge. The new "Needs review" label already says it.
- [x] "over all 34 practice answers" under Accuracy. The Attempts card next to it shows the count.
- [x] "Practice answers per day." under Last 30 days.

## 2. Reword: text that stays but gets plain

### Dashboard: Your next session (`NextUp.tsx`, `score.ts`)

| Now | New |
|---|---|
| Why this one | **Why this skill** |
| Chosen because there is more ground still to cover here than almost anywhere else (37%), and it fits how the session is going (90%). | **Most left to learn, and it suits how you're doing today.** |
| Held back because this skill has gone wrong 3 times in a row — grinding it further is unlikely to help. | **Paused: wrong 3 times in a row.** |
| Prerequisites are not met yet, so this cannot be served. | **Locked until earlier skills are done.** |
| Bars: Room to learn / Suits your current state / Right kind of thinking | **Left to learn / Fits how you're doing / Right difficulty** |
| Total 0.27. Next best: Modules & Imports 0.27, … | **Runner-up: Modules & Imports.** |
| Only one skill was eligible, so there was nothing to weigh it against. | **Only one skill is open right now.** |

The other reason phrases are "due for review" and "not seen lately". `score.test.ts:309` checks the old "Chosen because" wording and gets updated.

### Dashboard: other cards (`dashboard/page.tsx`)

| Now | New |
|---|---|
| By kind of thinking | **By question type** |
| Latest exam · Phase 1 · your chance on a medium question at each level | **Latest exam · Phase 1 · chance of a right answer** |
| Due now, then each of the next 14 days. | **Next 14 days** |
| What the model believes → | **See your skills →** |
| Tooltip: Prerequisites needed | **Finish earlier skills first** |

### Dashboard: How you work cards (`BehaviourInsights.tsx`)

| Now | New title | New caption (one line) |
|---|---|---|
| Your pace | Your pace | chart only; the unit becomes "s per answer" |
| Getting started | **Time to start** | "before your first click · 3 slow starts" |
| Second-guessing | **Changed answers** | "3 of 25 changed before submitting" |
| How the engine read your mood | **Your mood** | bars + "Worst run: 4 wrong in a row" |
| How much your answers counted | **Answer weight** | "3 of 40 counted less (after 2 misses, or over 15s)" |
| Hint reliance | **Hints used** | "on exam questions · 2 within 4s" |
| What your behaviour would do to reviews | **dropdown: "Review timing (test) ↓"** | open: "If your speed counted, reviews would come 1.2 days later on average. Not used yet." |

- Mood labels: "Under-challenged" → **"Too easy"**. In flow, Steady and Struggling stay.
- Empty state: → **"Answer a few questions to see this."**

### Profile (`profile/page.tsx`, `LearningCurve.tsx`)

| Now | New |
|---|---|
| What Synaptic believes about you | **Your skills** |
| Belief: the model's estimate… half-full at 5 attempts… | **Top bar: how well you know it. Bottom bar: how many answers.** |
| Row labels: belief / evidence | **known / answers** |
| State label: Fragile | **Needs review** |
| Badge: Belief ahead: 2 of last 5 right | **Only 2 of last 5 right** |
| Badge: High belief on 2 attempts | **Only 2 answers so far** |
| belief is ahead of recent answers | **recent answers weaker** |
| doing better than the belief | **doing better than shown** |
| too little evidence to judge | **too few answers yet** |
| Open but not practised yet (20), so no evidence either way: | **Not started yet (20):** |
| Is practice landing? + long note | **Are you improving?** · "How often you miss on try 1, 2, 3… Down = improving." |
| Not enough practice yet — a curve needs a second attempt on some skill. | **Practise a skill twice to see this.** |
| By kind of thinking · From your latest exam… Exams are a measurement only. | **By question type** · "Latest exam in each phase." |
| Tooltip on "counted less" (long) | **Counts less after 2 misses in a row, or if slower than 15s.** |

### Exam debrief (`components/exam/Debrief.tsx`)

| Now | New |
|---|---|
| Practice debrief / Checkpoint debrief | **Practice results / Checkpoint results** |
| The exam stopped once it was confident enough in your result. | **Stopped once it had enough answers.** |
| The exam reached its 24-item cap before it was fully confident — the bands below are wider for it. | **Reached the 24-question limit.** |
| Time ran out. Unanswered items count as wrong. | **Time ran out. Unanswered = wrong.** |
| The exam used every question in this phase. | **Used every question in this phase.** |
| By kind of thinking | **By question type** |
| Dot: your chance on a typical question at that level. Band: ±1 standard error. Dashed line: 50%. | **Dot = your chance of a right answer. Bar = likely range.** |
| not sampled | **no questions** |
| within time target | **on time** |
| items with a hint (1 took both) | **used a hint (1 used both)**. `exam.spec.ts:148` gets updated to match. |
| ⚑ 2 hints were asked for within four seconds — before the question could have been read. Hints help most after a real attempt. | **⚑ 2 hints asked within 4s. Try the question first.** |
| Pace: Well over | **Too slow** |
| Exam results are a measurement only. They do not change your mastery, review schedule or session. | **This exam doesn't change your progress or reviews.** |

## Not touched
- Code comments.
- The /engine page (developer view).
- Stats row labels.
- "Starts with", "Reviews", "Recent sessions", "What tripped you up", "What to revisit". These are already plain.

## After applying
- [x] Update `score.test.ts` and `exam.spec.ts` to the new wording.
- [x] Unit tests (360/360) and e2e exam + learner-model pass.
- [x] Take light-mode screenshots of the dashboard, profile and debrief for a visual check.
