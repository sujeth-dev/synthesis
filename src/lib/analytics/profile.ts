/**
 * The open learner model's numbers (OLM-2): what the system believes about each
 * skill, the evidence behind it, how practice is landing, and how the learner
 * works. Shown to the learner rather than kept inside the engine (Bull & Kay,
 * SMILI), which only helps if every number says what it is computed from.
 *
 * No confidence prompt exists, so nothing here is a confidence. "Evidence
 * strength" is how much the system has actually seen, and "agreement" is whether
 * recent answers bear the belief out.
 *
 * Pure and synchronous; `now` is a parameter.
 */
import type {
  AttemptEvent, BehaviorQualityShadowEntry, BloomLevel, ExamItemEvent, LearnerSkillState,
  MasteryState, MotivationStateValue,
} from '@/types'
import { pCorrect } from '@/lib/exam/ability'
import { ELO_START } from '@/lib/elo'
import type { Debrief } from '@/lib/exam/debrief'

const DAY_MS = 86_400_000

// Phase-evaluation and exam items all carry `_eval_` in their id (checked over
// all 324), and are recorded in attempt_events without touching BKT. They are
// not the evidence a skill's belief was built from, so they are kept out of it.
export function isEvaluationAttempt(questionId: string): boolean {
  return questionId.includes('_eval_')
}

const isReasoningAttempt = (a: Pick<AttemptEvent, 'question_format' | 'question_id'>) =>
  a.question_format === 'explain' || a.question_id.endsWith('_feynman_loop') || a.question_id.endsWith('_explain_back')

// ─── Per-skill evidence ──────────────────────────────────────────────────────

// Evidence strength n/(n+k): half-strength at five attempts, which is where
// BKT's estimate stops swinging hard on each answer.
export const EVIDENCE_HALF = 5
export const RECENT_WINDOW = 5
// Fewer scored attempts than this and agreement is not judged at all.
export const MIN_FOR_AGREEMENT = 3
// How far recent accuracy may sit from p_know before they are said to disagree.
export const AGREEMENT_TOLERANCE = 0.3

export type Agreement = 'agrees' | 'belief_ahead' | 'belief_behind' | 'thin'

export interface SkillEvidence {
  skill_id: string
  p_know: number
  mastery_state: MasteryState
  attempts: number
  correct: number
  /** Oldest to newest, at most RECENT_WINDOW. */
  recent: boolean[]
  evidence_strength: number
  agreement: Agreement
  /** p_know after each attempt that recorded one, oldest first. */
  trajectory: number[]
  sources: { correctness: number; reasoning: number; discounted: number }
  last_attempted_at: string | null
}

export function evidenceStrength(attempts: number): number {
  return attempts / (attempts + EVIDENCE_HALF)
}

export function judgeAgreement(pKnow: number, recent: boolean[]): Agreement {
  if (recent.length < MIN_FOR_AGREEMENT) return 'thin'
  const accuracy = recent.filter(Boolean).length / recent.length
  if (pKnow - accuracy > AGREEMENT_TOLERANCE) return 'belief_ahead'
  if (accuracy - pKnow > AGREEMENT_TOLERANCE) return 'belief_behind'
  return 'agrees'
}

