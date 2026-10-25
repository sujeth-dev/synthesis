import { describe, it, expect } from 'vitest'
import type { LearnerSkillState, MotivationState, ReviewSchedule } from '@/types'
import { ELO_START } from '@/lib/elo'
import { getAllNodes } from '@/lib/graph'
import { suggestNext, REASON_TEXT } from './suggest'

const NOW = new Date('2026-10-25T12:00:00.000Z')
const nodes = getAllNodes().filter(n => !n.deprecated)
const phase1 = nodes.filter(n => n.phase === 'phase_1_computer_basics' && n.question_ids.length > 0)

function state(skillId: string, over: Partial<LearnerSkillState> = {}): LearnerSkillState {
  return {
    learner_id: 'learner-suggest', skill_id: skillId,
    p_know: 0.1, p_slip: 0.1, p_guess: 0.2, p_transit: 0.15,
    mastery_state: 'blocked', consecutive_correct: 0, consecutive_wrong: 0,
    total_attempts: 0, last_attempted_at: null, first_seen_at: '2026-10-01T12:00:00.000Z', graph_stale: false,
    ...over,
  }
}

function fresh(skillId: string): ReviewSchedule {
  return {
    learner_id: 'learner-suggest', skill_id: skillId, interval_days: 1, ease_factor: 2.5,
    repetitions: 0, due_at: NOW.toISOString(), last_reviewed_at: null,
  }
}

const motivation: MotivationState = {
  learner_id: 'learner-suggest', state: 'neutral', consecutive_errors: 0, slow_response_streak: 0,
  intervention_cooldown_until: null, updated_at: NOW.toISOString(),
}

// Phase 1 open at varied progress, everything else still locked.
const states = nodes.map(n => {
  const i = phase1.findIndex(p => p.id === n.id)
  return i < 0 ? state(n.id) : state(n.id, { mastery_state: i % 2 ? 'learning' : 'ready', p_know: 0.1 + 0.05 * i, total_attempts: i })
})
const args = {
  skillStates: states, schedules: nodes.map(n => fresh(n.id)), motivation,
  learnerRating: ELO_START, questionRatings: new Map<string, number>(), now: NOW,
}

describe('the dashboard suggestion (OLM-5)', () => {
  it('names what the session will actually serve, from the active phase', () => {
    const s = suggestNext(args)
    expect(s.rule).not.toBeNull()
    expect(phase1.map(n => n.id)).toContain(s.rule!.skill_id)
    expect(REASON_TEXT[s.rule!.reason]).toBeTruthy()
  })

  it('gives the score\'s pick with its reasons, and never a locked skill', () => {
    const s = suggestNext(args)
    expect(s.score).not.toBeNull()
    expect(s.score!.reason.length).toBeGreaterThan(0)
    expect(s.score!.terms.length).toBeGreaterThan(0)
    const locked = new Set(states.filter(x => x.mastery_state === 'blocked').map(x => x.skill_id))
    expect(locked.has(s.score!.skill_id)).toBe(false)
  })

  it('is the same suggestion every time for the same state, since it never explores', () => {
    const a = suggestNext(args)
    const b = suggestNext(args)
    expect(b.rule).toEqual(a.rule)
    expect(b.score!.skill_id).toBe(a.score!.skill_id)
  })
})
