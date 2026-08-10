import { afterEach, describe, expect, it, vi } from 'vitest'

import * as sm2 from '@/lib/sm2'
import { deriveUrgency } from '@/lib/sm2/urgency'
import { canSelectReview } from '@/lib/session/engine'
import type { LearnerSkillState, ReviewSchedule } from '@/types'

const state: LearnerSkillState = {
  learner_id: 'learner-1',
  skill_id: 'skill-1',
  p_know: 0.9,
  p_slip: 0.1,
  p_guess: 0.2,
  p_transit: 0.15,
  mastery_state: 'mastered',
  consecutive_correct: 4,
  consecutive_wrong: 0,
  total_attempts: 8,
  last_attempted_at: '2026-06-30T00:00:00.000Z',
  first_seen_at: '2026-01-01T00:00:00.000Z',
  graph_stale: false,
}

const schedule: ReviewSchedule = {
  learner_id: 'learner-1',
  skill_id: 'skill-1',
  interval_days: 10,
  ease_factor: 2.5,
  repetitions: 4,
  due_at: '2026-07-01T00:00:00.000Z',
  last_reviewed_at: '2026-06-21T00:00:00.000Z',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('on-load BKT/SM-2 reconciliation', () => {
  it('decays p_know by 2% per overdue day and re-derives mastery', () => {
    const result = sm2.reconcileBktSm2OnLoad(
      state,
      schedule,
      new Date('2026-07-31T00:00:00.000Z'),
    )

    expect(result.state.p_know).toBeCloseTo(0.9 * 0.98 ** 30, 8)
    expect(result.state.mastery_state).toBe('learning')
    expect(result.schedule.due_at).toBe('2026-07-31T00:00:00.000Z')
  })

  it('preserves the attempt-time mastery-loss reset behavior', () => {
    const result = sm2.reconcileBktSm2(0.49, true, schedule, 1)

    expect(result.interval_days).toBe(1)
    expect(result.repetitions).toBe(schedule.repetitions)
  })

  it('requires explicit review mode for active- and past-phase reviews', () => {
    expect(canSelectReview('active_phase')).toBe(false)
    expect(canSelectReview('past_phase')).toBe(false)
    expect(canSelectReview('active_phase', 'review')).toBe(true)
    expect(canSelectReview('past_phase', 'review')).toBe(true)
  })
})

describe('SM-2 scheduling', () => {
  it('initializes a review one day in the future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T06:00:00.000Z'))

    expect(sm2.initSM2('learner-1', 'skill-1')).toEqual({
      learner_id: 'learner-1',
      skill_id: 'skill-1',
      interval_days: 1,
      ease_factor: 2.5,
      repetitions: 0,
      due_at: '2026-08-11T06:00:00.000Z',
      last_reviewed_at: null,
    })
  })

  it('advances a successful review and resets a failed review', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T06:00:00.000Z'))

    const firstSuccess = sm2.updateSM2({ ...schedule, repetitions: 0 }, 5)
    const failed = sm2.updateSM2(schedule, 2)

    expect(firstSuccess).toMatchObject({
      repetitions: 1,
      interval_days: 1,
      ease_factor: 2.6,
      due_at: '2026-08-11T06:00:00.000Z',
      last_reviewed_at: '2026-08-10T06:00:00.000Z',
    })
    expect(failed).toMatchObject({
      repetitions: 0,
      interval_days: 1,
    })
    expect(failed.ease_factor).toBeCloseTo(2.18, 8)
  })

  it('maps correctness and latency to SM-2 quality at each boundary', () => {
    expect(sm2.bktToQuality(false, 100)).toBe(1)
    expect(sm2.bktToQuality(true, 2999)).toBe(5)
    expect(sm2.bktToQuality(true, 3000)).toBe(4)
    expect(sm2.bktToQuality(true, 7999)).toBe(4)
    expect(sm2.bktToQuality(true, 8000)).toBe(3)
  })
})

describe('review urgency', () => {
  const now = new Date('2026-08-10T06:00:00.000Z')

  it('classifies overdue, today, soon, and upcoming review dates', () => {
    expect(deriveUrgency('2026-08-09T06:00:00.000Z', now)).toEqual({
      urgency: 'overdue', days_until_due: -1, label: 'Overdue by 1 day',
    })
    expect(deriveUrgency('2026-08-10T18:00:00.000Z', now)).toEqual({
      urgency: 'due_today', days_until_due: 0.5, label: 'Due today',
    })
    expect(deriveUrgency('2026-08-12T06:00:00.000Z', now)).toEqual({
      urgency: 'due_soon', days_until_due: 2, label: 'Due in 2 days',
    })
    expect(deriveUrgency('2026-08-14T06:00:00.000Z', now)).toEqual({
      urgency: 'upcoming', days_until_due: 4, label: 'Due in 4 days',
    })
  })
})
