import type { ExplanationCategory } from '../../feynman/classifier'

/**
 * NLP-2: versioned rubric-based grading prompt for the LLM reasoning grader.
 * Produces the same 3-category output as the rule-based classifier
 * (src/lib/feynman/classifier.ts) so the two are directly comparable in NLP-3.
 *
 * Bump PROMPT_VERSION and add a new file (v2.ts, ...) for any wording change
 * that could shift grading behavior — never edit v1 in place once it has
 * graded logged calls, so NLP-6 logs stay attributable to a fixed rubric.
 */
export const PROMPT_VERSION = 'v1' as const

const RUBRIC = `You are grading a learner's free-text explanation of a math concept, written while teaching it to a confused study partner (the Feynman technique). Classify the explanation into exactly one of three categories:

- "gap": the explanation is too short, hedged, uncertain, or otherwise fails to teach anything about the concept. This includes explanations that are long but evasive — they talk around the topic (e.g. "I've been practicing this a lot") without ever saying what the concept is or does.
- "method-only": the explanation correctly describes the procedure/steps/formula for the concept, but never connects it to what it means, what it's for, or a real situation where it applies.
- "meaning-included": the explanation connects the concept to a reason, a real-world situation, an analogy, or an intuitive picture of what it actually does — not just the steps to compute it. This can be present with or without also describing the method, and can be conveyed through analogy or example even without words like "because" or "means".

Judge the substance, not the presence of specific keywords. An explanation using a real-world analogy without ever saying "for example" is still meaning-included. An explanation that uses the word "because" to link two procedural steps together (not to explain real-world meaning) is still method-only.

Respond with ONLY a single JSON object, no prose before or after, matching exactly:
{"category": "gap" | "method-only" | "meaning-included", "confidence": <number 0-1>, "rationale": "<one short sentence citing what in the text drove the decision>"}`

export interface GradingPromptInput {
  concept: string
  explanationText: string
}

export interface GraderMessage {
  role: 'system' | 'user'
  content: string
}

export function buildGradingPrompt({ concept, explanationText }: GradingPromptInput): GraderMessage[] {
  return [
    { role: 'system', content: RUBRIC },
    {
      role: 'user',
      content: `Concept being taught: ${concept}\n\nLearner's explanation:\n"""\n${explanationText}\n"""\n\nReturn the JSON classification now.`,
    },
  ]
}

export interface ParsedGraderOutput {
  category: ExplanationCategory
  confidence: number
  rationale: string
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set(['gap', 'method-only', 'meaning-included'])

/**
 * Parses and validates a model's raw completion against the v1 rubric's JSON
 * contract. Throws on any malformed/out-of-schema response so the caller
 * (grader.ts) treats it the same as a failed call and moves to the next
 * model / the rule-based fallback, rather than silently trusting bad output.
 */
export function parseGraderResponse(raw: string): ParsedGraderOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`grader v1: no JSON object found in response: ${raw.slice(0, 200)}`)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    throw new Error(`grader v1: failed to parse JSON: ${(err as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('grader v1: parsed response is not an object')
  }

  const { category, confidence, rationale } = parsed as Record<string, unknown>

  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category)) {
    throw new Error(`grader v1: invalid category in response: ${String(category)}`)
  }
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`grader v1: invalid confidence in response: ${String(confidence)}`)
  }
  if (typeof rationale !== 'string' || rationale.trim().length === 0) {
    throw new Error('grader v1: missing rationale in response')
  }

  return { category: category as ExplanationCategory, confidence, rationale }
}
