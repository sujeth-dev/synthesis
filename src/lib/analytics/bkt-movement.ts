import type { AttemptEvent } from '@/types'

export const FEYNMAN_QUESTION_SUFFIX = '_feynman_loop'
export const PLAIN_SESSION_BASELINE_LIMIT = 5

export type BktMovementAttempt = Pick<
  AttemptEvent,
  'session_id' | 'skill_id' | 'question_id' | 'attempted_at' | 'p_know_before' | 'p_know_after'
>

export interface BktMovementComparison {
  skillId: string
  feynmanSessionId: string
  feynmanMovement: number
  plainSessionAverage: number
  movementMultiplier: number | null
  baselineSessionIds: string[]
}

interface SessionMovement {
  sessionId: string
  movement: number
  startedAt: number
  endedAt: number
}

export function isFeynmanAttempt(questionId: string): boolean {
  return questionId.endsWith(FEYNMAN_QUESTION_SUFFIX)
}

function movementForSession(sessionId: string, attempts: BktMovementAttempt[]): SessionMovement | null {
  const measured = attempts
    .filter(attempt =>
      attempt.session_id === sessionId &&
      attempt.p_know_before !== null &&
      attempt.p_know_after !== null &&
      Number.isFinite(attempt.p_know_before) &&
      Number.isFinite(attempt.p_know_after),
    )
    .sort((a, b) => Date.parse(a.attempted_at) - Date.parse(b.attempted_at))

  if (measured.length === 0) return null

  const first = measured[0]
  const last = measured[measured.length - 1]
  return {
    sessionId,
    movement: last.p_know_after! - first.p_know_before!,
    startedAt: Date.parse(first.attempted_at),
    endedAt: Date.parse(last.attempted_at),
  }
}

export function computeBktMovementComparison(
  attempts: BktMovementAttempt[],
  target: { sessionId: string; skillId: string },
  baselineLimit = PLAIN_SESSION_BASELINE_LIMIT,
): BktMovementComparison | null {
  if (baselineLimit < 1) return null

  const comparable = attempts.filter(attempt => attempt.skill_id === target.skillId && attempt.session_id)
  const feynmanAttempts = comparable.filter(attempt => attempt.session_id === target.sessionId)
  if (!feynmanAttempts.some(attempt => isFeynmanAttempt(attempt.question_id))) return null

  const feynmanSession = movementForSession(target.sessionId, feynmanAttempts)
  if (!feynmanSession) return null

  const groupedPlain = new Map<string, BktMovementAttempt[]>()
  for (const attempt of comparable) {
    const sessionId = attempt.session_id!
    if (sessionId === target.sessionId) continue
    const sessionAttempts = groupedPlain.get(sessionId) ?? []
    sessionAttempts.push(attempt)
    groupedPlain.set(sessionId, sessionAttempts)
  }

  const baselineSessions = Array.from(groupedPlain)
    .filter(([, sessionAttempts]) => !sessionAttempts.some(attempt => isFeynmanAttempt(attempt.question_id)))
    .map(([sessionId, sessionAttempts]) => movementForSession(sessionId, sessionAttempts))
    .filter((session): session is SessionMovement => session !== null && session.endedAt < feynmanSession.startedAt)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, baselineLimit)

  if (baselineSessions.length === 0) return null

  const plainSessionAverage = baselineSessions.reduce((sum, session) => sum + session.movement, 0) /
    baselineSessions.length

  return {
    skillId: target.skillId,
    feynmanSessionId: target.sessionId,
    feynmanMovement: feynmanSession.movement,
    plainSessionAverage,
    movementMultiplier: plainSessionAverage > 0
      ? feynmanSession.movement / plainSessionAverage
      : null,
    baselineSessionIds: baselineSessions.map(session => session.sessionId),
  }
}
