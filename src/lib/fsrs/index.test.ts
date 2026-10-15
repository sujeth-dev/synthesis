import { describe, expect, it } from 'vitest'
import { fsrs, generatorParameters, createEmptyCard, State, Rating, type Card } from 'ts-fsrs'

import { computeFsrsSchedule, fsrsRatingFromCorrectness, type FsrsCardState } from '@/lib/fsrs'

// Independent reference scheduler built directly from ts-fsrs with the exact
// same parameters the wrapper uses, so these tests prove computeFsrsSchedule()
// is a faithful passthrough rather than a reimplementation with its own bugs.
const reference = fsrs(generatorParameters({ enable_short_term: false }))

function referenceSchedule(card: Card, now: Date, rating: Parameters<typeof reference.next>[2]) {
  const retrievability = reference.get_retrievability(card, now, false)
  const { card: next } = reference.next(card, now, rating)
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    retrievability,
    interval_days: next.scheduled_days,
    due_at: next.due.toISOString(),
  }
}

describe('computeFsrsSchedule', () => {
  it('matches the reference scheduler for a first-ever (New card) Good review', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')

    const result = computeFsrsSchedule(null, Rating.Good, now)
    const expected = referenceSchedule(createEmptyCard(now), now, Rating.Good)

    expect(result).toEqual(expected)
  })

  it('matches the reference scheduler for a first-ever Again (incorrect) review', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')

    const result = computeFsrsSchedule(null, Rating.Again, now)
    const expected = referenceSchedule(createEmptyCard(now), now, Rating.Again)

    expect(result).toEqual(expected)
  })

  it('matches the reference scheduler for a second review resumed from prior state', () => {
    const firstNow = new Date('2026-01-01T00:00:00.000Z')
    const first = computeFsrsSchedule(null, Rating.Good, firstNow)

    const previous: FsrsCardState = {
      stability: first.stability,
      difficulty: first.difficulty,
      last_review: firstNow.toISOString(),
    }
    const secondNow = new Date(first.due_at)

    const result = computeFsrsSchedule(previous, Rating.Good, secondNow)

    const referenceCard: Card = {
      due: secondNow,
      stability: first.stability,
      difficulty: first.difficulty,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: State.Review,
      last_review: firstNow,
    }
    const expected = referenceSchedule(referenceCard, secondNow, Rating.Good)

    expect(result).toEqual(expected)
  })

  it('returns plausible day-granular values (no sub-day learning steps)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const result = computeFsrsSchedule(null, Rating.Good, now)

    expect(Number.isInteger(result.interval_days)).toBe(true)
    expect(result.interval_days).toBeGreaterThanOrEqual(1)
    expect(new Date(result.due_at).getUTCHours()).toBe(0)
  })
})

describe('fsrsRatingFromCorrectness', () => {
  it('maps correctness and latency to FSRS grade at each boundary', () => {
    expect(fsrsRatingFromCorrectness(false, 100)).toBe(Rating.Again)
    expect(fsrsRatingFromCorrectness(false, 50000)).toBe(Rating.Again)
    expect(fsrsRatingFromCorrectness(true, 2999)).toBe(Rating.Easy)
    expect(fsrsRatingFromCorrectness(true, 3000)).toBe(Rating.Good)
    expect(fsrsRatingFromCorrectness(true, 7999)).toBe(Rating.Good)
    expect(fsrsRatingFromCorrectness(true, 8000)).toBe(Rating.Hard)
  })
})
