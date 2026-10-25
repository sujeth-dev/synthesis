import { describe, it, expect } from 'vitest'
import type { DifficultyTier, LearnerSkillState, MotivationStateValue, ReviewSchedule } from '@/types'
import { MASTERY_THRESHOLD } from '@/lib/bkt'
import { ELO_START } from '@/lib/elo'
import {
  SCORE_WEIGHTS, TARGET_SUCCESS, MAX_EXPECTED_MOVEMENT, URGENCY_SATURATION_INTERVALS,
  WHEEL_SPIN_WRONG, WHEEL_SPIN_PENALTY, VARIETY_WINDOW, EXPLORATION_RATE,
  urgencyTerm, expectedBktMovement, masteryHeadroom, gainTerm, bestQuestionByRating, behaviourTerm,
  cognitiveTerm, varietyTerm, scoreCandidate, rankCandidates,
  type ScoreCandidateInput, type ScoreContext, type ScoreTermName,
} from './score'

const NOW = new Date('2026-10-25T12:00:00.000Z')

function skillState(over: Partial<LearnerSkillState> = {}): LearnerSkillState {
  return {
    learner_id: 'learner-score-test', skill_id: 'p1_binary_numbers',
    p_know: 0.40, p_slip: 0.10, p_guess: 0.20, p_transit: 0.15,
    mastery_state: 'learning', consecutive_correct: 0, consecutive_wrong: 0,
    total_attempts: 4, last_attempted_at: '2026-10-20T12:00:00.000Z',
    first_seen_at: '2026-10-01T12:00:00.000Z', graph_stale: false,
    ...over,
  }
}

/** A schedule `daysOverdue` past its due date, on a 10-day interval. */
function schedule(daysOverdue: number, over: Partial<ReviewSchedule> = {}): ReviewSchedule {
  return {
    learner_id: 'learner-score-test', skill_id: 'p1_binary_numbers',
    interval_days: 10, ease_factor: 2.5, repetitions: 3,
    due_at: new Date(NOW.getTime() - daysOverdue * 86_400_000).toISOString(),
    last_reviewed_at: '2026-10-05T12:00:00.000Z',
    ...over,
  }
}

function context(over: Partial<ScoreContext> = {}): ScoreContext {
  return {
    now: NOW, learner_rating: ELO_START,
    motivation_state: 'neutral' as MotivationStateValue,
    recent_skill_ids: [],
    ...over,
  }
}

function candidate(over: Partial<ScoreCandidateInput> = {}): ScoreCandidateInput {
  return {
    skill_id: 'p1_binary_numbers', state: skillState(), schedule: null,
    difficulty_tier: 'same' as DifficultyTier, question_rating: null,
    ...over,
  }
}

describe('score weights (SCORE-2)', () => {
  it('sum to exactly one, so a score reads as a fraction of the best possible', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
  })

  // Retention and progress are the two things a selector is actually for:
  // not forgetting what was learned, and not stalling. They are weighted
  // equally and above everything else, which is the shape left after SCORE-4
  // removed the difficulty-match term and redistributed its 0.20.
  it('weight retention and progress equally, and above every other signal', () => {
    expect(SCORE_WEIGHTS.urgency).toBe(SCORE_WEIGHTS.gain)
    const others = (Object.keys(SCORE_WEIGHTS) as ScoreTermName[])
      .filter(name => name !== 'urgency' && name !== 'gain')
    for (const name of others) {
      expect(SCORE_WEIGHTS.urgency, name).toBeGreaterThan(SCORE_WEIGHTS[name])
    }
  })
})

