import { describe, it, expect } from 'vitest'
import type { AttemptEvent, BehaviorQualityShadowEntry, ExamItemEvent, LearnerSkillState } from '@/types'
import {
  AGREEMENT_TOLERANCE, CURVE_MIN_SKILLS, EVIDENCE_HALF, SLOW_START_MS,
  activityByDay, behaviourInsights, bloomProfile, evidenceStrength, isEvaluationAttempt,
  judgeAgreement, learningCurve, median, reviewForecast, skillEvidence,
} from './profile'

const NOW = new Date('2026-10-25T12:00:00Z')
let seq = 0

function attempt(over: Partial<AttemptEvent>): AttemptEvent {
  seq += 1
  return {
    id: `a${seq}`, learner_id: 'l', skill_id: 's1', question_id: `s1_q${seq}`, session_id: 'sess',
    correct: true, latency_ms: 10_000, revision_count: 0, error_type: null, difficulty_tier: 'same',
    question_format: 'mcq', attempted_at: new Date(NOW.getTime() - (1000 - seq) * 60_000).toISOString(),
    p_know_before: null, p_know_after: null, motivation_state: null, consecutive_errors: null,
    slow_response_streak: null, behavior_modifier: null, hesitation_ms: null,
    ...over,
  }
}

function state(skill_id: string, p_know: number): LearnerSkillState {
  return {
    learner_id: 'l', skill_id, p_know, p_slip: 0.1, p_guess: 0.2, p_transit: 0.1,
    mastery_state: 'learning', consecutive_correct: 0, consecutive_wrong: 0, total_attempts: 0,
    last_attempted_at: null, first_seen_at: NOW.toISOString(), graph_stale: false,
  }
}

describe('evidence (OLM-2)', () => {
  it('is half-strength at EVIDENCE_HALF attempts and never reaches certainty', () => {
    expect(evidenceStrength(0)).toBe(0)
    expect(evidenceStrength(EVIDENCE_HALF)).toBe(0.5)
    expect(evidenceStrength(1000)).toBeLessThan(1)
  })

  it('does not judge agreement on too few answers', () => {
    expect(judgeAgreement(0.9, [true, false])).toBe('thin')
  })

  it('says a belief is ahead of the evidence when recent answers fall short of it', () => {
    expect(judgeAgreement(0.95, [false, false, true, false, false])).toBe('belief_ahead')
    expect(judgeAgreement(0.1, [true, true, true, true, true])).toBe('belief_behind')
    expect(judgeAgreement(0.8, [true, true, true, true, false])).toBe('agrees')
    // The boundary is exclusive.
    expect(judgeAgreement(0.6 + AGREEMENT_TOLERANCE - 0.01, [true, true, true, false, false])).toBe('agrees')
  })

  it('keeps exam and phase-evaluation attempts out of a skill\'s evidence', () => {
    expect(isEvaluationAttempt('p2_eval_bigo_remember')).toBe(true)
    expect(isEvaluationAttempt('p1_bin_q1')).toBe(false)
    const [ev] = skillEvidence([state('s1', 0.5)], [
      attempt({ correct: true }),
      attempt({ question_id: 'p1_eval_x_apply', correct: false }),
    ])
    expect(ev.attempts).toBe(1)
    expect(ev.correct).toBe(1)
  })

  it('splits evidence by source and keeps the last five, oldest first', () => {
    const list = [
      ...Array.from({ length: 6 }, (_, i) => attempt({ correct: i % 2 === 0, p_know_after: 0.1 * (i + 1) })),
      attempt({ question_format: 'explain', question_id: 's1_feynman_loop', correct: true }),
      attempt({ behavior_modifier: 0.7, correct: true }),
    ]
    const [ev] = skillEvidence([state('s1', 0.6)], list)
    expect(ev.attempts).toBe(8)
    expect(ev.sources).toEqual({ correctness: 7, reasoning: 1, discounted: 1 })
    // Eight answers T F T F T F T T: the last five.
    expect(ev.recent).toEqual([false, true, false, true, true])
    expect(ev.trajectory).toHaveLength(6)
    expect(ev.trajectory[0]).toBeCloseTo(0.1, 10)
  })
})

