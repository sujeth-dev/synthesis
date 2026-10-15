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
}))
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
      insert: async (row: Row) => { tables[name].push(row); return { data: null, error: null } },
      upsert: async (row: Row, opts: { onConflict: string }) => {
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

import { POST } from './route'

function fakeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const learnerId = 'learner-fsrs-test'
const skillId = 'p1_binary_numbers'

beforeEach(() => {
  for (const key of Object.keys(tables) as (keyof typeof tables)[]) tables[key].length = 0
  idCounter.n = 0

  // Kept low so bktUpdate() never crosses MASTERY_THRESHOLD across the up-to-two
  // correct answers these tests submit — the newly-mastered unlock branch in
  // route.ts calls getAllNodes(), whose static require() doesn't resolve under
  // Vitest and is unrelated to what FSRS-3 is testing here.
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
