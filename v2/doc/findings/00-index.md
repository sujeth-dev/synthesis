# Critical Findings — Index

Every item here was verified directly against the running code (file:line), not inherited from a lab doc without checking. Where an earlier document (the lab audit, or an earlier draft of `v2/doc/basic-guide.md`) made a claim that turned out to be stale or wrong, that's called out explicitly in `07-resolved-and-corrected.md` rather than silently fixed — so nothing gets re-flagged or re-lost later.

| # | Finding | Severity | Area |
|---|---|---|---|
| 01 | `p_know` never decays with elapsed time | Critical | Engine |
| 02 | Session length & review-debt policy undefined | Serious | Engine |
| 03 | Explain-back is not graded — and doesn't even save | Critical | Reasoning evaluation |
| 04 | Session flow has no topic continuity | Critical | Session / UX |
| 05 | Explanations are long, static, unpersonalized | Serious | Content presentation |
| 06 | Content classification/taxonomy gaps | Critical | Content methodology |
| 07 | Corrections to earlier findings (resolved, not open) | — | Audit trail |

**How to use this folder:** each file states what's actually happening (grounded, with file:line), why it matters, what it's blocking, and which phase of `v2/doc/basic-guide.md` it lands in. This folder is the "what's broken" reference — the phased build order and how-to-implement detail stays in `basic-guide.md` so it isn't duplicated in two places.

**Related:** `v2/doc/vision/discovery-model.md` is a third document, sitting alongside this folder and `basic-guide.md` — not "what's broken" but "what the experience should feel like" (problem-first discovery, masked mechanics, Bloom's-driven puzzle formats, revision embedded in composite puzzles). Findings 03 and 06 are both directly load-bearing for it — the reasoning-evidence mechanism in Finding 03 and the content-classification precision in Finding 06 are prerequisites for the composite-puzzle grading the vision doc depends on.
