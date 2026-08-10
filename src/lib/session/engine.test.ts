import { describe, expect, it } from 'vitest'

import {
  CURRENT_TOPIC_MINIMUM,
  DEFAULT_REVIEW_OFFER_SIZE,
  MAX_REVIEW_ITEMS,
  SESSION_TASK_CAP,
  getSessionGate,
  planReviewDebt,
} from '@/lib/session/engine'

describe('session review-debt policy', () => {
  it('uses the bounded review offer at session capacity', () => {
    const plan = planReviewDebt(MAX_REVIEW_ITEMS)

    expect(SESSION_TASK_CAP).toBe(10)
    expect(plan).toEqual({
      reviewOfferCount: 5,
      additionalReviewCount: 1,
      currentTopicSlots: CURRENT_TOPIC_MINIMUM,
      deferredReviewCount: 0,
    })
  })

  it('rolls excess review debt forward instead of consuming current-topic slots', () => {
    expect(planReviewDebt(14)).toEqual({
      reviewOfferCount: 5,
      additionalReviewCount: 1,
      currentTopicSlots: 4,
      deferredReviewCount: 8,
    })
  })

  it('does not begin or extend a review batch without consent', () => {
    expect(getSessionGate(0, 'review', 0)).toBe('consent_required')
    expect(getSessionGate(4, 'review', 5)).toBe('continue')
    expect(getSessionGate(5, 'review', 5)).toBe('consent_required')
    expect(getSessionGate(5, 'review', 6)).toBe('continue')
    expect(getSessionGate(6, 'review', 6)).toBe('consent_required')
  })

  it('stops every mode at the hard session cap', () => {
    expect(getSessionGate(10, 'learn', 10)).toBe('complete')
    expect(getSessionGate(10, 'review', 10)).toBe('complete')
  })
})
