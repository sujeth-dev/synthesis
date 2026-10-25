import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The same in-memory getDb() stand-in attempt/route.test.ts uses, with update()
// added, so the real queries.ts and the real route run unmodified against it.
type Row = Record<string, unknown>
const tables = vi.hoisted(() => ({
  exam_runs: [] as Row[],
  exam_item_events: [] as Row[],
  attempt_events: [] as Row[],
  learner_skill_states: [] as Row[],
  review_schedules: [] as Row[],
  motivation_states: [] as Row[],
}))
const idCounter = vi.hoisted(() => ({ n: 0 }))
const currentUser = vi.hoisted(() => ({ id: 'learner-exam' }))

vi.mock('@/lib/db', () => {
  function table(name: keyof typeof tables) {
    return {
      select: () => {
        const filters: Record<string, unknown> = {}
        let orderField: string | null = null
        let orderAsc = true
        let limitN: number | null = null
        function run() {
          let rows = tables[name].filter(r => Object.entries(filters).every(([k, v]) => r[k] === v))
          if (orderField) {
            const field = orderField
            rows = [...rows].sort((a, b) => {
              const av = a[field] as number | string
              const bv = b[field] as number | string
              const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
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
        tables[name].push({ ...row })
        return { data: null, error: null }
      },
      update: (patch: Row) => ({
        eq: async (field: string, value: unknown) => {
          for (const r of tables[name]) if (r[field] === value) Object.assign(r, patch)
          return { data: null, error: null }
        },
      }),
    }
  }
  return {
    generateId: () => `id-${++idCounter.n}`,
    getDb: () => ({ from: (name: string) => table(name as keyof typeof tables) }),
  }
})

vi.mock('@/lib/db/session', () => ({
  getCurrentUser: async () => ({ id: currentUser.id, email: 'exam@example.test' }),
}))

import fs from 'node:fs'
import path from 'node:path'
import { GET, POST } from './route'
import { MAX_ITEMS, MIN_ITEMS } from '@/lib/exam/policy'
import type { PhaseEvaluationQuestion } from '@/types'

const PHASE = 'phase_2_cs_data'
const bank: PhaseEvaluationQuestion[] = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'content', 'questions', 'phase-evaluation', 'p2_evaluation.json'), 'utf-8'))
const byId = new Map(bank.map(q => [q.id, q]))

async function post(body: Record<string, unknown>) {
  const res = await POST({ json: async () => body } as unknown as Parameters<typeof POST>[0])
  return { status: res.status, body: await res.json() }
}

async function get(runId: string) {
  const req = { nextUrl: new URL(`http://x/api/exam?run_id=${runId}`) } as unknown as Parameters<typeof GET>[0]
  const res = await GET(req)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  for (const key of Object.keys(tables) as (keyof typeof tables)[]) tables[key].length = 0
  idCounter.n = 0
  currentUser.id = 'learner-exam'
})

afterEach(() => { vi.useRealTimers() })

/** Answers every served item until the run stops; `rightIf` decides each one. */
async function runToEnd(runId: string, firstQuestionId: string, rightIf: (n: number) => boolean) {
  let questionId: string = firstQuestionId
  let n = 0
  for (;;) {
    const q = byId.get(questionId)!
    const pick = rightIf(n) ? q.correct_option_id : q.options.find(o => o.id !== q.correct_option_id)!.id
    const res = await post({ action: 'answer', run_id: runId, question_id: questionId, selected_option_id: pick, latency_ms: 20_000 })
    expect(res.status).toBe(200)
    n += 1
    if (res.body.done) return { n, stop: res.body.stop_reason as string }
    questionId = res.body.item.question_id
  }
}

describe('POST /api/exam start (EXAM-2)', () => {
  it('serves a first item without leaking the answer, a misconception or an explanation', async () => {
    const res = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    expect(res.status).toBe(200)
    const item = res.body.item
    expect(item.bloom_level).toBe('remember')
    const serialised = JSON.stringify(res.body)
    expect(serialised).not.toContain('correct_option_id')
    expect(serialised).not.toContain('misconception')
    expect(serialised).not.toContain('explanation_after')
    expect(item.hints).toEqual([])
  })

  it('gives a checkpoint a server-side deadline and practice none', async () => {
    const practice = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    const checkpoint = await post({ action: 'start', phase: PHASE, mode: 'checkpoint' })
    expect(practice.body.run.deadline_at).toBeNull()
    expect(checkpoint.body.run.deadline_at).not.toBeNull()
    expect(checkpoint.body.time_limit_sec).toBeGreaterThan(0)
  })

  it('rejects an unknown phase or mode', async () => {
    expect((await post({ action: 'start', phase: 'phase_9', mode: 'practice' })).status).toBe(400)
    expect((await post({ action: 'start', phase: PHASE, mode: 'speedrun' })).status).toBe(400)
  })
})

