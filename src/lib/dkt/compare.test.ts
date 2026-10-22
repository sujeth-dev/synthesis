import { describe, expect, it } from 'vitest'
import {
  compareDktVsBkt, compareGrowth, cutoverDecision, withOpportunityIndex,
  MAX_SLOPE_RATIO_LOSS, MIN_ATTEMPTS_FOR_DECISION, MIN_COHORT_BUCKET_ROWS,
  MIN_COHORT_OPPORTUNITIES, MIN_COHORT_PAIRS,
  type GrowthComparison, type OpportunityRow, type ShadowRow,
} from './compare'

// Growth that clears the floor, so the pre-existing AUC cases below keep
// testing exactly what they tested before the gate gained its third condition.
const growthClears: GrowthComparison = {
  pairs: MIN_COHORT_PAIRS + 40, points: MIN_COHORT_OPPORTUNITIES, actualSlope: 0.02,
  dkt: { slope: 0.0164, slopeRatio: 0.82 }, bkt: { slope: 0.017, slopeRatio: 0.85 },
}

function rows(n: number, dktSharp: boolean): ShadowRow[] {
  return Array.from({ length: n }, (_, i) => {
    const correct = i % 2 === 0
    const sharp = correct ? 0.9 : 0.1
    const noisy = (i % 4 < 2) ? 0.6 : 0.4 // half right, half wrong ordering
    return { correct, dkt_p_correct: dktSharp ? sharp : noisy, bkt_p_correct: dktSharp ? noisy : sharp }
  })
}

describe('DKT-12 comparison and DKT-13 gate', () => {
  it('scores both models on the same rows', () => {
    const c = compareDktVsBkt(rows(100, true))
    expect(c.n).toBe(100)
    expect(c.dkt.auc).toBe(1)
    expect(c.bkt.auc).toBeLessThan(c.dkt.auc)
  })

  it('never recommends a switch on too little data', () => {
    expect(cutoverDecision(compareDktVsBkt(rows(100, true)), growthClears)).toEqual({
      recommend: false, reason: 'insufficient_data',
      checks: expect.objectContaining({ sampleSize: { pass: false, n: 100, required: MIN_ATTEMPTS_FOR_DECISION } }),
    })
  })

  it('recommends only when DKT is clearly better on enough data', () => {
    expect(cutoverDecision(compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, true)), growthClears).recommend).toBe(true)
    expect(cutoverDecision(compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, false)), growthClears))
      .toEqual({
        recommend: false, reason: 'dkt_not_better',
        checks: expect.objectContaining({ ranking: expect.objectContaining({ pass: false }) }),
      })
  })
})

// A cohort where learners really improve: P(correct) rises with the
// opportunity index, DKT tracks it at `dktGrowth` of the observed rate and BKT
// at `bktGrowth`.
function cohortRows(pairs: number, dktGrowth: number, bktGrowth: number): OpportunityRow[] {
  const out: OpportunityRow[] = []
  for (let p = 0; p < pairs; p++) {
    for (let opportunity = 1; opportunity <= MIN_COHORT_OPPORTUNITIES; opportunity++) {
      const base = 0.3 + 0.05 * (opportunity - 1)
      out.push({
        learner_id: `learner-${p}`, skill_id: `skill-${p % 7}`,
        // Deterministic outcomes whose bucket mean is `base`.
        correct: (p % 100) / 100 < base,
        dkt_p_correct: 0.3 + 0.05 * dktGrowth * (opportunity - 1),
        bkt_p_correct: 0.3 + 0.05 * bktGrowth * (opportunity - 1),
      })
    }
  }
  return out
}

