# Node Audit + Hero-Path Plan (Phases 1-8)

**Status:** planning only — nothing in this doc has been authored into `content/graph/nodes.json`, `content/graph/edges.json`, or `content/questions/**` yet. `P2-3` in `MASTER_PLAN.md` stays `not_started`; this doc is the concrete plan a follow-up, human-reviewed session executes against.

**Why this doc exists:** Phases 1-3 (45 nodes) are built and shipped, all quiz/MCQ style. Phases 4-8 exist only as 8 placeholder stub nodes. Before the large `P2-3` authoring task starts, this is a real structural audit of what shipped — not an assumption that it's fine because it shipped — plus a concrete, depth-appropriate plan for Phases 4-8, a scalable content architecture for growing it further, and a design (not implementation) for hands-on "build it yourself" practice, since the platform's actual goal is zero-to-hero mastery, not tutorial-only theory.

**Sources read in full before writing this:** `MASTER_PLAN.md`, `PROGRESS.md`, `content/graph/nodes.json` (45 real + 8 stub nodes), `content/graph/edges.json` (83 edges), `src/types/index.ts`, sample files under `content/questions/by-skill/` and `content/explanations/`, `scripts/validate-content.js`, `content/templates/explanation_file.json`, and the relevant lab docs (`Research/lab/09-library.md`, `basic-guide.md`'s Promise #9 discussion) describing the future "Code Editor / Debug the Machine" construct gated to `P3-2`/Track 2.

**How this doc grew:** the Phase 4-8 breakdown originally targeted ~41 nodes. Mid-review, that was judged too shallow for real mastery of the hardest material — 9 nodes cannot honestly cover backpropagation, CNNs, RNNs, and PyTorch. It was revised to ~72 nodes, weighted by actual subject difficulty rather than spread evenly. The same depth test was then run backward onto the already-shipped Phase 2, surfacing two real prerequisite gaps worth appending there too. Per this repo's documentation convention (`v2/doc/findings/07-resolved-and-corrected.md`): corrections below are made visibly, not silently.

---

## Table of contents

- [A. Phase 1-3 structural audit](#a-phase-1-3-structural-audit)
- [B. Phase 4-8 proposed breakdown](#b-phase-4-8-proposed-breakdown-72-nodes-vs-current-8-stubs)
- [C. Hands-on "build it yourself" mechanic](#c-hands-on-build-it-yourself-mechanic--design-not-implementation)
- [D. Scalable, LLM-generatable content architecture](#d-scalable-llm-generatable-content-architecture)
- [E. Open questions for human decision](#e-open-questions-to-flag-for-human-decision)

---

## A. Phase 1-3 structural audit

**Composition, confirmed by direct count (not assumed from any doc's claim):** Phase 1 = 18 nodes, Phase 2 = 15 nodes, Phase 3 = 12 nodes = 45 total.

### A1. Phase label doesn't match phase content

`phase_1_computer_basics` is labeled as if it's about computer fundamentals, but only 5 of its 18 nodes are actually hardware/computer-basics content (`p1_what_is_computer`, `p1_input_output`, `p1_binary_numbers`, `p1_memory_storage`, `p1_cpu_processing`). The other 13 are Python programming fundamentals (`p1_how_code_works` through `p1_modules_imports`). A learner reading "Computer Basics," or the graph UI grouping by it, gets no signal that 70%+ of the phase is actually "Python Fundamentals." Flagged as a possible relabel/split candidate — **not resolved here**, since renaming a phase key that's already shipped has UI/URL/analytics ripple effects beyond this audit's scope. See open question E1.

### A1.5. Phase → main topic → node mapping (the layer the schema doesn't have)

`content/graph/nodes.json` has no `topic`/`subtopic` field — only `phase` (8 values) and a per-node `tags[]`. There is no explicit middle layer between "phase" and "individual skill node" anywhere in the schema or content. The clusters below are *implied* topics, reconstructed from each phase's actual node content, specifically to check whether depth and grouping are actually even (not assumed even because the phase shipped):

**Phase 1 (18 nodes) — implied topics are lopsided, 5 vs. 13:**
- *Computer Fundamentals* (5): `what_is_computer`, `input_output`, `binary_numbers`, `memory_storage`, `cpu_processing`
- *Python Fundamentals* (13): `how_code_works`, `python_intro`, `variables`, `data_types`, `operators`, `strings`, `conditionals`, `loops`, `lists_intro`, `functions`, `debugging`, `scope`, `modules_imports`

This is the concrete evidence behind A1: it isn't just that the label undersells the content, it's that one phase silently contains two topics of very different size with no structural marker distinguishing them.

**Phase 2 (15 nodes) — implied topics are reasonably even, 2-4 each:**
- *Data Structures* (3): `lists_arrays`, `dictionaries`, `sets_tuples`
- *Algorithms & Complexity* (4): `algorithms_intro`, `big_o_basics`, `recursion`, `sorting_searching`
- *Math Foundations* (4): `numpy_basics`, `math_vectors`, `math_matrices`, `linear_functions`
- *Probability & Statistics* (2): `probability_basics`, `statistics_basics`
- *Applied Data Skills* (2): `problem_solving`, `data_exploration`

**Phase 3 (12 nodes) — implied topics are the most even of the three, exactly 3 each:**
- *What AI Is* (3): `what_is_ai`, `ai_vs_ml_vs_dl`, `history_of_ai`
- *How Learning Works* (3): `how_machines_learn`, `types_of_learning`, `training_vs_inference`
- *Data & Evaluation* (3): `data_and_labels`, `model_evaluation`, `overfitting`
- *Practice & Application* (3): `feature_engineering`, `ai_applications`, `ai_dev_cycle`

**Reading across all three:** depth/granularity got *more* disciplined as the phases were built — Phase 1 lopsided, Phase 2 uneven-but-reasonable, Phase 3 a clean 4×3. Section B below is deliberately built topic-first, in Phase 3's style, not Phase 1's. See open question E5 on whether "topic" should become a real schema field rather than an implied grouping.

### A2. Dead-end nodes (no outgoing edge — nothing in the graph builds on them)

Computed directly from all 83 edges against all 45 node IDs. 9 of 45 nodes (20%) have zero outgoing edges:
- Phase 1 (4): `p1_memory_storage`, `p1_cpu_processing`, `p1_strings`, `p1_debugging`
- Phase 2 (4): `p2_dictionaries`, `p2_recursion`, `p2_sets_tuples`, `p2_sorting_searching`
- Phase 3 (1): `p3_history_of_ai`

Some of these are legitimately terminal/applied skills (debugging, sorting/searching). Two are concerning given their own stated `why_it_matters`:
- **`p1_strings`**: its own content says "NLP starts with text" — yet nothing downstream (not even a later NLP-adjacent node) ever treats it as a prerequisite. The pitch is unconnected from the graph.
- **`p2_dictionaries`**: its own content says model configs/hyperparameters/tokenizer vocabularies are dicts — yet it's disconnected from `p2_data_exploration` (pandas) or anything else. A soft edge `p2_dictionaries → p2_data_exploration` would close this.
- `p1_memory_storage` / `p1_cpu_processing`: acceptable as leaves conceptually (no future skill hard-requires hardware knowledge), but nothing later loops back to them either — Phase 5/6 (training compute, GPU cost) would be the natural place to reconnect, and currently isn't even softly linked.

### A3. Suspicious/weak edges into Phase 3's entry point

Three separate **soft** edges converge on `p3_what_is_ai` from unrelated Phase 2 areas: `p2_probability_basics → p3_what_is_ai`, `p2_problem_solving → p3_what_is_ai`, `p2_data_exploration → p3_what_is_ai`. None of these concepts is actually a prerequisite for understanding "What is AI?" (a plain-language conceptual node) — this reads like "Phase 2 should finish before Phase 3 starts" expressed as three arbitrary concept-level edges instead of an actual phase-level gate. Left as-is functionally (harmless, soft) — flagged as open question E4.

Separately, `p3_ai_applications → p3_how_machines_learn` (soft) sits alongside the more direct `p3_what_is_ai → p3_how_machines_learn` (hard) — a redundant diamond. Not a bug (`scripts/validate-content.js`'s topological sort already confirms 0 cycles), but pedagogically backwards: "applications" feeding into "how machines learn" implies applications should be understood first, which is unusual ordering. Minor, flag only.

### A4. Missing subtopics for a genuine "zero to hero" path

Checked against what Phase 5+ will actually need (PyTorch `nn.Module` subclassing, reading tracebacks vs. handling exceptions, real data loading):

- **No OOP/classes node anywhere in 45 nodes.** Every neural-net framework in Phase 5-6 uses `class Model(nn.Module):` — without a classes/objects foundation, that syntax is unexplained magic. This is the single biggest concrete gap, and now a hard prerequisite for `p5_neural_network_basics` (Section B).
- **No exception handling (`try`/`except`/`raise`).** `p1_debugging` teaches *reading* tracebacks, not *handling* errors programmatically — a distinct skill, currently absent.
- **No file I/O** (reading/writing files, `open()`, CSV basics before pandas). `p2_data_exploration` currently jumps straight to pandas without ever covering "how do you even load a file."
- **No list comprehensions** — a standard, extremely common Python idiom used constantly in real ML data-prep code, absent despite `p1_lists_intro`/`p2_lists_arrays` covering lists in depth otherwise.

These are flagged as **candidate additions**, not authored here — see open question E2 on sequencing.

### A5. Minor schema/content hygiene (not blocking, just noted)

- Question counts per node are inconsistent: most nodes have 5, a handful have 4 (`p1_debugging`, `p1_scope`, `p2_sets_tuples`, `p3_history_of_ai`, `p3_ai_applications`). Not wrong, just uneven — a consistent minimum of 5 is recommended for all new Phase 4-8 authoring.
- `scripts/validate-content.js` only warns (never errors) on missing `beginner`/`mid`/`advanced` explanation files, doesn't check `expert` at all, doesn't check question-count minimums, and has no structural checks for dead-end nodes or edge-direction sanity (confirmed by reading the script directly). Every finding in A2/A3 is a real gap the current validator would not catch — this audit is not re-describing something already enforced.

### A6. Re-applying the depth test back to Phase 2-3

Section B originally proposed ~41 nodes for Phase 4-8, revised upward to ~72 after review found that too shallow for genuine mastery of the hardest material. Fairness demands running that same test backward: is Phase 2-3, already shipped, actually deep enough, or does it just look topically even (A1.5) while still being thin in places? The result is asymmetric — a real gap in Phase 2, not much of one in Phase 3.

**Phase 2 (15 nodes) — genuinely thin in two places, both real prerequisite gaps for Phase 4-5, not just nice-to-haves:**

- **No calculus/derivatives node anywhere.** *Math Foundations* (`numpy_basics`, `math_vectors`, `math_matrices`, `linear_functions`) never introduces a derivative or gradient — yet `p5_backpropagation` (Section B) is built entirely on chain-rule gradients, and `p2_linear_functions` already uses "slope" in its own analogy without ever formalizing what a slope *is* in calculus terms. This gap was invisible until Phase 5 got real depth. **Recommended addition:** `p2_calculus_basics` in *Math Foundations* — derivatives-as-slope, gradients-as-direction-of-steepest-change, intuition-first, matching the rest of Phase 2's style.
- **No data cleaning/preprocessing node.** *Applied Data Skills* (`problem_solving`, `data_exploration`) covers understanding data (EDA) but not preparing it (missing values, outliers, encoding categorical variables) — a distinct, universally-taught step in every real ML curriculum, and a direct prerequisite for Phase 4's `p4_sklearn_workflow`. **Recommended addition:** `p2_data_cleaning_preprocessing` in *Applied Data Skills*.
- Lower priority, optional: `p2_conditional_probability_bayes` in *Probability & Statistics* (currently only 2 nodes) — not strictly required, but a natural thematic tie-in since Bayesian updating is what this platform's own BKT engine does.

Adding the two prerequisite-gap nodes brings Phase 2 to **17 nodes**, closer to Phase 1's 18 and no longer the visibly thinnest of the three shipped phases. Both are **new, appended nodes** — no existing Phase 1-3 node needs to change, consistent with the additive-only convention in Section D.

**Phase 3 (12 nodes) — held up under the same test; not recommending expansion.** Phase 3 is deliberately conceptual/orientation-level (`difficulty_base` never exceeds 3, versus Phase 2's up to 4) — its job is breadth before Phase 4 gets technical, not skill-depth itself. Its 4×3 topic structure covers what a conceptual survey phase needs without an obvious missing prerequisite the way Phase 2 had. Depth should track what the material actually needs, not match a number for its own sake — the same principle that justifies Phase 5/6 growing more than Phase 7/8 in Section B.

**Bottom line for Section A:** Phase 1-3 is not "fine because it shipped." It has real, fixable gaps — OOP, exceptions, file I/O, comprehensions (A4); calculus and data-cleaning (A6); two disconnected-but-important leaf nodes (A2); a phase-label mismatch (A1). None of this blocks Phase 4-8 from starting, but OOP and calculus specifically should be resolved *before* Phase 5 content is authored, since Phase 5 now hard-depends on both.
