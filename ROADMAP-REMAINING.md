# What is actually left

**As of 2026-10-21, verified against the working tree, not against the plan docs.**

This document exists because three planning documents in this repository disagree
about the state of the code, and all three are behind it:

- `MASTER_PLAN.md` and `PROGRESS.md` stop at P2-3 (2026-08-13). They list DKT-10…13 as
  `not_started` and FSRS-3/4 as `blocked`. `git log` shows all of them shipped as
  Levels 2–5 and merged in sujeth-dev/synthesis#1. Neither document mentions `dkt-lab/`
  at all, which is Labs 1–8 and a second merged pull request.
- `AUDIT_REPORT.md` is dated April 2026 and describes a 31-node, Phase-1–2 curriculum.
  The repo now has 120 nodes with every phase authored. It does not mention DKT.

`DEVELOPMENT_LOOP.md` already sets the tie-breaker: *"the repository is the source of
truth, not conversation history… If `PROGRESS.md` claims something that the repo
contradicts, trust the repo."* Per `PROGRESS.md`'s own convention, the stale claims are
corrected here rather than quietly deleted — the older documents are left in place as
the record of what was believed when.

Every status below was checked by reading the code or counting the content. Where a
feature is built but inert, that is stated as such, because "done" and "doing anything"
have come apart in several places.

---

## The one thing to fix first

**`latency_ms` reaches the server as ~0 on every attempt.** `src/app/learn/page.tsx:300-305`:

```ts
const start = Date.now()
const r = await fetch('/api/attempt', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    …
    latency_ms: Date.now() - start, client_answer: answer,
```

`start` is taken on the line before the request, and `Date.now() - start` is evaluated
while the request body is being built — microseconds later. It measures the cost of
constructing a JSON payload, not how long the learner thought. `/api/attempt` then
clamps it up to `MIN_LATENCY = 100`.

Four subsystems are downstream of that number, and all four are silently inert:

| Consumer | Intended behaviour | Actual behaviour |
|---|---|---|
| `bktToQuality` (`src/lib/sm2/index.ts:48`) | SM-2 quality 3/4/5 by response time | always **5** on a correct answer |
| `fsrsRatingFromCorrectness` (`src/lib/fsrs/index.ts:65`) | Hard / Good / Easy by response time | always **Easy** |
| `hesitation_ms` (`src/lib/motivation/index.ts:49`) | `max(0, latency − 15000)` | always **0** |
| `deriveBehaviorEvidenceModifier` (`src/lib/motivation/index.ts:13`) | −0.15 when slow | the slow arm **can never fire** |

So the behaviour half of the BKT evidence weighting, and the whole response-time
sensitivity of both schedulers, are dead. The fix is to capture the timestamp when the
question is *rendered* and subtract at submit. It is a handful of lines, it unblocks
items 3 and 6 below, and nothing else in this list is worth doing before it.

Two smaller cases of the same shape, both confirmed by grep:

- **`revision_count`** has a column (001), a type (`src/types/index.ts:109`), clamping
  (`route.ts:68`) and persistence (`queries.ts:221`) — and **no client ever sends it**,
  so it is always 0.
- **`error_type`** is hardcoded `null` at `route.ts:185` and
  `phase-evaluation/attempt/route.ts:46`. Engine 5 (error classification) in
  `Research/lab/02-engines.md:272` is still unbuilt, so nothing populates it.

---

## The seven items

### 1. Explanation-based answers, to capture real understanding

**Status: the pipe is built; nothing flows through it.**

The server grades free-text whenever `question_format === 'explain'`
(`src/app/api/attempt/route.ts:97-105`), with the LLM grader primary and the rule-based
classifier as fallback. But a count of the runtime content — `content/questions/by-skill/`,
the only tree `/api/attempt` reads — gives **768 `mcq`, 38 `order`, 37 `fill`, and 0
`explain`**. The sole producer of an explain attempt in the whole app is the Feynman
loop completion at `src/app/learn/page.tsx:338`, under a synthetic question id
`${skill_id}_feynman_loop`.

There is also **no table for the explanation text or the grade**. The learner's words
are graded in memory, compressed into `p_know_after`, and discarded; the only durable
trace is the best-effort `logs/nlp-grader.jsonl` ring.

