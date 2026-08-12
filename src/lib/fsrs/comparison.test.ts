import { describe, expect, it } from 'vitest'
import { computeShadowDivergence, hasSufficientSample, MIN_SAMPLE_FOR_SIGNAL } from '@/lib/fsrs/comparison'

describe('computeShadowDivergence', () => {
  it('returns a zeroed, non-crashing result for an empty sample', () => {
    const result = computeShadowDivergence([])
    expect(result).toEqual({
      count: 0, mean_sm2_interval_days: 0, mean_fsrs_interval_days: 0,
      mean_absolute_delta_days: 0, mean_signed_delta_days: 0, interval_correlation: null,
    })
  })

  it('computes means and signed/absolute deltas over a mixed sample', () => {
    const result = computeShadowDivergence([
      { sm2_interval_days: 6, fsrs_interval_days: 10 },
      { sm2_interval_days: 6, fsrs_interval_days: 2 },
      { sm2_interval_days: 15, fsrs_interval_days: 15 },
    ])
    expect(result.count).toBe(3)
    expect(result.mean_sm2_interval_days).toBeCloseTo(9, 8)
    expect(result.mean_fsrs_interval_days).toBeCloseTo(9, 8)
    // Signed deltas (4, -4, 0) cancel out even though FSRS clearly diverges per-row.
    expect(result.mean_signed_delta_days).toBeCloseTo(0, 8)
    expect(result.mean_absolute_delta_days).toBeCloseTo((4 + 4 + 0) / 3, 8)
  })

  it('reports perfect positive correlation when FSRS tracks SM-2 exactly', () => {
    const result = computeShadowDivergence([
      { sm2_interval_days: 1, fsrs_interval_days: 2 },
      { sm2_interval_days: 2, fsrs_interval_days: 4 },
      { sm2_interval_days: 3, fsrs_interval_days: 6 },
    ])
    expect(result.interval_correlation).toBeCloseTo(1, 8)
  })

  it('returns null correlation when a series has zero variance or fewer than 2 points', () => {
    expect(computeShadowDivergence([{ sm2_interval_days: 5, fsrs_interval_days: 7 }]).interval_correlation).toBeNull()
    expect(computeShadowDivergence([
      { sm2_interval_days: 5, fsrs_interval_days: 7 },
      { sm2_interval_days: 5, fsrs_interval_days: 12 },
    ]).interval_correlation).toBeNull()
  })
})

describe('hasSufficientSample', () => {
  it('gates on MIN_SAMPLE_FOR_SIGNAL', () => {
    const small = computeShadowDivergence(Array.from({ length: MIN_SAMPLE_FOR_SIGNAL - 1 }, () => ({ sm2_interval_days: 1, fsrs_interval_days: 1 })))
    const large = computeShadowDivergence(Array.from({ length: MIN_SAMPLE_FOR_SIGNAL }, () => ({ sm2_interval_days: 1, fsrs_interval_days: 1 })))
    expect(hasSufficientSample(small)).toBe(false)
    expect(hasSufficientSample(large)).toBe(true)
  })
})
