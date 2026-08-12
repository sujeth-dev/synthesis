export type ExplanationCategory = 'method-only' | 'meaning-included' | 'gap'

const MIN_WORDS = 8

const UNCERTAINTY_MARKERS = [
  /\bi (don't|dont|do not) know\b/i,
  /\bnot (that |totally |really )?sure\b/i,
  /\bi guess\b/i,
  /\bno idea\b/i,
  /\bconfus(ed|ing)\b/i,
  /\bnot really\b/i,
]

const MEANING_MARKERS = [
  'because', 'means', 'represents', 'so that', 'the reason', 'imagine', 'think of',
  'like when', 'for example', 'such as', 'situation', 'real-world', 'real world',
  'in practice', 'used when', 'total', 'overall', 'area under', 'accumulat',
  'sum of', 'over time', 'that\'s why', 'that is why',
]

const METHOD_MARKERS = [
  'step', 'formula', 'add', 'subtract', 'multiply', 'divide', 'plug in',
  'apply the rule', 'calculate', 'first you', 'then you', 'the rule is',
  'power rule', 'procedure', 'follow these',
]

/**
 * ~~NLP/LLM upgrade trigger (P1-5): keep this rule-based classifier primary until
 * NLP-1 through NLP-3 compare it with a versioned API grader...~~
 * **Trigger met, live cutover done 2026-08-12:** the API grader
 * (src/lib/nlp/grader.ts, gradeExplanation()) showed reliably higher agreement
 * with the same 106 human-labeled explanations (96.2% vs 67.0%, kappa 0.943 vs
 * 0.498) and is now primary in src/app/api/attempt/route.ts. Per the original
 * plan, this function was not removed — it remains the API grader's own
 * internal hard fallback for failure/timeout/cost-based disablement, and the
 * route's outer fail-open fallback besides. See v2/doc/basic-guide.md section C.
 */

/**
 * Rule-based classifier for a learner's free-text explanation of a concept
 * (the Feynman Loop teaching canvas — see Research/lab/13-content-structure.md §4.1).
 *
 * gap: too short or explicitly hedged/uncertain to have taught anything.
 * meaning-included: connects the concept to a reason, situation, or real-world referent.
 * method-only: describes a procedure/steps but never says what it's for.
 */
export function classifyExplanation(text: string): ExplanationCategory {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  const lower = trimmed.toLowerCase()

  if (words.length < MIN_WORDS || UNCERTAINTY_MARKERS.some(rx => rx.test(lower))) return 'gap'
  if (MEANING_MARKERS.some(m => lower.includes(m))) return 'meaning-included'
  return 'method-only'
}

export function explanationWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const REASONING_QUALITY_BY_CATEGORY: Record<ExplanationCategory, number> = {
  'meaning-included': 1,
  'method-only': 0.6,
  'gap': 0.3,
}

/** Maps a classified explanation to a BKT reasoning-quality evidence modifier (see bktUpdate). */
export function reasoningQualityFromCategory(category: ExplanationCategory): number {
  return REASONING_QUALITY_BY_CATEGORY[category]
}
