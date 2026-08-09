# Synaptic — Forward Plan: Fulfilling the Thesis's Compulsory Promises via the Best Available Path

## Context

The submitted thesis contains a formal "7.2 Future Enhancements" section — 10 promised items. These are **non-negotiable**: every single one must ship in the real, built project. This holds regardless of what the lab docs do or don't cover — if a lab concept lines up with a promise, pull it in (e.g. "explanation-based answers" ↔ the Feynman Loop are the same idea, so Feynman Loop *is* the implementation of that promise). If no lab concept lines up, the promise still gets built directly. Nothing on the 10-item list is allowed to be dropped or left as a lab-only design doc. The one sequencing rule: the Phase 0 critical/foundation fixes (BKT/SM-2 actually integrated, tests, etc.) happen first, because several of the 10 promises are literally impossible to build honestly on an engine that has this known-broken state — but foundation-first is about ordering, not about narrowing the 10-item scope.

Separately, `Research/lab/` (14 docs, 00-why through 13-content-structure) independently describes a much larger three-track platform vision, written after the thesis. The task here is to **evaluate each compulsory promise against what the lab direction offers**: where the lab has a better, more concrete answer, use it. Where the lab doesn't actually solve the promise (or solves a different problem), that item still has to be built directly — the lab is a resource for *how*, not a replacement for *what was promised*.

The standing instruction: this is not about producing a better-looking college project — the goal is a real, sellable, world-class product, of which the thesis is a byproduct. So "compulsory" doesn't mean "stub it for the write-up" — each item needs a genuine implementation, built with the same quality bar as the rest of the product, sequenced sensibly rather than rushed all at once.

Current verified state (from direct code/content inspection): the engine (`src/lib/bkt/`, `src/lib/sm2/`, `src/lib/motivation/`, `src/lib/session/engine.ts`) is real and coherent, no stubs, but BKT uses one global parameter set and — critically — **BKT and SM-2 are not actually integrated**: `p_know` does not decay when a review is overdue. Content covers 53 nodes/81 edges, Phases 1-3 complete (210 questions), Phases 4-8 are placeholders. Supabase migration is complete. No automated tests exist anywhere.

