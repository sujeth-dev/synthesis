import type {
  LearnerSkillState, ReviewSchedule, MotivationState, MotivationStateValue,
  Question, SessionTask, DifficultyTier, TaskReason, SessionMode, ReviewUrgency,
  GuidedArcProgress, GuidedArcStage,
} from '@/types'
import { getNodeById, getAllNodes } from '@/lib/graph'
import { findActivePhase, buildPhaseGroups } from '@/lib/phases'
import { deriveUrgency } from '@/lib/sm2/urgency'

export const SESSION_TASK_CAP = 10
export const MIN_QUESTIONS_PER_GUIDED_STAGE = 2
export const GUIDED_ARC_STAGE_COUNT = 3
export const MIN_GUIDED_ARC_QUESTIONS = MIN_QUESTIONS_PER_GUIDED_STAGE * GUIDED_ARC_STAGE_COUNT
export const CURRENT_TOPIC_MINIMUM = 4
export const MAX_REVIEW_ITEMS = SESSION_TASK_CAP - CURRENT_TOPIC_MINIMUM
export const DEFAULT_REVIEW_OFFER_SIZE = MAX_REVIEW_ITEMS - 1
export const ARC_SWITCH_THRESHOLD = 0.60

export interface ArcAttemptEvidence {
  correct: boolean
  difficulty_tier: DifficultyTier
}

const GUIDED_STAGE_ORDER: GuidedArcStage[] = ['beginner', 'intermediate', 'mastery']
const GUIDED_STAGE_DIFFICULTY: Record<GuidedArcStage, DifficultyTier> = {
  beginner: 'review',
  intermediate: 'same',
  mastery: 'harder',
}

export function getGuidedArcProgress(history: ArcAttemptEvidence[]): GuidedArcProgress {
  let stageIndex = 0
  let stageAttemptCount = 0
  let stageCorrectStreak = 0
  let coreComplete = false

  for (const attempt of history) {
    if (coreComplete) continue
    stageAttemptCount += 1

    if (attempt.correct) {
      stageCorrectStreak += 1
      if (stageCorrectStreak < MIN_QUESTIONS_PER_GUIDED_STAGE) continue
      if (stageIndex === GUIDED_STAGE_ORDER.length - 1) {
        coreComplete = true
      } else {
        stageIndex += 1
        stageAttemptCount = 0
        stageCorrectStreak = 0
      }
    } else {
      if (stageIndex > 0) {
        stageIndex -= 1
        stageAttemptCount = 0
      }
      stageCorrectStreak = 0
    }
  }

  return {
    stage: GUIDED_STAGE_ORDER[stageIndex],
    stage_attempt_count: stageAttemptCount,
    stage_correct_streak: stageCorrectStreak,
    completed_stage_count: coreComplete ? GUIDED_STAGE_ORDER.length : stageIndex,
    core_complete: coreComplete,
    total_attempt_count: history.length,
  }
}

export function selectArcDifficulty(history: ArcAttemptEvidence[]): DifficultyTier {
  return GUIDED_STAGE_DIFFICULTY[getGuidedArcProgress(history).stage]
}

export function canChooseTopicSwitch(pKnow: number, progress: GuidedArcProgress): boolean {
  return pKnow >= ARC_SWITCH_THRESHOLD && progress.core_complete
}

export interface ReviewDebtPlan {
  reviewOfferCount: number
  additionalReviewCount: number
  currentTopicSlots: number
  deferredReviewCount: number
}

export function planReviewDebt(overdueReviewCount: number): ReviewDebtPlan {
  const debt = Math.max(0, Math.floor(overdueReviewCount))
  const reviewOfferCount = Math.min(debt, DEFAULT_REVIEW_OFFER_SIZE)
  const additionalReviewCount = Math.min(debt - reviewOfferCount, MAX_REVIEW_ITEMS - reviewOfferCount)
  return {
    reviewOfferCount,
    additionalReviewCount,
    currentTopicSlots: CURRENT_TOPIC_MINIMUM,
    deferredReviewCount: debt - reviewOfferCount - additionalReviewCount,
  }
}

