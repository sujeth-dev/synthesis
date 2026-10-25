import { beforeEach, describe, expect, it, vi } from 'vitest'

// A minimal in-memory stand-in for the Supabase tables attempt/route.ts touches,
// following this repo's existing convention (see db/behavior-analytics.test.ts)
// of mocking '@/lib/db' at the getDb()/generateId() boundary so the real
// queries.ts — and, here, the real route handler — run unmodified against it.
type Row = Record<string, unknown>
const tables = vi.hoisted(() => ({
  learner_skill_states: [] as Row[],
  review_schedules: [] as Row[],
  attempt_events: [] as Row[],
  motivation_states: [] as Row[],
  fsrs_shadow_log: [] as Row[],
  explanation_grades: [] as Row[],
  behavior_quality_shadow: [] as Row[],
  bkt_param_shadow: [] as Row[],
  question_ratings: [] as Row[],
  learner_ability: [] as Row[],
}))
// Tables whose insert fails, so a missing migration can be simulated.
const unmigrated = vi.hoisted(() => new Set<string>())
let idCounter = vi.hoisted(() => ({ n: 0 }))

function matchesFilters(row: Row, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([k, v]) => row[k] === v)
}

vi.mock('@/lib/db', () => {
  function table(name: keyof typeof tables) {
    return {
      select: () => {
        const filters: Record<string, unknown> = {}
        let orderField: string | null = null
        let orderAsc = true
        let limitN: number | null = null
        function run() {
          let rows = tables[name].filter(r => matchesFilters(r, filters))
          if (orderField) {
            const field = orderField
            rows = [...rows].sort((a, b) => {
              const cmp = String(a[field]).localeCompare(String(b[field]))
              return orderAsc ? cmp : -cmp
            })
          }
          if (limitN != null) rows = rows.slice(0, limitN)
          return rows
        }
        const query = {
          eq(field: string, value: unknown) { filters[field] = value; return query },
          order(field: string, opts: { ascending: boolean }) { orderField = field; orderAsc = opts.ascending; return query },
          limit(n: number) { limitN = n; return query },
          maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
          then<T>(onfulfilled?: (v: { data: Row[]; error: null }) => T) {
            return Promise.resolve({ data: run(), error: null }).then(onfulfilled)
          },
        }
        return query
      },
      insert: async (row: Row) => {
        if (unmigrated.has(name)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${name}'` } }
        tables[name].push(row)
        return { data: null, error: null }
      },
      upsert: async (row: Row, opts: { onConflict: string }) => {
        if (unmigrated.has(name)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${name}'` } }
        const keys = opts.onConflict.split(',')
        const idx = tables[name].findIndex(r => keys.every(k => r[k] === row[k]))
        if (idx >= 0) tables[name][idx] = { ...tables[name][idx], ...row }
        else tables[name].push(row)
        return { data: null, error: null }
      },
    }
  }
  return {
    generateId: () => `id-${++idCounter.n}`,
    getDb: () => ({ from: (name: string) => table(name as keyof typeof tables) }),
  }
})

vi.mock('@/lib/db/session', () => ({
  getCurrentUser: async () => ({ id: 'learner-fsrs-test', email: 'fsrs-test@example.com' }),
}))

// The real grader does live catalogue discovery over fetch and needs an API key,
// so the LLM arm is stubbed per test; 'unavailable' exercises the route's
// fail-open path onto the rule-based classifier, which is what answers offline.
const graderMode = vi.hoisted(() => ({ value: 'unavailable' as 'unavailable' | 'meaning-included' | 'gap' }))
vi.mock('@/lib/nlp/grader', () => ({
  gradeExplanation: async () => {
    if (graderMode.value === 'unavailable') throw new Error('no model available')
    return {
      category: graderMode.value, confidence: 0.91, rationale: 'stub',
      servedBy: 'stub/model', promptVersion: 'v1', fromCache: false, attempts: 1, latencyMs: 12,
    }
  },
}))

import { POST } from './route'
import { ELO_START, coldStartQuestionRating } from '@/lib/elo'

function fakeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const learnerId = 'learner-fsrs-test'
const skillId = 'p1_binary_numbers'

beforeEach(() => {
  for (const key of Object.keys(tables) as (keyof typeof tables)[]) tables[key].length = 0
  idCounter.n = 0
  unmigrated.clear()

  // Kept low so bktUpdate() never crosses MASTERY_THRESHOLD across the up-to-two
  // correct answers these tests submit, keeping route.ts's newly-mastered
  // prerequisite-unlock branch out of scope here.
  tables.learner_skill_states.push({
    learner_id: learnerId, skill_id: skillId, p_know: 0.01,
    p_slip: 0.1, p_guess: 0.2, p_transit: 0.15, mastery_state: 'ready',
    consecutive_correct: 0, consecutive_wrong: 0, total_attempts: 3,
    last_attempted_at: '2026-08-01T00:00:00.000Z', first_seen_at: '2026-07-01T00:00:00.000Z',
    graph_stale: false,
  })
  tables.motivation_states.push({
    learner_id: learnerId, state: 'neutral', consecutive_errors: 0,
    slow_response_streak: 0, intervention_cooldown_until: null, updated_at: '2026-08-01T00:00:00.000Z',
  })
  tables.review_schedules.push({
    learner_id: learnerId, skill_id: skillId, interval_days: 6,
    ease_factor: 2.5, repetitions: 2, due_at: '2026-08-01T00:00:00.000Z', last_reviewed_at: '2026-07-26T00:00:00.000Z',
  })
})

describe('FSRS shadow mode alongside SM-2 in POST /api/attempt (FSRS-3)', () => {
  it('writes the same review_schedules row SM-2 alone would have, plus a new fsrs_shadow_log row', async () => {
    const res = await POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b', correct: true,
      latency_ms: 2000, difficulty_tier: 'review', question_format: 'mcq',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.correct).toBe(true)

    // SM-2 behavior is untouched: reconcileBktSm2(p_know_new, wasMastered=false, ...)
    // takes the plain updateSM2 branch, so interval_days follows the ease-factor formula.
    expect(tables.review_schedules).toHaveLength(1)
    expect(tables.review_schedules[0]).toMatchObject({
      learner_id: learnerId, skill_id: skillId, repetitions: 3,
      interval_days: Math.round(6 * 2.5),
    })

    expect(tables.fsrs_shadow_log).toHaveLength(1)
    const shadow = tables.fsrs_shadow_log[0]
    expect(shadow).toMatchObject({
      learner_id: learnerId, skill_id: skillId, attempt_id: body.attempt_id,
      sm2_interval_days: tables.review_schedules[0].interval_days,
    })
    expect(shadow.fsrs_interval_days).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(shadow.fsrs_stability)).toBe(true)
    expect(Number.isFinite(shadow.fsrs_difficulty)).toBe(true)
  })

  it('resumes FSRS state across a second review the same way SM-2 resumes its own', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))

    await POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b', correct: true,
      latency_ms: 2000, difficulty_tier: 'review', question_format: 'mcq',
    }))
    const firstShadow = tables.fsrs_shadow_log[0]

    // Advance well past the first review's due date so this is a genuine
    // second review cycle, not a same-day re-answer (which FSRS itself barely
    // moves stability for — retrievability is still ~1 same-day).
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'))

    await POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b', correct: true,
      latency_ms: 2000, difficulty_tier: 'review', question_format: 'mcq',
    }))

    expect(tables.fsrs_shadow_log).toHaveLength(2)
    const secondShadow = tables.fsrs_shadow_log[1]
    // A second review after real elapsed time should grow stability from the
    // resumed prior state, not reset to a brand-new card's init_stability —
    // proving computeFsrsSchedule() actually resumed instead of starting over.
    expect(secondShadow.fsrs_stability).toBeGreaterThan(firstShadow.fsrs_stability as number)

    vi.useRealTimers()
  })

  it('never blocks the live attempt/SM-2 write when the shadow log insert fails', async () => {
    const originalPush = tables.fsrs_shadow_log.push.bind(tables.fsrs_shadow_log)
    tables.fsrs_shadow_log.push = () => { throw new Error('simulated fsrs_shadow_log insert failure') }

    const res = await POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b', correct: true,
      latency_ms: 2000, difficulty_tier: 'review', question_format: 'mcq',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.correct).toBe(true)
    expect(tables.review_schedules[0]).toMatchObject({ repetitions: 3 })
    expect(tables.attempt_events).toHaveLength(1)

    tables.fsrs_shadow_log.push = originalPush
  })
})

