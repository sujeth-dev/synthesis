import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { bktUpdate, getMasteryTier } from '@/lib/bkt'
import { fittedParamsProvenance, hasFittedParams, isPerSkillBktEnabled, paramsFor } from '@/lib/bkt/params'
import { bktToQuality, reconcileBktSm2 } from '@/lib/sm2'
import { adaptiveFsrsRating, adaptiveQuality, isAdaptiveQualityEnabled, type AttemptBehaviorSignals } from '@/lib/sm2/adaptive'
import { computeFsrsSchedule, fsrsRatingFromCorrectness, type FsrsSchedule } from '@/lib/fsrs'
import { activeScheduler, chooseSchedule } from '@/lib/fsrs/scheduler'
import { buildAttemptBehaviorSnapshot, deriveBehaviorEvidenceModifier, updateMotivationState } from '@/lib/motivation'
import { classifyExplanation, reasoningQualityFromCategory } from '@/lib/feynman/classifier'
import { gradeExplanation, type GradeExplanationResult } from '@/lib/nlp/grader'
import { computeUnblocked } from '@/lib/graph'
import { isOrderAnswerCorrect } from '@/lib/ui/order-answer'
import {
  getSkillState, upsertSkillState, getReviewSchedule, upsertReviewSchedule,
  getMotivationState, upsertMotivationState, insertAttempt,
  incrementSessionCounts, getSession, getAllSkillStates, schedulePhaseReview,
  getRecentAttemptsForSkill, getSessionBehaviorAttempts,
  getLastFsrsShadowEntry, insertFsrsShadowLog,
  getAttemptHistory, insertDktShadowLog, insertExplanationGrade,
  insertBehaviorQualityShadow, insertBktParamShadow,
} from '@/lib/db/queries'
import { DKT_HISTORY_LIMIT, getBundledDktModel, isDktShadowEnabled, predictForAttempt } from '@/lib/dkt/shadow'
import { getAllNodes } from '@/lib/graph'
import type { Question, DifficultyTier, QuestionFormat, BehaviorQualityShadowEntry } from '@/types'
import { canChooseTopicSwitch, getGuidedArcProgress } from '@/lib/session/engine'
import { computeBktMovementComparison, isFeynmanAttempt } from '@/lib/analytics/bkt-movement'