export type SessionGate = 'continue' | 'consent_required' | 'complete'

export function getSessionGate(
  tasksCompleted: number,
  mode: SessionMode,
  grantedTaskLimit = 0,
): SessionGate {
  if (tasksCompleted >= SESSION_TASK_CAP) return 'complete'
  if (mode === 'review' && tasksCompleted >= Math.max(0, grantedTaskLimit)) return 'consent_required'
  return 'continue'
}

// ─── Internal types ────────────────────────────────────────────────────────────

export interface Candidate {
  skill_id:          string
  tier:              0 | 1 | 2 | 3 | 4
  reason:            TaskReason
  days_until_due:    number
  review_repetition?: number
  phase_context:     'active_phase' | 'past_phase'
  review_urgency?:   ReviewUrgency
}

export interface SelectTaskParams {
  skillStates:                Map<string, LearnerSkillState>
  reviewSchedules:            Map<string, ReviewSchedule>
  motivationState:            MotivationState
  seenSkillsThisSession:      string[]
  seenQuestionIdsThisSession: Set<string>
  questionsCache:             Map<string, Question[]>
  mode?:                      SessionMode
  currentSkillId?:            string
  arcHistory?:                ArcAttemptEvidence[]
  lastQuestionId?:            string
  /**
   * The moment selection is being made for. Defaults to the wall clock, which
   * is what every request wants; an offline harness over a simulated calendar
   * must pass its own clock, or every simulated `due_at` in the past reads as
   * overdue and review ordering drifts between runs.
   */
  now?:                       Date
}

export function canSelectReview(_phaseContext: Candidate['phase_context'], mode?: SessionMode): boolean {
  return mode === 'review'
}

/**
 * The difficulty tier the cascade serves, as a cascade of overwriting rules
 * where the last match wins. Extracted unchanged from the selector so the
 * shadow score can read the same tier for every candidate, not just the one
 * that was chosen.
 */
export function difficultyTierFor(state: LearnerSkillState, motivation: MotivationStateValue): DifficultyTier {
  let diffTier: DifficultyTier = 'same'
  if (motivation === 'bored')             diffTier = 'harder'
  if (state.consecutive_correct >= 3)     diffTier = 'harder'
  if (state.consecutive_wrong >= 2)       diffTier = 'review'
  if (state.mastery_state === 'blocked')  diffTier = 'prerequisite'
  return diffTier
}

/** Which arm of the cascade produced the task — the first thing to know when a pick looks wrong. */
export type SelectionBranch = 'review_mode' | 'pinned_arc' | 'confidence_boost' | 'tiers' | 'none'

/**
 * What `selectNextTask()` decided *and how*. The task is identical to what the
 * selector has always returned; the rest is the trace SCORE-3 logs so the
 * shadow score can be compared against the same pool, on the same inputs.
 */
export interface SelectionTrace {
  task: SessionTask | null
  branch: SelectionBranch
  /** Every candidate this arm of the cascade considered. */
  candidates: Candidate[]
  chosen: Candidate | null
  difficulty_tier: DifficultyTier | null
}

function noSelection(branch: SelectionBranch, candidates: Candidate[] = []): SelectionTrace {
  return { task: null, branch, candidates, chosen: null, difficulty_tier: null }
}

// ─── Main selector ─────────────────────────────────────────────────────────────

/** Unchanged contract: the task alone. Everything else reads the trace. */
export function selectNextTask(p: SelectTaskParams): SessionTask | null {
  return selectNextTaskDetailed(p).task
}

