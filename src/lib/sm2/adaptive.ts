import { Rating, type Grade } from '@/lib/fsrs'

// Level 11: a scheduling quality that reads the behaviour signals Level 7 made
// real, not response time alone. Shipped in shadow — computed and logged on
// every attempt, applied only when a deployment opts in, because hesitation and
// revisions have no analogue in the simulator's ground-truth learner model, so
// no offline run can justify promoting it. Real rows are the evidence.

export type QualityTier = 'again' | 'hard' | 'good' | 'easy'

export interface AttemptBehaviorSignals {
  latency_ms: number
  hesitation_ms: number
  revision_count: number
  /** Feynman loop and explain-back: minutes by design, so duration says nothing about fluency. */
  guided_reflection: boolean
}

export const LONG_HESITATION_MS = 10_000
export const REPEATED_REVISIONS = 2

const DEMOTE: Record<QualityTier, QualityTier> = {
  easy: 'good', good: 'hard', hard: 'hard', again: 'again',
}

const QUALITY_BY_TIER: Record<QualityTier, number> = { again: 1, hard: 3, good: 4, easy: 5 }
const RATING_BY_TIER: Record<QualityTier, Grade> = {
  again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy,
}

function latencyTier(latency_ms: number): QualityTier {
  if (latency_ms < 3000) return 'easy'
  if (latency_ms < 8000) return 'good'
  return 'hard'
}

/**
 * Start from the live latency tier, then demote one step when the learner
 * hesitated long before touching the answer or changed it repeatedly: both say
 * the answer was retrieved with effort, which is what the scheduler's tier is
 * for. A guided reflection starts at the middle tier instead, because a
 * construct designed to take minutes carries no fluency signal in its duration.
 * A wrong answer is 'again' regardless — there is nothing to demote.
 */
export function adaptiveTier(correct: boolean, signals: AttemptBehaviorSignals): QualityTier {
  if (!correct) return 'again'
  const base = signals.guided_reflection ? 'good' : latencyTier(signals.latency_ms)
  const effortful = signals.hesitation_ms >= LONG_HESITATION_MS || signals.revision_count >= REPEATED_REVISIONS
  return effortful ? DEMOTE[base] : base
}

export function adaptiveQuality(correct: boolean, signals: AttemptBehaviorSignals): number {
  return QUALITY_BY_TIER[adaptiveTier(correct, signals)]
}

export function adaptiveFsrsRating(correct: boolean, signals: AttemptBehaviorSignals): Grade {
  return RATING_BY_TIER[adaptiveTier(correct, signals)]
}

// Off by default. Promoting it is a live cutover and needs human sign-off
// (DEVELOPMENT_LOOP.md:113), with the shadow rows as the evidence.
export function isAdaptiveQualityEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADAPTIVE_QUALITY === '1'
}
