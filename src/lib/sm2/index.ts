import { deriveMasteryState } from '@/lib/bkt'
import { deriveUrgency } from '@/lib/sm2/urgency'
import type { LearnerSkillState, ReviewSchedule } from '@/types'
function addDays(date: Date, days: number): Date { const d = new Date(date); d.setDate(d.getDate() + days); return d }

export const OVERDUE_DAILY_RETENTION = 0.98

export function reconcileBktSm2OnLoad(
  state: LearnerSkillState,
  schedule: ReviewSchedule,
  now = new Date(),
): { state: LearnerSkillState; schedule: ReviewSchedule } {
  const { urgency, days_until_due } = deriveUrgency(schedule.due_at, now)
  if (urgency !== 'overdue' || schedule.repetitions === 0) return { state, schedule }

  const daysOverdue = Math.max(0, -days_until_due)
  if (daysOverdue === 0) return { state, schedule }

  const p_know = Math.max(0.01, state.p_know * OVERDUE_DAILY_RETENTION ** daysOverdue)
  return {
    state: {
      ...state,
      p_know,
      mastery_state: deriveMasteryState(p_know, state, schedule.repetitions),
    },
    schedule: { ...schedule, due_at: now.toISOString() },
  }
}

export function updateSM2(schedule: ReviewSchedule, quality: number): ReviewSchedule {
  const s = { ...schedule }
  if (quality >= 3) {
    if (s.repetitions === 0) s.interval_days = 1
    else if (s.repetitions === 1) s.interval_days = 6
    else s.interval_days = Math.round(s.interval_days * s.ease_factor)
    s.repetitions += 1
  } else { s.repetitions = 0; s.interval_days = 1 }
  s.ease_factor = Math.max(1.3, s.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  s.due_at = addDays(new Date(), s.interval_days).toISOString()
  s.last_reviewed_at = new Date().toISOString()
  return s
}

export function initSM2(learner_id: string, skill_id: string): ReviewSchedule {
  return { learner_id, skill_id, interval_days: 1, ease_factor: 2.5, repetitions: 0, due_at: addDays(new Date(), 1).toISOString(), last_reviewed_at: null }
}

export function bktToQuality(correct: boolean, latency_ms: number): number {
  if (!correct) return 1
  if (latency_ms < 3000) return 5
  if (latency_ms < 8000) return 4
  return 3
}

export function reconcileBktSm2(p_know_new: number, wasMastered: boolean, schedule: ReviewSchedule, quality: number): ReviewSchedule {
  if (wasMastered && p_know_new < 0.50) return { ...schedule, interval_days: 1, due_at: addDays(new Date(), 1).toISOString() }
  if (p_know_new >= 0.95 && schedule.repetitions >= 6) { const u = updateSM2(schedule, quality); return { ...u, interval_days: Math.min(60, u.interval_days) } }
  return updateSM2(schedule, quality)
}
