/**
 * Which selector serves the next skill (LIVE-1).
 *
 * The rule cascade still builds the pool: every hard constraint — blocked
 * skills, the pinned guided arc, the frustrated-learner intercept, consent for
 * reviews — stays a filter in `selectNextTaskDetailed()`. Under `score` the
 * weighted score then picks from that pool instead of the cascade's first
 * entry. That is exactly the policy `npm run selector:compare` measured, so the
 * numbers signed off at LAB-3 describe what this serves.
 *
 * `SELECTOR=rules` restores the cascade's own pick without a deploy of code.
 *
 * Exploration is off. The measurement that was signed off ran without it, and a
 * 12% random arm in front of real learners is a separate decision.
 */
import type { LearnerSkillState, MotivationStateValue, Question, ReviewSchedule } from '@/types'
import type { Candidate } from './engine'
import { rankCandidates, type RankedCandidates } from './score'
import { toScoreInputs } from './shadow'

export type SelectorMode = 'rules' | 'score'

// Signed off 2026-10-25 (LIVE-1). Anything other than an explicit `rules` is
// the score, so a typo cannot silently fall back.
export function activeSelector(env: Record<string, string | undefined> = process.env): SelectorMode {
  return env.SELECTOR === 'rules' ? 'rules' : 'score'
}

export interface ScoreRanker {
  /** Handed to `selectNextTaskDetailed()` as `rank`. */
  rank: (pool: Candidate[]) => string | null
  /** The ranking behind the last pick, for the selection log and the dashboard. */
  last: () => RankedCandidates | null
}

export function scoreRanker(args: {
  skillStates: Map<string, LearnerSkillState>
  reviewSchedules: Map<string, ReviewSchedule>
  motivation: MotivationStateValue
  questionsCache: Map<string, Question[]>
  /** Skills already served this session, most recent first. */
  recentSkillIds: string[]
  now: Date
  learnerRating: number
}): ScoreRanker {
  let last: RankedCandidates | null = null
  return {
    rank: pool => {
      const inputs = toScoreInputs(
        pool, args.skillStates, args.reviewSchedules, args.motivation, args.questionsCache, new Map(),
      )
      last = rankCandidates(inputs, {
        now: args.now,
        learner_rating: args.learnerRating,
        motivation_state: args.motivation,
        recent_skill_ids: args.recentSkillIds,
      }, () => 1)
      return last.chosen?.skill_id ?? null
    },
    last: () => last,
  }
}
