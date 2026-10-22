# Synaptic: what was built, what it showed, what is left

A plain-language summary for explaining the work to someone else. Every number
comes from **simulated learners** unless it says otherwise; nothing here has been
run against a real database, a real language model, or a real student.
Detail lives in `FEATURES-COMPLETED.md` (per item, with before/after) and
`LEVELS.md` (one commit per level, with a demo command each).

## The short version

The learning engine guesses what a student knows (BKT) and when to review it
(SM-2). Both were running on bad inputs. We repaired the inputs, added the
signals the engine was meant to use, and then asked whether a neural network
(DKT) should replace BKT. On this evidence the answer is **no, not yet**: DKT
ranks answers slightly better but tracks real learning noticeably worse. The
better upgrade turned out to be giving BKT per-skill parameters. Nothing
experimental is switched on; each such change waits for a human decision.

## The two BKT problems

> This is my reading of "the ongoing flow and the goodness". If you meant
> something else, this is the one section to correct.

1. **The flow was broken: BKT was fed dead inputs.** Response time was measured as
   about 0 ms (the timer read the clock while the request was still being built),
   hesitation was always 0, retries were never sent, and the placement test was
   never graded, so every learner started with most skills blocked. The engine's
   evidence barely varied, so its estimates barely moved for the right reasons.
2. **The goodness was weak.** One parameter set served all 120 skills, and classical
   BKT treats "mastered" as permanent, so a learner marked mastered is hard to
   un-master after wrong answers.

## What was built, against the six asks

| Ask | Where it stands |
|---|---|
| Reasoning evaluation, rule-based → LLM | **Built.** An LLM grader exists with a rule-based fallback. 120 explain questions now give it something to grade (there were none). The server's grade is the single verdict for free text, and the learner's words and the grade are stored (migration 006). The LLM grader itself was evaluated once before this work (2026-08-12, 106 hand-labelled explanations: 96.2% agreement against the rules' 67.0%, `src/lib/nlp/data/eval-results-v1.json`), but **none of the Level 9–10 work has run against a real model**, and the explain path has not been exercised end to end with a key. |
| Correctness + reasoning + behaviour into BKT | **Done.** The combination existed but both extra inputs were constant. They are live now. |
| BKT → DKT | **Built and measured, deliberately not switched.** DKT runs in shadow beside BKT and is judged by a gate. |
| Stronger SM-2 | **Built, off.** A behaviour-aware quality is computed and logged beside the live one (migration 007). Switching it on is your call. |
| Behaviour analytics (time, retries, hesitation) | **Done.** Measured for real at every client, including the Feynman loop. |
| Bloom's taxonomy | **Left as it was, by decision.** |

Two defects were found and fixed first: placement never placed anyone, and 38
`order` questions could be shown but not answered.

## DKT vs BKT, in one table

| | AUC (ranking) | Growth fidelity |
|---|---|---|
| DKT, retrained | 0.7253 | 0.73 |
| BKT, live engine | 0.7175 | **0.87** |
| BKT, per-skill parameters | **0.7293** | 0.86 |

- **AUC** asks whether right answers are ranked above wrong ones. **Growth
  fidelity** asks whether the model's prediction rises at the rate the learner
  really improves (1.0 is perfect). A model can win the first and lose the second:
  DKT's predictions are noisy, and the noise piles up the more answers a learner gives.
- The **cutover gate** checks sample size, ranking and growth. DKT fails ranking
  (gain 0.0078, needs 0.02) and growth (loses 0.144, may lose 0.05). The gate
  reports both rather than stopping at the first.
- Retraining DKT with the lab's recommended setting raised growth from 0.665 to
  0.727 (+0.062), much less than the lab's own simulator predicted (+0.15). Of the
  +0.062, +0.028 came from simply training longer with early stopping and +0.034
  from the reconstruction term itself.
- Per-skill BKT improved ranking and calibration but **not** growth. Only 62 of 120
  skills could be fitted from simulated data, and the app refuses to use
  simulator-fitted parameters live.

## What it cost to leave the signal dead

With response time crushed, SM-2 quality tiers 3 and 4 and FSRS "Hard" and "Good"
occurred **0%** of the time, while the top tier went from 15.5% to 58.4%. The
scheduler asked for fewer reviews (141.6 → 128.7 per learner) and retention fell
(0.918 → 0.903). `npm run sim:latency` reproduces this.

## Final checklist

**Done and verified offline**
- [x] Levels 6–16 committed and pushed
- [x] 182 app tests, 58 lab tests (45 Python, 13 TypeScript), `tsc` and both builds clean
- [x] Placement, `order` questions, timing, explain questions, grade storage
- [x] DKT retrained; gate reports all three conditions
- [x] Per-skill BKT parameters measured; lab website updated (new "Synaptic app" tab)

**Built but off, waiting for your decision**
- [ ] `SCHEDULER=fsrs` (FSRS scheduling)
- [ ] `ADAPTIVE_QUALITY=1` (behaviour-aware scheduling)
- [ ] `BKT_PER_SKILL=1` (inert until parameters come from real learners)
- [ ] Any DKT cutover (the gate says no)

**Needs your machine, not more code**
- [ ] Apply migrations 006, 007 and 008 (`npm run db:migrate`, needs `SUPABASE_DB_URL`)
- [ ] Add an `OPENROUTER_API_KEY` or `GROQ_API_KEY` and check a real LLM grade
- [ ] Run Playwright and click through placement, an `order` question and the Feynman loop
- [ ] Open `/engine` against a real database
- [ ] Set `DKT_SHADOW=1` and collect real attempts; the gate needs 5,000 and 200
      (learner, skill) pairs with 10+ attempts each

**Not done**
- [ ] Level 17: judge DKT on choosing the next question, where its ranking edge matters
- [ ] Error classification (`error_type` has a column and no producer)
- [ ] `/api/analytics` is still a stub that drops every event
- [ ] Per-learner ability and decay, the largest remaining modelled gain
- [ ] Per-question Bloom tagging (closed by your decision)

## Glossary

- **BKT** (Bayesian Knowledge Tracing): a small model that updates "probability the
  student knows this skill" after every answer.
- **DKT** (Deep Knowledge Tracing): a neural network that predicts the next answer
  from the whole answer history.
- **AUC**: how well a model ranks right answers above wrong ones (0.5 is chance).
- **Slope ratio / growth fidelity**: how much of the real improvement curve a model reproduces.
- **Shadow mode**: compute the new thing next to the live one, log both, change nothing the learner sees.
- **Cutover gate**: the automatic check that says whether a shadow model may be proposed for promotion.

## Questions you are likely to be asked

- **Is DKT better than BKT?** Not on this evidence: slightly better ranking, clearly worse growth.
- **Why not switch anyway?** Mastery and review scheduling depend on growth, which is
  where DKT is weaker, and any live switch needs human sign-off.
- **Are these results real?** No. They use simulated learners with a hand-written
  memory model. They validate the method, not the outcome for real students.
- **What would change the answer?** Real learner data in `dkt_shadow_log`.
- **What was the surprise?** The dead timing signal: a one-line timing bug quietly
  disabled most of the scheduling logic, and no test could see it.
- **Did anything go wrong along the way?** One comparison mixed parameters with
  forgetting and overstated the per-skill BKT gain (0.7345 vs 0.7168 instead of
  0.7293 vs 0.7184). It is corrected inline, not hidden.
