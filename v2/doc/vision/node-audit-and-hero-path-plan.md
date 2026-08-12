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

---

## B. Phase 4-8 proposed breakdown (72 nodes vs. current 8 stubs)

**Revised mid-review:** the first pass of this section proposed ~41 nodes, matching a figure referenced when this planning pass started. On review, that isn't enough depth for phases covering the actual hard, AI-defining material — 9 nodes cannot honestly cover backpropagation, CNNs, RNNs, and PyTorch, and 41 nodes total for Phases 4-8 would leave the "hero" half of the curriculum thinner than the "zero" half (Phase 1-3's 45 nodes cover comparatively low-complexity material). Revised to scale every phase up toward Phase 1-2's rigor, weighted by actual subject complexity rather than spread evenly. **This section supersedes, not silently replaces, the original ~41-node figure**, per this project's correction convention. No prior draft matching "~41 candidate nodes" was found anywhere in this repo (`v2/doc/**`, `Research/lab/**` searched) — if one exists outside it, it should be checked against this deeper version (open question E3).

Existing 8 stubs are kept (same IDs, not renamed) and slotted into the breakdown below. Depth is allocated by actual subject complexity, not evenly: **Phase 5 (Deep Learning) and Phase 6 (Modern AI/Transformers) get the most nodes** — the two phases where real conceptual depth (backprop, attention mechanics, fine-tuning) cannot be compressed without becoming a highlights reel. Phase 4 gets comparable depth to Phase 2 (it's "CS fundamentals" for ML — algorithms and math applied). Phase 7-8 stay proportionally lighter since they're inherently more applied/survey/synthesis in nature (production practice, capstone) rather than new conceptual ground.

Every new node follows Phase 1-3's own field pattern exactly: `id`, `label`, `phase`, `difficulty_base` (continuing the existing 1→5 gradient), `question_ids` (5, for consistency per A5), `explanation_ids` for all **four** depths including `expert` (the current 8 stubs wrongly omit `expert` — fix this for all new authoring), `tags`, `intuition`, `analogy`, `why_it_matters`. Prerequisite edges connect each new node into the existing spine — none are left as new dead-end leaves, learning A2's lesson. Framing is **discovery-first** (per `P2-3`'s existing doc ref, `discovery-model.md` §1) — every new node opens with a problem/scenario, not a definition, distinct from Phase 1-3's explanation-first style. Exact edge lists and full node JSON are authored in the follow-up session, not here — this is the topic/node map, not the content itself.

### Phase 4 — Machine Learning (`phase_4_machine_learning`), 5 topics / 16 nodes

| Topic | Nodes |
|---|---|
| Core ML Paradigms (3) | `p4_data_pipeline`\*, `p4_supervised_learning`\*, `p4_unsupervised_learning` (clustering/K-means, dimensionality reduction — ties back to `p3_types_of_learning`) |
| Regression Algorithms (2) | `p4_linear_regression`, `p4_logistic_regression` |
| Classification & Ensembles (4) | `p4_decision_trees`, `p4_random_forests`, `p4_boosting_methods` (gradient boosting/XGBoost — split from ensembles-as-one-node so bagging vs. boosting each get real coverage), `p4_knn_and_svm` |
| Model Evaluation & Tuning (5) | `p4_train_test_cross_validation` (deeper than `p3_model_evaluation`'s intro), `p4_evaluation_metrics` (precision/recall/F1/ROC-AUC — `p3_model_evaluation` only covered accuracy/loss), `p4_bias_variance_tradeoff` (revisits `p3_overfitting` with algorithm-tuning rigor), `p4_regularization` (L1/L2/ridge/lasso), `p4_hyperparameter_tuning` |
| Practical Workflow (2) | `p4_feature_scaling` (normalization/standardization, builds on `p3_feature_engineering`), `p4_sklearn_workflow` (fit/predict/score end-to-end; first hands-on-ladder candidate, see Section C) |

\* = existing stub node, kept as-is.

### Phase 5 — Deep Learning (`phase_5_deep_learning`), 5 topics / 16 nodes

| Topic | Nodes |
|---|---|
| Network Fundamentals (4) | `p5_neural_network_basics`\* (needs the OOP prerequisite from A4), `p5_activation_functions`, `p5_forward_propagation`, `p5_loss_functions` |
| Training Mechanics (4) | `p5_backpropagation` (chain-rule/blame-assignment intuition — split from gradient descent, genuinely distinct ideas), `p5_gradient_descent_and_optimizers` (SGD vs. Adam, learning-rate behavior), `p5_training_loops_epochs_batches`, `p5_learning_rate_and_hyperparameters` |
| Regularization & Stability (3) | `p5_overfitting_in_deep_nets` (dropout/weight decay — deep-net-specific, distinct from Phase 4's classical regularization), `p5_batch_normalization`, `p5_vanishing_exploding_gradients` |
| Architectures (3) | `p5_cnn_basics` (image data), `p5_rnn_basics` (sequence data), `p5_why_transformers_replaced_rnns` (deliberate bridge node — explains RNN limitations, sets up Phase 6 rather than leaving the jump unmotivated) |
| Practice (2) | `p5_pytorch_intro` (second hands-on-ladder candidate), `p5_build_your_first_network` (capstone-style node for the phase — assemble everything above into one trained model) |

### Phase 6 — Modern AI (`phase_6_modern_ai`), 4 topics / 16 nodes

| Topic | Nodes |
|---|---|
| Representation (3) | `p6_tokenization` (belongs *before* embeddings, currently missing entirely), `p6_embeddings`\*, `p6_vector_databases` (mechanics distinct from the RAG concept itself) |
| Transformer Architecture (5) | `p6_attention_mechanism` (intuition first), `p6_self_attention_and_multihead` (the actual mechanics — split from intuition deliberately, matching how genuinely hard this concept is), `p6_positional_encoding`, `p6_transformers`\* (the assembled architecture), `p6_residual_connections_and_layernorm` |
| Training & Adapting LLMs (4) | `p6_pretraining_objectives`, `p6_finetuning_methods`, `p6_lora_and_peft` (parameter-efficient fine-tuning — current, real-world practice), `p6_llm_landscape` (model families, context windows, sizes) |
| Applying LLMs (4) | `p6_prompt_engineering` (conceptual, distinct from Phase 7's applied/API version), `p6_rag_systems`\*, `p6_tool_use_and_function_calling` (agentic groundwork, bridges to Phase 8's multi-agent systems), `p6_evaluating_and_choosing_llms` (picking a model for a use case — distinct from Phase 7's "grading your own app's outputs") |

### Phase 7 — Real World (`phase_7_real_world`), 4 topics / 14 nodes

| Topic | Nodes |
|---|---|
| Shipping AI Products (3) | `p7_ai_apis`\*, `p7_building_ai_app` (end-to-end example; third/primary hands-on-ladder candidate), `p7_api_design_for_ai_features` (wrapping AI calls into your own product's API surface) |
| Quality & Safety (5) | `p7_evaluating_llm_outputs` (testing/grading AI outputs, distinct from Phase 3's classical `model_evaluation` and Phase 6's model-choice evaluation), `p7_explainability_and_interpretability`, `p7_safety_guardrails`, `p7_prompt_injection_and_jailbreaks`, `p7_content_moderation` |
| Performance & Cost (3) | `p7_cost_latency_optimization`, `p7_caching_and_batching`, `p7_model_selection_tradeoffs` (small/local vs. large/API models) |
| Operating in Production (3) | `p7_deployment_hosting`, `p7_monitoring_observability`, `p7_ci_cd_for_ai_apps` (versioning prompts/models, testing before deploy) |

### Phase 8 — Mastery (`phase_8_mastery`), 3 topics / 10 nodes

| Topic | Nodes |
|---|---|
| Systems at Scale (4) | `p8_system_design_ai`\*, `p8_scaling_ai_systems`, `p8_mlops` (CI/CD, model versioning at the systems level, distinct from Phase 7's app-level version), `p8_multi_agent_systems` |
| Responsibility & Frontier (4) | `p8_ai_ethics_bias`, `p8_ai_safety_alignment_intro` (distinct from ethics/bias — the existential/alignment side of the field), `p8_staying_current_with_research` (how to read papers, follow the field — a genuine "hero" skill, not busywork), `p8_case_studies_of_real_systems` (grounding system design in how real production AI systems are actually built) |
| Practice & Capstone (2) | `p8_ai_product_strategy` (product/business judgment for AI features, synthesizing every phase), `p8_capstone_project` (the flagship hands-on deliverable, ties every ladder tier from Section C together) |

**Total: 8 existing + 64 new = 72 nodes across 21 main topics for Phase 4-8.** Combined with Phase 2's 2 new prerequisite-gap nodes from A6, Phase 1-3 becomes 47, and the full curriculum lands at **119 nodes**. Deliberately not a round number — each phase's count reflects what the subject matter needs, not a padding target. Depth allocation: Phase 4/5/6 at 16 each (matching Phase 1's 18 / Phase 2's revised 17 rigor), Phase 7 at 14 (applied/survey), Phase 8 at 10 (synthesis/capstone, naturally the smallest).

---

## D. Scalable, LLM-generatable content architecture

The phase→topic→node structure above is designed so future addition, deletion, and LLM-assisted generation of nodes is a clean, mechanical operation — not a one-time fix scoped only to Phase 4-8. Five concrete pieces:

1. **Stable, additive-only node IDs.** This project already uses this exact convention for `MASTER_PLAN.md` task IDs ("stable once assigned — never renumber, only append"). Apply the same discipline to `skill_id`s: once assigned, never renamed or reused, even when content is revised — matches what's already true of the 45+8 existing nodes.
2. **Promote `topic` to a first-class field on `SkillNode`.** Resolves A1.5's open question in favor of "yes, add it": `topic: string` (human-readable, e.g. `"Transformer Architecture"`) plus a `topic_order`/`node_order` for stable within-topic ordering. Today, "topic" is only an implied grouping reconstructed by reading node content — with a real field, adding a node to a topic, adding a whole new topic, or moving a node between topics becomes a pure data edit, with zero ID-string archaeology or edge-topology inference required. That matters specifically because an LLM generation pipeline needs a deterministic slot to write into, not an inferred one. This is a `src/types/index.ts` change — see open question E5.
3. **Deprecate, don't delete.** Every node already has `deprecated: boolean` (confirmed present, always `false` today across all 53 real+stub nodes) — formalize this as the actual removal mechanism. Retiring a node means `deprecated: true` plus edge cleanup, never deleting the file outright. This matters because `LearnerSkillState` rows key on `skill_id` (`src/types/index.ts:73`) — a real learner's mastery history for a deleted skill_id would become an orphaned reference with no schema-level protection. Deprecation preserves both learner history and an audit trail.
4. **Edges are naturally additive; deletions are not.** `edges.json` references nodes by string ID only, so adding a node is zero-touch for existing files (new node entry + new edge entries). Deprecating a node is **not** zero-touch — its inbound/outbound edges need explicit cleanup (drop, or redirect to a replacement) as a required step, not an afterthought, or `scripts/validate-content.js`'s cycle-detection and (recommended, below) dead-end checks silently degrade.
5. **A generation contract for LLM-assisted authoring.** Define a minimal per-node "content brief" (`id`, `phase`, `topic`, `prereq_ids`, `difficulty_base`, a 1-2 sentence intuition seed) as the fixed input unit for generating a node's full content set:
   - `content/templates/explanation_file.json` **already exists** and already encodes this exact generation contract (title/key_insight/body/common_mistakes/mini_exercise/real_world_usage/explain_back_prompt/build_task, plus a `_depth_guide` telling a generator how beginner/mid/advanced should differ). Directly reusable as-is — no changes needed.
   - No equivalent `content/templates/question_file.json` exists. The follow-up authoring session should create one, mirroring the explanation template's `_comment`-guided-skeleton pattern, covering `mcq` plus Section C's `order` and chip-based `fill` ladder tiers — so question generation becomes just as templated and repeatable as explanation generation already is.
   - `scripts/validate-content.js` already plays the correctness-backstop role a generation pipeline needs (JSON validity, question-ID cross-references, cycle detection, phase-evaluation Bloom coverage). Recommend it gain a few more checks *when Phase 4-8 authoring actually starts*, not in this session: topic-field validity, a minimum question count per node (closing A5), and a dead-end-leaf warning (closing A2/A3). All are deterministic and cheap, the same role the existing checks already play — and specifically useful for catching bad LLM-generated output before it merges.

Net effect: authoring Phase 4-8 (or Phase 2's two new A6 nodes, or any future Phase 9+) becomes "fill in N short content briefs against two fixed templates, let the validator catch structural mistakes" rather than N bespoke one-off authoring passes — and the same pipeline works unchanged for corrections to Phase 1-3 too.
