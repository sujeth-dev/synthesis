// Ground-truth learner model for the simulator. Unlike BKT/SM-2/FSRS, which
// only ever *estimate* what a learner knows, a simulated learner's true memory
// state is known exactly — that is what makes scheduler and knowledge-tracing
// comparisons possible without real users. Results produced with it are
// synthetic and must always be labeled as such.

import type { Rng } from './rng'

export type LearnerArchetype = 'fast' | 'average' | 'slow' | 'forgetful'

export interface LearnerParams {
  archetype: LearnerArchetype
  learnRate: number        // P(acquiring a skill) per practice attempt, before prerequisite penalty
  initialStability: number // days until recall falls to 90% right after first learning
  stabilityGrowth: number  // how strongly a successful, effortful recall extends memory
  slip: number             // P(wrong | actually recalled)
  guess: number            // P(right | not recalled) — MCQs with 4 options sit near 0.25
  speed: number            // latency multiplier, < 1 = faster
  studyProbability: number // P(studying on any given day)
}

const ARCHETYPES: Record<LearnerArchetype, Omit<LearnerParams, 'archetype'>> = {
  fast:      { learnRate: 0.45, initialStability: 2.0, stabilityGrowth: 2.2, slip: 0.06, guess: 0.22, speed: 0.75, studyProbability: 0.70 },
  average:   { learnRate: 0.30, initialStability: 1.5, stabilityGrowth: 1.8, slip: 0.10, guess: 0.22, speed: 1.00, studyProbability: 0.55 },
  slow:      { learnRate: 0.18, initialStability: 1.2, stabilityGrowth: 1.5, slip: 0.12, guess: 0.20, speed: 1.35, studyProbability: 0.50 },
  forgetful: { learnRate: 0.30, initialStability: 0.7, stabilityGrowth: 1.2, slip: 0.10, guess: 0.22, speed: 1.00, studyProbability: 0.45 },
}

export const ARCHETYPE_MIX: readonly LearnerArchetype[] = ['fast', 'average', 'average', 'average', 'slow', 'forgetful']

// Individual variation around the archetype, so no two learners are identical.
export function sampleLearnerParams(rng: Rng, archetype: LearnerArchetype = rng.pick(ARCHETYPE_MIX)): LearnerParams {
  const base = ARCHETYPES[archetype]
  const jitter = (value: number, sd: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value * (1 + rng.normal(0, sd))))
  return {
    archetype,
    learnRate: jitter(base.learnRate, 0.2, 0.05, 0.8),
    initialStability: jitter(base.initialStability, 0.2, 0.3, 5),
    stabilityGrowth: jitter(base.stabilityGrowth, 0.15, 0.5, 4),
    slip: jitter(base.slip, 0.2, 0.01, 0.3),
    guess: jitter(base.guess, 0.1, 0.05, 0.35),
    speed: jitter(base.speed, 0.15, 0.4, 2.5),
    studyProbability: jitter(base.studyProbability, 0.15, 0.15, 0.95),
  }
}

export interface TrueSkillMemory {
  learned: boolean
  stability: number            // days; recall is exactly 90% this long after lastPracticedAt
  lastPracticedAt: number | null // simulated time in days
}

const RECALL_AT_STABILITY = 0.9

export function trueRecallProbability(memory: TrueSkillMemory | undefined, nowDays: number): number {
  if (!memory?.learned || memory.lastPracticedAt === null) return 0
  const elapsed = Math.max(0, nowDays - memory.lastPracticedAt)
  return Math.pow(RECALL_AT_STABILITY, elapsed / memory.stability)
}

export interface PracticeOutcome {
  correct: boolean
  recalled: boolean
  recallProbability: number // the true P(recall) immediately before this attempt
  latencyMs: number
  memory: TrueSkillMemory
}

// One practice attempt: answer from true memory, then update true memory.
// `prereqRecall` is the product of the learner's true recall of the skill's hard
// prerequisites — a learner who doesn't really know the prerequisites learns
// the new skill far more slowly, whatever the BKT estimates say.
export function practice(
  rng: Rng,
  params: LearnerParams,
  memory: TrueSkillMemory | undefined,
  nowDays: number,
  prereqRecall: number,
): PracticeOutcome {
  const current: TrueSkillMemory = memory ?? { learned: false, stability: params.initialStability, lastPracticedAt: null }
  const recallProbability = trueRecallProbability(current, nowDays)
  const recalled = rng.next() < recallProbability
  const correct = recalled ? rng.next() >= params.slip : rng.next() < params.guess
  const latencyMs = Math.round(rng.logNormal(recalled ? 4000 : 9000, 0.4) * params.speed)

  let next: TrueSkillMemory
  if (recalled) {
    // Spacing effect: recalling something that was close to forgotten
    // strengthens memory much more than re-reading something just seen.
    const gain = 1 + params.stabilityGrowth * (1 - recallProbability) * 3 + 0.1
    next = { learned: true, stability: current.stability * gain, lastPracticedAt: nowDays }
  } else if (current.learned) {
    // Forgotten: re-exposure restores the skill but with reduced stability.
    next = { learned: true, stability: Math.max(params.initialStability, current.stability * 0.4), lastPracticedAt: nowDays }
  } else {
    const learnsNow = rng.next() < params.learnRate * prereqRecall
    next = learnsNow
      ? { learned: true, stability: params.initialStability, lastPracticedAt: nowDays }
      : current
  }
  return { correct, recalled, recallProbability, latencyMs, memory: next }
}