// Level 6: `order` questions had no server-side verification branch, so they fell
// through to body.correct — which the client never sends for them — and scored
// wrong however the learner answered.
describe('order questions in POST /api/attempt (Level 6)', () => {
  const orderSkill = 'p1b_oop_classes'
  const orderQuestion = 'p1b_oop_order1'

  beforeEach(() => {
    tables.learner_skill_states.push({
      ...tables.learner_skill_states[0], skill_id: orderSkill,
    })
    tables.review_schedules.push({
      ...tables.review_schedules[0], skill_id: orderSkill,
    })
  })

  const submitOrder = (answer: string) => POST(fakeRequest({
    question_id: orderQuestion, skill_id: orderSkill, client_answer: answer,
    latency_ms: 2000, difficulty_tier: 'same', question_format: 'order',
  }))

  it('scores the authored sequence correct without the client claiming a verdict', async () => {
    const res = await submitOrder('d,b,c,a')
    expect(res.status).toBe(200)
    expect((await res.json()).correct).toBe(true)
  })

  it('scores a permuted sequence wrong', async () => {
    expect((await (await submitOrder('a,b,c,d')).json()).correct).toBe(false)
    expect((await (await submitOrder('d,b,a,c')).json()).correct).toBe(false)
  })

  it('does not let the client assert correctness for an order question', async () => {
    const res = await POST(fakeRequest({
      question_id: orderQuestion, skill_id: orderSkill, client_answer: 'a,b,c,d', correct: true,
      latency_ms: 2000, difficulty_tier: 'same', question_format: 'order',
    }))
    expect((await res.json()).correct).toBe(false)
  })
})

