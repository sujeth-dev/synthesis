/**
 * The multi-metric candidate score (SCORE-2).
 *
 * `selectNextTask()` picks lexicographically: the first non-empty tier, then one
 * tiebreak key. It cannot express that a slightly-less-overdue review of a
 * shaky skill beats a badly-overdue review of one already mastered, because it
 * never weighs two signals against each other. This module does, and — per
 * Research/lab/02-engines.md:334, where the `reason` field is called "not
 * optional" — every score carries the sentence that explains it.
 *
 * Live since LIVE-1 (human sign-off 2026-10-25): under SELECTOR=score, the
 * default, this picks from the pool the cascade makes eligible — see
 * selector.ts. SELECTOR=rules returns it to shadow.
 *
 * Pure and synchronous, like the selector it shadows: no I/O, no clock of its
 * own, no Math.random. Hard constraints stay filters in the cascade — this
 * ranks a pool that has already been made eligible, and refuses outright on a
 * blocked skill rather than relying on the caller.
 */
import type {
  DifficultyTier, LearnerSkillState, MotivationStateValue, ReviewSchedule,
} from '@/types'
import { bktUpdate, LEARNING_THRESHOLD, MASTERY_THRESHOLD } from '@/lib/bkt'
import { expectedScore } from '@/lib/elo'

export type ScoreTermName = 'urgency' | 'gain' | 'behaviour' | 'cognitive' | 'variety'

// Weights sum to 1, so a score reads as a fraction of the best any candidate
// could be. Retention carries the most weight because a forgotten skill is the
// one loss that practising something else cannot recover.
//
// **Corrected 2026-10-25, see TARGET_SUCCESS:** a sixth term, `difficulty_match`
// at 0.20, was removed after SCORE-4 measured it, and its weight went to the two
// terms that are coherent across candidates.
export const SCORE_WEIGHTS: Record<ScoreTermName, number> = {
  urgency: 0.35,
  gain: 0.35,
  behaviour: 0.10,
  cognitive: 0.15,
  variety: 0.05,
}

/**
 * The success probability to aim a *question* at. Math Garden samples at .75
 * (Klinkenberg, Straatemeier & van der Maas 2011); Wilson et al. 2019 derive
 * ~.85 for a class of gradient learners.
 *
 * **It is deliberately not a term in the candidate score.** It was, at weight
 * 0.20, and SCORE-4 showed why that was wrong: an unlearned skill predicts
 * ~27% success and a nearly-mastered one ~80%, so scoring candidates by
 * distance from the target systematically prefers skills the learner already
 * knows. Simulated learners under that version ended with better retention and
 * higher p_know while learning **half as many skills** (2.25 vs 4.50 per
 * learner) — the engine polished a handful of skills instead of letting anyone
 * advance, and the term drove 45 of 102 disagreements.
 *
 * The error was conceptual, not numeric. A target success rate is a
 * within-skill idea: it answers "which question of this skill", given that the
 * learner is practising it. Wilson et al. say as much about their own result —
 * it is derived for binary classification and they caution it will not transfer
 * directly to students. Applied across skills at different mastery levels the
 * question it answers is incoherent, and no weight makes it coherent.
 *
 * `bestQuestionByRating()` below is where it belongs, and where EXAM-1 uses it.
 */
export const TARGET_SUCCESS = 0.80

// Measured, not guessed: the largest expected |delta p_know| from one answer
// under the live global parameters is 0.3064, at p_know 0.53. Dividing by it
// puts the gain term on 0-1 without flattening the mid-range peak that makes
// the term worth having.
export const MAX_EXPECTED_MOVEMENT = 0.31

// Half the score at the due date, full score one whole interval past it. Scaled
// by the item's own interval so a 1-day and a 60-day schedule are comparable.
export const URGENCY_SATURATION_INTERVALS = 2

