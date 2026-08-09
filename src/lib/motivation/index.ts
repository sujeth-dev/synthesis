import type { MotivationState, MotivationStateValue, LearnerSkillState } from '@/types'

export function deriveBehaviorEvidenceModifier(current: MotivationState, latency_ms: number): number {
  let modifier = 1
  if (current.state === 'frustrated' || current.consecutive_errors >= 2) modifier -= 0.2
  if (latency_ms > 15000 || current.slow_response_streak >= 3) modifier -= 0.15
  return Math.max(0.5, modifier)
}

export function updateMotivationState(current: MotivationState, correct: boolean, latency_ms: number, skillState: LearnerSkillState): MotivationState {
  const now = new Date(); const m = { ...current, updated_at: now.toISOString() }
  if (m.intervention_cooldown_until && new Date(m.intervention_cooldown_until) > now) return m
  m.consecutive_errors = correct ? 0 : m.consecutive_errors + 1
  m.slow_response_streak = latency_ms > 15000 ? m.slow_response_streak + 1 : 0
  const prev = m.state
  if (m.consecutive_errors >= 3 || m.slow_response_streak >= 4) m.state = 'frustrated'
  else if (skillState.consecutive_correct >= 5 && skillState.p_know >= 0.80) m.state = 'bored'
  else if (skillState.consecutive_correct >= 3 && skillState.p_know >= 0.55 && skillState.p_know < 0.80) m.state = 'winning'
  else m.state = 'neutral'
  if (prev !== m.state && (m.state === 'frustrated' || m.state === 'bored'))
    m.intervention_cooldown_until = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  return m
}

export function initMotivationState(learner_id: string): MotivationState {
  return { learner_id, state: 'neutral', consecutive_errors: 0, slow_response_streak: 0, intervention_cooldown_until: null, updated_at: new Date().toISOString() }
}

export function getMotivationMessage(state: MotivationStateValue): string | null {
  if (state === 'frustrated') return "Let's take a step back. Here's something you already know well."
  if (state === 'bored') return "You're clearly past this — let's try something more challenging."
  if (state === 'winning') return "You're on a streak! Keep it up."
  return null
}
