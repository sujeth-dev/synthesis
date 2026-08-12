/**
 * NLP-6: logs every graded call — input, output, which rubric/prompt
 * version, and which model actually served it (or the rule-based fallback).
 * Kept in-memory (for tests and in-process inspection) and best-effort
 * appended to a gitignored JSONL file on disk when a writable filesystem
 * is available; a logging failure never breaks grading.
 */
import type { ExplanationCategory } from '../feynman/classifier'

export interface GradeAttemptLog {
  provider: string
  model: string
  ok: boolean
  errorType?: 'rate_limit' | 'quota' | 'http_error' | 'network' | 'timeout' | 'parse_error'
  errorMessage?: string
  latencyMs: number
}

export interface GradeCallLog {
  timestamp: string
  concept: string
  explanationText: string
  promptVersion: string
  category: ExplanationCategory
  confidence: number
  rationale: string
  servedBy: string
  fromCache: boolean
  attempts: GradeAttemptLog[]
  totalLatencyMs: number
}

const MAX_IN_MEMORY_LOGS = 1000
const inMemoryLogs: GradeCallLog[] = []

const LOG_FILE_PATH = 'logs/nlp-grader.jsonl'

export function logGradeCall(entry: GradeCallLog): void {
  inMemoryLogs.push(entry)
  if (inMemoryLogs.length > MAX_IN_MEMORY_LOGS) inMemoryLogs.shift()

  void appendToLogFile(entry)
}

async function appendToLogFile(entry: GradeCallLog): Promise<void> {
  if (typeof process === 'undefined' || !process.versions?.node) return
  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.dirname(LOG_FILE_PATH)
    await fs.mkdir(dir, { recursive: true })
    await fs.appendFile(LOG_FILE_PATH, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // best-effort only — never let logging failures break grading
  }
}

export function getRecentGradeLogs(limit = MAX_IN_MEMORY_LOGS): GradeCallLog[] {
  return inMemoryLogs.slice(-limit)
}

/** Test-only: clears the in-memory log buffer between test runs. */
export function _clearGradeLogsForTests(): void {
  inMemoryLogs.length = 0
}