describe('urgency term (SCORE-2)', () => {
  it('is nothing for a skill that has never been scheduled', () => {
    expect(urgencyTerm(null, NOW)).toBe(0)
  })

  it('is nothing for a skill scheduled but never actually reviewed', () => {
    expect(urgencyTerm(schedule(0, { repetitions: 0 }), NOW)).toBe(0)
  })

  it('is nothing the moment a review lands and the next interval starts', () => {
    expect(urgencyTerm(schedule(-10), NOW)).toBe(0)
  })

  it('is half on the due date', () => {
    expect(urgencyTerm(schedule(0), NOW)).toBeCloseTo(1 / URGENCY_SATURATION_INTERVALS, 6)
  })

  it('saturates a full interval past due rather than growing without bound', () => {
    expect(urgencyTerm(schedule(10), NOW)).toBe(1)
    expect(urgencyTerm(schedule(400), NOW)).toBe(1)
  })

  it('is scale-free: one interval overdue reads the same on a 1-day and a 60-day schedule', () => {
    const short = urgencyTerm(schedule(1, { interval_days: 1 }), NOW)
    const long = urgencyTerm(schedule(60, { interval_days: 60 }), NOW)
    expect(short).toBeCloseTo(long, 6)
  })

  it('rises monotonically with how overdue the skill is', () => {
    const readings = [-5, 0, 2, 5, 9].map(d => urgencyTerm(schedule(d), NOW))
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i], `${i} steps overdue`).toBeGreaterThan(readings[i - 1])
    }
  })
})

describe('expected learning gain (SCORE-2)', () => {
  // The whole justification for the term: a half-known skill is where an answer
  // tells us the most, which this measures through the real BKT update rather
  // than asserting.
  it('peaks in the middle of the probability scale, not at either end', () => {
    const mid = expectedBktMovement(skillState({ p_know: 0.5 }))
    expect(mid).toBeGreaterThan(expectedBktMovement(skillState({ p_know: 0.05 })))
    expect(mid).toBeGreaterThan(expectedBktMovement(skillState({ p_know: 0.95 })))
  })

  it('never exceeds the normalisation constant it was measured against', () => {
    for (let p = 0.01; p < 1; p += 0.01) {
      expect(expectedBktMovement(skillState({ p_know: p })), `p_know ${p.toFixed(2)}`)
        .toBeLessThanOrEqual(MAX_EXPECTED_MOVEMENT)
    }
  })

  it('stays on 0-1 across the whole scale', () => {
    for (let p = 0.01; p < 1; p += 0.01) {
      const term = gainTerm(skillState({ p_know: p }))
      expect(term, `p_know ${p.toFixed(2)}`).toBeGreaterThanOrEqual(0)
      expect(term, `p_know ${p.toFixed(2)}`).toBeLessThanOrEqual(1)
    }
  })

  it('falls away as a skill approaches certainty', () => {
    expect(gainTerm(skillState({ p_know: 0.99 })))
      .toBeLessThan(gainTerm(skillState({ p_know: 0.60 })))
  })

  // The correction SCORE-4's measurement forced. Scoring by expected movement
  // alone preferred half-known skills over unlearned ones, which parked
  // simulated learners and taught them fewer skills than the rule cascade.
  it('prefers an unlearned skill over a half-known one, not the reverse', () => {
    expect(gainTerm(skillState({ p_know: 0.10 })))
      .toBeGreaterThan(gainTerm(skillState({ p_know: 0.50 })))
  })

  it('is worth nothing once a skill is past the mastery threshold', () => {
    expect(masteryHeadroom(MASTERY_THRESHOLD)).toBe(0)
    expect(gainTerm(skillState({ p_know: MASTERY_THRESHOLD }))).toBe(0)
    expect(gainTerm(skillState({ p_know: 0.95 }))).toBe(0)
  })

  // Not monotone, and deliberately asserted as it actually is rather than as it
  // would be tidier: headroom falls fastest where movement rises fastest, so the
  // curve dips around p_know 0.2 and recovers near 0.3 before collapsing into
  // mastery. What matters is that its maximum is at the unlearned end and that
  // it reaches zero at mastery — a strictly monotone version is not required and
  // valuing a nearly-there skill a little above a barely-started one is sound.
  it('has its maximum at the unlearned end of the scale', () => {
    let peak = { p: 0, value: -1 }
    for (let p = 0.01; p < 1; p += 0.01) {
      const value = gainTerm(skillState({ p_know: p }))
      if (value > peak.value) peak = { p, value }
    }
    expect(peak.p).toBeLessThan(0.1)
  })

  it('values every unmastered skill above every mastered one', () => {
    const unmastered = [0.05, 0.2, 0.35, 0.5, 0.6].map(p => gainTerm(skillState({ p_know: p })))
    const mastered = [0.65, 0.8, 0.99].map(p => gainTerm(skillState({ p_know: p })))
    for (const below of unmastered) {
      for (const above of mastered) expect(below).toBeGreaterThan(above)
    }
  })

  it('keeps the measured mid-range property in the movement it is built from', () => {
    expect(masteryHeadroom(0)).toBe(1)
    expect(expectedBktMovement(skillState({ p_know: 0.5 })))
      .toBeGreaterThan(expectedBktMovement(skillState({ p_know: 0.1 })))
  })
})

