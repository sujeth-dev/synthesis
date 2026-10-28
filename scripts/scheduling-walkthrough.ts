/**
 * One scripted learner on one skill, scheduled by the app's real functions.
 *
 *   npx tsx scripts/scheduling-walkthrough.ts
 *
 * A teaching illustration for the lab's Scheduling tab, NOT a measurement: the
 * seven answers are written by hand below, the learner always comes back
 * exactly on the due date, and nothing is sampled. What is real is the
 * scheduling arithmetic -- updateSM2 / bktToQuality, computeFsrsSchedule /
 * fsrsRatingFromCorrectness and the shadow adaptiveQuality -- so every grade and
 * interval in the output is what the app would compute for that answer. The
 * population-level claims live in latency-signal-impact.json; this file only
 * shows how a single answer turns into a date.
 *
 * Six worlds: each scheduler under (a) the measured speed, (b) the speed signal
 * as the Level 7 bug delivered it (every answer 100 ms), (c) the behaviour-aware
 * grade that also reads hesitation and revisions (shadow-only in the app).
 *
 * Writes Research/sim/results/scheduling-walkthrough.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { adaptiveFsrsRating, adaptiveQuality, type AttemptBehaviorSignals } from '../src/lib/sm2/adaptive'
import { bktToQuality, initSM2, updateSM2 } from '../src/lib/sm2'
import { computeFsrsSchedule, fsrsRatingFromCorrectness, Rating, type FsrsCardState, type Grade } from '../src/lib/fsrs'
import { CRUSHED_LATENCY_MS } from '../src/lib/sim/run'
import type { ReviewSchedule } from '../src/types'

interface Answer { correct: boolean; latency_ms: number; hesitation_ms: number; revision_count: number; what: string }

// The story: a hesitant start, steady gains, one effortful pass, one slip.
const ANSWERS: Answer[] = [
  { correct: true,  latency_ms: 12_000, hesitation_ms: 2_000,  revision_count: 0, what: 'Right, but it took a while' },
  { correct: true,  latency_ms: 6_000,  hesitation_ms: 1_000,  revision_count: 0, what: 'Right, at a normal pace' },
  { correct: true,  latency_ms: 2_000,  hesitation_ms: 500,    revision_count: 0, what: 'Right and quick' },
  { correct: true,  latency_ms: 7_000,  hesitation_ms: 14_000, revision_count: 3, what: 'Right, after a long stare and three changes of mind' },
  { correct: false, latency_ms: 15_000, hesitation_ms: 4_000,  revision_count: 1, what: 'Wrong' },
  { correct: true,  latency_ms: 4_000,  hesitation_ms: 1_000,  revision_count: 0, what: 'Right again' },
  { correct: true,  latency_ms: 2_500,  hesitation_ms: 600,    revision_count: 0, what: 'Right and quick' },
]

type Signal = 'measured' | 'speed_lost' | 'behaviour_aware'
const START = new Date('2026-03-02T09:00:00Z')
const DAY_MS = 86_400_000
const FSRS_NAME: Record<number, string> = { [Rating.Again]: 'Again', [Rating.Hard]: 'Hard', [Rating.Good]: 'Good', [Rating.Easy]: 'Easy' }

function signals(a: Answer, kind: Signal): AttemptBehaviorSignals {
  return { latency_ms: kind === 'speed_lost' ? CRUSHED_LATENCY_MS : a.latency_ms, hesitation_ms: a.hesitation_ms, revision_count: a.revision_count, guided_reflection: false }
}

function walk(scheduler: 'sm2' | 'fsrs', kind: Signal) {
  const steps: Record<string, unknown>[] = []
  let now = new Date(START)
  let sm2: ReviewSchedule = initSM2('walkthrough', 'skill', now)
  let fsrs: FsrsCardState | null = null
  for (const a of ANSWERS) {
    const s = signals(a, kind)
    let grade: number, gradeName: string, intervalDays: number, dueAt: string, recallBefore: number | null = null
    if (scheduler === 'sm2') {
      grade = kind === 'behaviour_aware' ? adaptiveQuality(a.correct, s) : bktToQuality(a.correct, s.latency_ms)
      sm2 = updateSM2(sm2, grade, now)
      gradeName = `quality ${grade}`
      intervalDays = sm2.interval_days
      dueAt = sm2.due_at
    } else {
      const rating: Grade = kind === 'behaviour_aware' ? adaptiveFsrsRating(a.correct, s) : fsrsRatingFromCorrectness(a.correct, s.latency_ms)
      const next = computeFsrsSchedule(fsrs, rating, now)
      recallBefore = fsrs ? next.retrievability : null
      fsrs = { stability: next.stability, difficulty: next.difficulty, last_review: now.toISOString() }
      grade = rating
      gradeName = FSRS_NAME[rating]
      intervalDays = next.interval_days
      dueAt = next.due_at
    }
    steps.push({
      day: Math.round((now.getTime() - START.getTime()) / DAY_MS), what: a.what, correct: a.correct,
      latency_ms: a.latency_ms, hesitation_ms: a.hesitation_ms, revision_count: a.revision_count,
      grade, gradeName, intervalDays, recallBefore,
    })
    now = new Date(dueAt)  // the learner returns exactly when it is due
  }
  return steps
}

const worlds: Record<string, Record<string, unknown>[]> = {}
for (const scheduler of ['sm2', 'fsrs'] as const) for (const kind of ['measured', 'speed_lost', 'behaviour_aware'] as const) worlds[`${scheduler}_${kind}`] = walk(scheduler, kind)

const out = {
  synthetic: true,
  illustration: true,
  note: 'One hand-scripted learner, always returning exactly on the due date. The grades and intervals come from the app\'s real scheduling functions; the answers do not come from a population.',
  crushed_latency_ms: CRUSHED_LATENCY_MS,
  answers: ANSWERS,
  worlds,
}
const dest = path.resolve(__dirname, '../Research/sim/results/scheduling-walkthrough.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')
for (const [k, steps] of Object.entries(worlds)) console.log(k.padEnd(22), steps.map(s => `${s.gradeName}->${s.intervalDays}d`).join('  '))
console.log('wrote ' + path.relative(process.cwd(), dest))