describe('Elo calibration in POST /api/attempt (SCORE-1)', () => {
  // p1_bin_q1 is a 'review'-tier MCQ on a difficulty_base 2 node, so its cold
  // start sits below the learner's 1200 and the first correct answer is expected.
  const submit = (correct: boolean) => POST(fakeRequest({
    question_id: 'p1_bin_q1', skill_id: skillId, client_answer: correct ? 'b' : 'a',
    latency_ms: 2000, difficulty_tier: 'review', question_format: 'mcq',
  }))

  it('creates a rating for the question and an ability for the phase on first answer', async () => {
    await submit(true)
    expect(tables.question_ratings).toHaveLength(1)
    expect(tables.learner_ability).toHaveLength(1)
    expect(tables.question_ratings[0]).toMatchObject({
      question_id: 'p1_bin_q1', skill_id: skillId, phase: 'phase_1_computer_basics', plays: 1,
    })
    expect(tables.learner_ability[0]).toMatchObject({
      learner_id: learnerId, phase: 'phase_1_computer_basics', plays: 1,
    })
  })

  it('raises the learner and lowers the question when the answer is correct', async () => {
    await submit(true)
    expect(Number(tables.learner_ability[0].rating)).toBeGreaterThan(ELO_START)
    expect(Number(tables.question_ratings[0].rating))
      .toBeLessThan(coldStartQuestionRating(2, 'review'))
  })

  it('lowers the learner and raises the question when the answer is wrong', async () => {
    await submit(false)
    expect(Number(tables.learner_ability[0].rating)).toBeLessThan(ELO_START)
    expect(Number(tables.question_ratings[0].rating))
      .toBeGreaterThan(coldStartQuestionRating(2, 'review'))
  })

  it('builds on the stored rating on a second answer rather than cold-starting again', async () => {
    await submit(true)
    const afterFirst = Number(tables.question_ratings[0].rating)
    await submit(true)
    expect(tables.question_ratings).toHaveLength(1)
    expect(tables.question_ratings[0].plays).toBe(2)
    expect(Number(tables.question_ratings[0].rating)).toBeLessThan(afterFirst)
  })

  it('scores the attempt normally when migration 009 is missing', async () => {
    unmigrated.add('question_ratings')
    unmigrated.add('learner_ability')
    const res = await submit(true)
    expect(res.status).toBe(200)
    expect((await res.json()).correct).toBe(true)
    expect(tables.attempt_events).toHaveLength(1)
    expect(tables.question_ratings).toHaveLength(0)
  })

  it('does not rate a synthetic reflection id, which is not an authored question', async () => {
    await POST(fakeRequest({
      question_id: `${skillId}_explain_back`, skill_id: skillId,
      client_answer: 'because each bit doubles the places you can count to',
      latency_ms: 40_000, difficulty_tier: 'same', question_format: 'explain',
    }))
    expect(tables.question_ratings).toHaveLength(0)
  })
})

