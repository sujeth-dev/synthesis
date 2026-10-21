// How long a learner took, how long before they first touched the answer, and how
// many times they changed their mind. Kept out of the page components so it can be
// tested directly: vitest.config.mts only collects src/lib/** and src/app/**, and
// asserting on React internals would need jsdom and a renderer this repo does not
// carry. Time enters as an explicit parameter, the same discipline src/lib/sm2 uses
// so the simulator can drive it.

export interface AnswerTiming {
  renderedAt: number
  firstInteractionAt: number | null
  lastValue: string | null
  lastChangeAt: number | null
  revisionCount: number
}

export interface AnswerTimingPayload {
  latency_ms: number
  hesitation_ms: number
  revision_count: number
}

// Typing is not deliberating. Edits closer together than this are one burst of
// the same thought, so they count as a single revision rather than one per key.
export const REVISION_SETTLE_MS = 1500

export function startAnswerTiming(now = Date.now()): AnswerTiming {
  return { renderedAt: now, firstInteractionAt: null, lastValue: null, lastChangeAt: null, revisionCount: 0 }
}

function withInteraction(timing: AnswerTiming, value: string, now: number, isRevision: boolean): AnswerTiming {
  return {
    renderedAt: timing.renderedAt,
    firstInteractionAt: timing.firstInteractionAt ?? now,
    lastValue: value,
    lastChangeAt: now,
    revisionCount: timing.revisionCount + (isRevision ? 1 : 0),
  }
}

export function recordSelection(timing: AnswerTiming, optionId: string, now = Date.now()): AnswerTiming {
  if (optionId === '') return timing
  const changed = timing.lastValue !== null && optionId !== timing.lastValue
  return withInteraction(timing, optionId, now, changed)
}

export function recordTextEdit(timing: AnswerTiming, value: string, now = Date.now()): AnswerTiming {
  if (value.trim() === '') return timing
  const changed = timing.lastValue !== null && value !== timing.lastValue
    && now - (timing.lastChangeAt ?? now) >= REVISION_SETTLE_MS
  return withInteraction(timing, value, now, changed)
}

export function answerTimingPayload(timing: AnswerTiming, now = Date.now()): AnswerTimingPayload {
  const latency = Math.max(0, now - timing.renderedAt)
  const hesitation = Math.max(0, (timing.firstInteractionAt ?? now) - timing.renderedAt)
  return {
    latency_ms: latency,
    hesitation_ms: Math.min(latency, hesitation),
    revision_count: timing.revisionCount,
  }
}
