import { describe, expect, it, vi, beforeEach } from 'vitest'
import { gradeExplanation } from '../grader'
import { GradeCache } from '../cache'
import { _clearGradeLogsForTests, getRecentGradeLogs } from '../logger'
import type { ModelSpec } from '../catalog'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

function chatCompletion(content: string) {
  return jsonResponse({ choices: [{ message: { content } }] })
}

const CHAIN: ModelSpec[] = [
  { provider: 'openrouter', model: 'model-a:free' },
  { provider: 'openrouter', model: 'model-b:free' },
  { provider: 'groq', model: 'model-c' },
]

beforeEach(() => {
  _clearGradeLogsForTests()
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  process.env.GROQ_API_KEY = 'test-groq-key'
})

describe('gradeExplanation — automatic model failover', () => {
  it('retries the next free model when the first hits a rate limit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limit exceeded' }, { status: 429 }))
      .mockResolvedValueOnce(chatCompletion('{"category":"meaning-included","confidence":0.9,"rationale":"connects to a real situation"}'))

    const result = await gradeExplanation(
      { concept: 'Integration — Basics', explanationText: 'Explaining with a real example.' },
      { fetchImpl, chain: CHAIN, cache: new GradeCache(), disableLogging: true }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.servedBy).toBe('openrouter:model-b:free')
    expect(result.category).toBe('meaning-included')
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0].ok).toBe(false)
    expect(result.attempts[0].errorType).toBe('rate_limit')
    expect(result.attempts[1].ok).toBe(true)
  })

  it('retries the next free model when the first hits a quota error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'insufficient quota' }, { status: 402 }))
      .mockResolvedValueOnce(chatCompletion('{"category":"method-only","confidence":0.8,"rationale":"describes only steps"}'))

    const result = await gradeExplanation(
      { concept: 'Chain Rule', explanationText: 'First you do this, then that.' },
      { fetchImpl, chain: CHAIN, cache: new GradeCache(), disableLogging: true }
    )

    expect(result.attempts[0].errorType).toBe('quota')
    expect(result.servedBy).toBe('openrouter:model-b:free')
    expect(result.category).toBe('method-only')
  })

  it('skips a model that times out and serves from the next one', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(chatCompletion('{"category":"gap","confidence":0.7,"rationale":"too short"}'))

    const result = await gradeExplanation(
      { concept: 'Limits', explanationText: 'Not sure.' },
      { fetchImpl, chain: CHAIN, cache: new GradeCache(), disableLogging: true }
    )

    expect(result.attempts[0].errorType).toBe('timeout')
    expect(result.servedBy).toBe('openrouter:model-b:free')
  })

  it('falls through every model in order before giving up', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limit' }, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limit' }, { status: 429 }))
      .mockResolvedValueOnce(chatCompletion('{"category":"gap","confidence":0.6,"rationale":"hedged"}'))

    const result = await gradeExplanation(
      { concept: 'Probability', explanationText: 'I guess maybe not sure honestly.' },
      { fetchImpl, chain: CHAIN, cache: new GradeCache(), disableLogging: true }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.servedBy).toBe('groq:model-c')
    expect(result.attempts.map(a => a.ok)).toEqual([false, false, true])
  })
})

describe('gradeExplanation — NLP-4 hard fallback', () => {
  it('falls back to the rule-based classifier when every free model fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limit' }, { status: 429 }))

    const result = await gradeExplanation(
      {
        concept: 'Integration — Basics',
        explanationText:
          "Imagine Virat Kohli's run rate changes every over — sometimes 12 runs, sometimes 4. Integration adds those up to the total runs scored.",
      },
      { fetchImpl, chain: CHAIN, cache: new GradeCache(), disableLogging: true }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.servedBy).toBe('rule-based-fallback')
    expect(result.category).toBe('meaning-included')
  })

  it('falls back immediately when the model chain is empty', async () => {
    const fetchImpl = vi.fn()

    const result = await gradeExplanation(
      { concept: 'Differentiation — Rules', explanationText: 'It reverses differentiation.' },
      { fetchImpl, chain: [], cache: new GradeCache(), disableLogging: true }
    )

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.servedBy).toBe('rule-based-fallback')
  })

  it('falls back when a model response fails schema validation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chatCompletion('not valid json at all'))

    const result = await gradeExplanation(
      { concept: 'Vectors', explanationText: 'You add corresponding components together.' },
      { fetchImpl, chain: [CHAIN[0]], cache: new GradeCache(), disableLogging: true }
    )

    expect(result.servedBy).toBe('rule-based-fallback')
    expect(result.attempts[0].errorType).toBe('parse_error')
  })
})

describe('gradeExplanation — NLP-5 caching', () => {
  it('returns a cached grade for a near-identical explanation without calling any model', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(chatCompletion('{"category":"meaning-included","confidence":0.9,"rationale":"real example"}'))
    const cache = new GradeCache()

    const first = await gradeExplanation(
      { concept: 'Limits', explanationText: 'It is like a bus approaching a stop, for example.' },
      { fetchImpl, chain: [CHAIN[0]], cache, disableLogging: true }
    )
    expect(first.fromCache).toBe(false)

    // near-identical: different casing/whitespace/punctuation
    const second = await gradeExplanation(
      { concept: 'Limits', explanationText: '  It IS like a bus approaching a stop, for example!!  ' },
      { fetchImpl, chain: [CHAIN[0]], cache, disableLogging: true }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second.fromCache).toBe(true)
    expect(second.category).toBe('meaning-included')
  })
})

describe('gradeExplanation — NLP-6 logging', () => {
  it('logs every graded call with input, output, prompt version, and serving model', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(chatCompletion('{"category":"gap","confidence":0.5,"rationale":"too short"}'))

    await gradeExplanation(
      { concept: 'Continuity', explanationText: 'Not sure honestly.' },
      { fetchImpl, chain: [CHAIN[2]], cache: new GradeCache() }
    )

    const logs = getRecentGradeLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      concept: 'Continuity',
      explanationText: 'Not sure honestly.',
      category: 'gap',
      servedBy: 'groq:model-c',
      promptVersion: 'v1',
    })
  })
})
