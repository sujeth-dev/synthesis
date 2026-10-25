/**
 * What an exam run says, by kind of thinking rather than by score (EXAM-4).
 *
 * The headline is ability ± SE per Bloom level: "you can recall this, you fall
 * apart on analyse" is information, "17/24" is not. With two to four items per
 * level those SEs are wide, and the debrief shows them wide rather than
 * pretending to a precision the run did not buy.
 *
 * Pure and synchronous.
 */
import type { BloomLevel, PhaseEvaluationQuestion } from '@/types'
import { estimateAbility } from './ability'
import { BLOOM_ORDER, paceFor, responseCredit, type Pace, type StopReason } from './policy'

export interface DebriefItemInput {
  question: PhaseEvaluationQuestion
  rating: number
  selected_option_id: string | null
  latency_ms: number | null
  hint_level: number
  hint_abuse: boolean
}

export interface LevelResult {
  level: BloomLevel
  n: number
  correct: number
  theta: number | null
  se: number | null
}

export interface ItemResult {
  question_id: string
  skill_id: string
  bloom_level: BloomLevel
  correct: boolean
  answered: boolean
  latency_ms: number | null
  time_target_sec: number
  pace: Pace | null
  hint_level: number
}

export interface MisconceptionHit {
  question_id: string
  skill_id: string
  bloom_level: BloomLevel
  stem: string
  chosen: string
  misconception: string
  correct_answer: string
  explanation: string
}

export interface Revisit {
  skill_id: string
  missed: number
  levels: BloomLevel[]
}

export interface Debrief {
  theta: number
  se: number
  n: number
  correct: number
  stop_reason: StopReason | null
  levels: LevelResult[]
  items: ItemResult[]
  hints: { items_with_hint: number; second_hints: number; rapid_requests: number }
  misconceptions: MisconceptionHit[]
  revisit: Revisit[]
}

export function buildDebrief(items: DebriefItemInput[], stop: StopReason | null): Debrief {
  const scored = items.map(item => {
    const correct = item.selected_option_id === item.question.correct_option_id
    return { item, correct, credit: responseCredit(correct, item.hint_level) }
  })
  const overall = estimateAbility(scored.map(s => ({ rating: s.item.rating, credit: s.credit })))

  const levels: LevelResult[] = BLOOM_ORDER.map(level => {
    const atLevel = scored.filter(s => s.item.question.bloom_level === level)
    if (atLevel.length === 0) return { level, n: 0, correct: 0, theta: null, se: null }
    const est = estimateAbility(atLevel.map(s => ({ rating: s.item.rating, credit: s.credit })))
    return { level, n: atLevel.length, correct: atLevel.filter(s => s.correct).length, theta: est.theta, se: est.se }
  })

  const itemResults: ItemResult[] = scored.map(({ item, correct }) => ({
    question_id: item.question.id,
    skill_id: item.question.skill_id,
    bloom_level: item.question.bloom_level,
    correct,
    answered: item.selected_option_id !== null,
    latency_ms: item.latency_ms,
    time_target_sec: item.question.time_target_sec,
    pace: item.latency_ms === null ? null : paceFor(item.latency_ms, item.question.time_target_sec),
    hint_level: item.hint_level,
  }))

  const misconceptions: MisconceptionHit[] = []
  for (const { item, correct } of scored) {
    if (correct || item.selected_option_id === null) continue
    const q = item.question
    const chosen = q.options.find(o => o.id === item.selected_option_id)
    const right = q.options.find(o => o.id === q.correct_option_id)
    if (!chosen || !right) continue
    misconceptions.push({
      question_id: q.id, skill_id: q.skill_id, bloom_level: q.bloom_level, stem: q.stem,
      chosen: chosen.text, misconception: chosen.misconception ?? '',
      correct_answer: right.text, explanation: q.explanation_after,
    })
  }

  const bySkill = new Map<string, Revisit>()
  for (const { item, correct } of scored) {
    if (correct) continue
    const q = item.question
    const entry = bySkill.get(q.skill_id) ?? { skill_id: q.skill_id, missed: 0, levels: [] }
    entry.missed += 1
    if (!entry.levels.includes(q.bloom_level)) entry.levels.push(q.bloom_level)
    bySkill.set(q.skill_id, entry)
  }
  const revisit = [...bySkill.values()].sort((a, b) => b.missed - a.missed || a.skill_id.localeCompare(b.skill_id))

  return {
    theta: overall.theta,
    se: overall.se,
    n: items.length,
    correct: scored.filter(s => s.correct).length,
    stop_reason: stop,
    levels,
    items: itemResults,
    hints: {
      items_with_hint: items.filter(i => i.hint_level > 0).length,
      second_hints: items.filter(i => i.hint_level >= 2).length,
      rapid_requests: items.filter(i => i.hint_abuse).length,
    },
    misconceptions,
    revisit,
  }
}
