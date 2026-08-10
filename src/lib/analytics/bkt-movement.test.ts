import { describe, expect, it } from 'vitest'
import { computeBktMovementComparison, type BktMovementAttempt } from './bkt-movement'

const skillId = 'integration-basics'

function attempt(
  sessionId: string,
  questionId: string,
  attemptedAt: string,
  pKnowBefore: number,
  pKnowAfter: number,
): BktMovementAttempt {
  return {
    session_id: sessionId,
    skill_id: skillId,
    question_id: questionId,
    attempted_at: attemptedAt,
    p_know_before: pKnowBefore,
    p_know_after: pKnowAfter,
  }
}

describe('real BKT movement comparison', () => {
  it('derives plain and Feynman session movement from attempt records', () => {
    const attempts = [
      attempt('plain-1', 'q1', '2026-08-01T10:00:00.000Z', 0.10, 0.14),
      attempt('plain-1', 'q2', '2026-08-01T10:05:00.000Z', 0.14, 0.18),
      attempt('plain-2', 'q3', '2026-08-02T10:00:00.000Z', 0.18, 0.23),
      attempt('plain-2', 'q4', '2026-08-02T10:05:00.000Z', 0.23, 0.28),
      attempt('feynman-1', 'q5', '2026-08-03T10:00:00.000Z', 0.28, 0.35),
      attempt('feynman-1', `${skillId}_feynman_loop`, '2026-08-03T10:05:00.000Z', 0.35, 0.49),
    ]

    const comparison = computeBktMovementComparison(attempts, {
      sessionId: 'feynman-1',
      skillId,
    })

    // Hand calculation: plain movements are 0.08 and 0.10, averaging 0.09.
    // The Feynman session moves 0.28 -> 0.49 = 0.21, or 2.333...x baseline.
    expect(comparison).not.toBeNull()
    expect(comparison!.plainSessionAverage).toBeCloseTo(0.09, 10)
    expect(comparison!.feynmanMovement).toBeCloseTo(0.21, 10)
    expect(comparison!.movementMultiplier).toBeCloseTo(0.21 / 0.09, 10)
    expect(comparison!.baselineSessionIds).toEqual(['plain-2', 'plain-1'])
  })
})
