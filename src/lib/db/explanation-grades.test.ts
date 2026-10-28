import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks '@/lib/db' at the getDb()/generateId() boundary, the convention this
// repo already uses in behavior-analytics.test.ts, so the real queries.ts runs
// unmodified against an in-memory stand-in for the explanation_grades table.
const persistedRows = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const insertFailures = vi.hoisted(() => [] as Array<{ code: string; message: string }>)

vi.mock('@/lib/db', () => ({
  generateId: () => `grade-${persistedRows.length + 1}`,
  getDb: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        const error = insertFailures.shift()
        if (error) return { data: null, error }
        persistedRows.push(row)
        return { data: null, error: null }
      },
      select: () => {
        let selected = [...persistedRows]
        const query = {
          eq(field: string, value: unknown) {
            selected = selected.filter(row => row[field] === value)
            return query
          },
          order(field: string, options: { ascending: boolean }) {
            selected.sort((a, b) => {
              const left = String(a[field])
              const right = String(b[field])
              return options.ascending ? left.localeCompare(right) : right.localeCompare(left)
            })
            return query
          },
          limit(n: number) { selected = selected.slice(0, n); return query },
          then<T>(onfulfilled?: (value: { data: Array<Record<string, unknown>> }) => T) {
            return Promise.resolve({ data: selected }).then(onfulfilled)
          },
        }
        return query
      },
    }),
  }),
}))

import { getExplanationGrades, insertExplanationGrade } from '@/lib/db/queries'

const learnerId = 'learner-grades'

const graded = {
  learner_id: learnerId, skill_id: 'p1_variables', attempt_id: 'attempt-1',
  explanation_text: 'A variable is a labelled box because the name is how you find the value again.',
  prior_explanation_text: 'A variable stores something.',
  category: 'meaning-included' as const, confidence: 0.91, reasoning_quality: 1,
  rationale: 'Connects the mechanism to why it matters.',
  prompt_version: 'v1', served_by: 'openrouter:qwen/qwen-2.5-72b-instruct:free',
  from_cache: false, grader_latency_ms: 812,
}

beforeEach(() => {
  persistedRows.length = 0
  insertFailures.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T09:00:00.000Z'))
})

describe('explanation grade persistence (migration 006)', () => {
  it('reads back every column it was given, including the learner\'s own words', async () => {
    await insertExplanationGrade(graded)

    const rows = await getExplanationGrades(learnerId, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ...graded,
      id: 'grade-1',
      created_at: '2026-10-21T09:00:00.000Z',
    })
  })

  it('keeps a rule-based grade with its zero-confidence sentinel and no prior explanation', async () => {
    await insertExplanationGrade({
      ...graded, attempt_id: 'attempt-2', prior_explanation_text: null,
      category: 'method-only', confidence: 0, reasoning_quality: 0.6,
      served_by: 'rule-based-fallback', prompt_version: 'none', grader_latency_ms: 0,
    })

    const rows = await getExplanationGrades(learnerId, 10)
    expect(rows[0]).toMatchObject({
      prior_explanation_text: null, confidence: 0,
      served_by: 'rule-based-fallback', reasoning_quality: 0.6,
    })
  })

  it('throws when the table is missing, so the caller decides whether to fail the attempt', async () => {
    insertFailures.push({ code: 'PGRST205', message: "Could not find the table 'public.explanation_grades'" })

    await expect(insertExplanationGrade(graded)).rejects.toThrow(/Explanation grade insert failed/)
    expect(persistedRows).toHaveLength(0)
  })

  it('returns the most recent grades first, bounded by the limit', async () => {
    for (const attemptId of ['attempt-1', 'attempt-2', 'attempt-3']) {
      vi.setSystemTime(new Date(`2026-10-2${attemptId.slice(-1)}T09:00:00.000Z`))
      await insertExplanationGrade({ ...graded, attempt_id: attemptId })
    }

    const rows = await getExplanationGrades(learnerId, 2)
    expect(rows.map(row => row.attempt_id)).toEqual(['attempt-3', 'attempt-2'])
  })

  it('returns nothing for a learner with no graded explanations', async () => {
    await insertExplanationGrade(graded)
    expect(await getExplanationGrades('someone-else', 10)).toEqual([])
  })
})
