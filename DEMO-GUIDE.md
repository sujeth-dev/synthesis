# Demo guide: what you can show, what you cannot, and how

Everything below is from **simulated learners** unless stated. Nothing in this
work has been run against a real database, a real LLM or a real student (the LLM
grader had one earlier evaluation on 106 hand-labelled explanations, recorded in
`src/lib/nlp/data/eval-results-v1.json`).

## Works with no database, no keys, no login (use these)

| What to show | Command | What to point at |
|---|---|---|
| The lab website | `cd dkt-lab/web && npm run build && npm run preview` | **Learning curves** (before → after, and why DKT wins ranking but loses growth), **Scheduling** (the loop as a conversation, SM-2 vs FSRS, what a broken timing signal cost), **Synaptic app**, and **Real-app guide** (every ask: state, where, how to see it) |
| What each behaviour signal does | `npm run behaviour:effects` | Grade bands, belief movement per evidence modifier, a scripted session with and without timing |
| One learner through the real schedulers | `npm run sim:walkthrough` | Same seven answers, three signals, SM-2 and FSRS gaps |
| The before/after learning-curve data | `npm run curves:compare` (about 3 min) | Slope ratios 0.665 → 0.727 vs BKT 0.871; refuses to write if it disagrees with the gate |
| What the dead timing signal cost | `npm run sim:latency` | Wrong/slow/medium/fast grades, reviews per learner, retention |
| DKT vs BKT and the gate | `npm run dkt:compare -- --sim` | The three-condition table: ranking FAIL, growth FAIL |
| Per-skill BKT vs one global set | `npm run bkt:compare` | AUC 0.7184 → 0.7293, growth unchanged |
| SM-2 vs FSRS | `npm run sim -- --learners 200 --days 60` | FSRS: more reviews, less forgotten |
| 963 questions, 120 explain | `npm run validate` | "by format" line |
| The behaviour timing logic | `npx vitest run src/lib/timing src/app/api/attempt` | Tests named for slow answers, hesitation, revisions |
| What `/engine` will contain | `npm run seed:demo -- --dry-run` | Row counts per table, nothing written |
| Everything passes | `npx vitest run` | 32 files, 351 tests |
| The exam's rules (adaptive length, hint credit, debrief) | `npx vitest run src/lib/exam src/app/api/exam` | 44 tests |

## Needs your machine (do not promise these live without setup)

| What | What it needs |
|---|---|
| `/engine` page with data | `SUPABASE_DB_URL` + migrations 006/007/008, then `npm run seed:demo` |
| A real LLM grade on an explain answer | `OPENROUTER_API_KEY` or `GROQ_API_KEY` |
| Placement test, `order` questions, Feynman loop in a browser | Supabase (login) |
| Real timing, hesitation and retries in the rows | The same, plus a person answering |
| DKT on real learners | `DKT_SHADOW=1` running until 5,000 attempts exist |
| The Exam Room (`/learn/exam/<phase>`, or **Exam** on the dashboard) | Supabase + migration 011. Checkpoint is timed with no hints; Practice gives two hints. Stops at 12–24 questions, then debriefs by Bloom level |
| `/profile` and the dashboard's reasoning line, forecast and "How you work" | Supabase and a learner with some answers; `npx playwright test tests/e2e/learner-model.spec.ts` builds one from real answers |

## Built but deliberately off

`SCHEDULER=fsrs`, `ADAPTIVE_QUALITY=1`, `BKT_PER_SKILL=1` (inert until parameters
come from real learners), any DKT cutover, and the multi-metric selector — the
dashboard's **Suggested next** is labelled *advisory* because sessions still follow
the rule order until LIVE-1. Show them as *logged next to the live
value*, never as switched on.

## How behaviour is tracked

1. When a question appears the browser stamps **rendered**; the first click or
   keystroke stamps **first interaction**; Submit stamps **submitted**
   (`src/lib/timing/answer-timing.ts`).
2. From those: **latency** = submitted − rendered; **hesitation** = first
   interaction − rendered; **retries** = answer changes, counted once per settled
   1.5 s burst (so typing is not a retry).
3. They are sent to `/api/attempt`, clamped server-side (hesitation cannot exceed
   latency), and stored on `attempt_events`.
4. Slow answers build a streak in the motivation model, which lowers how much one
   answer moves BKT. Latency also picks the SM-2 quality and FSRS rating.
5. In shadow only, hesitation and retries demote the quality one step; both
   versions are logged (`behavior_quality_shadow`) so the effect can be judged
   later on real rows.

## A 5-minute script

1. Open the lab **Scheduling** tab. Say: SM-2 is a fixed recipe, FSRS models
   memory; FSRS reviews more and forgets less.
2. Scroll to *What a broken timing signal cost*. Say: this bug existed in the app;
   every right answer was graded "fast".
3. Open **Learning curves**. Say: DKT ranks well but its growth curve is flatter.
4. Open **Synaptic app**. Say: the gate checks all three conditions and refuses.
5. Run `npm run bkt:compare`. Say: the cheaper upgrade is per-skill BKT.
6. Close with the checklist in `FINAL-SUMMARY.md`.
