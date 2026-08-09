import type {
  LearnerSkillState, ReviewSchedule, MotivationState,
  Question, SessionTask, DifficultyTier, TaskReason, SessionMode, ReviewUrgency,
} from '@/types'
import { getNodeById, getAllNodes } from '@/lib/graph'
import { findActivePhase, buildPhaseGroups } from '@/lib/phases'
import { deriveUrgency } from '@/lib/sm2/urgency'

// ─── Internal types ────────────────────────────────────────────────────────────

interface Candidate {
  skill_id:          string
  tier:              0 | 1 | 2 | 3 | 4
  reason:            TaskReason
  days_until_due:    number
  review_repetition?: number
  phase_context:     'active_phase' | 'past_phase'
  review_urgency?:   ReviewUrgency
}

interface SelectTaskParams {
  skillStates:                Map<string, LearnerSkillState>
  reviewSchedules:            Map<string, ReviewSchedule>
  motivationState:            MotivationState
  seenSkillsThisSession:      string[]
  seenQuestionIdsThisSession: Set<string>
  questionsCache:             Map<string, Question[]>
  mode?:                      SessionMode
}

export function shouldAutoScheduleReview(phaseContext: Candidate['phase_context'], mode?: SessionMode): boolean {
  return mode === 'review' || phaseContext === 'active_phase'
}

// ─── Main selector ─────────────────────────────────────────────────────────────

export function selectNextTask(p: SelectTaskParams): SessionTask | null {
  const {
    skillStates, reviewSchedules, motivationState,
    seenSkillsThisSession, seenQuestionIdsThisSession, questionsCache, mode,
  } = p

  const now = new Date()

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
    if (reviewCandidates.length === 0) return null
    reviewCandidates.sort((a, b) => a.days_until_due - b.days_until_due) // most overdue first
    const best  = reviewCandidates[0]
    const state = skillStates.get(best.skill_id)
    if (!state) return null
    const diffTier: DifficultyTier = state.consecutive_wrong >= 2 ? 'review' : 'same'
    const q = pickQuestion(best.skill_id, diffTier, seenQuestionIdsThisSession, questionsCache)
    if (!q) return null
    return buildTask(best.skill_id, q, diffTier, best, state)
  }

  // ── Frustrated → confidence boost (intercept before tiering) ─────────────
  if (motivationState.state === 'frustrated') {
    const easyWin = findEasyWin(skillStates, seenSkillsThisSession)
    if (easyWin) {
      const q = pickQuestion(easyWin, 'review', seenQuestionIdsThisSession, questionsCache)
      if (q) {
        const state = skillStates.get(easyWin)
        if (state) {
          return buildTask(easyWin, q, 'review', {
            skill_id:      easyWin,
            tier:          4,
            reason:        'confidence_boost',
            days_until_due: 0,
            phase_context: activePhaseIds.has(easyWin) ? 'active_phase' : 'past_phase',
          }, state)
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
    if (!shouldAutoScheduleReview(inActive ? 'active_phase' : 'past_phase', mode)) continue

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

  if (!best) return null

  const state = skillStates.get(best.skill_id)
  if (!state) return null

  let diffTier: DifficultyTier = 'same'
  if (motivationState.state === 'bored')  diffTier = 'harder'
  if (state.consecutive_correct >= 3)      diffTier = 'harder'
  if (state.consecutive_wrong >= 2)        diffTier = 'review'
  if (state.mastery_state === 'blocked')   diffTier = 'prerequisite'

  const q = pickQuestion(best.skill_id, diffTier, seenQuestionIdsThisSession, questionsCache)
  if (!q) return null
  return buildTask(best.skill_id, q, diffTier, best, state)
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

function findEasyWin(
  skillStates: Map<string, LearnerSkillState>,
  recent:      string[],
): string | null {
  const r = new Set(recent.slice(-3))
  return Array.from(skillStates.values())
    .filter(s => s.p_know > 0.70 && s.mastery_state !== 'blocked' && !r.has(s.skill_id))
    .sort((a, b) => b.p_know - a.p_know)[0]?.skill_id ?? null
}