Two internal lab-doc conflicts are resolved as: **5-stage Orbit model** (`07-audit.md`/`12-design-spec.md`, supersedes 03's 7-stage draft) and **`12-design-spec.md`'s "Seven Worlds" design system** (supersedes `11-demo-masterplan.md`'s own earlier palette).

---

## Promise-by-Promise Evaluation

| # | Thesis Promise | What the lab offers | Verdict | Where it lands |
|---|---|---|---|---|
| 1 | Explanation-based answers | Feynman Loop teaching canvas (`08`,`09`,`12`,`13`) — structured branching dialogue, not free-text alone | **Lab is better** — a designed interaction, not just a text box | Build the mechanism now (Foundation+Near-term); full character content later |
| 2 | Reasoning evaluation (rule-based → NLP/LLM) | `07-audit` explicitly rejects keyword-matching; Feynman gap-detection ("explained method, not meaning") + Skeptic character challenge pattern are the rule-based tier | **Lab is better** — and it's still the same rule-based-first roadmap the thesis proposed | Rule-based version = Near-term; NLP/LLM upgrade = documented later trigger |
| 3 | Combine correctness + reasoning + behaviour as **input to BKT** | Lab uses behavior/error signals to drive construct *selection* (Engine 6), not to modify the BKT probability update itself. Audit's CRITICAL #1 is BKT/SM-2 not integrated at all | **Gap — lab doesn't solve this.** Thesis's ambition here is more rigorous than what lab specifies | Original work, required in Foundation phase |
| 4 | Upgrade BKT → DKT | Named only in `07-audit` as a Phase 4→5 risk; deferred until 50k+ sessions exist (matches thesis's own "future" framing) | **Agreement, better-specified** — lab gives a concrete data-threshold trigger | Documented future upgrade, not built now — legitimately later for both |
| 5 | Strengthen SM-2 with adaptive scheduling | `07-audit` CRITICAL #1 — this exact gap, but flagged as **launch-blocking**, not a future-enhancement | **Lab shows this is more urgent than the thesis framed it** | Foundation phase — first thing built, not last |
| 6 | Behaviour analytics (time, retries, hesitation) | `08-interfaces` Layer 2 lists these signals explicitly; current code's motivation FSM **already captures latency + streak signals** | **Partially already done** — lab + existing code are ahead of the promise | Extend existing FSM signal capture into a persisted analytics layer — mostly wiring |
| 7 | Bloom's taxonomy tagging | `07-audit` confirms `bloom_level` is already correct in the content schema *(CORRECTED by Finding 06: the field does not exist in the schema at all — the audit's claim was stale)* | ~~Schema-level already right~~ **Needs a real classification plan from scratch** — see Finding 06 | Parallel-eligible track alongside Phase 0-2 (2026-08-09 decision), not a "verify and wire" task |
| 8 | Multi-metric scoring | `construct_affinities`, BKT-movement comparison (e.g. "2.6× faster than baseline"), rank projection, pace profile | **Lab is better** — concrete, product-relevant metrics vs. a generic score | Adopt BKT-movement comparison as the core artifact; build alongside Foundation's engine fixes |
| 9 | Coding + real-time evaluation modules | Code Editor environment + Debug the Machine construct, fully spec'd incl. live test pass/fail (`09`,`11`,`13`) | **Lab is better** — concrete design vs. a vague promise | Track 2 scope, later phase (already gated in buildplan) — but now has a real spec instead of just an intention |
| 10 | Advanced dashboard + skill profile + recommendations | Learner Profile schema (6 dimensions, `08`), V6/V7 dashboard screens (`11`), affinity-bandit weights | **Lab is substantially better** — concrete schema + screens vs. a generic promise | Adopt lab's Learner Profile + dashboard design, built in the later phase per buildplan (Phase 5) |

**Net finding:** the lab direction is a better implementation path for 7 of 10 promises, already partially delivers 2 more (#6, #7), and reveals that one item (#3, BKT-input fusion) has no existing answer anywhere and must be designed and built directly. It also reveals that #5 (SM-2/BKT integration) is more urgent than "future enhancement" — it's foundation-blocking, confirmed by both the audit and direct code inspection.

---

## Mixture Strategy — How Lab and Original Work Combine, Per Promise

This is the concrete recipe for each item: what's pulled from lab verbatim, what's original glue code, and how they merge into one working feature (not two parallel systems).

**1. Explanation-based answers** — *Lab piece:* the Feynman Loop's teaching-canvas UI and branching structure (`13-content-structure.md`'s transcript is the literal spec — trigger → intro → teaching canvas → confused follow-up → gap callout → rebuild → summary). *Original piece:* none needed for the UI/flow itself — it's a direct reuse. *Combine:* build the Feynman Loop as specified; its output (the learner's free-text explanation + which branch it triggered) is the raw signal promise #2 classifies.

**2. Reasoning evaluation module** — *Lab piece:* the classification categories lab already defines (method-only vs. meaning-included vs. gap, from the Feynman transcript; "prove it" / "not sufficient" challenge pattern from the Skeptic character). *Original piece:* the actual rule-based classifier function that takes item 1's free text and returns one of lab's categories — lab describes the categories and the UI reaction to each, but not the classification algorithm itself. *Combine:* original classifier, lab's category taxonomy and branching UI reactions.

**3. Correctness + reasoning + behaviour → BKT input** — *Lab piece:* the specific behavior signals to use as inputs (08-interfaces' Layer 2 list: dominant error type, response latency, streaks — already partially captured by the existing motivation FSM in `src/lib/motivation/index.ts`). *Original piece:* the actual math — how promise #2's reasoning classification and the behavior signals get turned into a modifier on `bktUpdate()`'s evidence (e.g. treating a "gap" classification as a partial-credit observation rather than a binary correct/incorrect, and a frustrated-state answer as lower-confidence evidence). Nothing in any lab doc does this; it's the one fully original algorithm in the whole plan. *Combine:* lab's signal vocabulary as the inputs, original weighting/update-rule as the mechanism.

**4. BKT → DKT** — *Lab piece:* the deferral trigger (50k+ sessions, per `platform-direction` memory and `07-audit`'s Phase 4→5 risk note). *Original piece:* none yet — genuinely future work, just inheriting lab's trigger condition instead of the thesis's vague "future work." *Combine:* n/a until triggered.

**5. SM-2 adaptive scheduling** — *Lab piece:* the audit's diagnosis of exactly what's missing (decay-adaptive `p_know`) and the existing partial mechanism to extend (`reconcileBktSm2()` already resets on mastery-loss — lab/audit just clarifies this needs to be the general case, not an edge case). *Original piece:* the generalized decay function itself. *Combine:* lab supplies the diagnosis and the pattern to generalize from; original code does the generalization.

**6. Behaviour analytics** — *Lab piece:* the signal list (08-interfaces Layer 2) and the fact that latency/streak capture already exists in the motivation FSM. *Original piece:* a persistence layer — writing those already-computed signals to a queryable store per attempt, instead of only using them for live FSM state. *Combine:* almost pure lab-signal reuse; the only original part is storage/wiring.

**7. Bloom's taxonomy tagging** — *CORRECTED by Finding 06, superseding the paragraph below:* the `bloom_level` field does not exist in the schema — the lab audit's claim that it was "already correct" was stale. *Original piece, now the whole job, not just half of it:* define a closed vocabulary (same pattern as `difficulty_tier`/`error_type`), add the schema field, retrofit the 45 populated skills, extend the validator, then wire it into `engine.ts`'s difficulty-tier selection. Runs as a parallel-eligible track (2026-08-09 decision), not gating Phase 0. *(Original text, kept for the record: "Lab piece: confirms the `bloom_level` schema field is correctly designed... Original piece: verifying it's populated in content and wiring it into `engine.ts`'s difficulty-tier selection if not already consulted.")*

**8. Multi-metric scoring** — *Lab piece:* the specific metrics to compute (BKT-movement comparison "2.6× faster than baseline," construct affinities, pace/rank projection — from `13-content-structure.md` and `11-demo-masterplan.md`). *Original piece:* computing these from real session data instead of the lab's illustrative hardcoded example numbers. *Combine:* lab defines which metrics matter and how they're presented; original code makes them real.

**9. Coding + real-time evaluation modules** — *Lab piece:* the full Code Editor environment + Debug the Machine construct spec, including the live test-pass/fail transcript (`09-library.md`, `13-content-structure.md`). *Original piece:* none conceptually — direct reuse, deferred to Track 2 timing per buildplan. *Combine:* build lab's spec as-is when Track 2 starts.

**10. Advanced dashboard + skill profile + recommendations** — *Lab piece:* the Learner Profile schema (6 dimensions, 08-interfaces) and the V6/V7 dashboard screens (11-demo-masterplan). *Original piece:* the actual inference/reweighting logic behind each dimension needs real usage data to be honest, not just the schema — lab specifies the shape, not the trained behavior. *Combine:* lab's schema and screens as the target; original data pipeline once enough usage exists (buildplan's own Phase 5 gate).

**Bottom line on the mix:** for 6 of 10 items (1, 4, 6, 7, 9, and the deferred part of 10) it's close to pure lab reuse with light original wiring. For 3 items (2, 5, 8) lab supplies the vocabulary/diagnosis/target metrics but the actual mechanism is original. For 1 item (3) it's fully original — lab has no answer, only adjacent ingredients.

---

## Unified Build Plan

### Phase 0 — Foundation (closes launch-blocking gaps; covers promises #3, #5)
1. Integrate BKT + SM-2 for real: `p_know` decays when a review is overdue (extend `reconcileBktSm2()` in `src/lib/sm2/index.ts`, keyed off `urgency.ts`'s overdue calc, applied on every session load — not just the existing mastery-loss edge case). This also closes the item-3 correction above: once decay is real, the existing Orbit mapping's *input* stops going stale. **[Promise #5]**
2. Extend the BKT update itself to take a combined evidence signal — correctness (existing) + a reasoning-quality modifier (from #2's gap-detection output) + a behavior modifier (from the existing motivation-FSM signals) — as weighted adjustments to the evidence used in `bktUpdate()`, not just downstream UX routing. **[Promise #3 — original work, no lab equivalent]**
3. Define session length and review-debt policy explicitly (currently implicit) in `src/lib/session/engine.ts`.
4. **Give `selectNextTask()` arc memory** (Finding 04, Critical — orphaned until now, never actually scheduled in an earlier pass of this doc despite being written up in full): stay on a concept until it's reached a good degree of completion, not just for a bounded task count — the switch condition should be "this topic's arc is actually done" (e.g. the in-arc `p_know` movement/mastery-state has genuinely progressed, or the Feynman/practice sequence for this concept has resolved), with the bounded-task-run as a fallback cap only, not the primary trigger. Surface a one-line bridge when it does switch, instead of a bare "Selecting next skill…" reload. Depends on item 3 above — Finding 02 explicitly notes arc-continuity can't be built honestly until the engine has a defined notion of session length/time-remaining to budget against, and that budget now also has to accommodate "let this topic finish" rather than cutting it off on a fixed count. This is also a real prerequisite for Phase 1 landing well: per Finding 04, "even a well-graded explanation doesn't build flow if the topic never gets to breathe before the engine yanks attention elsewhere."
5. Add the automated test suite that doesn't currently exist, covering `bkt/`, `sm2/`, `motivation/`, `session/engine.ts` — non-negotiable for a "smooth, sellable" product and for safely doing #1-2 above without regressing existing behavior.
6. Fix dead Supabase-migration debris (`scripts/init-db.js`, `reset-db.js`).

**Promise #7 (Bloom's tagging) is explicitly NOT a Phase 0 item.** Finding 06 established `bloom_level` doesn't exist in the schema at all (corrects the "verify and wire in" framing this doc originally used) and needs its own classification plan — skill-granularity rules, a closed vocabulary, validator extensions, a retrofit pass on the 45 populated skills. Per decision on 2026-08-09: this runs as a **parallel-eligible track** alongside Phase 0-2, same treatment as DKT/FSRS/NLP below — it does not block or gate Phase 0's completion. See the parallel-eligible section for its checklist.

### Phase 1 — Explanation & Reasoning Evaluation (covers promises #1, #2, contributes to #8)

**Scope decision (2026-08-09, resolves `discovery-model.md` §7's open sequencing question):** "combination" — build the Feynman Loop mechanism now against **existing explanation-first content**, don't hold the mechanism hostage to rewriting all content into discovery/problem-first form first. Discovery Model's problem-first framing (`vision/discovery-model.md` §1) instead becomes the standard for **new content authored from here on**, starting with Phase 2's Phases 4-8 content completion (item 3 below) — those get authored discovery-first from the start rather than retrofitted. Existing Phases 1-3 content gets a discovery-style retrofit pass later, not blocking Phase 1.

1. Build the structured explanation-capture mechanism: a teaching-canvas interaction (rule-based branching per `13-content-structure.md`'s Feynman Loop transcript as the concrete spec) that classifies a learner's free-text explanation into method-only / meaning-included / gap patterns, on existing content. **[Promise #1, #2 — rule-based tier]** (Resumes the classifier drafted and reverted per Finding 03 — same taxonomy, no redesign needed since masking/vocabulary work is separate and doesn't block this.)
2. Feed the gap-detection output into Phase 0 step 2's BKT reasoning-quality modifier — this is what makes #3 real rather than a stub input.
3. Compute the BKT-movement comparison (plain-session baseline vs. this session) from actual engine data, not hardcoded — this is the concrete multi-metric artifact for **Promise #8**.
4. Document the NLP/LLM upgrade path for #2 (trigger condition, not built now) — matches the thesis's own stated roadmap.

### Phase 2 — Analytics & Content Completion (covers promise #6, matures the product)
1. Persist the motivation FSM's existing signal capture (latency, streaks) into a queryable analytics layer — retries and hesitation time per question, not just live in-session state. **[Promise #6]**
2. Re-skin the existing pages (`dashboard`, `graph`, `learn/skill/[skill_id]`) to the locked Seven Worlds design spec (`12-design-spec.md` Priority-1 screens) — session card as dominant CTA, reasoning line pulled from real engine output, Orbit badges using the locked 5-stage colors. **Fold in Finding 05's progressive-disclosure fix here** (also previously orphaned, never scheduled despite being written up): `LearnPanel`/`ExplanationPanel` switch from rendering the full explanation `body` immediately to a short `key_insight`-led opening with the rest on demand — schema-compatible, no content-schema change needed, and it's the same components this re-skin already touches, so doing it as a separate later pass would mean touching the same files twice.
3. Complete JEE Math content for Phases 4-8 using the existing validated pipeline (`content/graph/nodes.json`, `content/questions/by-skill/`, `scripts/validate-content.js`), so Track 1 Math is a genuinely complete syllabus, not 3 of 8 phases. **Author Phases 4-8 discovery-first** (per Phase 1's scope decision above) — problem/scenario opening per concept, not explanation-first — so new content doesn't need a retrofit pass later.

### Phase 3 — Later-phase items (documented now, built after Phase 0-2 are solid)
1. **Promise #10**: adopt the lab's Learner Profile schema (`08-interfaces.md`, 6 dimensions) + V6/V7 dashboard concepts (`11-demo-masterplan.md`) as the advanced dashboard/skill-profile/recommendation system — buildplan gates this to Phase 5 (post-Track-1), which is the right sequencing since it needs real usage data to be honest rather than decorative.
2. **Promise #9**: adopt the lab's Code Editor environment + Debug the Machine construct spec (`09-library.md`, `13-content-structure.md`'s scripted transcript as acceptance script) as Track 2 scope.
3. **Promise #4**: DKT upgrade, gated to the lab's own data threshold (50k+ sessions), not built now.
4. **Composite puzzles** (`vision/discovery-model.md` §5 — one puzzle requiring multiple prior skills as evidence, credit attributed per concept): not one of the 10 compulsory promises, so per the "promises are the base, findings/vision are the strategy layered on top" decision (2026-08-09), this is documented here as a future item, not scoped or built now. Needs Finding 06's content-classification work done first (multi-concept tagging is strictly harder than single-skill tagging) and a redesigned `insertAttempt()` (currently single `skill_id`) — revisit once Phase 0-2 and the Bloom's/classification track are solid.

Every one of the 10 compulsory promises has a concrete landing phase above — none are dropped, and each uses the better of (thesis's own idea) vs (lab's designed equivalent), with #3 flagged as the one genuinely original piece of engineering neither source solves.

---

## Critical Fixes (directly from `07-audit.md`, cross-checked against current code)

These are the specific, named issues the lab's own audit raised as blockers — restated here as concrete fixes, with a note on which are still open vs. already resolved in code (verified by direct inspection, not assumed from the docs):

1. **BKT and SM-2 not integrated (CRITICAL, still open)** — `p_known` is static and doesn't model forgetting; a concept can show high mastery while actually forgotten because the SM-2 review is overdue. → Phase 0, item 1.
2. **Session length undefined (CRITICAL, still open)** — blocks honest session-engine design; currently implicit in `src/lib/session/engine.ts`'s tiering. → Phase 0, item 4.
3. **Orbit stages never mapped to BKT `p_known` ranges — CORRECTED, already resolved in code** (per `findings/07-resolved-and-corrected.md`): `deriveMasteryState()` (`src/lib/bkt/index.ts:15-21`) already maps `p_know` to the 5-state model with explicit thresholds (`MASTERY_THRESHOLD=0.65`, `FRAGILE_THRESHOLD=0.55`, `LEARNING_THRESHOLD=0.30`). The mapping is honest; what's still open is that its *input* goes stale — see item 1 / Finding 01 (`p_know` doesn't decay with elapsed time). No separate Phase 0 item needed for this; folded into item 1.
4. **Review debt policy undefined (CRITICAL, still open)** — no defined behavior when overdue reviews exceed session capacity. → Phase 0, item 4.
5. **Motivation FSM "has no defined transition signals" (CRITICAL per audit, but ALREADY RESOLVED in code)** — direct inspection of `src/lib/motivation/index.ts` shows concrete numeric triggers already exist (≥3 consecutive errors, ≥4 slow responses >15s, ≥5-correct-streak with p_know≥0.80, 10-minute intervention cooldown). This is a case where the lab doc is stale relative to the code — no action needed here beyond backporting the fact into the docs.
6. **Phase 1 unrealistically large (SERIOUS)** — audit recommends splitting into 1a/1b/1c; `10-buildplan.md` already appears to be the response to this (it sequences far more granularly than the original `05-phases.md`). No separate action needed — just confirms `10-buildplan.md` is the phase reference to follow, not `05-phases.md`.
7. **Feynman Loop keyword-matching flagged as a weak signal (SERIOUS)** — audit explicitly recommends structured self-grading over keyword matching. This is already reflected in the Mixture Strategy item #2 above (original rule-based classifier using lab's category taxonomy, not keyword matching).

Items 1-4 are the true launch-blockers and are why Phase 0 exists before any of the 10 promises can be built honestly.

---

## Implementation Approach — How We Proceed From Here

1. **Foundation first, always** — Phase 0's four critical fixes land before any promise-specific work starts. Each fix gets its own commit, verified independently (see Verification section) before moving to the next — no batching multiple engine changes into one unverified commit, since `bkt/sm2/engine.ts` have zero regression protection today.
2. **Add tests as each fix lands, not after** — since there's currently no test suite, the discipline is: write the test that proves the bug (e.g. "p_know does not decay when overdue" reproduced as a failing test) before writing the fix, so the fix is provably correct and the regression is locked out permanently.
3. **One promise at a time within each phase** — Phase 1 and Phase 2 each bundle related promises, but implementation still proceeds promise-by-promise with its own verification step, not as one large merge.
4. **No parallel tracks** — there is one plan: fix the foundation, then build all 10 promises using the Mixture Strategy above, in the phase order given. The later lab-vision items (Track 2, DKT, full personalization) are simply the last phase of the same plan, not a separate track.
5. **Quality bar**: every fix and every promise implementation must pass its own verification step and the existing UI/UX audit baseline (don't regress April's contrast/size standards) before being considered done — quality and taking time over rushing.

---

## Testing Strategy & Dataset (important for the academic evaluation, not just product quality)

A knowledge-tracing system's credibility — both as a product and as a defensible piece of academic work — rests on showing the model actually predicts learning, not just that the code runs. This needs to be a first-class part of the plan, not an afterthought:

1. **Unit tests** (Phase 0, item 6) — `bkt/`, `sm2/`, `motivation/`, `session/engine.ts` covered directly, proving each fix and preventing regressions.
2. **Simulated-learner dataset** — per `10-buildplan.md`'s own Phase 0 spec (simulated learners over 60 days), generate synthetic interaction sequences (varying ability levels, forgetting rates, error patterns) to validate: BKT's `p_know` converges sensibly, SM-2 intervals behave correctly under the new decay-integration fix, and the session selector doesn't get stuck in any tier. This is cheap to build and catches engine bugs before real users do.
3. **Predictive accuracy evaluation (the actual academic result)** — standard knowledge-tracing evaluation methodology, directly comparable to the bibliography's own cited methods (Corbett & Anderson 1994, Piech et al.'s DKT paper): hold out a fraction of real attempt data (once Supabase's `attempt` table has enough volume) and measure how well BKT's `p_know` predicts the next attempt's correctness (AUC / accuracy), reported before and after the Phase 0 BKT-SM2 integration fix. This produces a real, defensible quantitative result for the thesis, not just a feature checklist.
4. **Before/after comparison for construct value** — the BKT-movement comparison built for Promise #8 (plain-session baseline vs. Feynman-session) doubles as evaluation data for the reasoning-evaluation module's actual effectiveness, not just a UI number.
5. **Content validation** — `scripts/validate-content.js` continues to run on every content change (existing tool, keep using it) as the dataset integrity check for the 210+ questions and their graph structure.

---

## DKT / FSRS / NLP — Data, Training & Development Notes

Item 3 above (predictive accuracy evaluation) and Promise #4 (DKT) raise a sharper question than "do we have data": **which components genuinely need real data to be trained/validated honestly, versus which can be tested against a known spec using synthetic data.** Treating these the same is how a plan quietly ships a meaningless benchmark. This section is the detailed answer for the three components that actually touch real-world data or external models — DKT, FSRS, and the NLP/LLM reasoning grader — plus the development discipline to apply to each as they're built, not just at evaluation time.

### A. DKT — benchmark-first, not Synaptic-data-first

DKT is a sequence model (LSTM) that learns patterns from data — it cannot be meaningfully trained on Synaptic's own simulated learners, because that would just teach it to reproduce whatever generative rule created the simulation (circular, proves nothing about real learning). It also cannot be meaningfully trained on Synaptic's own real usage yet, because the platform is nowhere near the volume this needs.

1. **Dataset**: use a public knowledge-tracing benchmark — **ASSISTments 2009-2010** is the primary choice (~4,151 students, ~525k skill-tagged interactions, the same dataset family used by Piech et al. 2015, already in the bibliography). Junyi Academy or EdNet are fallbacks if access/format issues come up. Check and record the dataset's license/citation terms before use — this matters for a thesis appendix and for keeping the repo clean.
2. **Preprocessing**: convert to `(student_id, skill_id, correct, timestamp)` sequences, sorted per student. This does not need to map onto Synaptic's own skill graph — it's a methodology benchmark, not a content integration.
3. **Split by student, not by interaction** — splitting at the interaction level leaks a student's future answers into their own training signal, which silently inflates both DKT's and BKT's reported accuracy. This is a real methodology bug to avoid explicitly, and worth a sentence in the thesis showing it was considered.
4. **Model**: a small single-layer LSTM (Piech et al.'s own hyperparameters — roughly 200 hidden units — are a reasonable starting point), trained on the train split, tuned on validation.
5. **Baseline**: fit BKT (per-skill, via EM/Baum-Welch) on the *same* split — comparing DKT against Synaptic's current single-global-parameter BKT would be an unfair, weaker baseline.
6. **Result**: report DKT AUC vs. properly-fit BKT AUC on the same held-out test set. This is the actual thesis-defensible number.
7. **Document explicitly, in the write-up and in code comments**: this benchmarks the DKT *method*, not Synaptic's live engine. The decision to switch Synaptic's own scheduling engine over to DKT stays gated at 50k+ real sessions (existing threshold, unchanged) — the benchmark is evidence the method works, not evidence it's ready to ship here.

**Separate, smaller task — testing the DKT *code* itself:** this is fine with synthetic data, because it's a correctness check on the training loop, not an evaluation of knowledge-tracing quality. A fixed tiny synthetic batch, confirming loss decreases over a few epochs, confirming padding/masking doesn't leak into the loss, confirming output tensor shapes are right. Same category as the BKT/SM-2 unit tests — don't conflate this with the benchmark result above; one proves the code runs, the other proves the method works.

**Development notes for DKT specifically:**
- Keep this entirely outside the shipped Next.js app. It's a research/evaluation script (likely Python + PyTorch), not production code — put it under something like `research/dkt/` with its own `requirements.txt`, and do not add a Python/ML dependency to the app's `package.json` or runtime.
- Don't commit the raw downloaded dataset to the repo — `.gitignore` the raw files, commit only the preprocessing/training scripts and the final results table/plot, so the repo stays clean and license-compliant.
- Timebox it. This is a parallelizable side-track for the thesis result, not a Phase 0-2 blocker — it should never delay the live-engine foundation work.
- When the thesis write-up cites the DKT-vs-BKT number, label it clearly as a benchmark-dataset result, not a Synaptic-production result, so the defense committee sees the distinction was made deliberately, not missed.

### B. FSRS — feasible now, no training required to adopt

FSRS ships with **published default parameters** (fit by the FSRS/Anki community on billions of real reviews). Unlike DKT, you don't need any of your own data to use it correctly.

1. **Now**: replace SM-2's interval formula with FSRS using its published default weight vector. Use an existing reference implementation's parameter values as ground truth (e.g. cross-check against `ts-fsrs` or `py-fsrs`'s defaults) rather than re-deriving them.
2. **Testing**: this is deterministic, so synthetic data is valid here (unlike DKT) — feed known review histories in and confirm the intervals match the reference implementation's output for the same inputs, not just internal self-consistency.
3. **Rollout discipline — shadow mode before cutover**: don't silently replace SM-2's live scheduling. Compute both SM-2 and FSRS intervals side by side for at least one full review cycle, log both, but keep serving SM-2's schedule to users. Compare the two logs before flipping which one actually drives review timing. This protects real users from a scheduling regression if the FSRS integration has a bug.
4. **Later, optional**: once Synaptic has 5k+ real review events (existing threshold), refit FSRS's 17 parameters to Synaptic's own users via gradient descent for a personalized fit. This is the only part of FSRS that needs real data, and it's an optional refinement, not a blocker to adopting FSRS at all.

**Development notes for FSRS:**
- Land it behind the shadow-mode comparison described above before it touches a real user's schedule.
- If a per-user refit is ever built, treat review-interval history as sensitive-ish behavioral data — no need for a new privacy posture beyond what Synaptic already applies to attempt data, but don't casually export it either.

### C. NLP/LLM — needed for the reasoning-evaluation upgrade, but no custom training

The NLP/LLM step in Promise #2 is the one place an external AI API genuinely belongs in the plan.

1. **Don't train a custom model.** Call an LLM API (Claude) with a structured grading prompt built directly on the existing rubric (method-only / meaning-included / gap, the same taxonomy already defined in the Mixture Strategy's item #2). This needs zero training data to deploy — it replaces the rule-based classifier's ceiling, not its foundation.
2. **Still need a validation set, just a small one.** Collect 50–200 real or hand-authored student explanations with human-assigned ground-truth labels, and measure agreement (e.g. Cohen's kappa) between the API's grading and the human grading. This is realistically self-collectible during Phase 1 testing — it does not require anything like DKT's scale.
3. **Fallback and cost/latency discipline**: the rule-based classifier stays as the always-available fallback (instant, free, deterministic) if the API call fails, times out, or is disabled for cost reasons — the LLM grader should be a strict upgrade path, never a hard dependency that can take the Feynman Loop down.
4. **Cost control**: cache grading results for identical/near-identical explanation text where reasonable, and treat grading as async where the UI allows it, rather than blocking the session flow on a network round trip.

**Development notes for the NLP grader:**
- Log every API grading call's input and output (explanation text, rubric category returned, confidence if available). This does two things: gives an audit trail for later inspection, and organically grows the validation set over time instead of it staying frozen at the initial 50–200 examples.
- Keep the rubric/prompt versioned — if the prompt changes, old logged gradings may no longer be comparable to new ones; note the prompt version alongside each logged result.

### Summary table — what needs what

| Component | Needs training/real data? | Size | Source | Can synthetic data test it? |
|---|---|---|---|---|
| DKT | Yes — real, large | Tens of thousands+ interactions | Public benchmark (ASSISTments) now; Synaptic's own 50k+ sessions later | No (for the model itself) — synthetic only validates the training-loop code, not learning quality |
| FSRS (adopt defaults) | No | — | Published default parameters | Yes — deterministic, cross-check against a reference implementation |
| FSRS (personalized refit) | Optional, real | 5k+ review events | Synaptic's own logs, later | No — refitting needs real forgetting-curve data |
| NLP reasoning grading | No (API-based, not custom-trained) | — | LLM API call | N/A — no training involved |
| NLP grading validation | Yes — real, small | 50–200 labeled examples | Self-collected/hand-authored | No — needs real explanations and human judgment |
| BKT / SM-2 / session-engine correctness | No | — | N/A | Yes — deterministic logic, synthetic simulated learners are the right tool |

**The one discipline that ties all three together**: never let a new, data-dependent, or externally-sourced pipeline (DKT, FSRS, the LLM grader) silently become the thing driving a real user's experience without first running it side-by-side against the current working system and comparing results. Benchmark DKT before touching the live engine at all; shadow-mode FSRS before cutover; fallback-and-log the LLM grader rather than trusting it blind. This is the same "foundation first, verify before replacing" discipline the rest of this plan already applies to Phase 0 — it just needed to be spelled out for the three components that involve data/training/external services specifically, since those fail silently in a way a broken function call doesn't.

---

## Verification

- Phase 0: new test suite passes; manually confirm `p_know` visibly decays after simulating an overdue review; confirm a BKT update with degraded reasoning-quality/behavior signals produces a measurably different posterior than plain correctness alone.
- Phase 1: run the Feynman Loop mechanism against `13-content-structure.md`'s scripted transcript as an acceptance script; confirm the BKT-movement comparison is computed from real session data, not hardcoded.
- Phase 2: `next build` clean (0 TypeScript errors); `npm run validate` passes with Phases 4-8 populated; manually walk dashboard → concept map → session flow and confirm the reasoning line and Orbit badges reflect real engine state.
- Phase 3: each item verified against its own lab-doc acceptance criteria when it's actually scheduled (buildplan Phase 5 / Track 2 gating).

---

## Master Checklist — Sequence From Now to Completion

One linear view of everything above, in the order it actually happens. The DKT, FSRS, and NLP side-tracks are marked **parallel-eligible** — they don't block Phase 0-2 and can be worked whenever there's bandwidth, but their *live cutover* points still depend on the phase they're gated to.

### Done
- [x] Commit + push the four `Research/lab/` docs (`10-buildplan.md`, `11-demo-masterplan.md`, `12-design-spec.md`, `13-content-structure.md`)
- [x] Create the plan doc (`v2/doc/basic-guide.md`)
- [x] Move `v2/` out of `Research/` to the project root, kept separate

### Phase 0 — Foundation (blocks everything else; nothing below starts until this is done — EXCEPT the Bloom's/classification track, which is parallel-eligible, see below)
- [ ] Write the failing test proving `p_know` doesn't decay when a review is overdue
- [ ] Fix it: generalize `reconcileBktSm2()` so decay applies on every session load, not just the mastery-loss edge case **[Promise #5]** (also closes the Orbit-mapping input-staleness gap, per corrected Critical Fixes item 3 — the mapping itself already exists in `deriveMasteryState()`, no separate lock-in step needed)
- [ ] Extend `bktUpdate()` to take combined evidence — correctness + reasoning-quality modifier + behavior modifier **[Promise #3 — original work]**
- [ ] Define session length + review-debt policy explicitly in `src/lib/session/engine.ts`
- [ ] Give `selectNextTask()` arc memory — hold a topic until it's reached a good degree of completion (mastery/`p_know` movement, not just a task count), bounded-count is a fallback cap only — plus a one-line bridge on topic switch instead of a bare reload **[Finding 04 — Critical, was orphaned, now scheduled]**
- [ ] Build the test suite: `bkt/`, `sm2/`, `motivation/`, `session/engine.ts`
- [ ] Remove dead Supabase-migration debris (`scripts/init-db.js`, `scripts/reset-db.js`)

### Parallel-eligible — Content classification & Bloom's tagging (Finding 06; start anytime, doesn't block or gate Phase 0 per 2026-08-09 decision) **[Promise #7]**
- [ ] Define explicit, checkable skill-granularity rules (when two sub-concepts are one `skill_id` vs. two)
- [ ] Add `bloom_level` to the `Question`/`SkillNode` schema (`src/types/index.ts`) as a closed, versioned vocabulary — same pattern as the existing `difficulty_tier`/`error_type` enums
- [ ] Extend `scripts/validate-content.js` to check bank-size minimums, tier coverage, and tag-vocabulary closure
- [ ] Retrofit `bloom_level` tags onto the 45 currently-populated skills
- [ ] Wire `bloom_level` into `engine.ts`'s tier/difficulty selection once it's real content, not a stub
- [ ] Gate Phase 2's Phases 4-8 content authoring on this vocabulary existing, so new content is tagged correctly from creation rather than retrofitted later

### Phase 1 — Explanation & Reasoning Evaluation
*(Scope decision 2026-08-09: build against existing explanation-first content now; discovery-first authoring applies to new content going forward — see Phase 2's content item and `vision/discovery-model.md` §7.)*
- [ ] Build the Feynman Loop teaching-canvas interaction (rule-based branching, per `13-content-structure.md`'s transcript) **[Promise #1]**
- [ ] Build the rule-based classifier: method-only / meaning-included / gap **[Promise #2, rule-based tier]**
- [ ] Wire the gap-detection output into Phase 0's BKT reasoning-quality modifier — makes Promise #3 real, not stubbed
- [ ] Compute the BKT-movement comparison from real session data (plain-session vs. Feynman-session) **[Promise #8]**
- [ ] Document the NLP/LLM upgrade trigger for #2 (condition, not the build itself)

### Parallel-eligible — DKT benchmark (start anytime after Phase 0 test discipline exists; doesn't block Phase 1/2)
- [ ] Download ASSISTments 2009-2010, record license/citation terms
- [ ] Preprocess into `(student_id, skill_id, correct, timestamp)` sequences
- [ ] Split by student (not by interaction)
- [ ] Fit a proper per-skill BKT baseline on the same split
- [ ] Train a small LSTM DKT on train/val
- [ ] Evaluate DKT AUC vs. BKT AUC on the held-out test set
- [ ] Unit-test the DKT training loop against a synthetic tiny batch (loss decreases, no mask leakage, correct shapes)
- [ ] Write up the result, labeled explicitly as a benchmark-dataset result, not a Synaptic-production result

### Phase 2 — Analytics & Content Completion
- [ ] Persist motivation-FSM signals (latency, retries, hesitation) into a queryable analytics layer **[Promise #6]**
- [ ] Re-skin `dashboard`, `graph`, `learn/skill/[skill_id]` to the locked Seven Worlds design spec, folding in Finding 05's progressive-disclosure fix (`key_insight`-led opening, full body on demand) **[Finding 05 — Serious, was orphaned, now scheduled]**
- [ ] Complete JEE Math content for Phases 4-8 via the existing validated content pipeline, **authored discovery-first** (problem/scenario opening per concept, per `vision/discovery-model.md` §1) and tagged with `bloom_level` per the classification track above

### Parallel-eligible — FSRS (start anytime after SM-2's current behavior is well-tested in Phase 0)
- [ ] Pull FSRS's published default parameters from a reference implementation
- [ ] Test FSRS interval output against the reference implementation for known inputs
- [ ] Run FSRS in shadow mode alongside SM-2 for at least one full review cycle (compute + log both, serve SM-2 live)
- [ ] Compare shadow-mode logs; decide on cutover
- [ ] Switch live scheduling to FSRS (only after the comparison looks right)
- [ ] *(Optional, needs 5k+ real review events)* Refit FSRS's 17 parameters to Synaptic's own users

### Parallel-eligible — NLP/LLM reasoning grader (start once Phase 1's rule-based classifier exists, since it needs the same rubric)
- [ ] Collect 50–200 labeled real/hand-authored explanation examples
- [ ] Design the rubric-based grading prompt for the LLM API, versioned
- [ ] Run the API grader against the validation set; measure agreement (e.g. Cohen's kappa) vs. human labels
- [ ] Wire in the rule-based classifier as a hard fallback on API failure/timeout
- [ ] Add caching for repeated/near-identical explanations (cost control)
- [ ] Log every graded call (input, output, rubric/prompt version) — grows the validation set organically

### Phase 3 — Later-phase items (only after Phase 0-2 are solid)
- [ ] **Promise #10**: adopt the Learner Profile schema (6 dimensions) + V6/V7 dashboard concepts — gated to buildplan Phase 5, needs real usage data to be honest
- [ ] **Promise #9**: build the Code Editor + Debug the Machine construct — Track 2 scope
- [ ] **Promise #4 (DKT live cutover)**: switch Synaptic's own engine to DKT — gated at 50k+ real sessions; the parallel-eligible benchmark work above is prior art for this, not a substitute for it
- [ ] **Composite puzzles** (`vision/discovery-model.md` §5, not a compulsory promise): design + build multi-skill attempts with per-concept credit attribution — needs the Bloom's/classification track done first (multi-concept tagging) and a redesigned `insertAttempt()`; revisit once Phase 0-2 are solid, per 2026-08-09 decision

### Final verification & thesis defense prep
- [ ] Full regression pass: `next build` clean, `npm run validate` passes, full test suite green
- [ ] Manual walkthrough: dashboard → concept map → session flow, confirming reasoning line + Orbit badges reflect real engine state
- [ ] Compile the thesis results package: DKT-vs-BKT benchmark comparison, real-data predictive-accuracy AUC (once Supabase's `attempt` table has volume), before/after BKT-movement comparison for the Feynman Loop
- [ ] Final pass on this doc (`v2/doc/basic-guide.md`) reconciling what was actually shipped against what was planned