const MIN_LATENCY = 100
const MAX_LATENCY = 5 * 60 * 1000

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { question_id, skill_id, session_id, latency_ms, hesitation_ms, client_answer,
          difficulty_tier, question_format, revision_count } = body

  if (!question_id || !skill_id) return NextResponse.json({ error: 'question_id and skill_id required' }, { status: 400 })

  // ── Server-side answer verification
  let correct = false
  const isGuidedReflection = question_format === 'explain' && (
    question_id.endsWith('_explain_back') || question_id.endsWith('_feynman_loop')
  )
  try {
    const questions: Question[] = require(`../../../../content/questions/by-skill/${skill_id}.json`)
    const q = questions.find(q => q.id === question_id)
    if (!q && !isGuidedReflection) return NextResponse.json({ error: 'Unknown question_id' }, { status: 400 })

    if (q?.format === 'mcq') correct = client_answer === q.correct_option_id
    else if (q?.format === 'fill') {
      const ans = (client_answer || '').toString().trim().toLowerCase()
      correct = ans === (q.correct_answer || '').trim().toLowerCase() ||
                (q.keywords || []).some((kw: string) => ans.includes(kw.toLowerCase()))
    } else if (q?.format === 'order') {
      correct = isOrderAnswerCorrect((client_answer || '').toString(), q.correct_answer)
    } else {
      correct = typeof body.correct === 'boolean' ? body.correct : false
    }
  } catch {
    correct = typeof body.correct === 'boolean' ? body.correct : false
  }

  // ── Validate session ownership
  if (session_id) {
    const session = await getSession(session_id)
    if (!session || session.learner_id !== user.id)
      return NextResponse.json({ error: 'Invalid session' }, { status: 403 })
  }

  const safe_latency = Math.min(MAX_LATENCY, Math.max(MIN_LATENCY, latency_ms || 3000))
  const parsedRevisionCount = Number.isFinite(Number(revision_count)) ? Math.trunc(Number(revision_count)) : 0
  const safe_revision_count = Math.min(100, Math.max(0, parsedRevisionCount))
  // Hesitation is the leading part of the attempt, so it can never exceed it.
  const parsedHesitation = Number.isFinite(Number(hesitation_ms)) ? Math.trunc(Number(hesitation_ms)) : 0
  const safe_hesitation = Math.min(safe_latency, Math.max(0, parsedHesitation))

  // ── Load current state (parallel)
  const [skillState, motivation] = await Promise.all([
    getSkillState(user.id, skill_id),
    getMotivationState(user.id),
  ])

  if (!skillState) return NextResponse.json({ error: 'Skill state not initialised — run /api/diagnostic first' }, { status: 400 })
  if (!motivation) return NextResponse.json({ error: 'Motivation state missing' }, { status: 400 })

  const wasMastered = skillState.mastery_state === 'mastered'
  const schedule    = await getReviewSchedule(user.id, skill_id)

  // ── Update BKT
  // Reasoning-quality evidence comes from grading free-text reasoning whenever the
  // learner submitted it (question_format 'explain'); question types with no reasoning
  // to evaluate (mcq/fill/code/order) keep the neutral modifier.
  // NLP live cutover (2026-08-12): the LLM grader (src/lib/nlp/grader.ts) is now primary
  // -- it measurably beats the rule-based classifier (96.2% vs 67.0% agreement with human
  // labels, kappa 0.943 vs 0.498 on 106 examples, live-tested with real model failover)
  // and internally hard-falls-back to the same rule-based classifier if every free-tier
  // model fails. This call site adds one more layer of the same fail-open guarantee: any
  // unexpected failure (e.g. catalog discovery throwing before its own model loop) still
  // resolves to the rule-based classifier directly, so a grading failure of any kind can
  // never block the attempt itself from being scored and persisted.
  const explanationText = typeof client_answer === 'string' ? client_answer.trim() : ''
  const priorExplanation = typeof body.prior_answer === 'string' ? body.prior_answer.trim() : ''
  let reasoningQuality = 1
  let grade: GradeExplanationResult | null = null
  if (question_format === 'explain' && explanationText) {
    const conceptNode = getAllNodes().find(n => n.id === skill_id)
    try {
      grade = await gradeExplanation({ concept: conceptNode?.label ?? skill_id, explanationText })
    } catch {
      // confidence 0 is the sentinel for "no model produced this grade", so a
      // re-scoring harness can exclude these rows from model-vs-human comparisons.
      grade = {
        category: classifyExplanation(explanationText), confidence: 0,
        rationale: 'rule-based fallback: the grader threw before producing a grade',
        servedBy: 'rule-based-fallback', promptVersion: 'none', fromCache: false,
        attempts: [], latencyMs: 0,
      }
    }
    reasoningQuality = reasoningQualityFromCategory(grade.category)
    // One attempt, one verdict. Free text has no answer key, so the grade above
    // is the only verification there is: deriving `correct` from the same
    // category that sets reasoningQuality makes a client-sent verdict (which
    // used to come from the rule-based classifier while this graded with the
    // LLM) unable to disagree with it.
    correct = grade.category === 'meaning-included'
  }
  const behaviorModifier = deriveBehaviorEvidenceModifier(motivation, safe_latency)
  const evidence = { reasoningQuality, behavior: behaviorModifier }
  // Level 16, in shadow: the same attempt under this skill's EM-fitted
  // parameters beside the live global set. bktUpdate reads p_slip, p_guess and
  // p_transit off the state, so a parameter set enters by swapping those three
  // fields and nothing inside the model changes. isPerSkillBktEnabled refuses
  // a parameter file fitted on simulator output whatever the flag says.
  const fittedParams = paramsFor(skill_id)
  const applyFitted = isPerSkillBktEnabled()
  const liveUpdated = bktUpdate(skillState, correct, schedule?.repetitions ?? 0, evidence)
  const fittedUpdated = hasFittedParams(skill_id)
    ? bktUpdate({ ...skillState, p_transit: fittedParams.p_transit, p_slip: fittedParams.p_slip, p_guess: fittedParams.p_guess },
        correct, schedule?.repetitions ?? 0, evidence)
    : liveUpdated
  const updatedState = applyFitted ? fittedUpdated : liveUpdated
  const bktParamShadow = {
    learner_id: user.id, skill_id, correct, p_know_before: skillState.p_know,
    live_p_know_after: liveUpdated.p_know, live_p_transit: skillState.p_transit,
    live_p_slip: skillState.p_slip, live_p_guess: skillState.p_guess,
    fitted_p_know_after: fittedUpdated.p_know, fitted_p_transit: fittedParams.p_transit,
    fitted_p_slip: fittedParams.p_slip, fitted_p_guess: fittedParams.p_guess,
    has_fitted_params: hasFittedParams(skill_id), applied: applyFitted,
    params_synthetic: fittedParamsProvenance().synthetic,
  }

  // ── Update SM-2, with FSRS alongside (FSRS-3 shadow mode). FSRS is always
  // computed and logged from the same correctness/latency evidence; it only
  // sets the live due date when the deployment opts in with SCHEDULER=fsrs
  // (FSRS-5). Any FSRS failure (e.g. migration 004 missing) is isolated and
  // falls back to SM-2's own schedule.
  let fsrsShadow: { sm2_interval_days: number; fsrs_interval_days: number; fsrs_stability: number; fsrs_difficulty: number; fsrs_due_at: string } | null = null
  // Level 11, in shadow: the behaviour-aware quality is computed from the same
  // attempt and logged beside the live one, and only sets the live schedule
  // under ADAPTIVE_QUALITY=1 (a live cutover, so off by default).
  let behaviorQualityShadow: Omit<BehaviorQualityShadowEntry, 'id' | 'created_at' | 'learner_id' | 'skill_id' | 'attempt_id'> | null = null
  if (schedule) {
    const signals: AttemptBehaviorSignals = {
      latency_ms: safe_latency, hesitation_ms: safe_hesitation,
      revision_count: safe_revision_count, guided_reflection: isGuidedReflection,
    }
    const liveQuality     = bktToQuality(correct, safe_latency)
    const behaviorQuality = adaptiveQuality(correct, signals)
    const applyAdaptive   = isAdaptiveQualityEnabled()
    // Both schedules come from the same starting point, so the log records the
    // scheduling consequence of each quality and not only the tier.
    const liveSchedule     = reconcileBktSm2(updatedState.p_know, wasMastered, schedule, liveQuality)
    const adaptiveSchedule = behaviorQuality === liveQuality
      ? liveSchedule
      : reconcileBktSm2(updatedState.p_know, wasMastered, schedule, behaviorQuality)
    const sm2Schedule = applyAdaptive ? adaptiveSchedule : liveSchedule
    behaviorQualityShadow = {
      correct, latency_ms: safe_latency, hesitation_ms: safe_hesitation,
      revision_count: safe_revision_count, guided_reflection: isGuidedReflection,
      live_quality: liveQuality, adaptive_quality: behaviorQuality,
      live_fsrs_rating: fsrsRatingFromCorrectness(correct, safe_latency),
      adaptive_fsrs_rating: adaptiveFsrsRating(correct, signals),
      live_interval_days: liveSchedule.interval_days,
      adaptive_interval_days: adaptiveSchedule.interval_days,
      applied: applyAdaptive,
    }

    let fsrsResult: FsrsSchedule | null = null
    try {
      const previousShadow = await getLastFsrsShadowEntry(user.id, skill_id)
      fsrsResult = computeFsrsSchedule(
        previousShadow
          ? { stability: previousShadow.fsrs_stability, difficulty: previousShadow.fsrs_difficulty, last_review: previousShadow.created_at }
          : null,
        applyAdaptive ? adaptiveFsrsRating(correct, signals) : fsrsRatingFromCorrectness(correct, safe_latency),
      )
      fsrsShadow = {
        sm2_interval_days: sm2Schedule.interval_days,
        fsrs_interval_days: fsrsResult.interval_days,
        fsrs_stability: fsrsResult.stability,
        fsrs_difficulty: fsrsResult.difficulty,
        fsrs_due_at: fsrsResult.due_at,
      }
    } catch {
      fsrsResult = null
      fsrsShadow = null
    }

    await upsertReviewSchedule(chooseSchedule(sm2Schedule, fsrsResult, activeScheduler()))
  }

  // ── Update motivation
  const updatedMotivation = updateMotivationState(motivation, correct, safe_latency, updatedState)
  const behaviorSnapshot = buildAttemptBehaviorSnapshot(updatedMotivation, behaviorModifier, safe_hesitation)
  await upsertMotivationState(updatedMotivation)

  // ── Update skill state
  await upsertSkillState(updatedState)

  // ── Unlock prerequisites if newly mastered
  if (updatedState.mastery_state === 'mastered' && !wasMastered) {
    const allStates = await getAllSkillStates(user.id)
    const stateMap  = new Map(allStates.map(s => [s.skill_id, s]))
    stateMap.set(skill_id, updatedState)
    const unblocked = computeUnblocked(stateMap)
    await Promise.all(
      Array.from(stateMap).map(([sid, s]) => {
        if (s.mastery_state === 'blocked' && unblocked.has(sid)) {
          return upsertSkillState({ ...s, mastery_state: 'ready' })
        }
      })
    )

    // ── Phase completion: stagger reviews for all mastered phase skills
    const skillNode = getAllNodes().find(n => n.id === skill_id)
    if (skillNode) {
      const phaseNodes = getAllNodes().filter(n => n.phase === skillNode.phase && !n.deprecated)
      const phaseMastered = phaseNodes.every(n => {
        const s = stateMap.get(n.id)
        return s?.mastery_state === 'mastered'
      })
      if (phaseMastered) {
        await schedulePhaseReview(user.id, phaseNodes.map(n => n.id))
      }
    }
  }

  // ── Record attempt
  const attempt_id = await insertAttempt({
    learner_id: user.id, skill_id, question_id, session_id: session_id ?? null,
    correct, latency_ms: safe_latency, revision_count: safe_revision_count, error_type: null,
    difficulty_tier: difficulty_tier as DifficultyTier,
    question_format: question_format as QuestionFormat,
    p_know_before: skillState.p_know,
    p_know_after: updatedState.p_know,
    ...behaviorSnapshot,
  })
  if (session_id) await incrementSessionCounts(session_id, correct)

  if (behaviorQualityShadow) {
    try {
      await insertBehaviorQualityShadow({ learner_id: user.id, skill_id, attempt_id, ...behaviorQualityShadow })
    } catch {
      // Observational only — see the FSRS and DKT shadow writes below.
    }
  }

  try {
    await insertBktParamShadow({ ...bktParamShadow, attempt_id })
  } catch {
    // Observational only; a deployment without migration 008 must not fail an
    // attempt over a comparison row.
  }

  if (grade) {
    try {
      await insertExplanationGrade({
        learner_id: user.id, skill_id, attempt_id,
        explanation_text: explanationText,
        prior_explanation_text: priorExplanation || null,
        category: grade.category, confidence: grade.confidence,
        reasoning_quality: reasoningQuality, rationale: grade.rationale,
        prompt_version: grade.promptVersion, served_by: grade.servedBy,
        from_cache: grade.fromCache, grader_latency_ms: Math.round(grade.latencyMs),
      })
    } catch {
      // Fail-open like the shadow logs below: a deployment without migration
      // 006 loses the grade record, never the attempt that was already scored.
    }
  }

  if (fsrsShadow) {
    try {
      await insertFsrsShadowLog({ learner_id: user.id, skill_id, attempt_id, ...fsrsShadow })
    } catch {
      // Observational only — see the SM-2 block above.
    }
  }

  // ── DKT shadow mode (DKT-11): DKT's prediction for this attempt from the
  // learner's earlier history, logged next to live BKT's and the outcome.
  // Opt-in (DKT_SHADOW=1), never read back, and fail-open like FSRS above.
  if (isDktShadowEnabled()) {
    try {
      const history = (await getAttemptHistory(user.id, DKT_HISTORY_LIMIT + 1))
        .filter(a => a.id !== attempt_id)
      const prediction = predictForAttempt(await getBundledDktModel(), history, skill_id)
      if (prediction) {
        await insertDktShadowLog({
          learner_id: user.id, skill_id, attempt_id, correct, ...prediction,
          bkt_p_correct: skillState.p_know * (1 - skillState.p_slip) + (1 - skillState.p_know) * skillState.p_guess,
        })
      }
    } catch {
      // Observational only — never affects the learner's attempt.
    }
  }

  const bktMovement = session_id && isFeynmanAttempt(question_id)
    ? computeBktMovementComparison(
        await getRecentAttemptsForSkill(user.id, skill_id),
        { sessionId: session_id, skillId: skill_id },
      )
    : null

  const arcAttempts = session_id
    ? (await getSessionBehaviorAttempts(user.id, session_id)).filter(attempt =>
        attempt.skill_id === skill_id &&
        !attempt.question_id.endsWith('_explain_back') &&
        !attempt.question_id.endsWith('_feynman_loop')
      ).map(attempt => ({
        correct: attempt.correct,
        difficulty_tier: attempt.difficulty_tier as DifficultyTier,
      }))
    : []
  const guidedArc = getGuidedArcProgress(arcAttempts)

  return NextResponse.json({
    correct, attempt_id,
    new_p_know: updatedState.p_know,
    mastery_state: updatedState.mastery_state,
    mastery_tier: getMasteryTier(updatedState.p_know),
    topic_choice_available: canChooseTopicSwitch(updatedState.p_know, guidedArc),
    arc_attempt_count: guidedArc.total_attempt_count,
    guided_arc: guidedArc,
    explanation_unlocked: true,
    motivation: updatedMotivation.state,
    bkt_movement: bktMovement,
  })
}
