# Levels — step-by-step progress

Each level is a git tag. Every tag builds, passes its tests, and its feature
works on its own, without anything from a later level. To demo a level:

```bash
git checkout level-1-simulator   # any tag below
npm ci && npm test               # and the level's own command, listed below
```

| Tag | What it adds | Try it |
|---|---|---|
| `level-0-merged` | `main` (120-node curriculum) + `v2` (FSRS shadow, DKT benchmark, LLM grader) on one branch | `npm run dev`, `npm test` |
| `level-1-simulator` | Learner simulator: virtual students with a known true memory, driving the real BKT / SM-2 / FSRS code. All its output is **synthetic** | `npm run sim -- --learners 200 --days 60` |

## Level details

### level-1-simulator
- `src/lib/sim/` — seeded RNG, ground-truth learner model (`learner.ts`: prerequisites gate learning, memory decays and strengthens with spaced recall), simulation loop (`run.ts`), metrics (log-loss, AUC), curriculum adapter (`skills.ts`).
- `scripts/sim-run.ts` — runs SM-2 and FSRS on the same simulated population; writes `Research/sim/results/scheduler-comparison.json` (committed) and full event CSVs to `Research/sim/output/` (gitignored, DKT-ready columns first).
- `src/lib/sm2` functions take an optional `now` so simulated time works; live callers are unchanged.
- Never writes to the database — simulation is in-process only.