export function skillEvidence(states: LearnerSkillState[], attempts: AttemptEvent[]): SkillEvidence[] {
  const bySkill = new Map<string, AttemptEvent[]>()
  for (const a of attempts) {
    if (isEvaluationAttempt(a.question_id)) continue
    const list = bySkill.get(a.skill_id) ?? []
    list.push(a)
    bySkill.set(a.skill_id, list)
  }
  return states.map(state => {
    const list = (bySkill.get(state.skill_id) ?? []).sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))
    const recent = list.slice(-RECENT_WINDOW).map(a => a.correct)
    return {
      skill_id: state.skill_id,
      p_know: state.p_know,
      mastery_state: state.mastery_state,
      attempts: list.length,
      correct: list.filter(a => a.correct).length,
      recent,
      evidence_strength: evidenceStrength(list.length),
      agreement: judgeAgreement(state.p_know, recent),
      trajectory: list.flatMap(a => a.p_know_after === null ? [] : [a.p_know_after]),
      sources: {
        correctness: list.filter(a => !isReasoningAttempt(a)).length,
        reasoning: list.filter(isReasoningAttempt).length,
        discounted: list.filter(a => a.behavior_modifier !== null && a.behavior_modifier < 1).length,
      },
      last_attempted_at: list.length > 0 ? list[list.length - 1].attempted_at : state.last_attempted_at,
    }
  })
}

// ─── Learning curve ──────────────────────────────────────────────────────────

export const CURVE_MAX_OPPORTUNITY = 10
// A point averaged over a single skill is one learner's one skill, not a curve.
export const CURVE_MIN_SKILLS = 2

export interface CurvePoint { opportunity: number; errorRate: number; n: number }

/** Error rate on the k-th attempt at a skill, averaged over the skills that reached k. */
export function learningCurve(attempts: AttemptEvent[]): CurvePoint[] {
  const bySkill = new Map<string, AttemptEvent[]>()
  for (const a of attempts) {
    if (isEvaluationAttempt(a.question_id) || isReasoningAttempt(a)) continue
    const list = bySkill.get(a.skill_id) ?? []
    list.push(a)
    bySkill.set(a.skill_id, list)
  }
  const errors = new Array(CURVE_MAX_OPPORTUNITY).fill(0)
  const counts = new Array(CURVE_MAX_OPPORTUNITY).fill(0)
  for (const list of bySkill.values()) {
    list.sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))
    list.slice(0, CURVE_MAX_OPPORTUNITY).forEach((a, k) => {
      counts[k] += 1
      if (!a.correct) errors[k] += 1
    })
  }
  return counts.flatMap((n, k) => n >= CURVE_MIN_SKILLS ? [{ opportunity: k + 1, errorRate: errors[k] / n, n }] : [])
}

// ─── Activity ────────────────────────────────────────────────────────────────

export interface DayCount { key: string; label: string; count: number }

export function activityByDay(attempts: Pick<AttemptEvent, 'attempted_at'>[], now: Date, days: number): DayCount[] {
  const counts = new Map<string, number>()
  for (const a of attempts) {
    const key = a.attempted_at.slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getTime() - (days - 1 - i) * DAY_MS)
    const key = d.toISOString().slice(0, 10)
    return { key, label: d.toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' }), count: counts.get(key) ?? 0 }
  })
}

// ─── Review forecast ─────────────────────────────────────────────────────────

export interface ForecastDay { key: string; label: string; count: number; emphasis?: boolean }

/** Reviews already overdue, then one bar per day for the next `days`. */
export function reviewForecast(dueDates: string[], now: Date, days: number): ForecastDay[] {
  const today = now.toISOString().slice(0, 10)
  let overdue = 0
  const counts = new Map<string, number>()
  for (const due of dueDates) {
    const t = Date.parse(due)
    if (t <= now.getTime()) { overdue += 1; continue }
    const key = new Date(t).toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const ahead = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getTime() + i * DAY_MS)
    const key = d.toISOString().slice(0, 10)
    return {
      key,
      label: key === today ? 'today' : d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
      count: counts.get(key) ?? 0,
    }
  })
  return [{ key: 'overdue', label: 'due', count: overdue, emphasis: true }, ...ahead]
}

// ─── Bloom profile ───────────────────────────────────────────────────────────

export interface BloomLevelSummary { level: BloomLevel; chance: number | null; correct: number; n: number }

export function bloomProfile(debrief: Pick<Debrief, 'levels'>): BloomLevelSummary[] {
  return debrief.levels.map(l => ({
    level: l.level,
    chance: l.theta === null ? null : pCorrect(l.theta, ELO_START),
    correct: l.correct,
    n: l.n,
  }))
}

