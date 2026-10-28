/**
 * Assembles one `selection_shadow` row: what the rule cascade chose, beside
 * what the multi-metric score would have chosen on the same pool (SCORE-3).
 *
 * Pure, so the comparison itself is unit-testable and the route is left with
 * only the two reads and the fail-open insert.
 */
import type {
  LearnerSkillState, MotivationStateValue, Question, ReviewSchedule, SelectionShadowEntry,
} from '@/types'
import { difficultyTierFor, type Candidate, type SelectionTrace } from './engine'
import { rankCandidates, type CandidateScore, type ScoreCandidateInput } from './score'

/** How many rejected candidates to keep on the row — enough to show what was passed over. */
export const RUNNERS_UP_LOGGED = 5

/**
 * Below this gap the score is not expressing a preference, and a disagreement
 * between it and the cascade is only two tie-breaks differing.
 *
 * This is not hypothetical: on a pool of freshly placed skills every candidate
 * shares the same state, so every score is identical to the last decimal. A
 * run against the real app produced three rows, all `agreed: false`, all three
 * scored 0.3094. Counting those as disagreements would make the comparison
 * worse than useless.
 */
export const SCORE_TIE_EPSILON = 0.005

export interface RunnerUp {
  skill_id: string
  score: number
}

/**
 * The Elo rating to score a candidate against: the mean over that skill's
 * questions at the tier that would actually be served, since those are the only
 * questions the learner could be shown.
 *
 * Returns null when none of them has ever been answered — the score's
 * difficulty term then falls back to BKT's own P(correct) rather than pretending
 * to a measurement that does not exist.
 */
export function ratingForSkillTier(
  skillId: string,
  tier: string,
  questionsCache: Map<string, Question[]>,
  questionRatings: Map<string, number>,
): number | null {
  const atTier = (questionsCache.get(skillId) ?? []).filter(q => q.difficulty_tier === tier)
  const rated = atTier.map(q => questionRatings.get(q.id)).filter((r): r is number => r !== undefined)
  if (rated.length === 0) return null
  return rated.reduce((sum, r) => sum + r, 0) / rated.length
}

export function toScoreInputs(
  candidates: Candidate[],
  skillStates: Map<string, LearnerSkillState>,
  reviewSchedules: Map<string, ReviewSchedule>,
  motivation: MotivationStateValue,
  questionsCache: Map<string, Question[]>,
  questionRatings: Map<string, number>,
): ScoreCandidateInput[] {
  const inputs: ScoreCandidateInput[] = []
  for (const candidate of candidates) {
    const state = skillStates.get(candidate.skill_id)
    if (!state) continue
    const tier = difficultyTierFor(state, motivation)
    inputs.push({
      skill_id: candidate.skill_id,
      state,
      schedule: reviewSchedules.get(candidate.skill_id) ?? null,
      difficulty_tier: tier,
      question_rating: ratingForSkillTier(candidate.skill_id, tier, questionsCache, questionRatings),
    })
  }
  return inputs
}

export type SelectionShadowRow = Omit<SelectionShadowEntry, 'id' | 'created_at' | 'learner_id'>

export function buildSelectionShadowRow(
  trace: SelectionTrace,
  chosen: CandidateScore | null,
  ranked: CandidateScore[],
  explored: boolean,
  sessionId: string | null,
  /** True when the score's pick is what the learner was served (LIVE-1, SELECTOR=score). */
  applied = false,
): SelectionShadowRow {
  const runnersUp: RunnerUp[] = ranked
    .filter(candidate => candidate.skill_id !== chosen?.skill_id)
    .slice(0, RUNNERS_UP_LOGGED)
    .map(candidate => ({ skill_id: candidate.skill_id, score: candidate.score }))

  const ruleScore = trace.chosen
    ? ranked.find(candidate => candidate.skill_id === trace.chosen!.skill_id) ?? null
    : null

  return {
    session_id: sessionId,
    branch: trace.branch,
    rule_skill_id: trace.chosen?.skill_id ?? null,
    rule_reason: trace.chosen?.reason ?? null,
    rule_tier: trace.difficulty_tier ?? null,
    score_skill_id: chosen?.skill_id ?? null,
    score_value: chosen?.score ?? null,
    score_reason: chosen?.reason ?? null,
    rule_score_value: ruleScore?.score ?? null,
    tied: chosen !== null && ruleScore !== null
      && Math.abs(chosen.score - ruleScore.score) < SCORE_TIE_EPSILON,
    // Only a real agreement when both actually chose something.
    agreed: chosen !== null && trace.chosen !== null && chosen.skill_id === trace.chosen.skill_id,
    explored,
    candidate_count: trace.candidates.length,
    terms: chosen?.terms ?? null,
    runners_up: runnersUp,
    applied,
  }
}

export interface ShadowSelectionArgs {
  trace: SelectionTrace
  skillStates: Map<string, LearnerSkillState>
  reviewSchedules: Map<string, ReviewSchedule>
  motivation: MotivationStateValue
  questionsCache: Map<string, Question[]>
  questionRatings: Map<string, number>
  learnerRating: number
  recentSkillIds: string[]
  sessionId: string | null
  now: Date
  next?: () => number
}

/**
 * Scores the pool the cascade considered and returns the row to log, or null
 * when there was nothing to compare — a pool of one candidate says nothing
 * about whether the score ranks better, so it is not worth a row.
 */
export function shadowSelection(args: ShadowSelectionArgs): SelectionShadowRow | null {
  if (args.trace.candidates.length < 2) return null

  const inputs = toScoreInputs(
    args.trace.candidates, args.skillStates, args.reviewSchedules,
    args.motivation, args.questionsCache, args.questionRatings,
  )
  if (inputs.length === 0) return null

  const { chosen, ranked, explored } = rankCandidates(inputs, {
    now: args.now,
    learner_rating: args.learnerRating,
    motivation_state: args.motivation,
    recent_skill_ids: args.recentSkillIds,
  }, args.next)

  return buildSelectionShadowRow(args.trace, chosen, ranked, explored, args.sessionId)
}
