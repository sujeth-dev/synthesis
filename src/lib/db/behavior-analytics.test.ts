import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistedRows = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('@/lib/db', () => ({
  generateId: () => `attempt-${persistedRows.length + 1}`,
  getDb: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        persistedRows.push(row)
        return { data: null, error: null }
      },
      select: () => {
        let selected = [...persistedRows]
        const query = {
          eq(field: string, value: unknown) {
            selected = selected.filter(row => row[field] === value)
            return query
          },
          order(field: string, options: { ascending: boolean }) {
            selected.sort((a, b) => {
              const left = String(a[field])
              const right = String(b[field])
              return options.ascending ? left.localeCompare(right) : right.localeCompare(left)
            })
            return query
          },
          then<TResult1 = { data: Array<Record<string, unknown>> }, TResult2 = never>(
            onfulfilled?: ((value: { data: Array<Record<string, unknown>> }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) {
            return Promise.resolve({ data: selected }).then(onfulfilled, onrejected)
          },
        }
        return query
      },
    }),
  }),
}))

import { buildAttemptBehaviorSnapshot, deriveBehaviorEvidenceModifier, updateMotivationState } from '@/lib/motivation'
import { getSessionBehaviorAttempts, insertAttempt } from '@/lib/db/queries'
import type { LearnerSkillState, MotivationState } from '@/types'

const learnerId = 'learner-analytics'
const sessionId = 'session-analytics'

beforeEach(() => {
  persistedRows.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-10T08:00:00.000Z'))
})

describe('attempt behavior analytics persistence', () => {
  it('round-trips the same signal values computed by the live motivation FSM', async () => {
    const currentMotivation: MotivationState = {
      learner_id: learnerId,
      state: 'neutral',
      consecutive_errors: 1,
      slow_response_streak: 2,
      intervention_cooldown_until: null,
      updated_at: '2026-08-10T07:55:00.000Z',
    }
    const skillState: LearnerSkillState = {
      learner_id: learnerId,
      skill_id: 'integration-basics',
      p_know: 0.4,
      p_slip: 0.1,
      p_guess: 0.2,
      p_transit: 0.15,
      mastery_state: 'learning',
      consecutive_correct: 0,
      consecutive_wrong: 1,
      total_attempts: 4,
      last_attempted_at: '2026-08-10T07:55:00.000Z',
      first_seen_at: '2026-08-01T00:00:00.000Z',
      graph_stale: false,
    }
    const latencyMs = 16000
    const behaviorModifier = deriveBehaviorEvidenceModifier(currentMotivation, latencyMs)
    const updatedMotivation = updateMotivationState(currentMotivation, false, latencyMs, skillState)
    const snapshot = buildAttemptBehaviorSnapshot(updatedMotivation, latencyMs, behaviorModifier)

    await insertAttempt({
      learner_id: learnerId,
      skill_id: skillState.skill_id,
      question_id: 'integration-q1',
      session_id: sessionId,
      correct: false,
      latency_ms: latencyMs,
      revision_count: 2,
      error_type: null,
      difficulty_tier: 'same',
      question_format: 'mcq',
      p_know_before: 0.4,
      p_know_after: 0.31,
      ...snapshot,
    })

    const [persisted] = await getSessionBehaviorAttempts(learnerId, sessionId)

    expect(persisted).toMatchObject({
      latency_ms: latencyMs,
      revision_count: 2,
      motivation_state: updatedMotivation.state,
      consecutive_errors: updatedMotivation.consecutive_errors,
      slow_response_streak: updatedMotivation.slow_response_streak,
      behavior_modifier: behaviorModifier,
      hesitation_ms: 1000,
    })
  })
})
