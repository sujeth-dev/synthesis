# DKT Live Integration — Scoping (not implementation)

**Status:** planning only. Nothing in this doc is built. `P3-3` in `MASTER_PLAN.md`
stays gated as written; this is what "actually doing P3-3" would require, made
concrete instead of a one-line placeholder.

**Why this needed its own pass instead of "just wire it in":** a direct
request to make DKT live right now ran into three real blockers that aren't
policy caution — they're missing engineering. This doc names them precisely
and lays out the only path that actually resolves them, modeled on how FSRS
went from idea to real, evidence-backed shadow-mode data.

---

## The three real blockers

### Blocker 1 — skill-space mismatch (the one that matters most)

DKT's trained model (`Research/dkt/train_dkt.py`) is an LSTM fit end-to-end on
a one-hot encoding of ASSISTments 2009-2010's own 123 `skill_id`s. Confirmed
by direct search: nothing in `Research/dkt/` references Synaptic's actual
skill graph (`content/graph/nodes.json`, `phase_1_computer_basics`, or any
real `skill_id` in this repo). The two skill spaces don't correspond, and
this isn't a relabeling problem — the model's learned weights are tied to
that specific 123-dimensional input. There is no valid mapping from
Synaptic's ~45 (soon up to 119, per the node-audit plan) skills onto it that
would produce meaningful predictions.

**The only real fix:** retrain DKT from scratch on Synaptic's own interaction
data, once enough of it exists. This is *why* `P3-3`'s 50k-session gate isn't
arbitrary — it's the same order of magnitude as the 338,001 interactions from
4,163 students the ASSISTments benchmark itself needed to fit a stable model.
Synaptic's skill vocabulary is smaller, so the real number may end up lower
than 50k, but it can't be known without trying — see DKT-10 below.

### Blocker 2 — no live inference path exists

Today's DKT code is an offline Python research script (`train_dkt.py`,
`evaluate.py`) — batch-mode, run once, produces a results file. It is not a
servable model. Two real options once Blocker 1 is solved:

- **(a) Python inference microservice**, called over HTTP from
  `src/app/api/attempt/route.ts`. Adds a second deployable service, a new
  network hop and failure mode on every attempt, and real deployment
  complexity (this app currently has zero non-Next.js runtime dependencies).
- **(b) Export to ONNX, run inference in Node/TypeScript** directly inside
  the existing app. Avoids a second service, but is nontrivial: porting an
  LSTM forward pass correctly and verifying numerical parity with the
  original PyTorch model is real work, not a one-line import.

Neither exists today. This needs a decision, not just effort, once Blocker 1
is solved and there's an actual model worth serving.

### Blocker 3 — 19 files currently assume BKT is the only source of truth

Direct search for `p_know` across the codebase (excluding tests):

```
src/app/api/attempt/route.ts
src/app/api/explanation/route.ts
src/app/api/graph/route.ts
src/app/api/phase-evaluation/attempt/route.ts
src/app/api/session/route.ts
src/app/api/skill/route.ts
src/app/dashboard/page.tsx
src/app/demo/page.tsx
src/app/graph/page.tsx
src/app/learn/page.tsx
src/components/graph/GraphView.tsx
src/components/graph/SkillDetailPanel.tsx
src/lib/analytics/bkt-movement.ts
src/lib/bkt/index.ts
src/lib/graph/index.ts
src/lib/motivation/index.ts
src/lib/session/engine.ts
src/lib/sm2/index.ts
src/types/index.ts
```

Every one of these has different stakes. Some are pure UI display (mastery
tier labels, graph node color). Some gate real decisions (`selectNextTask()`
in `session/engine.ts` deciding what a learner sees next; unlock logic in
`graph/index.ts`; phase-evaluation gating). A live cutover has to go through
this list file by file and decide, deliberately, whether DKT's output
replaces BKT's, augments it, or is only compared against it — not a single
global switch.

---

## The path that actually resolves this: DKT shadow mode, same discipline as FSRS

Jumping straight to a live cutover skips the step that made FSRS's cutover
decision trustworthy: real Synaptic data, compared honestly, before anything
gets served. The equivalent sequence for DKT:

| ID | Task | Can start now? |
|---|---|---|
| DKT-9 | Log real learner interactions in Synaptic's own `(student_id, skill_id, correct, timestamp)` shape as they happen — this alone starts solving Blocker 1, since it's exactly the training data a Synaptic-native DKT model would need. | **Yes** |
| DKT-10 | Once enough real interactions exist, retrain DKT from scratch on Synaptic's own skill space (not ASSISTments'). Resolves Blocker 1 for real, not synthetically. | No — needs DKT-9's real volume first |
| DKT-11 | Build the inference path (resolve Blocker 2: option (a) vs (b) above) and shadow-log DKT's predicted `p_know` alongside BKT's real one on every attempt — never served, exactly mirroring `fsrs_shadow_log`. | No — needs DKT-10's retrained model |
| DKT-12 | Once shadow data accumulates, compare DKT's predictions against what actually happened on learners' next attempts — the real, Synaptic-specific evidence `P3-3` needs, not the ASSISTments benchmark alone. | No — needs DKT-11's shadow data |
| DKT-13 (= `P3-3` itself) | Only with DKT-12's real evidence in hand: decide, and if justified, implement the cutover across Blocker 3's file list — with human sign-off, same as FSRS-5/NLP's cutover. | No — needs DKT-12's evidence |

**What can genuinely start today:** DKT-9 (real interaction logging — useful
infrastructure regardless of when/whether DKT ever goes live) and deciding
between inference option (a)/(b) on paper. **What can't be rushed:** DKT-10
through DKT-13, each one gated on the previous step's real output, not a
calendar date or a synthetic stand-in.

This is not "wait forever" — DKT-9 is real, startable work. It's "the next
real step is data collection, not a cutover," which is a different thing
than declining to move at all.

---

## What this doc deliberately does not do

It does not implement DKT-9. It does not modify `MASTER_PLAN.md`'s `P3-3`
status. It does not touch any of the 19 files in Blocker 3's list. This is
the scope, not the work — the same relationship the node-audit plan doc has
to `P2-3`'s actual content authoring.
