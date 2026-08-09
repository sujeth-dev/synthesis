# The Discovery Model — Problem-First, Masked-Mechanics Learning

This is a design pillar, not a bug list — it belongs next to `basic-guide.md` (the build plan) and `findings/` (what's broken in the current build), as a third document: what the experience should actually feel like. Four ideas raised across this session, each thought through to a concrete resolution rather than left as an aspiration.

---

## 1. Discovery content — problem/puzzle-solving as the default, not explanation-first

**The idea:** every concept should begin with a problem, not an explanation. The learner is guided through questions, observations, and reasoning toward the answer themselves — each stage feels like discovery, not instruction.

**Where this overrides existing docs, explicitly:** `08-interfaces.md`'s Dimension 3 (Explanation Style) currently treats "problem-first" as one of three interchangeable personalization options — some learners get theory-first, some example-first, based on inferred preference. This idea makes problem-first the **default pedagogy for every learner**, not one option among three. That's a real override, not an addition — worth stating plainly so it isn't silently lost when Dimension 3 gets built.

**Resolution — how this maps onto the Orbit lifecycle (`03-constructs.md`):**
- **Stage 1 (Encounter)** changes fundamentally: instead of "show explanation → practice," the concept opens with a scenario/problem that can't be solved without the concept, and the learner is walked toward it via guided questions — not told it upfront. This is the biggest single change to Phase 1's scope (see §7).
- **Stage 2 (Practice)** stays close to Feynman Loop as already planned — explaining what you just discovered is the natural next step after discovering it.
- Later stages (Apply, Build, Teach) already lean toward active construction in the lab docs — least affected by this change.

**What doesn't change:** low-stakes spaced-repetition practice (quick recall, Plain Session) still has a place — not everything needs to be a puzzle. The claim is that concept *introduction* and meaningful *practice* should default to discovery, not that every single interaction must be a narrative set-piece.

---

## 2. Merge with Bloom's taxonomy — puzzle type as a function of cognitive level

**The idea, made concrete:** instead of `bloom_level` being an inert tag on an isolated MCQ (which is all it could ever be, since — per Finding 06 — it doesn't even exist in the schema yet), Bloom's level becomes the organizing principle for *which construct/puzzle format gets used*. This gives Bloom's real teeth instead of decorative metadata, and gives content authors (and eventually an LLM generator) a well-defined brief instead of a vague one.

**Proposed mapping** (first draft, needs content-team sign-off, not treated as final):

| Bloom level | What the learner must do | Puzzle/construct form |
|---|---|---|
| Remember / Understand | Recognize or restate the concept in a new guise | Discovery scenario — one guided question, answer is the concept itself |
| Apply | Use the concept correctly in an unfamiliar context | Tapas Mode / scenario problem — no scaffolding, single correct application |
| Analyze | Pull apart a scenario to find which concept is actually at play | Detective/investigation format (new — see §5) — multiple plausible causes, only one fits the evidence |
| Evaluate | Judge between two approaches and justify | Two Paths (already exists) |
| Create | Construct something new using the concept | Build task / construction format (already partially exists via `explanation.build_task`) |

This closes Finding 06's gap productively rather than just adding a field: `bloom_level` stops being metadata nobody reads and becomes the thing that literally decides what shows up on screen.

---

## 3. Masked levels — the metrics still exist, they're just never shown raw

**The idea:** p_know, mastery state, "revision due," level transitions should never appear under their real names — always disguised in narrative language.

**The real tension to resolve:** `X-Ray Mode` is an existing Tier-1 non-negotiable construct (`03-constructs.md`) — the learner can see their own knowledge state, and `13-content-structure.md`'s dashboard mockup literally shows "Calculated from your response history using Bayesian Knowledge Tracing" with p_known sparklines. That's the opposite instinct from "never show it."

**Resolution:** these aren't actually incompatible if X-Ray is treated as an **opt-in reveal**, not ambient UI. Concretely:
- During play — puzzles, discovery scenarios, the session flow itself — no raw metric, state name, or system label ever appears. No "Review session" pill, no "62% mastered," no "Level up."
- X-Ray is a separate, deliberately-entered screen ("go look behind the curtain") where the real numbers live, for the learner who wants them.
- **Architecturally**, this means a narrative-copy layer sits between the engine's output and the UI: the engine keeps emitting its literal state (`mastery_state`, `review_urgency`, `reason: 'active_phase_review'`, etc. — exactly as it does now, `session/engine.ts`'s `TaskReason` enum) because that vocabulary is still needed for debugging, analytics, and the thesis's own evaluation. A copy-mapping table translates each internal state to in-world language before it ever reaches a learner-facing screen outside X-Ray. This is buildable now, independent of any final creative names.
- **What's explicitly not resolved here:** the actual fictional vocabulary (what a "review" is called in-world, what a level transition feels like) is a creative-writing decision, not an engineering one. `09-library.md` is direct about this: character and world writing is "the hardest part of the platform to build... not because of engineering complexity, but because of creative production complexity." I'm not going to invent throwaway names to fill this gap — it needs a real creative pass, scoped honestly as its own effort.

---

## 4. The dashboard as a discovery route, not a dashboard

**The idea:** the entry/home screen should feel like a map or a route into an unfolding world, not a literal progress-bar list with percentages.

**Current state:** the dashboard already leans partway there — skill nodes as circles on a path, pulsing when active (per the April UI/UX audit) — but it still shows literal `mastery_state` text and `p_know` percentages directly, which §3's masking principle now rules out for the main flow.

**Resolution:** this shouldn't be designed twice. `basic-guide.md`'s Phase 2 already schedules a dashboard re-skin to the locked Seven Worlds design system (`12-design-spec.md`). That re-skin needs to absorb the masking requirement from §3 and the route/journey framing from this section as part of the same pass, not as a separate later effort — redoing the dashboard once, correctly, rather than skinning it now and re-architecting the information it shows later.

---

## 5. Revision embedded in puzzle webs, not separate drill sessions

Carried over from the previous discussion turn, formalized here: revision shouldn't be a separate `mode: 'review'` session (as it is today — see `learn/page.tsx`'s "Review session" pill) at all. Instead, new puzzles should be *composed* to require 1-2 previously-learned concepts as supporting evidence alongside the new one — revision happens as a side effect of solving something new and interesting, not as its own labeled activity.