describe('an adaptive run (EXAM-2)', () => {
  it('stops between the minimum and the cap, and every item is distinct', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'checkpoint' })
    const { n, stop } = await runToEnd(start.body.run.id, start.body.item.question_id, i => i % 3 !== 2)
    expect(n).toBeGreaterThanOrEqual(MIN_ITEMS)
    expect(n).toBeLessThanOrEqual(MAX_ITEMS)
    expect(['precision', 'max_length']).toContain(stop)
    const served = tables.exam_item_events.map(r => r.question_id)
    expect(new Set(served).size).toBe(served.length)
  })

  it('records the final answer of a revisited item and serves nothing new for it', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'checkpoint' })
    const runId = start.body.run.id
    const first = byId.get(start.body.item.question_id)!
    const wrong = first.options.find(o => o.id !== first.correct_option_id)!.id
    const second = await post({ action: 'answer', run_id: runId, question_id: first.id, selected_option_id: wrong, latency_ms: 5000 })
    expect(second.body.item).toBeDefined()
    const revisit = await post({ action: 'answer', run_id: runId, question_id: first.id, selected_option_id: first.correct_option_id, latency_ms: 9000 })
    expect(revisit.body).toEqual({ ok: true })
    expect(tables.exam_item_events).toHaveLength(2)
    expect(tables.exam_item_events[0]).toMatchObject({ selected_option_id: first.correct_option_id, correct: true })
  })

  it('rejects an option the item does not have', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    const res = await post({ action: 'answer', run_id: start.body.run.id, question_id: start.body.item.question_id, selected_option_id: 'z' })
    expect(res.status).toBe(400)
  })

  it('refuses an answer after the deadline and records the run as timed out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
    const start = await post({ action: 'start', phase: PHASE, mode: 'checkpoint' })
    vi.setSystemTime(Date.parse(start.body.run.deadline_at) + 60_000)
    const q = byId.get(start.body.item.question_id)!
    const res = await post({ action: 'answer', run_id: start.body.run.id, question_id: q.id, selected_option_id: q.correct_option_id })
    expect(res.status).toBe(409)
    expect(res.body.time_up).toBe(true)
    const finish = await post({ action: 'finish', run_id: start.body.run.id })
    expect(finish.body.debrief.stop_reason).toBe('time')
  })

  it('will not show one learner another learner\'s run', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    currentUser.id = 'someone-else'
    expect((await get(start.body.run.id)).status).toBe(404)
    expect((await post({ action: 'finish', run_id: start.body.run.id })).status).toBe(404)
  })
})

describe('hints (EXAM-2)', () => {
  it('gives two hints in practice, in order, then no more', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    const body = { action: 'hint', run_id: start.body.run.id, question_id: start.body.item.question_id }
    const q = byId.get(start.body.item.question_id)!
    const one = await post(body)
    const two = await post(body)
    const three = await post(body)
    expect(one.body.hints).toEqual([q.hints[0]])
    expect(two.body.hints).toEqual(q.hints)
    expect(three.body.hint_level).toBe(2)
  })

  it('refuses every hint in a checkpoint', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'checkpoint' })
    const res = await post({ action: 'hint', run_id: start.body.run.id, question_id: start.body.item.question_id })
    expect(res.status).toBe(403)
  })

  it('flags a hint asked for before the stem could be read, and not one asked later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    const body = { action: 'hint', run_id: start.body.run.id, question_id: start.body.item.question_id }
    vi.setSystemTime(new Date('2026-10-25T10:00:30Z'))
    await post(body)
    expect(tables.exam_item_events[0].hint_abuse).toBe(false)
    vi.setSystemTime(new Date('2026-10-25T10:00:31Z'))
    await post(body)
    expect(tables.exam_item_events[0].hint_abuse).toBe(true)
  })
})

describe('finish (EXAM-2)', () => {
  it('is measurement-only: attempt rows, and nothing in BKT, SM-2 or motivation', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    const { n } = await runToEnd(start.body.run.id, start.body.item.question_id, i => i % 2 === 0)
    const finish = await post({ action: 'finish', run_id: start.body.run.id })
    expect(finish.status).toBe(200)
    expect(tables.attempt_events).toHaveLength(n)
    for (const row of tables.attempt_events) expect(row.session_id).toBeNull()
    expect(tables.learner_skill_states).toHaveLength(0)
    expect(tables.review_schedules).toHaveLength(0)
    expect(tables.motivation_states).toHaveLength(0)
  })

  it('returns the stored debrief on a second finish without writing attempts again', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    await runToEnd(start.body.run.id, start.body.item.question_id, () => true)
    const first = await post({ action: 'finish', run_id: start.body.run.id })
    const count = tables.attempt_events.length
    const again = await post({ action: 'finish', run_id: start.body.run.id })
    expect(again.body.debrief).toEqual(first.body.debrief)
    expect(tables.attempt_events).toHaveLength(count)
  })

  it('debriefs by Bloom level, with skill labels, and GET returns the same', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'checkpoint' })
    await runToEnd(start.body.run.id, start.body.item.question_id, () => false)
    const finish = await post({ action: 'finish', run_id: start.body.run.id })
    expect(finish.body.debrief.levels).toHaveLength(6)
    expect(finish.body.debrief.misconceptions.length).toBe(finish.body.debrief.n)
    expect(Object.keys(finish.body.skill_labels).length).toBeGreaterThan(0)
    const read = await get(start.body.run.id)
    expect(read.body.debrief).toEqual(finish.body.debrief)
    expect(read.body.run.status).toBe('finished')
  })

  it('refuses further answers once finished', async () => {
    const start = await post({ action: 'start', phase: PHASE, mode: 'practice' })
    await post({ action: 'finish', run_id: start.body.run.id })
    const q = byId.get(start.body.item.question_id)!
    const res = await post({ action: 'answer', run_id: start.body.run.id, question_id: q.id, selected_option_id: q.correct_option_id })
    expect(res.status).toBe(409)
  })
})
