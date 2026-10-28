/**
 * What the dashboard says comes next (OLM-5, LIVE-1): the pick a session will
 * actually serve, with the score's per-term reasons, beside the pick the other
 * selector would have made on the same pool.
 *
 * It runs the same selection the session route does, through the same
 * `scoreRanker`, so under SELECTOR=score the dashboard's "starts with" is the
 * score's pick and under SELECTOR=rules it is the cascade's, with the score
 * shown as advisory.
 *
 * Read-only: no state is written, and exploration is off, so the same state
 * always gives the same suggestion.
 */
import fs from 'fs'
import path from 'path'
import type {
  LearnerSkillState, MotivationState, Question, ReviewSchedule, TaskReason,
} from '@/types'
import { selectNextTaskDetailed } from './engine'
import type { CandidateScore } from './score'
import { SCORE_TIE_EPSILON } from './shadow'
import { activeSelector, scoreRanker, type SelectorMode } from './selector'

const QUESTIONS_DIR = path.join(process.cwd(), 'content', 'questions', 'by-skill')

// Content is static for the life of the process; reading 120 files on every
// dashboard render would be the slowest thing on the page.
const questionCache = new Map<string, Question[]>()

function questionsFor(skillId: string): Question[] {
  const cached = questionCache.get(skillId)
  if (cached) return cached
  let questions: Question[] = []
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, `${skillId}.json`), 'utf-8'))
    questions = Array.isArray(parsed) ? parsed : []
  } catch {
    questions = []
  }
  questionCache.set(skillId, questions)
  return questions
}

export const REASON_TEXT: Record<TaskReason, string> = {
  active_phase_new:         'the next skill you are ready for in this phase',
  active_phase_review:      'a review that is due in this phase',
  past_phase_review_urgent: 'an overdue review from an earlier phase',
  past_phase_review:        'a review from an earlier phase',
  confidence_boost:         'an easier win after a hard stretch',
  varied_practice:          'something different, for variety',
}

type Pick = { skill_id: string; reason: TaskReason }

export interface Suggestion {
  /** Which selector the session follows. */
  selector: SelectorMode
  /** What the session will start with. */
  served: Pick | null
  /** The rule cascade's own pick on the same pool. */
  rule: Pick | null
  /** The score's pick, with its terms and reason. */
  score: CandidateScore | null
  runnersUp: CandidateScore[]
  agreed: boolean
  /** The score saw no real difference between its pick and the rule's. */
  tied: boolean
}

export function suggestNext(args: {
  skillStates: LearnerSkillState[]
  schedules: ReviewSchedule[]
  motivation: MotivationState
  learnerRating: number
  now: Date
  selector?: SelectorMode
}): Suggestion {
  const selector = args.selector ?? activeSelector()
  const skillStates = new Map(args.skillStates.map(s => [s.skill_id, s]))
  const reviewSchedules = new Map(args.schedules.map(s => [s.skill_id, s]))
  const questionsCache = new Map<string, Question[]>()
  for (const id of Array.from(skillStates.keys())) {
    const qs = questionsFor(id)
    if (qs.length > 0) questionsCache.set(id, qs)
  }

  // The score ranks the pool whichever selector is live; only whether its pick
  // is served differs.
  const ranker = scoreRanker({
    skillStates, reviewSchedules, motivation: args.motivation.state, questionsCache,
    recentSkillIds: [], now: args.now, learnerRating: args.learnerRating,
  })
  const trace = selectNextTaskDetailed({
    skillStates, reviewSchedules, motivationState: args.motivation,
    seenSkillsThisSession: [], seenQuestionIdsThisSession: new Set(),
    questionsCache, mode: 'learn', now: args.now,
    rank: selector === 'score' ? ranker.rank : undefined,
  })
  const pick = (c: typeof trace.chosen): Pick | null => c ? { skill_id: c.skill_id, reason: c.reason } : null
  const rule = pick(trace.chosen)

  // Under the rules the score never ran inside the selection; rank the pool
  // here, beside it, exactly as the shadow log does.
  if (selector === 'rules' && trace.candidates.length >= 2) ranker.rank(trace.candidates)
  const ranking = ranker.last()
  const served = trace.task ? pick(trace.served) : null
  if (!ranking?.chosen) return { selector, served, rule, score: null, runnersUp: [], agreed: false, tied: false }

  const { chosen, ranked } = ranking
  const ruleScore = rule ? ranked.find(c => c.skill_id === rule.skill_id) ?? null : null
  return {
    selector,
    served,
    rule,
    score: chosen,
    runnersUp: ranked.filter(c => c.skill_id !== chosen.skill_id).slice(0, 2),
    agreed: chosen.skill_id === rule?.skill_id,
    tied: ruleScore !== null && Math.abs(chosen.score - ruleScore.score) < SCORE_TIE_EPSILON,
  }
}
