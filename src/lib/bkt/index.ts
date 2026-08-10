import type { LearnerSkillState, MasteryState } from '@/types'
export const BKT_DEFAULTS = { p_know: 0.10, p_transit: 0.15, p_slip: 0.10, p_guess: 0.20 } as const
export const MASTERY_THRESHOLD = 0.65; export const FRAGILE_THRESHOLD = 0.55; export const LEARNING_THRESHOLD = 0.30
export type MasteryTier = 'Beginner' | 'Intermediate' | 'Mastered'

export function getMasteryTier(pKnow: number): MasteryTier {
  if (pKnow >= MASTERY_THRESHOLD) return 'Mastered'
  if (pKnow >= LEARNING_THRESHOLD) return 'Intermediate'
  return 'Beginner'
}

export interface BktEvidenceModifiers {
  reasoningQuality?: number
  behavior?: number
}

function clampEvidence(value: number): number { return Math.min(1, Math.max(0, value)) }

export function bktUpdate(
  state: LearnerSkillState,
  correct: boolean,
  sm2Reps = 0,
  modifiers: BktEvidenceModifiers = {},
): LearnerSkillState {
  const { p_know, p_slip, p_guess, p_transit } = state
  const reasoningQuality = clampEvidence(modifiers.reasoningQuality ?? 1)
  const behavior = clampEvidence(modifiers.behavior ?? 1)
  const evidenceStrength = 0.6 * reasoningQuality + 0.4 * behavior
  const knownRaw = correct ? 1 - p_slip : p_slip
  const unknownRaw = correct ? p_guess : 1 - p_guess
  const knownLikelihood = 0.5 + (knownRaw - 0.5) * evidenceStrength
  const unknownLikelihood = 0.5 + (unknownRaw - 0.5) * evidenceStrength
  const pg = (p_know * knownLikelihood) /
    (p_know * knownLikelihood + (1 - p_know) * unknownLikelihood)
  const p_know_final = Math.min(0.99, Math.max(0.01, pg + (1 - pg) * p_transit))
  return { ...state, p_know: p_know_final, consecutive_correct: correct ? state.consecutive_correct + 1 : 0,
    consecutive_wrong: correct ? 0 : state.consecutive_wrong + 1, total_attempts: state.total_attempts + 1,
    last_attempted_at: new Date().toISOString(), mastery_state: deriveMasteryState(p_know_final, state, sm2Reps) }
}

export function deriveMasteryState(p_know: number, state: LearnerSkillState, sm2Reps = 0): MasteryState {
  if (state.mastery_state === 'blocked') return 'blocked'
  if (p_know >= MASTERY_THRESHOLD && sm2Reps >= 1) return 'mastered'
  if (p_know >= FRAGILE_THRESHOLD) return 'fragile'
  if (p_know >= LEARNING_THRESHOLD) return 'learning'
  return 'ready'
}

export function initSkillState(learner_id: string, skill_id: string, initial_p_know?: number, blocked?: boolean): LearnerSkillState {
  const p_know = initial_p_know ?? BKT_DEFAULTS.p_know
  return { learner_id, skill_id, p_know, p_slip: BKT_DEFAULTS.p_slip, p_guess: BKT_DEFAULTS.p_guess,
    p_transit: BKT_DEFAULTS.p_transit,
    mastery_state: blocked ? 'blocked' : p_know >= LEARNING_THRESHOLD ? 'learning' : 'ready',
    consecutive_correct: 0, consecutive_wrong: 0, total_attempts: 0,
    last_attempted_at: null, first_seen_at: new Date().toISOString(), graph_stale: false }
}

export function diagnosticScoreToKnow(score: number): number { return Math.min(0.65, 0.05 + score * 0.60) }
