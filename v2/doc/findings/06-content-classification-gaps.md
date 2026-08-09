# Finding 06 — Content classification/taxonomy gaps

**Severity:** Critical (methodology-level — this is the backbone BKT/SM-2 depend on)

**Area:** Content

## What's actually happening

Verified directly against the schema and content, not assumed:

- **`bloom_level` does not exist in the schema at all.** Not in the `Question` interface, not in `SkillNode` (`src/types/index.ts:18-31`), and a scripted check across all 45 populated skills' question files found zero instances of the field anywhere in actual content. This corrects an earlier claim (inherited from `Research/lab/07-audit.md` and repeated uncritically in an earlier draft of `basic-guide.md`) that "the schema is already correct, just needs to be wired in" — there is no field to wire in. See `07-resolved-and-corrected.md`.
- **Question banks are thin** — 3 to 6 questions per skill across all 45 populated skills (scripted check), with `difficulty_tier` coverage often incomplete (some skills have only `same`/`harder`, missing `review` or `prerequisite` entirely).
- **`scripts/validate-content.js` doesn't check any of this.** Read in full: it validates graph acyclicity, that question IDs referenced by a node exist in that node's question file, and that explanation files have `body`/`key_insight` present. It has no check for question-bank size, tier coverage, tag presence, or tag-vocabulary closure.
- **No deterministic rule exists for skill granularity** — nothing defines when two related sub-concepts should be one `skill_id` vs. two, beyond content-author judgment at the time each node was created.

## Why it matters

BKT assumes each `skill_id` is one coherent latent thing a learner either knows or doesn't, tracked by one `p_know` with one set of parameters. If that assumption is wrong — a node too coarse (bundling distinct sub-skills) or too fine (starved of the attempts needed to converge, especially given the current 3-6-question banks) — `p_know` stops meaning anything specific, silently. Because the engine is deterministic rather than LLM-judged, there's nothing downstream that can compensate for a bad classification the way an LLM grader might absorb some fuzziness in a single explanation — the classification has to be right, or checkably wrong, before it reaches the engine at all.

This is also why Promise #7 (Bloom's taxonomy tagging) is not "verify and wire in" as previously documented — it needs the field added to the schema, a closed vocabulary defined, and actual content authored against it, essentially from scratch.

## Related

Thesis Promise #7. Raised directly by the user as a standalone concern: content/topic/subtopic classification needs its own careful, deterministic treatment specifically because the engine has no LLM in the loop to catch a misclassification.

## Fix direction

Needs its own plan (not yet written) covering: (a) explicit, checkable skill-granularity rules, (b) a closed, versioned tagging vocabulary — `difficulty_tier` and `error_type` are already closed enums and fine as a model to follow, `bloom_level` needs to be added the same way, (c) validator extensions enforcing bank-size/tier-coverage/tag-closure automatically, (d) a retrofit pass on the 45 existing populated skills plus a gate on Phases 4-8 (not yet written) so new content is classified correctly at authoring time.