**This is the biggest architecture implication in this whole document**, and it deserves to be named plainly: today, one attempt = one `skill_id` (`insertAttempt()` takes a single skill). A puzzle requiring three concepts as clues needs one artifact producing gradable evidence for multiple skills at once, with credit attributed per concept based on which parts the learner actually got right. That's the same weighted-evidence mechanism already sketched for reasoning-quality grading (Finding 03) — same mechanism, now triggered by composite puzzles instead of just explanations. It also raises the bar on Finding 06 (content classification): tagging now has to say not just "this tests skill X" but "this requires X, Y, Z, and here's how a wrong answer implicates which one" — meaningfully harder than single-skill tagging, and needs to be right before anything (LLM or human-authored) generates these at scale.

---

## 6. LLM-generated puzzles — content author, not state owner

Reconnects to the earlier "should the LLM run everything" discussion, narrowed to something defensible: the deterministic engine (BKT/SM-2, unchanged) still decides *what's required next* — which concepts, at what Bloom level, for this learner, right now. The LLM's job is authoring a scenario that naturally requires exactly that — not deciding sequencing, not owning state.

**Grading stays mostly deterministic**, consistent with keeping BKT/SM-2 as the auditable backbone (per the earlier "no LLM in the engine" discussion): each clue in a composite puzzle should have a checkable sub-answer, same as MCQ/fill today, wherever that's feasible. Open-ended reasoning steps still go through something like the reasoning classifier already discussed (rule-based now, LLM-assisted later per Promise #2's own staged roadmap).

**Honest risk, not glossed over:** live, per-session LLM generation of puzzles has a real quality-control problem. An LLM asked to "write a detective case requiring Chain Rule and Integration by Parts" can drift, produce an ambiguous puzzle, or make itself solvable without the target concept at all. This needs a **batch-generate-and-validate pipeline** — puzzles authored and checked before they ever reach a learner — not live generation trusted blind, for the same reason FSRS gets a shadow-mode rollout and DKT gets benchmarked before touching the live engine (see the DKT/FSRS/NLP notes in `basic-guide.md`): never let an unproven, data/LLM-dependent pipeline touch a real learner directly.

---

## 7. What this means for the build plan — a scope decision, not a silent merge

This document changes what "Phase 1" in `basic-guide.md` actually needs to build. Phase 1 was scoped as "Feynman Loop teaching-canvas + rule-based reasoning classifier." Under the Discovery Model, concept *introduction itself* (Orbit Stage 1) also needs to shift from explanation-first to problem-first — a bigger scope than originally planned, and one that touches content authoring (every concept needs a discovery-scenario opening, not just an explanation file) before any engine work can show it off.

This isn't folded into `basic-guide.md` automatically — it's a real scope and sequencing decision that should be made deliberately, not inherited by default. Flagging it here rather than quietly expanding Phase 1's definition.

---

## Open decisions

**Resolved 2026-08-09:**
- **§7 Phase 1 scope** — "combination": Feynman Loop builds now against existing explanation-first content; discovery-first authoring (§1) applies to new content going forward, starting with `basic-guide.md` Phase 2's Phases 4-8 completion. Existing Phases 1-3 content gets a discovery-style retrofit later, not blocking Phase 1. See `basic-guide.md` Phase 1/Phase 2.
- **§5 Composite puzzles** — not one of the 10 compulsory thesis promises, so per the "promises are the base, lab/vision docs are the strategy layered on top" framing, this is documented as a future item (`basic-guide.md` Phase 3 checklist) rather than scoped or built now. Needs Finding 06's classification track done first (multi-concept tagging) plus a redesigned `insertAttempt()`.
- **§2 Bloom's mapping** — its schema prerequisite (Finding 06) runs as a parallel-eligible track alongside Phase 0-2, not gating engine work. See `basic-guide.md`'s Bloom's/classification checklist.

**Still not resolved:**
- Final in-world vocabulary for masked states (needs a creative pass, not an engineering one) — no owner assigned yet; doesn't block Phase 0/1 engine work, but does block Phase 2's dashboard re-skin (§4) since the narrative-copy layer needs real strings.
- Whether Plain Session / MCQ practice survives as a lightweight tier alongside puzzles, or is phased out entirely (this doc assumes it survives, per §1).
- The Analyze-level "detective/investigation" format needs full design treatment (Environment + Character + Game Format) to the same standard `09-library.md` demands of everything else — it does not exist yet in any form.
