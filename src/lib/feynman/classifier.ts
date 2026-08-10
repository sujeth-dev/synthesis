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
