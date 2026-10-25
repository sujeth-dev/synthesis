import { describe, it, expect } from 'vitest'
import {
  ELO_START, ELO_SCALE, ELO_MIN, ELO_MAX, K_BASE, K_FLOOR, K_HALF_LIFE_PLAYS,
  expectedScore, ratingForTargetSuccess, kFactor, coldStartQuestionRating,
  eloExchange, speedAdjustedScore,
} from './index'

describe('expected success (SCORE-1)', () => {
  it('is an even chance when learner and question are rated the same', () => {
    expect(expectedScore(ELO_START, ELO_START)).toBeCloseTo(0.5, 10)
  })

  it('reaches the textbook 0.909 one scale-width above the question', () => {
    expect(expectedScore(ELO_START + ELO_SCALE, ELO_START)).toBeCloseTo(0.909, 3)
  })

  it('is symmetric: the two sides of a pairing sum to one', () => {
    for (const gap of [0, 50, 200, 400, 800]) {
      const learnerFirst = expectedScore(ELO_START + gap, ELO_START)
      const itemFirst = expectedScore(ELO_START, ELO_START + gap)
      expect(learnerFirst + itemFirst).toBeCloseTo(1, 10)
    }
  })

  it('rises monotonically as the question gets easier', () => {
    const easier = expectedScore(ELO_START, ELO_START - 100)
    const level = expectedScore(ELO_START, ELO_START)
    const harder = expectedScore(ELO_START, ELO_START + 100)
    expect(easier).toBeGreaterThan(level)
    expect(level).toBeGreaterThan(harder)
  })
})

describe('targeting a success rate (SCORE-1)', () => {
  // The whole point of the difficulty-match term: ask for a success probability
  // and get back the question rating that delivers it.
  it('inverts expectedScore for the rates the engine actually aims at', () => {
    for (const target of [0.6, 0.75, 0.8, 0.85]) {
      const itemRating = ratingForTargetSuccess(ELO_START, target)
      expect(expectedScore(ELO_START, itemRating)).toBeCloseTo(target, 6)
    }
  })

  it('asks for an easier question as the target success rate rises', () => {
    expect(ratingForTargetSuccess(ELO_START, 0.85))
      .toBeLessThan(ratingForTargetSuccess(ELO_START, 0.75))
  })

  it('returns the learner’s own rating for an even chance', () => {
    expect(ratingForTargetSuccess(ELO_START, 0.5)).toBeCloseTo(ELO_START, 6)
  })
})

describe('K factor (SCORE-1)', () => {
  it('starts at K_BASE for something never answered', () => {
    expect(kFactor(0)).toBe(K_BASE)
  })

  it('has halved by K_HALF_LIFE_PLAYS answers', () => {
    expect(kFactor(K_HALF_LIFE_PLAYS)).toBeCloseTo(K_BASE / 2, 10)
  })

  it('never falls below K_FLOOR, however much evidence accumulates', () => {
    for (const plays of [100, 1_000, 100_000]) {
      expect(kFactor(plays), `${plays} plays`).toBe(K_FLOOR)
    }
  })

  it('treats a negative play count as no evidence rather than inverting', () => {
    expect(kFactor(-5)).toBe(K_BASE)
  })
})

describe('cold start from authored difficulty (SCORE-1)', () => {
  it('puts a mid-difficulty same-tier question at the scale centre', () => {
    expect(coldStartQuestionRating(3, 'same')).toBe(ELO_START)
  })

  it('rises with the node’s difficulty_base across the real 1-5 range', () => {
    const ratings = [1, 2, 3, 4, 5].map(base => coldStartQuestionRating(base, 'same'))
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i], `difficulty_base ${i + 1}`).toBeGreaterThan(ratings[i - 1])
    }
  })

  it('orders the four difficulty tiers prerequisite < review < same < harder', () => {
    const prerequisite = coldStartQuestionRating(3, 'prerequisite')
    const review = coldStartQuestionRating(3, 'review')
    const same = coldStartQuestionRating(3, 'same')
    const harder = coldStartQuestionRating(3, 'harder')
    expect(prerequisite).toBeLessThan(review)
    expect(review).toBeLessThan(same)
    expect(same).toBeLessThan(harder)
  })

  it('stays inside the clamp at both ends of the authored range', () => {
    expect(coldStartQuestionRating(1, 'prerequisite')).toBeGreaterThanOrEqual(ELO_MIN)
    expect(coldStartQuestionRating(5, 'harder')).toBeLessThanOrEqual(ELO_MAX)
  })
})

