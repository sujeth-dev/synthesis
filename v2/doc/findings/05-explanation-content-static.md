# Finding 05 — Explanations are long, static, and unpersonalized

**Severity:** Serious
**Area:** Content presentation

## What's actually happening

`LearnPanel` (`learn/page.tsx:150-207`) and `ExplanationPanel` (`src/components/learning/ExplanationPanel.tsx:116-146`) both render a single explanation's full `body` field as one continuous markdown block via `dangerouslySetInnerHTML={{ __html: mdToHtml(...) }}`. There is exactly one explanation per skill per depth level (`content/explanations/<skill>/<depth>.json`) — depth is chosen server-side from `p_know` (`api/explanation/route.ts:34-40`), but within a given depth every learner sees identical wording. There is no analogy substitution, no interest-based framing, and no progressive disclosure — the full body renders immediately, not a short core insight with optional expansion.

## Why it matters

This is the direct mechanism behind the "long texts, not great" complaint. It also means two of the lab's specified personalization dimensions — Language (`Research/lab/08-interfaces.md` Dimension 1) and Interest/Analogy (Dimension 2) — have no implementation surface at all yet; the content schema itself (one `body` per depth, no analogy variants field) doesn't support them.

## Related

Thesis Promise #1 (explanation-based answers, presentation half). User complaint #2. Lab Dimensions 1-2 (`08-interfaces.md`).

## Fix direction

`v2/doc/basic-guide.md`, Phase 2 item 2 (added 2026-08-09 — this finding was written up in full but not actually scheduled in the phase plan until flagged) — progressive disclosure (short `key_insight`-led opening, full body on demand) is a near-term, schema-compatible fix, folded into the same pass as the Seven Worlds re-skin since both touch `LearnPanel`/`ExplanationPanel`. Full interest/analogy personalization requires a content schema change (analogy variants per concept) and is a larger, later investment — same order of effort as the content classification work in Finding 06, and worth sequencing alongside it rather than separately.
