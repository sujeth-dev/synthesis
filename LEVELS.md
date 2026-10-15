# Levels — step-by-step progress

Each level is one commit whose message starts with `Level N:`. Every level
builds, passes its tests, and its feature works on its own, without anything
from a later level. To demo a level:

```bash
git checkout $(git log --format=%h --grep='^Level 1:' -1 ccr-03eb88e4-wjepi5)   # change the number
npm ci && npm test                                                              # then the level's own command below
git checkout ccr-03eb88e4-wjepi5                                                # back to the latest
```

Level 0 is the merge commit `b94b44e` (`git checkout b94b44e`).

| Level | What it adds | Try it |
|---|---|---|
| 0 | `main` (120-node curriculum) + `v2` (FSRS shadow, DKT benchmark, LLM grader) on one branch | `npm run dev`, `npm test` |
| 1 | Learner simulator: virtual students with a known true memory, driving the real BKT / SM-2 / FSRS code. All its output is **synthetic** | `npm run sim -- --learners 200 --days 60` |

## Level details

### Level 1 — simulator
- `src/lib/sim/` — seeded RNG, ground-truth learner model (`learner.ts`: prerequisites gate learning, memory decays and strengthens with spaced recall), simulation loop (`run.ts`), metrics (log-loss, AUC), curriculum adapter (`skills.ts`).
- `scripts/sim-run.ts` — runs SM-2 and FSRS on the same simulated population; writes `Research/sim/results/scheduler-comparison.json` (committed) and full event CSVs to `Research/sim/output/` (gitignored, DKT-ready columns first).
- `src/lib/sm2` functions take an optional `now` so simulated time works; live callers are unchanged.
- Never writes to the database — simulation is in-process only.