// Removed from the candidate score after SCORE-4 measured it: a target success
// rate compares like with like only within one skill. These cover its coherent
// form — choosing between the questions of a single skill.
describe('matching a question to the target success rate (SCORE-2)', () => {
  const atTarget = ELO_START + 400 * Math.log10(1 / TARGET_SUCCESS - 1)
  const questions = [
    { id: 'far_too_hard' }, { id: 'on_target' }, { id: 'far_too_easy' },
  ]
  const ratings = new Map([
    ['far_too_hard', ELO_START + 600],
    ['on_target', atTarget],
    ['far_too_easy', ELO_START - 900],
  ])

  it('picks the question closest to the target', () => {
    expect(bestQuestionByRating(questions, ELO_START, ratings)?.id).toBe('on_target')
  })

  it('ignores questions nobody has answered yet rather than guessing their difficulty', () => {
    const partial = new Map([['far_too_hard', ELO_START + 600]])
    expect(bestQuestionByRating(questions, ELO_START, partial)?.id).toBe('far_too_hard')
  })

  it('returns null when none of them is calibrated, leaving the caller as it was', () => {
    expect(bestQuestionByRating(questions, ELO_START, new Map())).toBeNull()
    expect(bestQuestionByRating([], ELO_START, ratings)).toBeNull()
  })

  it('follows the target it is given, not only the default', () => {
    // A much lower target should prefer the hardest question on the list.
    expect(bestQuestionByRating(questions, ELO_START, ratings, 0.1)?.id).toBe('far_too_hard')
  })
})

describe('behaviour fit (SCORE-2)', () => {
  it('sends a frustrated learner toward what they already know', () => {
    expect(behaviourTerm(skillState({ p_know: 0.85 }), 'frustrated'))
      .toBeGreaterThan(behaviourTerm(skillState({ p_know: 0.15 }), 'frustrated'))
  })

  it('sends a bored learner toward what they do not', () => {
    expect(behaviourTerm(skillState({ p_know: 0.15 }), 'bored'))
      .toBeGreaterThan(behaviourTerm(skillState({ p_know: 0.85 }), 'bored'))
  })

  it('expresses no preference when the session is going normally', () => {
    for (const state of ['neutral', 'winning'] as MotivationStateValue[]) {
      expect(behaviourTerm(skillState({ p_know: 0.15 }), state), state)
        .toBe(behaviourTerm(skillState({ p_know: 0.85 }), state))
    }
  })
})

