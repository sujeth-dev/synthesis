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
| 2 | DKT trained on Synaptic's own 120 skills (DKT-10), compared with the app's live BKT, a fitted BKT, and a ground-truth ceiling | `npm run sim` then `cd Research/dkt && python3 train_synaptic.py` |
| 3 | DKT runs inside the app in TypeScript (DKT-11), verified against PyTorch; optional shadow logging next to BKT | `npm run dkt:predict` |
| 4 | DKT evaluated against live BKT on unseen learners (DKT-12) + an automatic cutover gate (DKT-13) | `npm run dkt:compare -- --sim` |
| 5 | FSRS vs SM-2 compared on simulated learners (FSRS-4) + a live scheduler switch (FSRS-5) | `npm run sim`, then set `SCHEDULER=fsrs` |

## Level details

### Level 1 — simulator
- `src/lib/sim/` — seeded RNG, ground-truth learner model (`learner.ts`: prerequisites gate learning, memory decays and strengthens with spaced recall), simulation loop (`run.ts`), metrics (log-loss, AUC), curriculum adapter (`skills.ts`).
- `scripts/sim-run.ts` — runs SM-2 and FSRS on the same simulated population; writes `Research/sim/results/scheduler-comparison.json` (committed) and full event CSVs to `Research/sim/output/` (gitignored, DKT-ready columns first).
- `src/lib/sm2` functions take an optional `now` so simulated time works; live callers are unchanged.
- Never writes to the database — simulation is in-process only.

### Level 2 — DKT on Synaptic's skills
- `Research/dkt/train_synaptic.py` — trains the existing `DKTModel` on Synaptic's 120-skill graph. Skill index is fixed by `content/graph/nodes.json`, so the app and the model always agree. Input is any `student_id,skill_id,correct,timestamp` CSV: the simulator's log by default, or `npm run dkt:export` real data via `--input`.
- Results: `Research/dkt/results/synaptic_dkt_results.md` — **synthetic** (simulated learners). AUC on 300 held-out simulated students: ceiling 0.839, fitted BKT 0.735, **DKT 0.722**, live app BKT 0.717 (8 epochs, ~3 min on CPU).
- Fixed `train_dkt.py`'s `int(skill_id)` crash on text skill IDs, and `.gitignore` paths that said `research/` while the folder is `Research/` (Linux is case-sensitive, so data files weren't actually ignored).
- Python deps: `pip install -r Research/dkt/requirements.txt`. Tests: `python3 -m pytest Research/dkt/tests`.

### Level 3 — DKT inside the app (shadow mode)
- `src/lib/dkt/index.ts` — LSTM forward pass in TypeScript; no Python service. `src/lib/dkt/model/synaptic-dkt.json` is the Level 2 model (2 MB, trained on **simulated** learners, flagged `synthetic: true`).
- Parity: `Research/dkt/export_weights.py --fixture` writes PyTorch outputs; `src/lib/dkt/dkt.test.ts` checks TypeScript matches to 5 decimals on every skill.
- Shadow mode: with `DKT_SHADOW=1` and migration `005_dkt_shadow_log.sql` applied, every attempt logs DKT's prediction, live BKT's, and the outcome to `dkt_shadow_log`. Off by default; fail-open; BKT stays the live model. Learners see no difference.
- Demo without a database: `npm run dkt:predict` prints DKT's per-skill predictions for one simulated learner next to BKT's.
- Retrain and re-export: `python3 train_synaptic.py && python3 export_weights.py` (in `Research/dkt`).

### Level 4 — DKT evaluation and cutover gate
- `src/lib/dkt/compare.ts` — scores DKT vs live BKT on the same attempts; `cutoverDecision()` recommends a switch only with ≥ 5,000 attempts **and** ≥ 0.02 AUC gain **and** no worse log-loss. A recommendation is for a human to review; nothing switches automatically.
- `npm run dkt:compare -- --sim` — 300 fresh simulated learners (seed never used in training) through the app's TypeScript DKT and BKT. Result (**synthetic**): DKT AUC 0.723 vs live BKT 0.718 (ceiling 0.839) → gate says **don't switch**. Matches the Python result, confirming the shipped model end to end.
- `npm run dkt:compare` (no flag) — same report on real `dkt_shadow_log` rows once Level 3's shadow mode has collected data.
- `src/lib/dkt/index.ts` now steps the LSTM incrementally (`stepDkt`, `predictSkill`); `predictNext` is unchanged.

### Level 5 — FSRS: comparison and switch
- `npm run sim` now also writes `Research/sim/results/scheduler-comparison.md` (**synthetic**, 2,000 learners × 90 days): FSRS uses ~14% more reviews and cuts forgotten skills from 4.7% to 3.1%; it ranks recall better than SM-2 (AUC 0.62 vs 0.52) but default parameters are over-confident.
- `SCHEDULER=fsrs` makes FSRS set live review due dates (`src/lib/fsrs/scheduler.ts`). Default stays SM-2. SM-2's bookkeeping is always updated so switching either way is instant; any FSRS failure falls back to SM-2. FSRS shadow logging is unchanged.
- Not done: FSRS-6 (refitting FSRS's parameters) needs real review logs, which a simulator can't stand in for.
