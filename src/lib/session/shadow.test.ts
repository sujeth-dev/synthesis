import { describe, it, expect } from 'vitest'
import type { LearnerSkillState, Question, ReviewSchedule } from '@/types'
import { ELO_START } from '@/lib/elo'
import type { Candidate, SelectionTrace } from './engine'
import type { CandidateScore } from './score'
import {
  RUNNERS_UP_LOGGED, ratingForSkillTier, toScoreInputs, buildSelectionShadowRow, shadowSelection,
} from './shadow'

const NOW = new Date('2026-10-25T12:00:00.000Z')

function skillState(skillId: string, over: Partial<LearnerSkillState> = {}): LearnerSkillState {
  return {
    learner_id: 'learner-shadow-test', skill_id: skillId,
    p_know: 0.40, p_slip: 0.10, p_guess: 0.20, p_transit: 0.15,
    mastery_state: 'learning', consecutive_correct: 0, consecutive_wrong: 0,
    total_attempts: 4, last_attempted_at: null, first_seen_at: '2026-10-01T12:00:00.000Z', graph_stale: false,
    ...over,
  }
}

function reviewSchedule(skillId: string, daysOverdue: number): ReviewSchedule {
  return {
    learner_id: 'learner-shadow-test', skill_id: skillId,
    interval_days: 10, ease_factor: 2.5, repetitions: 3,
    due_at: new Date(NOW.getTime() - daysOverdue * 86_400_000).toISOString(),
    last_reviewed_at: '2026-10-05T12:00:00.000Z',
  }
}

function question(id: string, skillId: string, tier: Question['difficulty_tier']): Question {
  return { id, skill_id: skillId, format: 'mcq', difficulty_tier: tier }
}

function candidate(skillId: string, over: Partial<Candidate> = {}): Candidate {
  return {
    skill_id: skillId, tier: 1, reason: 'active_phase_new',
    days_until_due: 0, phase_context: 'active_phase', ...over,
  }
}

function trace(over: Partial<SelectionTrace> = {}): SelectionTrace {
  const candidates = [candidate('alpha'), candidate('beta')]
  return {
    task: null, branch: 'tiers', candidates,
    chosen: candidates[0], served: candidates[0], difficulty_tier: 'same', ...over,
  }
}

function score(skillId: string, value: number): CandidateScore {
  return { skill_id: skillId, score: value, terms: [], reason: `Chosen because ${skillId}.`, guards: [] }
}

describe('rating a skill at the tier that would be served (SCORE-3)', () => {
  const cache = new Map<string, Question[]>([
    ['alpha', [
      question('a_review', 'alpha', 'review'),
      question('a_same_1', 'alpha', 'same'),
      question('a_same_2', 'alpha', 'same'),
    ]],
  ])

  it('averages only the questions at that tier', () => {
    const ratings = new Map([['a_same_1', 1100], ['a_same_2', 1300], ['a_review', 500]])
    expect(ratingForSkillTier('alpha', 'same', cache, ratings)).toBe(1200)
  })

  it('ignores questions at that tier that nobody has answered yet', () => {
    const ratings = new Map([['a_same_1', 1100]])
    expect(ratingForSkillTier('alpha', 'same', cache, ratings)).toBe(1100)
  })

  it('is null when no question at that tier has ever been answered', () => {
    expect(ratingForSkillTier('alpha', 'harder', cache, new Map())).toBeNull()
    expect(ratingForSkillTier('alpha', 'same', cache, new Map())).toBeNull()
  })

  it('is null for a skill with no questions loaded at all', () => {
    expect(ratingForSkillTier('missing', 'same', cache, new Map([['x', 1200]]))).toBeNull()
  })
})

describe('mapping the cascade’s pool onto score inputs (SCORE-3)', () => {
  const states = new Map([['alpha', skillState('alpha')], ['beta', skillState('beta')]])
  const schedules = new Map([['alpha', reviewSchedule('alpha', 3)]])
  const cache = new Map<string, Question[]>([['alpha', [question('a_same', 'alpha', 'same')]]])

  it('carries each candidate’s state, schedule and served tier', () => {
    const inputs = toScoreInputs(
      [candidate('alpha'), candidate('beta')], states, schedules, 'neutral', cache, new Map([['a_same', 1150]]),
    )
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toMatchObject({ skill_id: 'alpha', difficulty_tier: 'same', question_rating: 1150 })
    expect(inputs[0].schedule?.skill_id).toBe('alpha')
    expect(inputs[1]).toMatchObject({ skill_id: 'beta', question_rating: null })
    expect(inputs[1].schedule).toBeNull()
  })

  it('reads the same tier rule the cascade uses, per candidate', () => {
    const stuck = new Map([['alpha', skillState('alpha', { consecutive_wrong: 2 })]])
    const inputs = toScoreInputs([candidate('alpha')], stuck, schedules, 'neutral', cache, new Map())
    expect(inputs[0].difficulty_tier).toBe('review')
  })

  it('drops a candidate whose state is missing rather than inventing one', () => {
    const inputs = toScoreInputs([candidate('ghost')], states, schedules, 'neutral', cache, new Map())
    expect(inputs).toEqual([])
  })
})