describe('learning curve (OLM-2)', () => {
  it('averages the k-th attempt over the skills that reached it', () => {
    const list = [
      attempt({ skill_id: 'a', correct: false }), attempt({ skill_id: 'a', correct: true }),
      attempt({ skill_id: 'b', correct: false }), attempt({ skill_id: 'b', correct: false }),
      attempt({ skill_id: 'c', correct: true }),
    ]
    const curve = learningCurve(list)
    expect(curve[0]).toEqual({ opportunity: 1, errorRate: 2 / 3, n: 3 })
    expect(curve[1]).toEqual({ opportunity: 2, errorRate: 1 / 2, n: 2 })
  })

  it(`drops points backed by fewer than ${CURVE_MIN_SKILLS} skills`, () => {
    const list = [attempt({ skill_id: 'a' }), attempt({ skill_id: 'a' }), attempt({ skill_id: 'b' })]
    expect(learningCurve(list).map(p => p.opportunity)).toEqual([1])
  })

  it('orders each skill by time, not by the order rows arrived', () => {
    const late = attempt({ skill_id: 'a', correct: true, attempted_at: '2026-10-02T00:00:00Z' })
    const early = attempt({ skill_id: 'a', correct: false, attempted_at: '2026-10-01T00:00:00Z' })
    const other = [attempt({ skill_id: 'b', correct: false, attempted_at: '2026-10-01T00:00:00Z' }), attempt({ skill_id: 'b', correct: true, attempted_at: '2026-10-02T00:00:00Z' })]
    expect(learningCurve([late, early, ...other])[0].errorRate).toBe(1)
  })
})

describe('activity and forecast (OLM-2)', () => {
  it('counts every attempt in the window, not just the latest page', () => {
    const many = Array.from({ length: 450 }, () => attempt({ attempted_at: NOW.toISOString() }))
    const days = activityByDay(many, NOW, 7)
    expect(days).toHaveLength(7)
    expect(days[6].count).toBe(450)
    expect(days[0].count).toBe(0)
  })

  it('puts overdue reviews in their own bar ahead of the days', () => {
    const f = reviewForecast([
      '2026-10-20T00:00:00Z', '2026-10-25T11:00:00Z',
      '2026-10-25T18:00:00Z', '2026-10-27T09:00:00Z', '2026-12-30T00:00:00Z',
    ], NOW, 14)
    expect(f[0]).toMatchObject({ key: 'overdue', count: 2, emphasis: true })
    expect(f[1]).toMatchObject({ label: 'today', count: 1 })
    expect(f[3].count).toBe(1)
    expect(f.reduce((s, d) => s + d.count, 0)).toBe(4)
  })
})

describe('bloom profile (OLM-2)', () => {
  it('reads an exam debrief as chance on a medium item, null where unsampled', () => {
    const p = bloomProfile({ levels: [
      { level: 'remember', n: 2, correct: 2, theta: 1, se: 0.6 },
      { level: 'create', n: 0, correct: 0, theta: null, se: null },
    ] })
    expect(p[0].chance!).toBeGreaterThan(0.5)
    expect(p[1].chance).toBeNull()
  })
})

describe('behaviour insights (OLM-2)', () => {
  it('takes medians, not means, so one abandoned tab does not set the pace', () => {
    expect(median([1, 2, 3])).toBe(2)
    expect(median([1, 2, 3, 1000])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('reads every signal from what was logged', () => {
    const list = [
      attempt({ hesitation_ms: SLOW_START_MS + 1, revision_count: 2, motivation_state: 'frustrated', consecutive_errors: 3, behavior_modifier: 0.8 }),
      attempt({ hesitation_ms: 2000, motivation_state: 'winning', slow_response_streak: 2, behavior_modifier: 1 }),
      attempt({ question_id: 'p1_eval_x_remember', hesitation_ms: 99_000 }),
    ]
    const shadow = [
      { adaptive_interval_days: 6, live_interval_days: 4 },
      { adaptive_interval_days: 1, live_interval_days: 3 },
      { adaptive_interval_days: 5, live_interval_days: 5 },
    ] as BehaviorQualityShadowEntry[]
    const items = [
      { hint_level: 2, hint_abuse: true }, { hint_level: 1, hint_abuse: false }, { hint_level: 0, hint_abuse: false },
    ] as ExamItemEvent[]
    const b = behaviourInsights(list, shadow, items, NOW)
    expect(b.attempts).toBe(2)
    expect(b.hesitation).toEqual({ medianMs: (SLOW_START_MS + 1 + 2000) / 2, n: 2, slowStarts: 1 })
    expect(b.revisions).toEqual({ revised: 1, n: 2 })
    expect(b.motivation.counts).toMatchObject({ frustrated: 1, winning: 1 })
    expect(b.streaks).toEqual({ maxSlowStreak: 2, maxConsecutiveErrors: 3 })
    expect(b.discount).toMatchObject({ n: 2, discounted: 1 })
    expect(b.interval).toEqual({ n: 3, meanDeltaDays: 0, longer: 1, shorter: 1 })
    expect(b.hints).toEqual({ items: 3, withHint: 2, secondHints: 1, rapid: 1 })
    expect(b.pace).toHaveLength(6)
    expect(b.pace[5].n).toBe(2)
  })

  it('reports nothing rather than zero when nothing was logged', () => {
    const b = behaviourInsights([], [], [], NOW)
    expect(b.hesitation.medianMs).toBeNull()
    expect(b.discount.meanModifier).toBeNull()
    expect(b.interval.meanDeltaDays).toBeNull()
  })
})
