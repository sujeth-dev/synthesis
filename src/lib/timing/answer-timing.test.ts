import { describe, expect, it } from 'vitest'
import {
  answerTimingPayload, recordSelection, recordTextEdit,
  REVISION_SETTLE_MS, startAnswerTiming,
} from './answer-timing'

describe('answer timing', () => {
  it('measures the time from the question appearing to the answer being sent', () => {
    const timing = recordSelection(startAnswerTiming(1_000), 'b', 5_000)
    expect(answerTimingPayload(timing, 12_000)).toEqual({
      latency_ms: 11_000, hesitation_ms: 4_000, revision_count: 0,
    })
  })

  it('reports an untouched answer as all hesitation, not as none', () => {
    // The old derivation was max(0, latency - 15000), so a learner who stared at
    // a question for ten seconds and submitted blank recorded zero hesitation.
    expect(answerTimingPayload(startAnswerTiming(1_000), 11_000)).toEqual({
      latency_ms: 10_000, hesitation_ms: 10_000, revision_count: 0,
    })
  })

  it('separates thinking time from answering time', () => {
    const slowToStart = recordSelection(startAnswerTiming(0), 'a', 20_000)
    const quickToStart = recordSelection(startAnswerTiming(0), 'a', 500)
    expect(answerTimingPayload(slowToStart, 21_000).latency_ms)
      .toBe(answerTimingPayload(quickToStart, 21_000).latency_ms)
    expect(answerTimingPayload(slowToStart, 21_000).hesitation_ms).toBe(20_000)
    expect(answerTimingPayload(quickToStart, 21_000).hesitation_ms).toBe(500)
  })

  it('counts a changed option as a revision and the first choice as none', () => {
    let timing = startAnswerTiming(0)
    timing = recordSelection(timing, 'a', 1_000)
    timing = recordSelection(timing, 'b', 2_000)
    timing = recordSelection(timing, 'c', 3_000)
    expect(answerTimingPayload(timing, 4_000).revision_count).toBe(2)
  })

  it('ignores re-picking the option already chosen', () => {
    let timing = startAnswerTiming(0)
    for (const at of [1_000, 2_000, 3_000]) timing = recordSelection(timing, 'a', at)
    expect(answerTimingPayload(timing, 4_000).revision_count).toBe(0)
  })

  it('counts a settled rewrite once and keystrokes inside a burst not at all', () => {
    let timing = startAnswerTiming(0)
    for (const [value, at] of [['a', 100], ['ab', 200], ['abc', 300]] as const) {
      timing = recordTextEdit(timing, value, at)
    }
    expect(answerTimingPayload(timing, 400).revision_count).toBe(0)

    timing = recordTextEdit(timing, 'something else', 300 + REVISION_SETTLE_MS)
    expect(answerTimingPayload(timing, 9_000).revision_count).toBe(1)
  })

  it('treats a blank answer as no interaction at all', () => {
    let timing = recordTextEdit(startAnswerTiming(0), '   ', 1_000)
    timing = recordSelection(timing, '', 2_000)
    expect(timing.firstInteractionAt).toBeNull()
    const payload = answerTimingPayload(timing, 5_000)
    expect(payload.hesitation_ms).toBe(payload.latency_ms)
  })

  it('never reports a negative figure, or a hesitation longer than the attempt', () => {
    const timing = recordSelection(startAnswerTiming(10_000), 'a', 30_000)
    expect(answerTimingPayload(timing, 5_000)).toEqual({
      latency_ms: 0, hesitation_ms: 0, revision_count: 0,
    })
  })
})