export function selectNextTaskDetailed(p: SelectTaskParams): SelectionTrace {
  const {
    skillStates, reviewSchedules, motivationState,
    seenSkillsThisSession, seenQuestionIdsThisSession, questionsCache, mode, currentSkillId,
    arcHistory = [], lastQuestionId, now = new Date(),
  } = p

  // ── Determine active phase ────────────────────────────────────────────────
  const allNodes        = getAllNodes().filter(n => !n.deprecated)
  const phaseGroups     = buildPhaseGroups(allNodes)
  const activePhase     = findActivePhase(allNodes, skillStates)
  const activePhaseIds  = new Set(phaseGroups[activePhase]?.map(n => n.id) ?? [])

  // ── Review-only mode: serve overdue reviews sorted by urgency ─────────────
  if (mode === 'review') {
    const reviewCandidates: Candidate[] = []
    for (const [skillId, schedule] of Array.from(reviewSchedules)) {
      const state = skillStates.get(skillId)
      if (!state || state.mastery_state === 'blocked') continue
      if (!getNodeById(skillId)) continue
      if (new Date(schedule.due_at) > now || schedule.repetitions === 0) continue
      const { days_until_due, urgency } = deriveUrgency(schedule.due_at, now)
      const inActive = activePhaseIds.has(skillId)
      reviewCandidates.push({
        skill_id: skillId, tier: 0,
        reason:           inActive ? 'active_phase_review' : 'past_phase_review_urgent',
        days_until_due,
        review_repetition: schedule.repetitions,
        phase_context:    inActive ? 'active_phase' : 'past_phase',
        review_urgency:   urgency,
      })
    }
    if (reviewCandidates.length === 0) return noSelection('review_mode')
    reviewCandidates.sort((a, b) => a.days_until_due - b.days_until_due) // most overdue first
    const best  = reviewCandidates[0]
    const state = skillStates.get(best.skill_id)
    if (!state) return noSelection('review_mode', reviewCandidates)
    const diffTier: DifficultyTier = state.consecutive_wrong >= 2 ? 'review' : 'same'
    const q = pickQuestion(best.skill_id, diffTier, seenQuestionIdsThisSession, questionsCache)
    if (!q) return noSelection('review_mode', reviewCandidates)
    return {
      task: buildTask(best.skill_id, q, diffTier, best, state),
      branch: 'review_mode', candidates: reviewCandidates, chosen: best, difficulty_tier: diffTier,
    }
  }

  // A selected arc always outranks interleaving and motivation-based rerouting.
  if (currentSkillId) {
    const state = skillStates.get(currentSkillId)
    const node = getNodeById(currentSkillId)
    const pinned: Candidate = {
      skill_id: currentSkillId,
      tier: 1,
      reason: activePhaseIds.has(currentSkillId) ? 'active_phase_new' : 'varied_practice',
      days_until_due: 0,
      phase_context: activePhaseIds.has(currentSkillId) ? 'active_phase' : 'past_phase',
    }
    if (state && state.mastery_state !== 'blocked' && node && questionsCache.has(currentSkillId)) {
      const diffTier = selectArcDifficulty(arcHistory)
      const q = pickGuidedQuestion(
        currentSkillId,
        diffTier,
        seenQuestionIdsThisSession,
        questionsCache,
        lastQuestionId,
      )
      if (q) {
        return {
          task: buildTask(currentSkillId, q, diffTier, pinned, state),
          branch: 'pinned_arc', candidates: [pinned], chosen: pinned, difficulty_tier: diffTier,
        }
      }
    }
    return noSelection('pinned_arc', [pinned])
  }

  // ── Frustrated → confidence boost (intercept before tiering) ─────────────
  if (motivationState.state === 'frustrated') {
    const easyWin = findEasyWin(skillStates, seenSkillsThisSession)
    if (easyWin) {
      const q = pickQuestion(easyWin, 'review', seenQuestionIdsThisSession, questionsCache)
      if (q) {
        const state = skillStates.get(easyWin)
        if (state) {
          const boost: Candidate = {
            skill_id:      easyWin,
            tier:          4,
            reason:        'confidence_boost',
            days_until_due: 0,
            phase_context: activePhaseIds.has(easyWin) ? 'active_phase' : 'past_phase',
          }
          return {
            task: buildTask(easyWin, q, 'review', boost, state),
            branch: 'confidence_boost', candidates: [boost], chosen: boost, difficulty_tier: 'review',
          }
        }
      }
    }
  }

  // ── Interleaving: penalise skills seen ≥2× in last 5 ────────────────────
  const recentWindow = seenSkillsThisSession.slice(-5)
  const overRep = new Set(
    Object.entries(
      recentWindow.reduce<Record<string, number>>(
        (a, id) => { a[id] = (a[id] ?? 0) + 1; return a }, {}
      )
    )
      .filter(([, c]) => c >= 2)
      .map(([id]) => id)
  )

  // ── Build 5-tier candidate pools ──────────────────────────────────────────
  // Tier 0: urgent overdue reviews in active phase
  // Tier 1: weak/new learnable skills in active phase
  // Past-phase reviews are offered only when the learner chooses review mode.
  // Tier 4: fallback — any learnable skill when active phase is exhausted
  const tiers: Candidate[][] = [[], [], [], [], []]

  for (const [skillId, schedule] of Array.from(reviewSchedules)) {
    const state = skillStates.get(skillId)
    if (!state || state.mastery_state === 'blocked') continue
    if (!getNodeById(skillId)) continue
    if (schedule.repetitions === 0) continue
    if (new Date(schedule.due_at) > now) continue  // not yet due

    const { days_until_due, urgency } = deriveUrgency(schedule.due_at, now)
    const inActive = activePhaseIds.has(skillId)
    if (!canSelectReview(inActive ? 'active_phase' : 'past_phase', mode)) continue

    if (inActive) {
      // Tier 0: active phase overdue review
      tiers[0].push({
        skill_id: skillId, tier: 0,
        reason: 'active_phase_review',
        days_until_due, review_repetition: schedule.repetitions,
        phase_context: 'active_phase', review_urgency: urgency,
      })
    }
  }

  // Tier 1: active-phase learnable skills not already in Tier 0
  const tier0Ids = new Set(tiers[0].map(c => c.skill_id))
  const learnableActive = Array.from(skillStates.values())
    .filter(s =>
      activePhaseIds.has(s.skill_id) &&
      ['ready', 'learning', 'fragile'].includes(s.mastery_state) &&
      questionsCache.has(s.skill_id) &&
      !tier0Ids.has(s.skill_id) &&
      !overRep.has(s.skill_id) &&
      getNodeById(s.skill_id)
    )
    .sort((a, b) => a.p_know - b.p_know)
    .slice(0, 5)

  for (const s of learnableActive) {
    tiers[1].push({
      skill_id: s.skill_id, tier: 1,
      reason: 'active_phase_new',
      days_until_due: 0,
      phase_context: 'active_phase',
    })
  }

  // Tier 4 fallback: active-phase pool exhausted → any learnable skill
  if (tiers[0].length === 0 && tiers[1].length === 0) {
    const learnableAll = Array.from(skillStates.values())
      .filter(s =>
        activePhaseIds.has(s.skill_id) &&
        ['ready', 'learning', 'fragile'].includes(s.mastery_state) &&
        questionsCache.has(s.skill_id) &&
        getNodeById(s.skill_id)
      )
      .sort((a, b) => a.p_know - b.p_know)
    const learnableFiltered = learnableAll.filter(s => !overRep.has(s.skill_id))
    const learnable = (learnableFiltered.length > 0 ? learnableFiltered : learnableAll).slice(0, 5)
    for (const s of learnable) {
      tiers[4].push({
        skill_id: s.skill_id, tier: 4,
        reason: recentWindow.includes(s.skill_id) ? 'varied_practice' : 'active_phase_new',
        days_until_due: 0,
        phase_context: activePhaseIds.has(s.skill_id) ? 'active_phase' : 'past_phase',
      })
    }
  }

  // ── Select best candidate ─────────────────────────────────────────────────
  let best: Candidate | null = null
  for (const tier of tiers) {
    if (tier.length > 0) {
      // Reviews: most overdue first; learnable: weakest first (already sorted by p_know)
      if (tier[0].days_until_due < 0) {
        tier.sort((a, b) => a.days_until_due - b.days_until_due)
      }
      best = tier[0]
      break
    }
  }

  // Flattened after the sort above, so the logged pool is in the order the
  // cascade actually ranked it.
  const considered = tiers.flat()

  if (!best) return noSelection('tiers', considered)

  const state = skillStates.get(best.skill_id)
  if (!state) return noSelection('tiers', considered)

  const diffTier = difficultyTierFor(state, motivationState.state)

  const q = pickQuestion(best.skill_id, diffTier, seenQuestionIdsThisSession, questionsCache)
  if (!q) return noSelection('tiers', considered)
  return {
    task: buildTask(best.skill_id, q, diffTier, best, state),
    branch: 'tiers', candidates: considered, chosen: best, difficulty_tier: diffTier,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTask(
  skill_id:  string,
  question:  Question,
  diffTier:  DifficultyTier,
  candidate: Candidate,
  state:     LearnerSkillState,
): SessionTask | null {
  const node = getNodeById(skill_id)
  if (!node) return null
  return {
    skill_id,
    skill_label:     node.label,
    skill_intuition: node.intuition,
    skill_analogy:   node.analogy,
    question,
    difficulty_tier: diffTier,
    source:          'learning',
    reason:          candidate.reason,
    p_know:          state.p_know,
    phase_context:   candidate.phase_context,
    ...(candidate.review_urgency !== undefined && { review_urgency: candidate.review_urgency }),
    ...(candidate.days_until_due !== 0        && { days_until_due: candidate.days_until_due }),
    ...(candidate.review_repetition !== undefined && { review_repetition: candidate.review_repetition }),
  }
}

function pickQuestion(
  skill_id: string,
  tier:     DifficultyTier,
  seen:     Set<string>,
  cache:    Map<string, Question[]>,
): Question | null {
  const qs     = cache.get(skill_id) ?? []
  const tiered = qs.filter(q => q.difficulty_tier === tier && !seen.has(q.id))
  if (tiered.length > 0) return tiered[Math.floor(Math.random() * tiered.length)]
  const unseen = qs.filter(q => !seen.has(q.id))
  if (unseen.length > 0) return unseen[Math.floor(Math.random() * unseen.length)]
  return qs[Math.floor(Math.random() * qs.length)] ?? null
}

function pickGuidedQuestion(
  skill_id: string,
  tier: DifficultyTier,
  seen: Set<string>,
  cache: Map<string, Question[]>,
  lastQuestionId?: string,
): Question | null {
  const allQuestions = (cache.get(skill_id) ?? []).filter(question => question.format === 'mcq')
  const tiered = allQuestions.filter(question => question.difficulty_tier === tier)
  const unseen = tiered.filter(question => !seen.has(question.id))
  const unseenFallback = allQuestions.filter(question => !seen.has(question.id))
  const tieredAlternative = tiered.filter(question => question.id !== lastQuestionId)
  const anyAlternative = allQuestions.filter(question => question.id !== lastQuestionId)
  const pool = unseen.length > 0
    ? unseen
    : tieredAlternative.length > 0
      ? tieredAlternative
      : unseenFallback.length > 0
        ? unseenFallback
        : anyAlternative.length > 0
          ? anyAlternative
          : allQuestions
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

function findEasyWin(
  skillStates: Map<string, LearnerSkillState>,
  recent:      string[],
): string | null {
  const r = new Set(recent.slice(-3))
  return Array.from(skillStates.values())
    .filter(s => s.p_know > 0.70 && s.mastery_state !== 'blocked' && !r.has(s.skill_id))
    .sort((a, b) => b.p_know - a.p_know)[0]?.skill_id ?? null
}
