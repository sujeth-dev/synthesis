# What the latency bug cost (Level 8)

**SYNTHETIC** — 500 simulated learners x 90 days over the real
120-skill curriculum, seed 2026. Identical population in both columns; the
only difference is the response time the engine is told about. "Crushed" is what
shipped until Level 7: the client measured ~0 ms and the server clamped it up to
100 ms. Ground-truth memory model: `src/lib/sim/learner.ts`. Not evidence
about real learners.

Regenerate: `npm run sim:latency`

## 1. The evidence the engine receives

Share of all attempts, SM-2 arm. The wrong-answer row is a control: it is
identical by construction, since neither mapping consults latency when the answer
is wrong.

| Evidence | Measured latency | Crushed (what shipped) |
|---|---|---|
| SM-2 quality 1 — wrong answer | 39.8% | 41.6% |
| SM-2 quality 3 — correct, slower than 8 s | 8.4% | 0.0% |
| SM-2 quality 4 — correct, 3–8 s | 36.3% | 0.0% |
| SM-2 quality 5 — correct, under 3 s | 15.5% | 58.4% |
| FSRS Again | 39.8% | 41.6% |
| FSRS Hard | 8.4% | 0.0% |
| FSRS Good | 36.3% | 0.0% |
| FSRS Easy | 15.5% | 58.4% |

## 2. What that does to scheduling and retention

| | SM-2 measured | SM-2 crushed | FSRS measured | FSRS crushed |
|---|---|---|---|---|
| Attempts | 164,873 | 158,899 | 170,251 | 142,307 |
| Reviews per learner | 141.61 | 128.65 | 160.99 | 110.19 |
| Skills learned per learner | 27.67 | 27.65 | 27.04 | 23.13 |
| True retention at end | 0.9181 | 0.9030 | 0.9319 | 0.9052 |
| Learned skills forgotten (recall < 0.7) | 4.7% | 5.9% | 3.1% | 5.1% |
| BKT next-answer AUC | 0.7226 | 0.7134 | 0.7376 | 0.7242 |
| BKT next-answer log-loss | 0.6043 | 0.6178 | 0.5733 | 0.6033 |
| Scheduler recall AUC | 0.5179 | 0.5222 | 0.6003 | 0.5889 |
| Scheduler recall log-loss | 0.6524 | 0.6944 | 0.6255 | 0.7296 |

Column order: sm2/measured, sm2/crushed, fsrs/measured, fsrs/crushed.

## 3. Behaviour-evidence reachability

`deriveBehaviorEvidenceModifier` replayed over the SM-2 arm's attempts through the
real `src/lib/motivation` code. Slow is latency above 15000 ms.

| Modifier | Measured | Crushed |
|---|---|---|
| 1.00 — no penalty | 3.3% | 3.6% |
| 0.85 — slow response only | 0.2% | 0.0% |
| 0.80 — frustrated or repeated errors | 90.1% | 96.4% |
| 0.65 — both | 6.4% | 0.0% |
| Learners ever reaching a 4-attempt slow streak | 1 of 500 | 0 of 500 |

## Reading this

- **SM2**: losing the signal costs 12.96 reviews per learner (141.61 to 128.65) and 0.0150 of end-of-run true recall (0.9181 to 0.9030).
- **FSRS**: losing the signal costs 50.80 reviews per learner (160.99 to 110.19) and 0.0268 of end-of-run true recall (0.9319 to 0.9052).
- The forgotten-skill rate worsens under the crushed signal on both schedulers.

## Limits of this measurement

- Observational. `simulate()` passes no modifiers to `bktUpdate`, so section 3
  reports the values production *would* compute, not a feedback loop. The bored
  and winning branches of `updateMotivationState` are held out by replaying
  against a neutral skill state, isolating the latency-driven arms.
- Hesitation (time to first interaction) and answer revisions have **no analogue
  in the ground-truth learner model**, so this quantifies the latency half of
  Level 7 only. A hesitation-based scheduling policy cannot be justified from
  here — that is why Level 11 ships one in shadow rather than live.
- The latency distribution is an assumption of the simulator, not a measurement.
