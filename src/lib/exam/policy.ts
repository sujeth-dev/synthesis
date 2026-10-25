/**
 * The exam's rules: which item next, when to stop, what a hint costs, how much
 * time there is (EXAM-1).
 *
 * Every function takes the time as a parameter and nothing reads the clock, the
 * same discipline as src/lib/timing: there is no jsdom in this repo, so the
 * logic lives here and the page only renders it.
 *
 * Pure and synchronous.
 */
import type { BloomLevel, PhaseEvaluationQuestion, QuestionDifficulty } from '@/types'
import { ELO_START } from '@/lib/elo'
import { estimateAbility, pCorrect, type AbilityEstimate, type ScoredResponse } from './ability'

export type ExamMode = 'practice' | 'checkpoint'

export const BLOOM_ORDER: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

// Minimum length plus a cap, stopping in between on precision: the standard CAT
// rule (Choi, Grady & Dodd 2011). Twelve is two full passes over the six levels,
// so even the shortest run touches every level twice.
export const MIN_ITEMS = 12
export const MAX_ITEMS = 24
export const SE_STOP = 0.35

// The bank's `difficulty` band sets an item's cold-start rating until real
// answers move it. One band is ~1.0 logit, a meaningful but not extreme step.
const DIFFICULTY_OFFSET: Record<QuestionDifficulty, number> = { easy: -175, medium: 0, hard: 175 }

// Credit for a correct answer reached with help. A second hint says how to
// proceed, so an answer after it is worth half; neither hint names the option,
// so neither drops credit to zero.
export const HINT_CREDIT = [1, 0.75, 0.5] as const

// A hint asked for this soon after the item (or the previous hint) appeared was
// asked for before the stem could have been read: Baker et al.'s (2004) "rapid
// hint request" form of gaming, separated by response time as in Shih,
// Koedinger & Scheines (2008).
export const HINT_ABUSE_MS = 4000

// Overall limit for a Checkpoint: the longest possible run at the bank's average
// time target, with a quarter again in slack. No per-item cut-off — the evidence
// on time pressure does not support one; the pace indicator measures instead.
export const TIME_LIMIT_SLACK = 1.25

export type StopReason = 'precision' | 'max_length' | 'time' | 'bank'

export interface ExamResponse {
  question_id: string
  bloom_level: BloomLevel
  rating: number
  correct: boolean
  hint_level: number
}

export function coldStartExamRating(difficulty: QuestionDifficulty): number {
  return ELO_START + DIFFICULTY_OFFSET[difficulty]
}

export function responseCredit(correct: boolean, hintLevel: number): number {
  if (!correct) return 0
  const level = Math.min(HINT_CREDIT.length - 1, Math.max(0, Math.floor(hintLevel)))
  return HINT_CREDIT[level]
}

export function scoreResponses(responses: ExamResponse[]): ScoredResponse[] {
  return responses.map(r => ({ rating: r.rating, credit: responseCredit(r.correct, r.hint_level) }))
}

export function examAbility(responses: ExamResponse[]): AbilityEstimate {
  return estimateAbility(scoreResponses(responses))
}

/** The Bloom level the item at this 0-based position samples. */
export function levelForPosition(position: number): BloomLevel {
  return BLOOM_ORDER[position % BLOOM_ORDER.length]
}

/**
 * The unserved item at the next position's Bloom level whose difficulty sits
 * nearest the current ability — maximum information for a Rasch item.
 * Falls through to any unserved item if that level is exhausted, and returns
 * null only when the bank is.
 */
export function chooseNextItem(
  bank: PhaseEvaluationQuestion[],
  servedIds: string[],
  theta: number,
  ratingOf: (q: PhaseEvaluationQuestion) => number,
): PhaseEvaluationQuestion | null {
  const served = new Set(servedIds)
  const unserved = bank.filter(q => !served.has(q.id))
  if (unserved.length === 0) return null
  const level = levelForPosition(servedIds.length)
  const atLevel = unserved.filter(q => q.bloom_level === level)
  const pool = atLevel.length > 0 ? atLevel : unserved
  // Ties broken on id so a run is reproducible from its answers.
  return [...pool].sort((a, b) => {
    const da = Math.abs(pCorrect(theta, ratingOf(a)) - 0.5)
    const db = Math.abs(pCorrect(theta, ratingOf(b)) - 0.5)
    return da - db || a.id.localeCompare(b.id)
  })[0]
}

export function stopReason(
  ability: AbilityEstimate,
  bankRemaining: number,
  timeUp: boolean,
): StopReason | null {
  if (timeUp) return 'time'
  if (ability.n >= MAX_ITEMS) return 'max_length'
  if (ability.n >= MIN_ITEMS && ability.se < SE_STOP) return 'precision'
  if (bankRemaining === 0) return 'bank'
  return null
}

export function checkpointTimeLimitSec(bank: PhaseEvaluationQuestion[]): number {
  if (bank.length === 0) return 0
  const mean = bank.reduce((sum, q) => sum + q.time_target_sec, 0) / bank.length
  return Math.ceil((MAX_ITEMS * mean * TIME_LIMIT_SLACK) / 60) * 60
}

export function remainingMs(deadline: number | null, now: number): number | null {
  if (deadline === null) return null
  return Math.max(0, deadline - now)
}

export type Pace = 'on_pace' | 'slow' | 'over'

export function paceFor(elapsedMs: number, targetSec: number): Pace {
  const ratio = elapsedMs / Math.max(1, targetSec * 1000)
  if (ratio <= 1) return 'on_pace'
  if (ratio <= 1.5) return 'slow'
  return 'over'
}

/**
 * Whether this hint request is a rapid one. `sinceMs` is the time since the item
 * was shown, or since the previous hint for a second request.
 */
export function isHintAbuse(sinceMs: number): boolean {
  return sinceMs < HINT_ABUSE_MS
}
