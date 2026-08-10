import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deriveBehaviorEvidenceModifier,
  getMotivationMessage,
  initMotivationState,
  updateMotivationState,
} from '@/lib/motivation'
import type { LearnerSkillState, MotivationState } from '@/types'

const learnerId = 'learner-1'

function skillState(consecutiveCorrect = 0, pKnow = 0.1): LearnerSkillState {
  return {
    learner_id: learnerId,
    skill_id: 'skill-1',
    p_know: pKnow,
    p_slip: 0.1,
    p_guess: 0.2,
    p_transit: 0.15,
    mastery_state: 'ready',
    consecutive_correct: consecutiveCorrect,
    consecutive_wrong: 0,
    total_attempts: 0,
    last_attempted_at: null,
    first_seen_at: '2026-08-01T00:00:00.000Z',
    graph_stale: false,
  }
}

function motivationState(overrides: Partial<MotivationState> = {}): MotivationState {
  return {
    learner_id: learnerId,
    state: 'neutral',
    consecutive_errors: 0,
    slow_response_streak: 0,
    intervention_cooldown_until: null,
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('motivation evidence', () => {
  it('degrades behavior evidence for frustration, repeated errors, and slow responses', () => {
    expect(deriveBehaviorEvidenceModifier(motivationState(), 1000)).toBe(1)
    expect(deriveBehaviorEvidenceModifier(motivationState({ consecutive_errors: 2 }), 1000)).toBe(0.8)
    expect(deriveBehaviorEvidenceModifier(motivationState({ state: 'frustrated' }), 16000)).toBe(0.65)
  })
})

describe('motivation state machine', () => {
  it('initializes a neutral learner state', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T06:00:00.000Z'))

    expect(initMotivationState(learnerId)).toEqual({
      learner_id: learnerId,
      state: 'neutral',
      consecutive_errors: 0,
      slow_response_streak: 0,
      intervention_cooldown_until: null,
      updated_at: '2026-08-10T06:00:00.000Z',
    })
  })

  it('enters frustration after three consecutive errors and starts a cooldown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T06:00:00.000Z'))

    const first = updateMotivationState(motivationState(), false, 1000, skillState())
    const second = updateMotivationState(first, false, 1000, skillState())
    const third = updateMotivationState(second, false, 1000, skillState())

    expect(third).toMatchObject({
      state: 'frustrated',
      consecutive_errors: 3,
      intervention_cooldown_until: '2026-08-10T06:10:00.000Z',
    })
  })

  it('distinguishes winning and bored skill trajectories', () => {
    const winning = updateMotivationState(motivationState(), true, 1000, skillState(3, 0.55))
    const bored = updateMotivationState(motivationState(), true, 1000, skillState(5, 0.8))

    expect(winning.state).toBe('winning')
    expect(bored.state).toBe('bored')
  })
})

describe('motivation messages', () => {
  it('returns the matching intervention copy or no message for neutral state', () => {
    expect(getMotivationMessage('frustrated')).toContain('step back')
    expect(getMotivationMessage('bored')).toContain('more challenging')
    expect(getMotivationMessage('winning')).toContain('on a streak')
    expect(getMotivationMessage('neutral')).toBeNull()
  })
})