Left to do: author explain-format questions per skill; add a migration storing the
explanation text, the grader's category, the prompt version and which model served it;
decide whether an explanation is its own attempt or an attribute of one.

Worth noting: a known defect in the existing path is that the client sends
`correct: result.resolved` derived from the **rule-based** classifier, while the server
independently re-grades the same text with the **LLM** for `reasoningQuality`. The two
can disagree inside a single attempt.

### 2. A reasoning-evaluation module (rule-based → NLP/LLM)

**Status: done, and live.** This one is genuinely finished.

`src/lib/nlp/` is the upgrade: live free-tier model discovery that verifies pricing
against each provider's catalogue rather than hardcoding "free" model ids
(`catalog.ts`), a failover chain, a 24-hour cache keyed on
`concept::promptVersion::normalisedText`, per-call logging with the prompt version, and
a hard fallback to the rule-based classifier when every model fails. Benchmarked at
**0.962 accuracy / κ 0.943** against human labels versus the rule-based classifier's
**0.670 / κ 0.498** on the same 106 examples (`src/lib/nlp/data/eval-results-v1.json`).

Left to do: nothing in the module. Its value is capped by item 1 — a grader with almost
nothing to grade.

### 3. Correctness + reasoning + behaviour as BKT input

**Status: wired, and running on two dead inputs out of three.**

`src/lib/bkt/index.ts:26-33` shrinks both likelihoods toward 0.5 in proportion to the
evidence:

```ts
const evidenceStrength = 0.6 * reasoningQuality + 0.4 * behavior
```

In practice, on every ordinary question `reasoningQuality` is exactly 1 (item 1: no
explain questions exist) and `behavior` can only take the values {1, 0.85} rather than
{1, 0.85, 0.8, 0.65}, because its latency arm cannot fire (the latency bug). So
`evidenceStrength` collapses to a near-constant and the weighting is close to textbook
BKT with extra steps.

Left to do: items 1 and the latency fix. The combination logic itself needs no work —
it needs inputs.

### 4. Upgrade BKT to modern knowledge tracing (DKT)

**Status: shipped in shadow mode; the gate says don't switch; and the gate is measuring
the wrong thing.**

DKT runs as a TypeScript LSTM forward pass with no Python service
(`src/lib/dkt/index.ts`), checked against PyTorch to five decimals, logging predictions
beside live BKT's under `DKT_SHADOW=1`. `cutoverDecision` (`src/lib/dkt/compare.ts`)
requires `n ≥ 5000 ∧ ΔAUC ≥ 0.02 ∧ log-loss no worse`, and nothing switches
automatically. Real volume is far short: 416 attempt rows against a 50,000 threshold.

This is the item Labs 7–9 are about, and the finding changes what "left to do" means —
see `dkt-lab/FINDINGS-CURVES.md`. In short: DKT wins the gate's metrics on ASSISTments
2009 (+0.087 AUC) while reproducing only **56%** of observed learning growth against
BKT's 82%. AUC is a pure ranking measure and cannot see that. **A gate built on AUC and
log-loss alone would approve a cutover to a model that is worse at the one thing the
scheduler depends on.**

Left to do: add a growth term (a cohort-curve slope-ratio floor) to the cutover gate
before it is ever allowed to fire; finish the Lab 9 fix work; and keep the human
sign-off that `DEVELOPMENT_LOOP.md:113` requires for any live cutover.

### 5. Strengthen SM-2 with adaptive scheduling

**Status: FSRS built and switchable; validated only on synthetic data; and its
response-time input is dead.**

`activeScheduler()` (`src/lib/fsrs/scheduler.ts:9`) returns `'fsrs'` only on an exact
`SCHEDULER=fsrs`, so **SM-2 is live by default**. FSRS is computed on every attempt
regardless of the flag and logged to `fsrs_shadow_log`; under the flag it overrides only
`interval_days` and `due_at`, and SM-2's bookkeeping is always kept so switching either
way is instant. Any FSRS failure falls back to SM-2.