// ─── Behaviour ───────────────────────────────────────────────────────────────

// A first touch later than this is a learner staring at the question.
export const SLOW_START_MS = 15_000
export const PACE_WEEKS = 6

export interface BehaviourInsights {
  attempts: number
  pace: { key: string; label: string; medianLatencyMs: number | null; n: number }[]
  hesitation: { medianMs: number | null; n: number; slowStarts: number }
  revisions: { revised: number; n: number }
  motivation: { counts: Record<MotivationStateValue, number>; recent: MotivationStateValue[] }
  streaks: { maxSlowStreak: number; maxConsecutiveErrors: number }
  discount: { n: number; discounted: number; meanModifier: number | null }
  interval: { n: number; meanDeltaDays: number | null; longer: number; shorter: number }
  hints: { items: number; withHint: number; secondHints: number; rapid: number }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Monday 00:00 UTC of the week containing `t`. */
function weekStart(t: number): number {
  const d = new Date(t)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

export function behaviourInsights(
  attempts: AttemptEvent[],
  shadow: BehaviorQualityShadowEntry[],
  examItems: ExamItemEvent[],
  now: Date,
): BehaviourInsights {
  const practice = attempts.filter(a => !isEvaluationAttempt(a.question_id))

  const thisWeek = weekStart(now.getTime())
  const pace = Array.from({ length: PACE_WEEKS }, (_, i) => {
    const start = thisWeek - (PACE_WEEKS - 1 - i) * 7 * DAY_MS
    const inWeek = practice.filter(a => {
      const t = Date.parse(a.attempted_at)
      return t >= start && t < start + 7 * DAY_MS
    })
    return {
      key: new Date(start).toISOString().slice(0, 10),
      label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      medianLatencyMs: median(inWeek.map(a => a.latency_ms)),
      n: inWeek.length,
    }
  })

  const hesitations = practice.flatMap(a => a.hesitation_ms === null ? [] : [a.hesitation_ms])
  const counts: Record<MotivationStateValue, number> = { bored: 0, neutral: 0, frustrated: 0, winning: 0 }
  const states = practice.flatMap(a => a.motivation_state === null ? [] : [a.motivation_state])
  for (const s of states) counts[s] += 1
  const modifiers = practice.flatMap(a => a.behavior_modifier === null ? [] : [a.behavior_modifier])
  const deltas = shadow.map(s => s.adaptive_interval_days - s.live_interval_days)

  return {
    attempts: practice.length,
    pace,
    hesitation: {
      medianMs: median(hesitations),
      n: hesitations.length,
      slowStarts: hesitations.filter(h => h > SLOW_START_MS).length,
    },
    revisions: { revised: practice.filter(a => a.revision_count > 0).length, n: practice.length },
    motivation: { counts, recent: states.slice(-30) },
    streaks: {
      maxSlowStreak: Math.max(0, ...practice.map(a => a.slow_response_streak ?? 0)),
      maxConsecutiveErrors: Math.max(0, ...practice.map(a => a.consecutive_errors ?? 0)),
    },
    discount: {
      n: modifiers.length,
      discounted: modifiers.filter(m => m < 1).length,
      meanModifier: modifiers.length > 0 ? modifiers.reduce((s, m) => s + m, 0) / modifiers.length : null,
    },
    interval: {
      n: deltas.length,
      meanDeltaDays: deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null,
      longer: deltas.filter(d => d > 0).length,
      shorter: deltas.filter(d => d < 0).length,
    },
    hints: {
      items: examItems.length,
      withHint: examItems.filter(i => i.hint_level > 0).length,
      secondHints: examItems.filter(i => i.hint_level >= 2).length,
      rapid: examItems.filter(i => i.hint_abuse).length,
    },
  }
}
