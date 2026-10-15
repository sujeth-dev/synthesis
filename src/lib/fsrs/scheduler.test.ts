import { describe, expect, it } from 'vitest'
import { activeScheduler, chooseSchedule } from './scheduler'
import type { ReviewSchedule } from '@/types'
import type { FsrsSchedule } from './index'

const sm2: ReviewSchedule = {
  learner_id: 'l', skill_id: 's', interval_days: 1, ease_factor: 2.5, repetitions: 1,
  due_at: '2026-01-02T00:00:00.000Z', last_reviewed_at: '2026-01-01T00:00:00.000Z',
}
const fsrs: FsrsSchedule = { stability: 8, difficulty: 5, retrievability: 1, interval_days: 8, due_at: '2026-01-09T00:00:00.000Z' }

describe('FSRS-5 scheduler switch', () => {
  it('defaults to SM-2 and only switches on SCHEDULER=fsrs', () => {
    expect(activeScheduler({})).toBe('sm2')
    expect(activeScheduler({ SCHEDULER: 'FSRS' })).toBe('sm2')
    expect(activeScheduler({ SCHEDULER: 'fsrs' })).toBe('fsrs')
  })

  it('keeps the SM-2 schedule untouched under SM-2', () => {
    expect(chooseSchedule(sm2, fsrs, 'sm2')).toBe(sm2)
  })

  it('takes interval and due date from FSRS but keeps SM-2 bookkeeping', () => {
    expect(chooseSchedule(sm2, fsrs, 'fsrs')).toEqual({ ...sm2, interval_days: 8, due_at: fsrs.due_at })
  })

  it('falls back to SM-2 when FSRS has no result', () => {
    expect(chooseSchedule(sm2, null, 'fsrs')).toBe(sm2)
  })
})