describe('cognitive demand (SCORE-2)', () => {
  it('asks a learner who cannot recall it yet to recall it, not to apply it', () => {
    const weak = skillState({ p_know: 0.10 })
    expect(cognitiveTerm(weak, 'review')).toBeGreaterThan(cognitiveTerm(weak, 'harder'))
  })

  it('pushes a learner who already knows it past recall', () => {
    const strong = skillState({ p_know: 0.70 })
    expect(cognitiveTerm(strong, 'harder')).toBeGreaterThan(cognitiveTerm(strong, 'review'))
  })

  it('stays on 0-1 for every tier at both ends of mastery', () => {
    for (const tier of ['prerequisite', 'review', 'same', 'harder'] as DifficultyTier[]) {
      for (const p of [0.01, 0.29, 0.31, 0.99]) {
        const term = cognitiveTerm(skillState({ p_know: p }), tier)
        expect(term, `${tier} at ${p}`).toBeGreaterThanOrEqual(0)
        expect(term, `${tier} at ${p}`).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('variety (SCORE-2)', () => {
  it('is full for a skill that has not come up this session', () => {
    expect(varietyTerm('p2_recursion', ['p1_loops', 'p1_variables'])).toBe(1)
  })

  it('is nothing for the skill just served', () => {
    expect(varietyTerm('p1_loops', ['p1_loops', 'p1_variables'])).toBe(0)
  })

  it('recovers the further back the skill was served', () => {
    const window = ['a', 'b', 'c', 'd', 'e']
    const readings = window.map(skill => varietyTerm(skill, window))
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i], window[i]).toBeGreaterThan(readings[i - 1])
    }
  })

  it('forgets anything older than the interleaving window', () => {
    const older = Array.from({ length: VARIETY_WINDOW }, (_, i) => `recent-${i}`)
    expect(varietyTerm('long-ago', [...older, 'long-ago'])).toBe(1)
  })
})

describe('scoring a candidate (SCORE-2)', () => {
  it('reports every weighted term and a score that is their sum', () => {
    const result = scoreCandidate(candidate({ schedule: schedule(3) }), context())
    expect(result.terms).toHaveLength(Object.keys(SCORE_WEIGHTS).length)
    const summed = result.terms.reduce((total, term) => total + term.contribution, 0)
    expect(result.score).toBeCloseTo(summed, 10)
  })

  it('keeps every term and the score itself on 0-1', () => {
    for (const p of [0.01, 0.4, 0.99]) {
      for (const overdue of [-5, 0, 20]) {
        const result = scoreCandidate(
          candidate({ state: skillState({ p_know: p }), schedule: schedule(overdue) }),
          context(),
        )
        for (const term of result.terms) {
          expect(term.raw, `${term.name} p=${p} overdue=${overdue}`).toBeGreaterThanOrEqual(0)
          expect(term.raw, `${term.name} p=${p} overdue=${overdue}`).toBeLessThanOrEqual(1)
        }
        expect(result.score).toBeGreaterThanOrEqual(0)
        expect(result.score).toBeLessThanOrEqual(1)
      }
    }
  })

  it('explains itself in a sentence naming its strongest term', () => {
    const result = scoreCandidate(candidate({ schedule: schedule(20) }), context())
    expect(result.reason).toMatch(/^Chosen because /)
    expect(result.reason).toContain('review date')
  })
})

describe('score invariants that must hold before this can ever go live (SCORE-2)', () => {
  it('scores a blocked skill at zero however attractive it otherwise looks', () => {
    const result = scoreCandidate(
      candidate({ state: skillState({ p_know: 0.5, mastery_state: 'blocked' }), schedule: schedule(30) }),
      context(),
    )
    expect(result.score).toBe(0)
    expect(result.guards).toContain('blocked')
  })

  it('never returns a blocked skill as the choice, even as the only candidate', () => {
    const result = rankCandidates(
      [candidate({ state: skillState({ mastery_state: 'blocked' }), schedule: schedule(30) })],
      context(),
    )
    expect(result.chosen).toBeNull()
  })

  it('ranks the more overdue of two otherwise identical skills first', () => {
    const result = rankCandidates([
      candidate({ skill_id: 'slightly', schedule: schedule(1) }),
      candidate({ skill_id: 'badly', schedule: schedule(9) }),
    ], context())
    expect(result.chosen?.skill_id).toBe('badly')
  })

  it('ranks an unmastered skill above a mastered one on the same schedule', () => {
    const result = rankCandidates([
      candidate({ skill_id: 'mastered', state: skillState({ p_know: 0.95, mastery_state: 'mastered' }), schedule: schedule(4) }),
      candidate({ skill_id: 'shaky', state: skillState({ p_know: 0.50 }), schedule: schedule(4) }),
    ], context())
    expect(result.chosen?.skill_id).toBe('shaky')
    expect(skillState({ p_know: 0.95 }).p_know).toBeGreaterThan(MASTERY_THRESHOLD)
  })

  it('demotes a skill the learner is stuck on rather than grinding it', () => {
    const stuck = candidate({ state: skillState({ consecutive_wrong: WHEEL_SPIN_WRONG }), schedule: schedule(9) })
    const unstuck = candidate({ state: skillState({ consecutive_wrong: 0 }), schedule: schedule(9) })
    const penalised = scoreCandidate(stuck, context())
    const plain = scoreCandidate(unstuck, context())
    expect(penalised.guards).toContain('wheel_spin')
    expect(penalised.score).toBeCloseTo(plain.score * WHEEL_SPIN_PENALTY, 10)
    expect(penalised.reason).toContain('grinding it further')
  })

  it('does not penalise a skill one wrong answer short of stuck', () => {
    const nearly = scoreCandidate(
      candidate({ state: skillState({ consecutive_wrong: WHEEL_SPIN_WRONG - 1 }) }), context(),
    )
    expect(nearly.guards).not.toContain('wheel_spin')
  })
})

describe('exploration (SCORE-2)', () => {
  const pool = [
    candidate({ skill_id: 'top', schedule: schedule(9) }),
    candidate({ skill_id: 'second', schedule: schedule(4) }),
    candidate({ skill_id: 'third', schedule: schedule(1) }),
  ]

  it('takes the best candidate when the draw says exploit', () => {
    const result = rankCandidates(pool, context(), () => 1)
    expect(result.chosen?.skill_id).toBe('top')
    expect(result.explored).toBe(false)
  })

  it('takes a runner-up when the draw says explore', () => {
    const result = rankCandidates(pool, context(), () => 0)
    expect(result.chosen?.skill_id).not.toBe('top')
    expect(result.explored).toBe(true)
  })

  it('still returns the full ranking when it explores, so the log shows what it passed over', () => {
    const result = rankCandidates(pool, context(), () => 0)
    expect(result.ranked.map(c => c.skill_id)).toEqual(['top', 'second', 'third'])
  })

  it('never explores when there is nothing to explore to', () => {
    const result = rankCandidates([pool[0]], context(), () => 0)
    expect(result.chosen?.skill_id).toBe('top')
    expect(result.explored).toBe(false)
  })

  it('explores at roughly the documented rate over many draws', () => {
    let draws = 0
    let explored = 0
    // A fixed sweep rather than a PRNG: each draw feeds the same value to both
    // the rate check and the index pick, so the count is exact and reproducible.
    for (let i = 0; i < 1000; i++) {
      const value = i / 1000
      draws += 1
      if (rankCandidates(pool, context(), () => value).explored) explored += 1
    }
    expect(explored / draws).toBeCloseTo(EXPLORATION_RATE, 2)
  })

  it('breaks exact ties by skill id so a ranking is never order-dependent', () => {
    const forward = rankCandidates([candidate({ skill_id: 'b' }), candidate({ skill_id: 'a' })], context())
    const reverse = rankCandidates([candidate({ skill_id: 'a' }), candidate({ skill_id: 'b' })], context())
    expect(forward.ranked.map(c => c.skill_id)).toEqual(reverse.ranked.map(c => c.skill_id))
  })

  it('returns nothing for an empty pool rather than inventing a task', () => {
    expect(rankCandidates([], context()).chosen).toBeNull()
  })
})
