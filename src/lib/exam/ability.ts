/**
 * Ability with a standard error, from a handful of exam answers (EXAM-1).
 *
 * Elo (src/lib/elo) gives a running point estimate but no error bar, and an
 * adaptive exam cannot stop on precision without one. This is the textbook
 * Rasch-model expected a posteriori estimate over a fixed grid: the posterior
 * mean is ability, the posterior standard deviation is its standard error.
 * EAP is used rather than maximum likelihood because ML has no finite answer
 * for an all-correct or all-wrong run, which in a 12-item exam is common.
 *
 * Scale. Items are rated on the Elo scale, whose logistic slope is ln10/400 per
 * point. Ability is reported in the normal-ogive metric (logit / 1.702, prior
 * N(0, 1)), which is the metric the CAT stopping-rule thresholds of .25-.35 are
 * quoted in. On the raw logit scale an SE of 0.35 needs about 33 well-targeted
 * Rasch items, so the planned 24-item cap could never meet it; in this metric it
 * is reachable in about 12. Recorded in PROGRESS.md rather than buried here.
 *
 * Pure and synchronous.
 */
import { ELO_SCALE, ELO_START } from '@/lib/elo'

/** Logistic-to-normal-ogive scaling constant (Haley 1952). */
export const D = 1.702

const GRID_MIN = -4
const GRID_MAX = 4
const GRID_STEP = 0.05

export interface ScoredResponse {
  /** Item difficulty on the Elo scale. */
  rating: number
  /**
   * 1 for unaided correct, 0 for wrong, a fraction for a correct answer reached
   * with help. A fractional response is a legitimate Bernoulli-likelihood weight
   * and keeps the estimate order-independent, which is what lets a learner
   * change an earlier answer before submitting.
   */
  credit: number
}

export interface AbilityEstimate {
  theta: number
  se: number
  n: number
}

export function ratingToLogit(rating: number): number {
  return (rating - ELO_START) * Math.LN10 / ELO_SCALE
}

export function thetaToRating(theta: number): number {
  return ELO_START + D * theta * ELO_SCALE / Math.LN10
}

/** Probability a learner at `theta` answers an item of Elo `rating` correctly. */
export function pCorrect(theta: number, rating: number): number {
  return 1 / (1 + Math.exp(-(D * theta - ratingToLogit(rating))))
}

export function estimateAbility(responses: ScoredResponse[]): AbilityEstimate {
  const points: number[] = []
  const weights: number[] = []
  for (let theta = GRID_MIN; theta <= GRID_MAX + 1e-9; theta += GRID_STEP) {
    // Log space: 24 products of small probabilities underflow a double.
    let logWeight = -0.5 * theta * theta
    for (const r of responses) {
      const p = pCorrect(theta, r.rating)
      const s = Math.min(1, Math.max(0, r.credit))
      logWeight += s * Math.log(p) + (1 - s) * Math.log(1 - p)
    }
    points.push(theta)
    weights.push(logWeight)
  }
  const peak = Math.max(...weights)
  let total = 0
  let mean = 0
  for (let i = 0; i < points.length; i += 1) {
    const w = Math.exp(weights[i] - peak)
    total += w
    mean += w * points[i]
  }
  mean /= total
  let variance = 0
  for (let i = 0; i < points.length; i += 1) {
    variance += Math.exp(weights[i] - peak) * (points[i] - mean) ** 2
  }
  variance /= total
  return { theta: mean, se: Math.sqrt(variance), n: responses.length }
}
