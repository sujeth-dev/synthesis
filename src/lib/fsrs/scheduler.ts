import type { ReviewSchedule } from '@/types'
import type { FsrsSchedule } from './index'

// FSRS-5: which scheduler sets live review due dates. SM-2 unless a
// deployment opts in with SCHEDULER=fsrs (after reviewing the FSRS-4
// comparison) — switching back is just unsetting it.
export type SchedulerKind = 'sm2' | 'fsrs'

export function activeScheduler(env: Record<string, string | undefined> = process.env): SchedulerKind {
  return env.SCHEDULER === 'fsrs' ? 'fsrs' : 'sm2'
}

// The schedule to persist. SM-2's bookkeeping (repetitions, ease) is always
// kept up to date so either scheduler can be switched on at any time; under
// FSRS only the interval and due date come from FSRS. No FSRS result (e.g.
// its shadow history couldn't be read) falls back to SM-2's own schedule.
export function chooseSchedule(sm2: ReviewSchedule, fsrs: FsrsSchedule | null, kind: SchedulerKind): ReviewSchedule {
  if (kind !== 'fsrs' || !fsrs) return sm2
  return { ...sm2, interval_days: fsrs.interval_days, due_at: fsrs.due_at }
}