// Level 7: until the client clock was fixed, latency arrived as ~0 and the route
// clamped it to MIN_LATENCY, so every correct answer was the fastest tier. Every
// case above sends latency_ms: 2000, which is why the suite never saw it.
describe('measured response time in POST /api/attempt (Level 7)', () => {
  const slowCorrect = (extra: Record<string, unknown> = {}) => POST(fakeRequest({
    question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b', correct: true,
    latency_ms: 20_000, hesitation_ms: 9_000, revision_count: 3,
    difficulty_tier: 'review', question_format: 'mcq', ...extra,
  }))

  it('persists the real response time, hesitation and revision count', async () => {
    expect((await slowCorrect()).status).toBe(200)
    expect(tables.attempt_events).toHaveLength(1)
    expect(tables.attempt_events[0]).toMatchObject({
      latency_ms: 20_000, hesitation_ms: 9_000, revision_count: 3,
      // Both only reachable now that latency is real: the slow arm of
      // deriveBehaviorEvidenceModifier (1 - 0.15) and a non-zero slow streak.
      behavior_modifier: 0.85, slow_response_streak: 1,
    })
  })

  it('feeds the real response time into SM-2 quality instead of always scoring 5', async () => {
    await slowCorrect()
    // bktToQuality(correct, 20000) is 3 (>= 8s), so updateSM2 lowers the ease
    // factor by 0.14. A fast correct answer scores 5 and raises it to 2.6.
    expect(tables.review_schedules[0].ease_factor as number).toBeCloseTo(2.36, 8)

    // updateSM2 applies the ease factor before updating it, so this review's
    // interval is round(6 * 2.5) either way; the tier compounds into the next one.
    expect(tables.review_schedules[0].interval_days).toBe(15)
    await slowCorrect()
    expect(tables.review_schedules[0].interval_days).toBe(Math.round(15 * 2.36))
  })

  it('rates a slow correct answer below the top FSRS tier', async () => {
    await slowCorrect()
    const fsrsInterval = tables.fsrs_shadow_log[0].fsrs_interval_days as number

    for (const key of Object.keys(tables) as (keyof typeof tables)[]) tables[key].length = 0
    idCounter.n = 0
    tables.learner_skill_states.push({
      learner_id: learnerId, skill_id: skillId, p_know: 0.01, p_slip: 0.1, p_guess: 0.2,
      p_transit: 0.15, mastery_state: 'ready', consecutive_correct: 0, consecutive_wrong: 0,
      total_attempts: 3, last_attempted_at: '2026-08-01T00:00:00.000Z',
      first_seen_at: '2026-07-01T00:00:00.000Z', graph_stale: false,
    })
    tables.motivation_states.push({
      learner_id: learnerId, state: 'neutral', consecutive_errors: 0, slow_response_streak: 0,
      intervention_cooldown_until: null, updated_at: '2026-08-01T00:00:00.000Z',
    })
    tables.review_schedules.push({
      learner_id: learnerId, skill_id: skillId, interval_days: 6, ease_factor: 2.5,
      repetitions: 2, due_at: '2026-08-01T00:00:00.000Z', last_reviewed_at: '2026-07-26T00:00:00.000Z',
    })
    await slowCorrect({ latency_ms: 1_000, hesitation_ms: 200, revision_count: 0 })

    expect(fsrsInterval).toBeLessThan(tables.fsrs_shadow_log[0].fsrs_interval_days as number)
  })

  it('clamps a hesitation longer than the attempt, and defaults a missing one to zero', async () => {
    await slowCorrect({ hesitation_ms: 999_999 })
    expect(tables.attempt_events[0].hesitation_ms).toBe(20_000)

    tables.attempt_events.length = 0
    await POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b', correct: true,
      latency_ms: 20_000, difficulty_tier: 'review', question_format: 'mcq',
    }))
    expect(tables.attempt_events[0].hesitation_ms).toBe(0)
  })
})

