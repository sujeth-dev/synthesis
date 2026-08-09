import { describe, expect, it } from 'vitest'

import * as sm2 from '@/lib/sm2'
import { shouldAutoScheduleReview } from '@/lib/session/engine'
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

describe('on-load BKT/SM-2 reconciliation', () => {
  it('decays p_know by 2% per overdue day and re-derives mastery', () => {
    const reconcile = (
      sm2 as typeof sm2 & {
        reconcileBktSm2OnLoad?: (
          state: LearnerSkillState,
          schedule: ReviewSchedule,
          now: Date,
        ) => { state: LearnerSkillState; schedule: ReviewSchedule }
      }
    ).reconcileBktSm2OnLoad

    const result = reconcile
      ? reconcile(state, schedule, new Date('2026-07-31T00:00:00.000Z'))
      : { state, schedule }

    expect(result.state.p_know).toBeCloseTo(0.9 * 0.98 ** 30, 8)
    expect(result.state.mastery_state).toBe('learning')
    expect(result.schedule.due_at).toBe('2026-07-31T00:00:00.000Z')
  })

  it('preserves the attempt-time mastery-loss reset behavior', () => {
    const result = sm2.reconcileBktSm2(0.49, true, schedule, 1)

    expect(result.interval_days).toBe(1)
    expect(result.repetitions).toBe(schedule.repetitions)
  })

  it('keeps past-phase reviews optional outside explicit review mode', () => {
    expect(shouldAutoScheduleReview('active_phase')).toBe(true)
    expect(shouldAutoScheduleReview('past_phase')).toBe(false)
    expect(shouldAutoScheduleReview('past_phase', 'review')).toBe(true)
  })
})