describe('the comparison row (SCORE-3)', () => {
  it('records agreement when both chose the same skill', () => {
    const row = buildSelectionShadowRow(trace(), score('alpha', 0.7), [score('alpha', 0.7)], false, 'session-1')
    expect(row.agreed).toBe(true)
    expect(row.rule_skill_id).toBe('alpha')
    expect(row.score_skill_id).toBe('alpha')
  })

  it('records disagreement when the score would have picked elsewhere', () => {
    const row = buildSelectionShadowRow(trace(), score('beta', 0.8), [score('beta', 0.8), score('alpha', 0.4)], false, 'session-1')
    expect(row.agreed).toBe(false)
    expect(row.score_reason).toContain('beta')
  })

  it('carries what the score made of the cascade’s own pick, so a gap can be read', () => {
    const row = buildSelectionShadowRow(trace(), score('beta', 0.8), [score('beta', 0.8), score('alpha', 0.4)], false, null)
    expect(row.rule_score_value).toBe(0.4)
    expect(row.score_value).toBe(0.8)
  })

  // The artifact this exists to catch: on freshly placed skills every candidate
  // scores identically, so `agreed` goes false on nothing but a tie-break.
  it('marks a disagreement as tied when the two scores are effectively equal', () => {
    const ranked = [score('beta', 0.3094), score('alpha', 0.3094)]
    const row = buildSelectionShadowRow(trace(), ranked[0], ranked, false, null)
    expect(row.agreed).toBe(false)
    expect(row.tied).toBe(true)
  })

  it('does not mark a real preference as tied', () => {
    const ranked = [score('beta', 0.72), score('alpha', 0.41)]
    const row = buildSelectionShadowRow(trace(), ranked[0], ranked, false, null)
    expect(row.tied).toBe(false)
  })

  it('is not tied when the score could not rate the cascade’s pick at all', () => {
    const row = buildSelectionShadowRow(trace(), score('beta', 0.5), [score('beta', 0.5)], false, null)
    expect(row.rule_score_value).toBeNull()
    expect(row.tied).toBe(false)
  })

  it('does not call it agreement when the score chose nothing', () => {
    const row = buildSelectionShadowRow(trace(), null, [], false, null)
    expect(row.agreed).toBe(false)
    expect(row.score_skill_id).toBeNull()
    expect(row.score_value).toBeNull()
  })

  it('does not call it agreement when the cascade chose nothing', () => {
    const row = buildSelectionShadowRow(trace({ chosen: null }), score('alpha', 0.7), [], false, null)
    expect(row.agreed).toBe(false)
    expect(row.rule_skill_id).toBeNull()
  })

  it('keeps the runners-up it passed over, excluding its own pick', () => {
    const ranked = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => score(id, 1 - i / 10))
    const row = buildSelectionShadowRow(trace(), ranked[0], ranked, false, null)
    const runners = row.runners_up as { skill_id: string }[]
    expect(runners).toHaveLength(RUNNERS_UP_LOGGED)
    expect(runners.map(r => r.skill_id)).not.toContain('a')
    expect(runners[0].skill_id).toBe('b')
  })

  it('carries the branch, the pool size and the served tier for a later audit', () => {
    const row = buildSelectionShadowRow(
      trace({ branch: 'review_mode', difficulty_tier: 'review' }), score('alpha', 0.9), [], false, 'session-9',
    )
    expect(row).toMatchObject({
      branch: 'review_mode', rule_tier: 'review', candidate_count: 2, session_id: 'session-9',
    })
  })

  it('is never marked applied — nothing here has changed a learner’s session', () => {
    const row = buildSelectionShadowRow(trace(), score('alpha', 0.7), [], false, null)
    expect(row.applied).toBe(false)
  })

  it('is marked applied when the score’s pick was the one served (LIVE-1)', () => {
    const row = buildSelectionShadowRow(trace(), score('beta', 0.8), [score('beta', 0.8)], false, null, true)
    expect(row.applied).toBe(true)
    expect(row.rule_skill_id).toBe('alpha')
    expect(row.score_skill_id).toBe('beta')
  })
})

describe('shadowing a whole selection (SCORE-3)', () => {
  const states = new Map([['alpha', skillState('alpha')], ['beta', skillState('beta', { p_know: 0.8 })]])
  const schedules = new Map([['alpha', reviewSchedule('alpha', 6)], ['beta', reviewSchedule('beta', 1)]])

  const args = {
    trace: trace(), skillStates: states, reviewSchedules: schedules,
    motivation: 'neutral' as const, questionsCache: new Map<string, Question[]>(),
    questionRatings: new Map<string, number>(), learnerRating: ELO_START,
    recentSkillIds: [], sessionId: 'session-1', now: NOW,
  }

  it('says nothing when the cascade had no real choice to make', () => {
    expect(shadowSelection({ ...args, trace: trace({ candidates: [candidate('alpha')] }) })).toBeNull()
    expect(shadowSelection({ ...args, trace: trace({ candidates: [] }) })).toBeNull()
  })

  it('produces a row when there were at least two candidates to rank', () => {
    const row = shadowSelection({ ...args, next: () => 1 })
    expect(row).not.toBeNull()
    expect(row?.candidate_count).toBe(2)
    expect(row?.score_skill_id).toBeTruthy()
  })

  it('flags an exploration pick so it can be excluded from agreement statistics', () => {
    expect(shadowSelection({ ...args, next: () => 0 })?.explored).toBe(true)
    expect(shadowSelection({ ...args, next: () => 1 })?.explored).toBe(false)
  })

  it('says nothing when none of the candidates has a state to score', () => {
    expect(shadowSelection({ ...args, skillStates: new Map() })).toBeNull()
  })
})