describe('explain questions are graded server-side in POST /api/attempt (Level 9)', () => {
  const explainQuestionId = 'p1_binary_numbers_explain1'

  function explainAttempt(body: Record<string, unknown> = {}) {
    return POST(fakeRequest({
      question_id: explainQuestionId, skill_id: skillId, question_format: 'explain',
      client_answer: 'Binary uses only two digits because a wire is either on or off.',
      latency_ms: 20_000, difficulty_tier: 'same', ...body,
    }))
  }

  it('scores an authored explain question from the grade, with no verdict from the client', async () => {
    graderMode.value = 'meaning-included'
    const res = await explainAttempt()
    expect(res.status).toBe(200)
    expect((await res.json()).correct).toBe(true)
    expect(tables.attempt_events[0]).toMatchObject({ question_format: 'explain', correct: true })
  })

  it('overrides a client-sent verdict that disagrees with the grade', async () => {
    // The old Feynman client sent correct: true from the rule-based classifier
    // while the server graded the text with the LLM. The grade now decides alone.
    graderMode.value = 'gap'
    const res = await explainAttempt({ correct: true })
    expect((await res.json()).correct).toBe(false)
    expect(tables.attempt_events[0].correct).toBe(false)
  })

  it('falls back to the rule-based classifier when the LLM grader fails, and still scores the attempt', async () => {
    graderMode.value = 'unavailable'
    const res = await explainAttempt()
    expect(res.status).toBe(200)
    // classifyExplanation sees 'because' — a meaning marker — so the fallback agrees.
    expect((await res.json()).correct).toBe(true)

    tables.attempt_events.length = 0
    const hedged = await explainAttempt({ client_answer: 'I guess it is something about bits and wires inside.' })
    expect((await hedged.json()).correct).toBe(false)
  })

  it('scores a guided-reflection explain attempt the same way, under its synthetic question id', async () => {
    graderMode.value = 'meaning-included'
    const res = await explainAttempt({ question_id: `${skillId}_feynman_loop` })
    expect(res.status).toBe(200)
    expect((await res.json()).correct).toBe(true)
  })
})

describe('the explanation and its grade are persisted (Level 10)', () => {
  const explanationText = 'Binary uses only two digits because a wire is either on or off.'

  function explainAttempt(body: Record<string, unknown> = {}) {
    return POST(fakeRequest({
      question_id: 'p1_binary_numbers_explain1', skill_id: skillId, question_format: 'explain',
      client_answer: explanationText, latency_ms: 20_000, difficulty_tier: 'same', ...body,
    }))
  }

  it('stores the learner\'s words, the grade, its provenance, and what BKT consumed', async () => {
    graderMode.value = 'meaning-included'
    const body = await (await explainAttempt({ prior_answer: 'Something with ones and zeroes.' })).json()

    expect(tables.explanation_grades).toHaveLength(1)
    expect(tables.explanation_grades[0]).toMatchObject({
      learner_id: learnerId, skill_id: skillId, attempt_id: body.attempt_id,
      explanation_text: explanationText,
      prior_explanation_text: 'Something with ones and zeroes.',
      category: 'meaning-included', confidence: 0.91,
      // reasoningQualityFromCategory('meaning-included'), i.e. the evidence
      // bktUpdate was actually given for this attempt.
      reasoning_quality: 1,
      served_by: 'stub/model', prompt_version: 'v1', from_cache: false,
    })
  })

  it('marks a grade no model produced with the zero-confidence sentinel', async () => {
    graderMode.value = 'unavailable'
    await explainAttempt({ client_answer: 'I guess it is something about bits and wires inside.' })

    expect(tables.explanation_grades[0]).toMatchObject({
      served_by: 'rule-based-fallback', confidence: 0, prompt_version: 'none',
      category: 'gap', reasoning_quality: 0.3, prior_explanation_text: null,
    })
  })

  it('scores and persists the attempt even when migration 006 is missing', async () => {
    graderMode.value = 'meaning-included'
    unmigrated.add('explanation_grades')

    const res = await explainAttempt()
    expect(res.status).toBe(200)
    expect((await res.json()).correct).toBe(true)
    expect(tables.attempt_events).toHaveLength(1)
    expect(tables.explanation_grades).toHaveLength(0)
  })

  it('writes no grade row for a question with an answer key', async () => {
    await POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b',
      latency_ms: 2000, difficulty_tier: 'review', question_format: 'mcq',
    }))
    expect(tables.explanation_grades).toHaveLength(0)
  })
})

