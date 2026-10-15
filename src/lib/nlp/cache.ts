import type { ExplanationCategory } from '../feynman/classifier'
import { PROMPT_VERSION } from './prompts/v1'

/**
 * NLP-5: avoids re-grading repeated/near-identical explanations. Keyed on
 * the concept plus a normalized form of the text (trimmed, lowercased,
 * whitespace-collapsed, punctuation-stripped) so trivial formatting
 * differences — extra spaces, a trailing period, different casing — hit
 * the same entry without pulling in heavier fuzzy-matching machinery this
 * scope doesn't need.
 */
export interface CachedGrade {
  category: ExplanationCategory
  confidence: number
  rationale: string
  servedBy: string
  promptVersion: string
}

interface CacheRecord {
  value: CachedGrade
  cachedAt: number
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const DEFAULT_MAX_ENTRIES = 500

export function normalizeExplanationKey(concept: string, text: string): string {
  const normalizedText = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
  return `${concept.trim().toLowerCase()}::${PROMPT_VERSION}::${normalizedText}`
}

export class GradeCache {
  private store = new Map<string, CacheRecord>()

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES
  ) {}

  get(concept: string, text: string): CachedGrade | null {
    const key = normalizeExplanationKey(concept, text)
    const record = this.store.get(key)
    if (!record) return null
    if (Date.now() - record.cachedAt > this.ttlMs) {
      this.store.delete(key)
      return null
    }
    // refresh recency for simple LRU-ish eviction
    this.store.delete(key)
    this.store.set(key, record)
    return record.value
  }

  set(concept: string, text: string, value: CachedGrade): void {
    const key = normalizeExplanationKey(concept, text)
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) this.store.delete(oldestKey)
    }
    this.store.set(key, { value, cachedAt: Date.now() })
  }

  size(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }
}

export const defaultGradeCache = new GradeCache()