Two things to know. Real evidence is **n = 1** shadow row against the 30-row minimum
(`Research/fsrs-shadow-comparison.md`), so no cutover recommendation can be drawn. And
under `SCHEDULER=fsrs`, FSRS resumes its state from `fsrs_shadow_log` — the
"observational only" log is load-bearing, so a missing migration 004 silently degrades
the live scheduler to SM-2.

Correction to an earlier note in this project's survey: `reconcileBktSm2OnLoad`, the
overdue `p_know` decay, **is** wired into the live app, at
`src/app/api/session/route.ts:109`, as well as into the simulator. It is not
simulator-only.

Left to do: real review logs; FSRS-6 parameter refit (default parameters are
over-confident on the simulator — AUC 0.519 → 0.622 but log-loss 0.655 → 0.735); and the
latency fix, without which both schedulers see every correct answer as "Easy".

### 6. Behaviour analytics (time, retries, hesitation)

**Status: the storage layer is done; the signals are mostly zeros.**

Migration 003 adds `motivation_state`, `consecutive_errors`, `slow_response_streak`,
`behavior_modifier` and `hesitation_ms` to `attempt_events`, and they are written on
every attempt with an insert-to-reread parity fixture proving it. `insertAttempt`
(`queries.ts:197-231`) even falls back to a legacy row shape on un-migrated
deployments.

What is actually captured: `motivation_state`, `consecutive_errors`,
`slow_response_streak` and `behavior_modifier` are real. `latency_ms` is ~0,
`hesitation_ms` is always 0, `revision_count` is always 0, `error_type` is always null.
Retries are not modelled anywhere. So of the three things this item names — time,
retries, hesitation — **none is currently measured**.

Left to do: the latency fix; a client-side retry counter feeding `revision_count`;
hesitation measured as time-to-first-interaction rather than derived from total latency;
and Engine 5 for `error_type`.

### 7. Bloom's taxonomy tagging for cognitive-level control

**Status: done at phase granularity; per-question tagging was deliberately dropped.**

The original design tagged every practice question with a Bloom level. That was
replaced (`MASTER_PLAN.md:124`) by a macro layer: skill-level BKT is the micro
evaluation, and Bloom's is one level up, as an optional self-check per phase. Counted in
the content: **9 phase evaluations, 153 tagged questions** — 25–26 per level across
remember / understand / apply / analyze / evaluate / create. `bloom_level` appears on
**0** practice questions, and `BLOOM-5` (Bloom-biased question selection) was dropped
because per-phase granularity leaves no per-question signal to bias with.

Phase-evaluation attempts deliberately bypass the whole BKT/SM-2/motivation pipeline
(`src/app/api/phase-evaluation/attempt/route.ts:10-13`), writing null for
`p_know_before/after` and every behaviour column.

Left to do: a decision, not code. If item 1 lands and explanations start producing a
per-question cognitive signal, per-question Bloom tagging becomes useful again and
BLOOM-5 becomes possible. Until then this item is complete as redesigned, and saying so
is more honest than leaving it open.

---

## Suggested order

1. **Fix `latency_ms`.** Smallest change, unblocks items 3, 5 and 6, and makes four
   existing subsystems start working. Nothing here should precede it.
2. **Finish the DKT curve work** (item 4, Labs 7–9) and add the growth term to the
   cutover gate, so the gate cannot approve a regression on growth.
3. **Author explain-format questions and persist explanations** (item 1), which is what
   makes items 2 and 3 worth their existing code.
4. **Retry counter and hesitation-as-time-to-first-interaction** (item 6).
5. **Accumulate real review logs, then refit FSRS** (item 5). Gated on usage, not on
   engineering.
6. **Revisit per-question Bloom tagging** (item 7) once item 1 supplies the signal.
7. **Reconcile or retire `MASTER_PLAN.md`, `PROGRESS.md` and `AUDIT_REPORT.md`**, which
   currently cost more in misdirection than they provide in history.

## What this document does not cover

Live cutovers. Per `DEVELOPMENT_LOOP.md:113`, flipping an experimental system to
production behaviour — `SCHEDULER=fsrs`, a DKT cutover — needs human sign-off even when
every automated check passes. Nothing in Labs 7–9 switches anything live.