describe('behaviour-aware scheduling quality, in shadow (Level 11)', () => {
  function hesitantCorrect() {
    return POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b',
      latency_ms: 2_000, hesitation_ms: 1_800, revision_count: 3,
      difficulty_tier: 'review', question_format: 'mcq',
    }))
  }

  it('logs both qualities and their intervals, and schedules on the live one', async () => {
    const body = await (await hesitantCorrect()).json()

    expect(tables.behavior_quality_shadow).toHaveLength(1)
    expect(tables.behavior_quality_shadow[0]).toMatchObject({
      learner_id: learnerId, skill_id: skillId, attempt_id: body.attempt_id,
      hesitation_ms: 1_800, revision_count: 3, guided_reflection: false,
      // A fast answer the learner changed three times: 5 live, demoted to 4.
      live_quality: 5, adaptive_quality: 4, applied: false,
    })

    // The live row is exactly what SM-2 alone would have written: ease 2.5 + 0.1
    // for quality 5, not the 2.5 the adaptive quality 4 would have left.
    expect(tables.review_schedules[0].ease_factor as number).toBeCloseTo(2.6, 8)
    expect(tables.review_schedules[0].interval_days).toBe(Math.round(6 * 2.5))
  })

  it('records the interval the adaptive quality would have produced', async () => {
    await hesitantCorrect()
    const shadow = tables.behavior_quality_shadow[0]
    // Same starting schedule, so the first interval matches; the demoted ease
    // factor is what diverges on the next review.
    expect(shadow.live_interval_days).toBe(15)
    expect(shadow.adaptive_interval_days).toBe(15)
    expect(shadow.live_fsrs_rating).not.toBe(shadow.adaptive_fsrs_rating)
  })

  it('does not fail the attempt when migration 007 is missing', async () => {
    unmigrated.add('behavior_quality_shadow')
    const res = await hesitantCorrect()

    expect(res.status).toBe(200)
    expect(tables.attempt_events).toHaveLength(1)
    expect(tables.review_schedules).toHaveLength(1)
    expect(tables.behavior_quality_shadow).toHaveLength(0)
  })

  it('gives a guided reflection a neutral tier rather than one derived from its duration', async () => {
    graderMode.value = 'meaning-included'
    await POST(fakeRequest({
      question_id: `${skillId}_feynman_loop`, skill_id: skillId, question_format: 'explain',
      client_answer: 'Binary uses two digits because a wire is either on or off.',
      latency_ms: 240_000, hesitation_ms: 0, revision_count: 0, difficulty_tier: 'same',
    }))

    expect(tables.behavior_quality_shadow[0]).toMatchObject({
      guided_reflection: true, live_quality: 3, adaptive_quality: 4,
    })
  })
})

// ── Level 16: per-skill BKT parameters, in shadow ──────────────────────────
describe('POST /api/attempt — per-skill BKT parameters (Level 16)', () => {
  function correctAnswer() {
    return POST(fakeRequest({
      question_id: 'p1_bin_q1', skill_id: skillId, client_answer: 'b',
      latency_ms: 2_000, hesitation_ms: 500, revision_count: 0,
      difficulty_tier: 'review', question_format: 'mcq',
    }))
  }

  it('logs both parameter sets and the p_know each would have produced', async () => {
    const body = await (await correctAnswer()).json()

    expect(tables.bkt_param_shadow).toHaveLength(1)
    const shadow = tables.bkt_param_shadow[0]
    expect(shadow).toMatchObject({
      learner_id: learnerId, skill_id: skillId, attempt_id: body.attempt_id,
      correct: true, has_fitted_params: true, applied: false,
    })
    // The fitted parameters differ from the global set, so the two estimates
    // of the same attempt must differ — otherwise there is nothing to compare.
    expect(shadow.fitted_p_know_after).not.toBe(shadow.live_p_know_after)
  })

  it('leaves the learner on the live global parameters while the flag is off', async () => {
    await correctAnswer()
    const shadow = tables.bkt_param_shadow[0]

    // What the learner's state actually became is the live estimate, not the
    // fitted one — this is the whole guarantee of shadow mode.
    expect(tables.learner_skill_states[0].p_know).toBe(shadow.live_p_know_after)
    expect(tables.attempt_events[0].p_know_after).toBe(shadow.live_p_know_after)
    expect(shadow.live_p_slip).toBe(0.10)
    expect(shadow.live_p_guess).toBe(0.20)
  })

  it('does not fail the attempt when migration 008 is missing', async () => {
    unmigrated.add('bkt_param_shadow')
    const res = await correctAnswer()

    expect(res.status).toBe(200)
    expect(tables.attempt_events).toHaveLength(1)
    expect(tables.learner_skill_states).toHaveLength(1)
    expect(tables.bkt_param_shadow).toHaveLength(0)
  })
})