describe('cohort growth (Level 12)', () => {
  it('indexes each (learner, skill) pair separately, in the order given', () => {
    const indexed = withOpportunityIndex([
      { learner_id: 'a', skill_id: 's1', dkt_p_correct: 0.5, bkt_p_correct: 0.5, correct: true },
      { learner_id: 'a', skill_id: 's2', dkt_p_correct: 0.5, bkt_p_correct: 0.5, correct: true },
      { learner_id: 'a', skill_id: 's1', dkt_p_correct: 0.5, bkt_p_correct: 0.5, correct: false },
      { learner_id: 'b', skill_id: 's1', dkt_p_correct: 0.5, bkt_p_correct: 0.5, correct: true },
    ])
    expect(indexed.map(row => row.opportunity)).toEqual([1, 1, 2, 1])
  })

  it('measures each model\'s slope against the observed one on a fixed cohort', () => {
    const growth = compareGrowth(cohortRows(MIN_COHORT_PAIRS + 20, 0.5, 0.9))

    expect(growth.pairs).toBe(MIN_COHORT_PAIRS + 20)
    expect(growth.points).toBe(MIN_COHORT_OPPORTUNITIES)
    expect(growth.actualSlope).toBeGreaterThan(0)
    expect(growth.dkt.slopeRatio).toBeCloseTo(0.5 / (growth.actualSlope / 0.05), 6)
    expect(growth.bkt.slopeRatio).toBeGreaterThan(growth.dkt.slopeRatio)
  })

  it('drops pairs with too few attempts and buckets with too few rows', () => {
    const short: OpportunityRow[] = Array.from({ length: 500 }, (_, i) => ({
      learner_id: `short-${i}`, skill_id: 's', dkt_p_correct: 0.5, bkt_p_correct: 0.5, correct: true,
    }))
    expect(compareGrowth(short).pairs).toBe(0)

    const thin = cohortRows(Math.floor(MIN_COHORT_BUCKET_ROWS / 2), 0.9, 0.9)
    expect(compareGrowth(thin).points).toBe(0)
  })

  it('refuses the cutover when growth cannot be measured, even with the AUC gain', () => {
    const comparison = compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, true))
    const thin = compareGrowth(cohortRows(MIN_COHORT_PAIRS - 1, 0.9, 0.9))

    expect(thin.pairs).toBeLessThan(MIN_COHORT_PAIRS)
    expect(cutoverDecision(comparison, thin)).toEqual({
      recommend: false, reason: 'growth_unmeasured',
      checks: expect.objectContaining({ growth: expect.objectContaining({ pass: false, measured: false }) }),
    })
  })

  it('refuses a model that wins on AUC while reproducing less of the learning', () => {
    // The lab's ASSISTments 2009 result: +0.087 AUC for DKT, slope ratio 0.560
    // against BKT's 0.822.
    const comparison = compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, true))
    const growth: GrowthComparison = {
      ...growthClears, dkt: { slope: 0.0112, slopeRatio: 0.560 }, bkt: { slope: 0.0164, slopeRatio: 0.822 },
    }
    expect(cutoverDecision(comparison, growth)).toEqual({
      recommend: false, reason: 'dkt_worse_growth',
      checks: expect.objectContaining({ growth: expect.objectContaining({ pass: false, measured: true }) }),
    })
  })

  it('allows a slope ratio within the tolerance of BKT\'s', () => {
    const comparison = compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, true))
    const atFloor: GrowthComparison = {
      ...growthClears,
      dkt: { slope: 0.0164, slopeRatio: growthClears.bkt.slopeRatio - MAX_SLOPE_RATIO_LOSS },
    }
    expect(cutoverDecision(comparison, atFloor).recommend).toBe(true)

    const justBelow: GrowthComparison = {
      ...atFloor,
      dkt: { slope: 0.0164, slopeRatio: growthClears.bkt.slopeRatio - MAX_SLOPE_RATIO_LOSS - 0.001 },
    }
    expect(cutoverDecision(comparison, justBelow).reason).toBe('dkt_worse_growth')
  })

  // ── Level 15: the verdict names one reason, the checks name all of them ──
  it('reports ranking AND growth as failing when both do', () => {
    // Today's simulator case: the retrained DKT gains 0.0078 AUC against the
    // 0.02 required and loses 0.144 slope ratio against the 0.05 tolerated.
    // The old gate returned `dkt_not_better` and said nothing about growth, so
    // closing the AUC gap would have surfaced a second failure nobody was told
    // about.
    const comparison = compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, false))
    const worse: GrowthComparison = {
      ...growthClears, dkt: { slope: 0.0145, slopeRatio: 0.7273 }, bkt: { slope: 0.0174, slopeRatio: 0.8712 },
    }
    const decision = cutoverDecision(comparison, worse)

    expect(decision.reason).toBe('dkt_not_better')
    expect(decision.checks.sampleSize.pass).toBe(true)
    expect(decision.checks.ranking.pass).toBe(false)
    expect(decision.checks.growth.measured).toBe(true)
    expect(decision.checks.growth.pass).toBe(false)
  })

  it('recommends only when every check passes', () => {
    const decision = cutoverDecision(compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, true)), growthClears)
    expect(decision.recommend).toBe(true)
    expect(Object.values(decision.checks).every(check => check.pass)).toBe(true)
  })
})
