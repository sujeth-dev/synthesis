import { fsrs, generatorParameters, createEmptyCard, State, Rating, type Card, type Grade } from 'ts-fsrs'

// enable_short_term: false collapses FSRS's sub-day Learning/Relearning steps so
// every interval lands on whole days, comparable to SM-2's day-granular schedule
// (see probe: default learning_steps otherwise schedule the first review 10
// minutes out, not days). All other parameters are ts-fsrs's own published
// defaults — never re-derived here.
const scheduler = fsrs(generatorParameters({ enable_short_term: false }))

export interface FsrsSchedule {
  stability: number
  difficulty: number
  retrievability: number
  interval_days: number
  due_at: string
}

// Minimal resumable state for a shadow-mode card: only stability, difficulty,
// and last_review feed the FSRS formulas once a card has left the New state
// (verified against ts-fsrs's own scheduler — due/reps/lapses/scheduled_days
// don't affect next() or get_retrievability() output). null means no prior
// shadow review exists yet for this learner/skill pair.
export interface FsrsCardState {
  stability: number
  difficulty: number
  last_review: string
}

function toCard(previous: FsrsCardState | null, now: Date): Card {
  if (!previous) return createEmptyCard(now)
  return {
    due: now,
    stability: previous.stability,
    difficulty: previous.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: State.Review,
    last_review: new Date(previous.last_review),
  }
}

export function computeFsrsSchedule(
  previous: FsrsCardState | null,
  rating: Grade,
  now = new Date(),
): FsrsSchedule {
  const card = toCard(previous, now)
  const retrievability = scheduler.get_retrievability(card, now, false)
  const { card: next } = scheduler.next(card, now, rating)
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    retrievability,
    interval_days: next.scheduled_days,
    due_at: next.due.toISOString(),
  }
}

// Analogous to sm2's bktToQuality: maps correctness + response latency onto
// FSRS's 4-point Again/Hard/Good/Easy scale using the same latency tiers, so
// the two schedulers see the same evidence about each attempt.
export function fsrsRatingFromCorrectness(correct: boolean, latency_ms: number): Grade {
  if (!correct) return Rating.Again
  if (latency_ms < 3000) return Rating.Easy
  if (latency_ms < 8000) return Rating.Good
  return Rating.Hard
}

export { Rating } from 'ts-fsrs'
export type { Grade } from 'ts-fsrs'