// Beck & Gong's wheel-spinning: mastery-based selection can keep serving a skill
// the learner is not going to get, and a fallback is required rather than
// optional. Three wrong in a row is this repo's existing "stuck" threshold
// (motivation turns frustrated at the same count).
export const WHEEL_SPIN_WRONG = 3
export const WHEEL_SPIN_PENALTY = 0.25

// Rohrer & Taylor's interleaving effect, as a recency penalty over the skills
// already served this session.
export const VARIETY_WINDOW = 5

// Research/lab/02-engines.md:355 puts exploration at 10-15% of selections. A
// bandit needs 20k sessions of outcome data this repo does not have, so this is
// the cheap half of the idea: occasionally take a runner-up and log what
// happened.
export const EXPLORATION_RATE = 0.12

const TIER_COGNITIVE_RANK: Record<DifficultyTier, number> = {
  prerequisite: 0,
  review: 0.33,
  same: 0.67,
  harder: 1,
}

export interface ScoreCandidateInput {
  skill_id: string
  state: LearnerSkillState
  /** null when the skill has never been scheduled. */
  schedule: ReviewSchedule | null
  /** The tier the engine would serve for this candidate. */
  difficulty_tier: DifficultyTier
  /** Elo rating of the question that would be served, or null if uncalibrated. */
  question_rating: number | null
}

export interface ScoreContext {
  now: Date
  /** The learner's Elo ability for this phase. */
  learner_rating: number
  motivation_state: MotivationStateValue
  /** Skills already served this session, most recent first. */
  recent_skill_ids: string[]
}

export interface ScoreTerm {
  name: ScoreTermName
  /** The term's own 0-1 reading, before weighting. */
  raw: number
  weight: number
  contribution: number
}

