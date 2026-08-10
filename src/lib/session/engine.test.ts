import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/graph', () => {
  const nodes = [
    {
      id: 'p1_what_is_computer', label: 'What is a Computer?', phase: 'phase_1_computer_basics',
      difficulty_base: 1, question_ids: ['p1_what_is_computer-question'],
      explanation_ids: { beginner: '', mid: '', advanced: '' }, tags: [],
      intuition: '', analogy: '', why_it_matters: '',
    },
    {
      id: 'p1_input_output', label: 'Input & Output', phase: 'phase_1_computer_basics',
      difficulty_base: 1, question_ids: ['p1_input_output-question'],
      explanation_ids: { beginner: '', mid: '', advanced: '' }, tags: [],
      intuition: '', analogy: '', why_it_matters: '',
    },
  ]
  return {
    getAllNodes: () => nodes,
    getNodeById: (id: string) => nodes.find(node => node.id === id),
  }
})

import {
  ARC_SWITCH_THRESHOLD,
  CURRENT_TOPIC_MINIMUM,
  DEFAULT_REVIEW_OFFER_SIZE,
  MAX_REVIEW_ITEMS,
  SESSION_TASK_CAP,
  canChooseTopicSwitch,
  canSelectReview,
  getSessionGate,
  planReviewDebt,
  selectNextTask,
} from '@/lib/session/engine'
import type { LearnerSkillState, MotivationState, Question } from '@/types'

const learnerId = 'learner-1'

function skillState(skillId: string, pKnow: number): LearnerSkillState {
  return {
    learner_id: learnerId,
    skill_id: skillId,
    p_know: pKnow,
    p_slip: 0.1,
    p_guess: 0.2,
    p_transit: 0.15,
    mastery_state: pKnow >= 0.55 ? 'fragile' : pKnow >= 0.3 ? 'learning' : 'ready',
    consecutive_correct: 0,
    consecutive_wrong: 0,
    total_attempts: 0,
    last_attempted_at: null,
    first_seen_at: new Date().toISOString(),
    graph_stale: false,
  }
}

function question(skillId: string): Question {
  return {
    id: `${skillId}-question`,
    skill_id: skillId,
    format: 'mcq',
    difficulty_tier: 'same',
    stem: 'Test question',
  }
}

const motivationState: MotivationState = {
  learner_id: learnerId,
  state: 'neutral',
  consecutive_errors: 0,
  slow_response_streak: 0,
  intervention_cooldown_until: null,
  updated_at: new Date().toISOString(),
}

function selectPinnedTask(pKnow: number, seenCount: number) {
  const pinnedSkillId = 'p1_what_is_computer'
  const weakerSkillId = 'p1_input_output'
  return selectNextTask({
    skillStates: new Map([
      [pinnedSkillId, skillState(pinnedSkillId, pKnow)],
      [weakerSkillId, skillState(weakerSkillId, 0.1)],
    ]),
    reviewSchedules: new Map(),
    motivationState,
    seenSkillsThisSession: Array.from({ length: seenCount }, () => pinnedSkillId),
    seenQuestionIdsThisSession: new Set(),
    questionsCache: new Map([
      [pinnedSkillId, [question(pinnedSkillId)]],
      [weakerSkillId, [question(weakerSkillId)]],
    ]),
    currentSkillId: pinnedSkillId,
  })
}

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

  it('selects review candidates only in explicit review mode', () => {
    expect(canSelectReview('active_phase')).toBe(false)
    expect(canSelectReview('past_phase')).toBe(false)
    expect(canSelectReview('active_phase', 'review')).toBe(true)
    expect(canSelectReview('past_phase', 'review')).toBe(true)
  })
})

describe('session topic arc memory', () => {
  it('holds the current topic indefinitely below the switch-choice threshold', () => {
    expect(selectPinnedTask(ARC_SWITCH_THRESHOLD - 0.01, 100)?.skill_id)
      .toBe('p1_what_is_computer')
  })

  it('holds the current topic indefinitely above the threshold until the learner chooses', () => {
    expect(selectPinnedTask(ARC_SWITCH_THRESHOLD + 0.01, 100)?.skill_id)
      .toBe('p1_what_is_computer')
  })

  it('unlocks the stay-or-switch choice exactly at the threshold', () => {
    expect(canChooseTopicSwitch(ARC_SWITCH_THRESHOLD - 0.01)).toBe(false)
    expect(canChooseTopicSwitch(ARC_SWITCH_THRESHOLD)).toBe(true)
    expect(canChooseTopicSwitch(ARC_SWITCH_THRESHOLD + 0.01)).toBe(true)
  })
})
