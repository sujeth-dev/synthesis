/**
 * What the dashboard says comes next (OLM-5): the rule cascade's pick, which is
 * what a session will actually serve, beside the multi-metric score's pick on
 * the same pool with its per-term reasons.
 *
 * Advisory by construction. The score is still shadow-only until LIVE-1, so the
 * dashboard must never present its pick as the plan — it is "what the score
 * would choose", next to "what your session will start with".
 *
 * Read-only: no state is written, and exploration is off (the default `next`
 * never explores), so the same state always gives the same suggestion.
 */
import fs from 'fs'
import path from 'path'
import type {
  LearnerSkillState, MotivationState, Question, ReviewSchedule, TaskReason,
} from '@/types'
import { selectNextTaskDetailed } from './engine'
import { rankCandidates, type CandidateScore } from './score'
import { SCORE_TIE_EPSILON, toScoreInputs } from './shadow'

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

export interface Suggestion {
  rule: { skill_id: string; reason: TaskReason } | null
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
  questionRatings: Map<string, number>
  now: Date
}): Suggestion {
  const skillStates = new Map(args.skillStates.map(s => [s.skill_id, s]))
  const reviewSchedules = new Map(args.schedules.map(s => [s.skill_id, s]))
  const questionsCache = new Map<string, Question[]>()
  for (const id of Array.from(skillStates.keys())) {
    const qs = questionsFor(id)
    if (qs.length > 0) questionsCache.set(id, qs)
  }

  const trace = selectNextTaskDetailed({
    skillStates, reviewSchedules, motivationState: args.motivation,
    seenSkillsThisSession: [], seenQuestionIdsThisSession: new Set(),
    questionsCache, mode: 'learn', now: args.now,
  })
  const rule = trace.chosen ? { skill_id: trace.chosen.skill_id, reason: trace.chosen.reason } : null

  const inputs = toScoreInputs(trace.candidates, skillStates, reviewSchedules, args.motivation.state, questionsCache, args.questionRatings)
  if (inputs.length < 2) return { rule, score: null, runnersUp: [], agreed: false, tied: false }

  const { chosen, ranked } = rankCandidates(inputs, {
    now: args.now,
    learner_rating: args.learnerRating,
    motivation_state: args.motivation.state,
    recent_skill_ids: [],
  })
  const ruleScore = rule ? ranked.find(c => c.skill_id === rule.skill_id) ?? null : null
  return {
    rule,
    score: chosen,
    runnersUp: ranked.filter(c => c.skill_id !== chosen?.skill_id).slice(0, 2),
    agreed: chosen !== null && chosen.skill_id === rule?.skill_id,
    tied: chosen !== null && ruleScore !== null && Math.abs(chosen.score - ruleScore.score) < SCORE_TIE_EPSILON,
  }
}