describe('one answer, scored both ways (SCORE-1)', () => {
  const evenMatch = () => ({ learner: { rating: ELO_START, plays: 0 }, item: { rating: ELO_START, plays: 0 } })

  it('raises the learner and lowers the question on a correct answer', () => {
    const { learner, item } = evenMatch()
    const result = eloExchange(learner, item, 1)
    expect(result.learner.rating).toBeGreaterThan(ELO_START)
    expect(result.item.rating).toBeLessThan(ELO_START)
  })

  it('lowers the learner and raises the question on a wrong answer', () => {
    const { learner, item } = evenMatch()
    const result = eloExchange(learner, item, 0)
    expect(result.learner.rating).toBeLessThan(ELO_START)
    expect(result.item.rating).toBeGreaterThan(ELO_START)
  })

  it('moves nothing when the answer is exactly what the model expected', () => {
    const { learner, item } = evenMatch()
    const result = eloExchange(learner, item, 0.5)
    expect(result.learner.rating).toBeCloseTo(ELO_START, 10)
    expect(result.item.rating).toBeCloseTo(ELO_START, 10)
  })

  it('counts the answer on both sides even when neither rating moves', () => {
    const { learner, item } = evenMatch()
    const result = eloExchange(learner, item, 0.5)
    expect(result.learner.plays).toBe(1)
    expect(result.item.plays).toBe(1)
  })

  it('reports the prediction it scored the answer against', () => {
    const result = eloExchange({ rating: ELO_START + ELO_SCALE, plays: 0 }, { rating: ELO_START, plays: 0 }, 1)
    expect(result.expected).toBeCloseTo(0.909, 3)
  })

  it('rewards an upset far more than an expected win', () => {
    const upset = eloExchange({ rating: ELO_START, plays: 0 }, { rating: ELO_START + 400, plays: 0 }, 1)
    const expectedWin = eloExchange({ rating: ELO_START, plays: 0 }, { rating: ELO_START - 400, plays: 0 }, 1)
    expect(upset.learner.rating - ELO_START).toBeGreaterThan(expectedWin.learner.rating - ELO_START)
  })

  it('moves a settled question less than a brand-new one on the same residual', () => {
    const fresh = eloExchange({ rating: ELO_START, plays: 0 }, { rating: ELO_START, plays: 0 }, 1)
    const settled = eloExchange({ rating: ELO_START, plays: 0 }, { rating: ELO_START, plays: 500 }, 1)
    expect(ELO_START - settled.item.rating).toBeLessThan(ELO_START - fresh.item.rating)
  })

  it('clamps rather than running away on a long streak at the ceiling', () => {
    let learner = { rating: ELO_MAX, plays: 0 }
    for (let i = 0; i < 50; i++) {
      learner = eloExchange(learner, { rating: ELO_MIN, plays: 0 }, 1).learner
    }
    expect(learner.rating).toBeLessThanOrEqual(ELO_MAX)
  })

  it('clamps an out-of-range score instead of trusting it', () => {
    const { learner, item } = evenMatch()
    expect(eloExchange(learner, item, 9).learner.rating)
      .toBeCloseTo(eloExchange(learner, item, 1).learner.rating, 10)
  })
})

describe('speed-adjusted scoring, for timed items only (SCORE-1)', () => {
  it('gives a full point for an instant correct answer', () => {
    expect(speedAdjustedScore(true, 0, 30_000)).toBeCloseTo(1, 10)
  })

  it('gives nothing for an instant wrong answer', () => {
    expect(speedAdjustedScore(false, 0, 30_000)).toBeCloseTo(0, 10)
  })

  it('scores a draw at the time limit, whichever way the answer went', () => {
    expect(speedAdjustedScore(true, 30_000, 30_000)).toBeCloseTo(0.5, 10)
    expect(speedAdjustedScore(false, 30_000, 30_000)).toBeCloseTo(0.5, 10)
  })

  it('clamps past the limit rather than scoring a correct answer below a draw', () => {
    expect(speedAdjustedScore(true, 120_000, 30_000)).toBeCloseTo(0.5, 10)
  })

  it('falls back to plain correctness when the item has no time target', () => {
    expect(speedAdjustedScore(true, 5_000, 0)).toBe(1)
    expect(speedAdjustedScore(false, 5_000, 0)).toBe(0)
  })
})