export interface CandidateScore {
  skill_id: string
  score: number
  terms: ScoreTerm[]
  /** Why this candidate scored as it did — the sentence a learner can be shown. */
  reason: string
  /** Named penalties applied after the weighted sum, in order. */
  guards: string[]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * How far past its own review interval this skill has drifted. 0 when freshly
 * reviewed, 0.5 at the due date, 1 a full interval overdue.
 *
 * A skill that has never been reviewed scores 0: it is not at risk of being
 * forgotten yet, and the gain term is what should carry it.
 */
export function urgencyTerm(schedule: ReviewSchedule | null, now: Date): number {
  if (!schedule || schedule.repetitions === 0) return 0
  const interval = Math.max(1, schedule.interval_days)
  const daysUntilDue = (new Date(schedule.due_at).getTime() - now.getTime()) / 86_400_000
  const elapsedRatio = (interval - daysUntilDue) / interval
  return clamp01(elapsedRatio / URGENCY_SATURATION_INTERVALS)
}

/**
 * Expected movement in `p_know` from one more answer, run through the real BKT
 * update rather than approximated — so the term inherits the live parameters
 * and automatically falls to nothing as a skill approaches certainty.
 */
export function expectedBktMovement(state: LearnerSkillState): number {
  const pCorrect = state.p_know * (1 - state.p_slip) + (1 - state.p_know) * state.p_guess
  const ifCorrect = Math.abs(bktUpdate(state, true).p_know - state.p_know)
  const ifWrong = Math.abs(bktUpdate(state, false).p_know - state.p_know)
  return pCorrect * ifCorrect + (1 - pCorrect) * ifWrong
}

/** How much of the distance to mastery is still unclaimed. 1 unlearned, 0 at mastery. */
export function masteryHeadroom(pKnow: number): number {
  return clamp01((MASTERY_THRESHOLD - pKnow) / MASTERY_THRESHOLD)
}

/**
 * Expected progress toward mastery: how far one answer can be expected to move
 * the belief, times how much of the journey is left.
 *
 * **Corrected 2026-10-25 after SCORE-4 measured it.** The first version was
 * `expectedBktMovement / MAX_EXPECTED_MOVEMENT` alone, on the reasoning that
 * BKT is most informative mid-range. Measured over simulated learners that
 * policy learned *fewer* skills than the rule cascade (3.75 vs 4.75 per
 * learner) and ended with lower retention, and the disagreement breakdown
 * showed this term driving 68 of 96 disagreements. The error: expected movement
 * measures information gained *about* the learner, which is not the same
 * objective as the learner's progress, and maximising it parks a learner on
 * half-known skills instead of letting them advance. Corbett & Anderson's model
 * is a measurement model; treating its movement as pedagogic value was the
 * mistake.
 *
 * Multiplying by headroom restores the repo's own stated priority — new
 * concepts before reinforcement (Research/lab/02-engines.md:167-176) — while
 * keeping the measured property that a mid-range answer moves the belief more
 * than an extreme one.
 */
export function gainTerm(state: LearnerSkillState): number {
  const movement = clamp01(expectedBktMovement(state) / MAX_EXPECTED_MOVEMENT)
  return clamp01(movement * masteryHeadroom(state.p_know))
}

/**
 * Which of a skill's questions sits closest to the target success rate, by the
 * Elo pairing SCORE-1 measures.
 *
 * This is the coherent home for TARGET_SUCCESS: every question here belongs to
 * the same skill, so comparing their predicted success rates compares
 * like with like. Returns null when none of the candidates has ever been
 * answered, leaving the caller on whatever it already did.
 *
 * Not wired into live question selection — `pickQuestion()` in engine.ts still
 * picks at random within a tier, and changing that is LIVE-1's business, not a
 * shadow sprint's. EXAM-1 is the first planned caller.
 */
export function bestQuestionByRating<T extends { id: string }>(
  questions: T[],
  learnerRating: number,
  questionRatings: Map<string, number>,
  target = TARGET_SUCCESS,
): T | null {
  let best: { question: T; deviation: number } | null = null
  for (const question of questions) {
    const rating = questionRatings.get(question.id)
    if (rating === undefined) continue
    const deviation = Math.abs(expectedScore(learnerRating, rating) - target)
    if (!best || deviation < best.deviation) best = { question, deviation }
  }
  return best?.question ?? null
}

/**
 * Whether this candidate suits the learner's current behavioural state: a
 * frustrated learner is better served something they can get, a bored one
 * something they cannot yet.
 *
 * Deliberately does not reuse `behavior_modifier`. That already discounts the
 * evidence a slow or hesitant answer contributes inside `bktUpdate`, so
 * spending it again here would count the same hesitation twice.
 */
export function behaviourTerm(state: LearnerSkillState, motivation: MotivationStateValue): number {
  if (motivation === 'frustrated') return clamp01(state.p_know)
  if (motivation === 'bored') return clamp01(1 - state.p_know)
  return 0.5
}

/**
 * Cognitive demand, from the authored tier: ask a learner who cannot yet recall
 * the material to recall it, and one who can to do something with it.
 *
 * `difficulty_tier` is a proxy and is labelled as one. Real Bloom levels exist
 * only on the 324 phase-evaluation questions, by deliberate design (Bloom is
 * the macro layer here, not a per-question label), so the honest version of this
 * term needs the per-level ability the exam produces. EXAM-4 now produces it, in
 * exam_runs.debrief; wiring it in here changes what the score prefers, so it
 * waits for LIVE-1 rather than shifting a shadow comparison mid-measurement.
 */
export function cognitiveTerm(state: LearnerSkillState, tier: DifficultyTier): number {
  const rank = TIER_COGNITIVE_RANK[tier]
  return state.p_know < LEARNING_THRESHOLD ? 1 - rank : rank
}

/** Interleaving: the more recently a skill was served, the less it is worth serving again. */
export function varietyTerm(skillId: string, recentSkillIds: string[]): number {
  const window = recentSkillIds.slice(0, VARIETY_WINDOW)
  const position = window.indexOf(skillId)
  if (position < 0) return 1
  return clamp01(position / window.length)
}

function buildReason(terms: ScoreTerm[], input: ScoreCandidateInput, guards: string[]): string {
  if (guards.includes('blocked')) return 'Prerequisites are not met yet, so this cannot be served.'

  const ranked = [...terms].sort((a, b) => b.contribution - a.contribution)
  const parts = ranked.slice(0, 2).map(term => {
    const pct = Math.round(term.raw * 100)
    switch (term.name) {
      case 'urgency': return `it is drifting past its review date (${pct}% of the way to a full interval overdue)`
      case 'gain': return `there is more ground still to cover here than almost anywhere else (${pct}%)`
      case 'behaviour': return `it fits how the session is going (${pct}%)`
      case 'cognitive': return `the ${input.difficulty_tier} tier matches how well this is already known (${pct}%)`
      case 'variety': return `it has not come up recently (${pct}%)`
    }
  })

  const guardNote = guards.includes('wheel_spin')
    ? ` Held back because this skill has gone wrong ${input.state.consecutive_wrong} times in a row — grinding it further is unlikely to help.`
    : ''

  return `Chosen because ${parts.join(', and ')}.${guardNote}`
}

export function scoreCandidate(input: ScoreCandidateInput, context: ScoreContext): CandidateScore {
  const { state } = input
  const guards: string[] = []

  const raw: Record<ScoreTermName, number> = {
    urgency: urgencyTerm(input.schedule, context.now),
    gain: gainTerm(state),
    behaviour: behaviourTerm(state, context.motivation_state),
    cognitive: cognitiveTerm(state, input.difficulty_tier),
    variety: varietyTerm(input.skill_id, context.recent_skill_ids),
  }

  const terms: ScoreTerm[] = (Object.keys(SCORE_WEIGHTS) as ScoreTermName[]).map(name => ({
    name,
    raw: raw[name],
    weight: SCORE_WEIGHTS[name],
    contribution: raw[name] * SCORE_WEIGHTS[name],
  }))

  let score = terms.reduce((sum, term) => sum + term.contribution, 0)

  if (state.consecutive_wrong >= WHEEL_SPIN_WRONG) {
    guards.push('wheel_spin')
    score *= WHEEL_SPIN_PENALTY
  }

  // Defensive, not decorative: the cascade is supposed to have filtered these
  // out, and a score of zero means a filter regression can never promote a
  // locked skill into the learner's session.
  if (state.mastery_state === 'blocked') {
    guards.push('blocked')
    score = 0
  }

  return { skill_id: input.skill_id, score, terms, reason: buildReason(terms, input, guards), guards }
}

export interface RankedCandidates {
  chosen: CandidateScore | null
  ranked: CandidateScore[]
  /** True when the choice was an exploration pick rather than the top score. */
  explored: boolean
}

/**
 * Scores and orders a pool, then takes the top — except for the exploration
 * share, which takes a runner-up instead so there is something other than the
 * engine's own preference in the logs.
 *
 * `next` is injected rather than taken from Math.random so a ranking is
 * reproducible in a test and in the simulator.
 */
export function rankCandidates(
  inputs: ScoreCandidateInput[],
  context: ScoreContext,
  next: () => number = () => 1,
): RankedCandidates {
  const ranked = inputs
    .map(input => scoreCandidate(input, context))
    .sort((a, b) => b.score - a.score || a.skill_id.localeCompare(b.skill_id))

  const selectable = ranked.filter(candidate => !candidate.guards.includes('blocked'))
  if (selectable.length === 0) return { chosen: null, ranked, explored: false }

  const runnersUp = selectable.slice(1)
  if (runnersUp.length > 0 && next() < EXPLORATION_RATE) {
    const index = Math.min(runnersUp.length - 1, Math.floor(next() * runnersUp.length))
    return { chosen: runnersUp[index], ranked, explored: true }
  }

  return { chosen: selectable[0], ranked, explored: false }
}
