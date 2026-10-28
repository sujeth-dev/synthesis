/**
 * Elo ratings for questions and learners (SCORE-1).
 *
 * The engine has never had a difficulty estimate for an individual question —
 * only the author's `difficulty_tier` label and the node's `difficulty_base`.
 * Those order questions; they cannot aim at a success probability, which is what
 * the multi-metric scorer's difficulty-match term and the exam's item choice both
 * need.
 *
 * Elo earns its place because it calibrates persons and items from the same
 * stream of answers with no separate calibration run — Klinkenberg, Straatemeier
 * & van der Maas (2011, Computers & Education 57:1813-1824) use exactly this to
 * sample items at a fixed success rate of ~.75.
 *
 * Pure and synchronous. Persistence, and any decision to act on these numbers,
 * live outside this module.
 */
import type { DifficultyTier } from '@/types'

export const ELO_START = 1200
export const ELO_SCALE = 400

// Ratings are clamped so one burst of bad rows can't drive a question or a
// learner somewhere the rest of the system has no items for.
export const ELO_MIN = 600
export const ELO_MAX = 2000

// K shrinks as evidence accumulates: a brand-new question must move fast to find
// its level, while one answered by hundreds of learners should barely twitch.
export const K_BASE = 32
export const K_FLOOR = 8
export const K_HALF_LIFE_PLAYS = 20

// Cold start. `difficulty_base` runs 1-5 across the 120 nodes and is the
// author's estimate of the concept; `difficulty_tier` is the author's estimate of
// this question within the concept. Both are opinions, so they only set a
// starting point that real answers then correct.
export const DIFFICULTY_BASE_CENTRE = 3
export const DIFFICULTY_BASE_STEP = 80

const TIER_OFFSET: Record<DifficultyTier, number> = {
  prerequisite: -120,
  review: -60,
  same: 0,
  harder: 60,
}

export interface EloSide {
  rating: number
  plays: number
}

export interface EloExchangeResult {
  learner: EloSide
  item: EloSide
  /** The learner's expected score before the answer — the model's prediction. */
  expected: number
}

function clampRating(rating: number): number {
  return Math.min(ELO_MAX, Math.max(ELO_MIN, rating))
}

/** Probability that a learner of `rating` answers an item of `itemRating` correctly. */
export function expectedScore(rating: number, itemRating: number): number {
  return 1 / (1 + Math.pow(10, (itemRating - rating) / ELO_SCALE))
}

/** The item rating at which this learner's expected success equals `target`. */
export function ratingForTargetSuccess(rating: number, target: number): number {
  const t = Math.min(0.99, Math.max(0.01, target))
  return rating + ELO_SCALE * Math.log10(1 / t - 1)
}

export function kFactor(plays: number): number {
  const safePlays = Math.max(0, plays)
  return Math.max(K_FLOOR, K_BASE / (1 + safePlays / K_HALF_LIFE_PLAYS))
}

export function coldStartQuestionRating(difficultyBase: number, tier: DifficultyTier): number {
  const base = (difficultyBase - DIFFICULTY_BASE_CENTRE) * DIFFICULTY_BASE_STEP
  return clampRating(ELO_START + base + TIER_OFFSET[tier])
}

/**
 * One answer, scored both ways. `actual` is 1 for correct and 0 for wrong, or a
 * speed-adjusted value in between where a time target exists.
 *
 * The learner and the item move in opposite directions by the same residual but
 * with their own K, so a settled question nudges a new learner far more than the
 * reverse.
 */
export function eloExchange(learner: EloSide, item: EloSide, actual: number): EloExchangeResult {
  const expected = expectedScore(learner.rating, item.rating)
  const residual = Math.min(1, Math.max(0, actual)) - expected
  return {
    learner: {
      rating: clampRating(learner.rating + kFactor(learner.plays) * residual),
      plays: Math.max(0, learner.plays) + 1,
    },
    item: {
      rating: clampRating(item.rating - kFactor(item.plays) * residual),
      plays: Math.max(0, item.plays) + 1,
    },
    expected,
  }
}

/**
 * Klinkenberg et al.'s scoring rule, mapped onto Elo's 0-1 scale: an answer at
 * the time limit scores a draw whichever way it went, and only a fast answer
 * earns (or loses) the full point.
 *
 * Only used where an item carries a real time target — practice questions have
 * none, so they score on correctness alone.
 */
export function speedAdjustedScore(correct: boolean, latencyMs: number, targetMs: number): number {
  if (targetMs <= 0) return correct ? 1 : 0
  const fraction = Math.min(1, Math.max(0, latencyMs / targetMs))
  return ((correct ? 1 : -1) * (1 - fraction) + 1) / 2
}
