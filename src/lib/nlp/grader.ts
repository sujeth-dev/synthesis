/**
 * NLP/LLM reasoning grader client: grades a learner's free-text Feynman
 * explanation using only free-tier OpenRouter/Groq models, with automatic
 * failover across an ordered model list, an NLP-4 hard fallback to the
 * rule-based classifier when every model fails or times out, NLP-5 caching
 * of repeated/near-identical explanations, and NLP-6 logging of every call.
 *
 * Live since 2026-08-12: src/app/api/attempt/route.ts calls gradeExplanation()
 * as the primary reasoning-quality grader for 'explain'-format attempts, per the
 * NLP/LLM upgrade trigger note in src/lib/feynman/classifier.ts (106-example
 * labeled set, 96.2% vs 67.0% agreement with human labels, kappa 0.943 vs 0.498).
 * The rule-based classifier stays as this module's own internal hard fallback
 * (see below) and as the route's outer fail-open fallback if this module itself
 * throws before reaching that fallback.
 */
import { classifyExplanation, type ExplanationCategory } from '../feynman/classifier'
import { buildGradingPrompt, parseGraderResponse, PROMPT_VERSION, type GraderMessage } from './prompts/v1'
import { buildFailoverChain, type ModelSpec } from './catalog'
import { defaultGradeCache, type GradeCache } from './cache'
import { logGradeCall, type GradeAttemptLog, type GradeCallLog } from './logger'

export type { ModelSpec } from './catalog'
export type { GradeAttemptLog } from './logger'

export interface GradeExplanationInput {
  concept: string
  explanationText: string
}

export interface GradeExplanationResult {
  category: ExplanationCategory
  confidence: number
  rationale: string
  /** e.g. "openrouter:qwen/qwen-2.5-72b-instruct:free", "groq:llama-3.3-70b-versatile", or "rule-based-fallback" */
  servedBy: string
  promptVersion: string
  fromCache: boolean
  attempts: GradeAttemptLog[]
  latencyMs: number
}

export interface GradeExplanationOptions {
  fetchImpl?: typeof fetch
  cache?: GradeCache
  /** Override the model failover chain — used in tests to bypass live catalog discovery. */
  chain?: ModelSpec[]
  disableCache?: boolean
  disableLogging?: boolean
}

const REQUEST_TIMEOUT_MS = 20_000

interface HttpError extends Error {
  status?: number
  errorType?: GradeAttemptLog['errorType']
}

export async function gradeExplanation(
  input: GradeExplanationInput,
  options: GradeExplanationOptions = {}
): Promise<GradeExplanationResult> {
  const start = Date.now()
  const cache = options.cache ?? defaultGradeCache
  const fetchImpl = options.fetchImpl ?? fetch

  if (!options.disableCache) {
    const cached = cache.get(input.concept, input.explanationText)
    if (cached) {
      const result: GradeExplanationResult = { ...cached, fromCache: true, attempts: [], latencyMs: Date.now() - start }
      if (!options.disableLogging) logGradeCall(toLogEntry(input, result))
      return result
    }
  }

  const chain = options.chain ?? (await buildFailoverChain({ fetchImpl }))
  const messages = buildGradingPrompt({ concept: input.concept, explanationText: input.explanationText })
  const attempts: GradeAttemptLog[] = []

  for (const spec of chain) {
    const attemptStart = Date.now()
    try {
      const raw = await callModel(spec, messages, fetchImpl)
      const parsed = parseGraderResponse(raw)
      attempts.push({ provider: spec.provider, model: spec.model, ok: true, latencyMs: Date.now() - attemptStart })

      const result: GradeExplanationResult = {
        category: parsed.category,
        confidence: parsed.confidence,
        rationale: parsed.rationale,
        servedBy: `${spec.provider}:${spec.model}`,
        promptVersion: PROMPT_VERSION,
        fromCache: false,
        attempts,
        latencyMs: Date.now() - start,
      }
      if (!options.disableCache) {
        cache.set(input.concept, input.explanationText, {
          category: result.category,
          confidence: result.confidence,
          rationale: result.rationale,
          servedBy: result.servedBy,
          promptVersion: result.promptVersion,
        })
      }
      if (!options.disableLogging) logGradeCall(toLogEntry(input, result))
      return result
    } catch (err) {
      attempts.push({
        provider: spec.provider,
        model: spec.model,
        ok: false,
        errorType: classifyError(err),
        errorMessage: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - attemptStart,
      })
      // automatic failover: move to the next free model in the chain
    }
  }

  // NLP-4 hard fallback: every configured free model failed/timed out (or the chain was empty).
  const category = classifyExplanation(input.explanationText)
  const result: GradeExplanationResult = {
    category,
    confidence: 1,
    rationale: 'rule-based fallback: all free-tier models failed or timed out',
    servedBy: 'rule-based-fallback',
    promptVersion: PROMPT_VERSION,
    fromCache: false,
    attempts,
    latencyMs: Date.now() - start,
  }
  if (!options.disableLogging) logGradeCall(toLogEntry(input, result))
  return result
}

async function callModel(spec: ModelSpec, messages: GraderMessage[], fetchImpl: typeof fetch): Promise<string> {
  const { url, headers, apiKey } = endpointFor(spec)
  if (!apiKey) throw new Error(`missing API key for provider ${spec.provider}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: spec.model, messages, temperature: 0, max_tokens: 300 }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const bodyText = await safeReadText(res)
      const errorType: GradeAttemptLog['errorType'] =
        res.status === 429 || /rate.?limit/i.test(bodyText)
          ? 'rate_limit'
          : res.status === 402 || /quota|insufficient/i.test(bodyText)
            ? 'quota'
            : 'http_error'
      const error = new Error(`${spec.provider} ${spec.model} HTTP ${res.status}: ${bodyText.slice(0, 300)}`) as HttpError
      error.status = res.status
      error.errorType = errorType
      throw error
    }

    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error(`${spec.provider} ${spec.model}: empty completion`)
    return content
  } finally {
    clearTimeout(timeout)
  }
}

function endpointFor(spec: ModelSpec): { url: string; headers: Record<string, string>; apiKey: string | undefined } {
  if (spec.provider === 'openrouter') {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: { 'HTTP-Referer': 'https://synaptic.local', 'X-Title': 'Synaptic NLP reasoning grader' },
      apiKey: process.env.OPENROUTER_API_KEY,
    }
  }
  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {},
    apiKey: process.env.GROQ_API_KEY,
  }
}

function classifyError(err: unknown): GradeAttemptLog['errorType'] {
  if (err instanceof Error && err.name === 'AbortError') return 'timeout'
  const httpErr = err as HttpError
  if (httpErr?.errorType) return httpErr.errorType
  if (err instanceof Error && /grader v1|JSON/i.test(err.message)) return 'parse_error'
  return 'network'
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function toLogEntry(input: GradeExplanationInput, result: GradeExplanationResult): GradeCallLog {
  return {
    timestamp: new Date().toISOString(),
    concept: input.concept,
    explanationText: input.explanationText,
    promptVersion: result.promptVersion,
    category: result.category,
    confidence: result.confidence,
    rationale: result.rationale,
    servedBy: result.servedBy,
    fromCache: result.fromCache,
    attempts: result.attempts,
    totalLatencyMs: result.latencyMs,
  }
}
