import { describe, expect, it } from 'vitest'
import { Rating } from '@/lib/fsrs'
import {
  adaptiveFsrsRating, adaptiveQuality, adaptiveTier,
  isAdaptiveQualityEnabled, LONG_HESITATION_MS, REPEATED_REVISIONS,
} from '@/lib/sm2/adaptive'
import { bktToQuality } from '@/lib/sm2'
import { fsrsRatingFromCorrectness } from '@/lib/fsrs'

function signals(over: Partial<Parameters<typeof adaptiveTier>[1]> = {}) {
  return {
    latency_ms: 2000, hesitation_ms: 0, revision_count: 0,
    guided_reflection: false, ...over,
  }
}

describe('behaviour-aware scheduling quality (Level 11, shadow)', () => {
  it('matches the live latency tiers when no behaviour signal fires', () => {
    for (const latency of [500, 2999, 3000, 7999, 8000, 60_000]) {
      const s = signals({ latency_ms: latency })
      expect(adaptiveQuality(true, s), `${latency}ms`).toBe(bktToQuality(true, latency))
      expect(adaptiveFsrsRating(true, s), `${latency}ms`).toBe(fsrsRatingFromCorrectness(true, latency))
    }
  })

  it('demotes one step on a long time to first interaction, at the boundary', () => {
    expect(adaptiveTier(true, signals({ hesitation_ms: LONG_HESITATION_MS - 1 }))).toBe('easy')
    expect(adaptiveTier(true, signals({ hesitation_ms: LONG_HESITATION_MS }))).toBe('good')
    expect(adaptiveQuality(true, signals({ hesitation_ms: LONG_HESITATION_MS }))).toBe(4)
    expect(adaptiveFsrsRating(true, signals({ hesitation_ms: LONG_HESITATION_MS }))).toBe(Rating.Good)
  })

  it('demotes one step on repeated answer changes, at the boundary', () => {
    expect(adaptiveTier(true, signals({ revision_count: REPEATED_REVISIONS - 1 }))).toBe('easy')
    expect(adaptiveTier(true, signals({ latency_ms: 5000, revision_count: REPEATED_REVISIONS }))).toBe('hard')
  })

  it('does not demote below the slowest correct tier', () => {
    const s = signals({ latency_ms: 30_000, hesitation_ms: 25_000, revision_count: 9 })
    expect(adaptiveTier(true, s)).toBe('hard')
    expect(adaptiveQuality(true, s)).toBe(3)
    expect(adaptiveFsrsRating(true, s)).toBe(Rating.Hard)
  })

  it('leaves a wrong answer at the bottom tier whatever the behaviour was', () => {
    for (const s of [signals(), signals({ latency_ms: 30_000, revision_count: 5 })]) {
      expect(adaptiveTier(false, s)).toBe('again')
      expect(adaptiveQuality(false, s)).toBe(1)
      expect(adaptiveFsrsRating(false, s)).toBe(Rating.Again)
    }
  })

  it('takes a neutral tier for a guided reflection instead of a latency-derived one', () => {
    // The Feynman loop spans five dialogue steps and two typed explanations, so
    // the live mapping rates every one of them 3/Hard on duration alone.
    const slowReflection = signals({ latency_ms: 240_000, guided_reflection: true })
    expect(bktToQuality(true, 240_000)).toBe(3)
    expect(adaptiveQuality(true, slowReflection)).toBe(4)
    expect(adaptiveFsrsRating(true, slowReflection)).toBe(Rating.Good)

    // The behaviour signals still apply to it.
    expect(adaptiveQuality(true, { ...slowReflection, revision_count: REPEATED_REVISIONS })).toBe(3)
  })

  it('is off unless a deployment opts in explicitly', () => {
    expect(isAdaptiveQualityEnabled({})).toBe(false)
    expect(isAdaptiveQualityEnabled({ ADAPTIVE_QUALITY: 'true' })).toBe(false)
    expect(isAdaptiveQualityEnabled({ ADAPTIVE_QUALITY: '1' })).toBe(true)
  })
})
