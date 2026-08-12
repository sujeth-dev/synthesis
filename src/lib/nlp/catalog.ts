/**
 * Discovers which OpenRouter and Groq models are actually free-tier right
 * now, by querying each provider's live model catalog rather than trusting
 * a hardcoded list of model IDs. Hardcoding IDs believed to be free would
 * silently start incurring cost the moment a provider reprices a model —
 * this fetches pricing/availability fresh (with a short in-memory cache)
 * so the hard "free models only, ever" requirement holds over time.
 */
export type Provider = 'openrouter' | 'groq'

export interface ModelSpec {
  provider: Provider
  model: string
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models'
const CATALOG_TTL_MS = 60 * 60 * 1000 // 1 hour

// Model ids containing these substrings aren't text chat models (audio,
// image, embedding, moderation) and can't serve the grading prompt.
const NON_CHAT_MARKERS = ['whisper', 'tts', 'embed', 'moderation', 'guard', 'vision-ocr', 'dall-e', 'stable-diffusion']

function isChatCapable(id: string): boolean {
  const lower = id.toLowerCase()
  return !NON_CHAT_MARKERS.some(marker => lower.includes(marker))
}

/** Bigger-parameter-count models tend to grade more reliably; used only to order an already-free-only list. */
function sizePreferenceScore(id: string): number {
  const match = id.toLowerCase().match(/(\d+)(x\d+)?b(?![a-z])/)
  if (!match) return 0
  const base = parseInt(match[1], 10)
  const multiplier = match[2] ? parseInt(match[2].slice(1), 10) : 1
  return base * multiplier
}

interface CacheEntry {
  models: ModelSpec[]
  fetchedAt: number
}

let openRouterCache: CacheEntry | null = null
let groqCache: CacheEntry | null = null

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  return entry !== null && Date.now() - entry.fetchedAt < CATALOG_TTL_MS
}

interface OpenRouterModel {
  id: string
  pricing?: { prompt?: string; completion?: string }
}

async function fetchOpenRouterFreeModels(apiKey: string, fetchImpl: typeof fetch): Promise<ModelSpec[]> {
  const res = await fetchImpl(OPENROUTER_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`openrouter model catalog fetch failed: ${res.status}`)
  const body = (await res.json()) as { data?: OpenRouterModel[] }
  const models = body.data ?? []

  return models
    .filter(m => isChatCapable(m.id))
    .filter(m => m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
    .sort((a, b) => sizePreferenceScore(b.id) - sizePreferenceScore(a.id))
    .map(m => ({ provider: 'openrouter' as const, model: m.id }))
}

interface GroqModel {
  id: string
  active?: boolean
}

/**
 * Groq's public API key is provisioned as a rate-limited free developer
 * tier by default (no per-token billing on that tier) — its /models
 * endpoint doesn't carry a pricing field the way OpenRouter's does. We
 * treat every active, chat-capable model it reports as free-tier-eligible
 * for this key, and rely on the account's own free-tier gate rather than
 * a per-model price check.
 */
async function fetchGroqFreeModels(apiKey: string, fetchImpl: typeof fetch): Promise<ModelSpec[]> {
  const res = await fetchImpl(GROQ_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`groq model catalog fetch failed: ${res.status}`)
  const body = (await res.json()) as { data?: GroqModel[] }
  const models = body.data ?? []

  return models
    .filter(m => m.active !== false)
    .filter(m => isChatCapable(m.id))
    .sort((a, b) => sizePreferenceScore(b.id) - sizePreferenceScore(a.id))
    .map(m => ({ provider: 'groq' as const, model: m.id }))
}

export interface BuildFailoverChainOptions {
  openRouterApiKey?: string
  groqApiKey?: string
  fetchImpl?: typeof fetch
  /** Skip the cache and force a fresh catalog fetch. */
  forceRefresh?: boolean
}

/**
 * Returns the ordered list of free models to try, OpenRouter first then
 * Groq. A provider whose catalog fetch fails (network error, bad key) is
 * silently skipped rather than throwing — the caller's failover loop and
 * NLP-4 hard fallback handle an empty or partial chain.
 */
export async function buildFailoverChain(options: BuildFailoverChainOptions = {}): Promise<ModelSpec[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const openRouterApiKey = options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY
  const groqApiKey = options.groqApiKey ?? process.env.GROQ_API_KEY
  const forceRefresh = options.forceRefresh ?? false

  const chain: ModelSpec[] = []

  if (openRouterApiKey) {
    try {
      if (forceRefresh || !isFresh(openRouterCache)) {
        openRouterCache = { models: await fetchOpenRouterFreeModels(openRouterApiKey, fetchImpl), fetchedAt: Date.now() }
      }
      chain.push(...openRouterCache.models)
    } catch {
      if (openRouterCache) chain.push(...openRouterCache.models)
    }
  }

  if (groqApiKey) {
    try {
      if (forceRefresh || !isFresh(groqCache)) {
        groqCache = { models: await fetchGroqFreeModels(groqApiKey, fetchImpl), fetchedAt: Date.now() }
      }
      chain.push(...groqCache.models)
    } catch {
      if (groqCache) chain.push(...groqCache.models)
    }
  }

  return chain
}

/** Test-only: clears the in-memory catalog cache between test runs. */
export function _resetCatalogCacheForTests(): void {
  openRouterCache = null
  groqCache = null
}
