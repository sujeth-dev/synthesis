import { getDb, generateId } from '@/lib/db'
import type {
  LearnerProfile, LearnerSkillState, ReviewSchedule,
  AttemptEvent, Session, MotivationState, FsrsShadowLogEntry, DktShadowLogEntry,
  ExplanationGrade, BehaviorQualityShadowEntry, BktParamShadowEntry,
  QuestionRating, LearnerAbility, Phase, SelectionShadowEntry,
  ExamRun, ExamItemEvent,
} from '@/types'

// ─────────────────────────────────────────────
// LEARNER PROFILES
// ─────────────────────────────────────────────

export async function getLearnerProfile(learnerId: string): Promise<LearnerProfile | null> {
  const { data } = await getDb()
    .from('learner_profiles')
    .select('id, email, display_name, created_at, diagnostic_done, entry_node, streak_days, last_session_at, graph_version')
    .eq('id', learnerId)
    .maybeSingle()
  return data
}

export async function setDiagnosticDone(learnerId: string, entryNode: string) {
  await getDb()
    .from('learner_profiles')
    .update({ diagnostic_done: true, entry_node: entryNode })
    .eq('id', learnerId)
}

export async function updateStreak(learnerId: string) {
  const { data: row } = await getDb()
    .from('learner_profiles')
    .select('last_session_at, streak_days')
    .eq('id', learnerId)
    .maybeSingle()

  if (!row) return

  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastDate  = row.last_session_at?.slice(0, 10)

  let newStreak = row.streak_days ?? 0
  if (lastDate === today) {
    // Already counted today — no change
  } else if (lastDate === yesterday) {
    newStreak += 1
  } else {
    newStreak = 1
  }

  await getDb()
    .from('learner_profiles')
    .update({ streak_days: newStreak, last_session_at: new Date().toISOString() })
    .eq('id', learnerId)
}

// ─────────────────────────────────────────────
// SKILL STATES
// ─────────────────────────────────────────────

export async function getAllSkillStates(learnerId: string): Promise<LearnerSkillState[]> {
  const { data } = await getDb()
    .from('learner_skill_states')
    .select('*')
    .eq('learner_id', learnerId)
  return data ?? []
}

export async function getSkillState(learnerId: string, skillId: string): Promise<LearnerSkillState | null> {
  const { data } = await getDb()
    .from('learner_skill_states')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('skill_id', skillId)
    .maybeSingle()
  return data
}

export async function upsertSkillState(state: LearnerSkillState) {
  await getDb()
    .from('learner_skill_states')
    .upsert(state, { onConflict: 'learner_id,skill_id' })
}

export async function bulkUpsertSkillStates(states: LearnerSkillState[]) {
  if (states.length === 0) return
  await getDb()
    .from('learner_skill_states')
    .upsert(states, { onConflict: 'learner_id,skill_id' })
}

// ─────────────────────────────────────────────
// REVIEW SCHEDULES
// ─────────────────────────────────────────────

export async function getReviewSchedules(learnerId: string): Promise<ReviewSchedule[]> {
  const { data } = await getDb()
    .from('review_schedules')
    .select('*')
    .eq('learner_id', learnerId)
  return data ?? []
}

export async function getReviewSchedule(learnerId: string, skillId: string): Promise<ReviewSchedule | null> {
  const { data } = await getDb()
    .from('review_schedules')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('skill_id', skillId)
    .maybeSingle()
  return data
}

export async function upsertReviewSchedule(schedule: ReviewSchedule) {
  await getDb()
    .from('review_schedules')
    .upsert(schedule, { onConflict: 'learner_id,skill_id' })
}

export async function schedulePhaseReview(learnerId: string, skillIds: string[]) {
  const db = getDb()
  await Promise.all(
    skillIds.map(async (id, i) => {
      const dueDate = new Date(Date.now() + Math.min(i, 4) * 86400000).toISOString()
      await db
        .from('review_schedules')
        .update({ due_at: dueDate })
        .eq('learner_id', learnerId)
        .eq('skill_id', id)
        .gt('repetitions', 0)
    })
  )
}

export async function bulkUpsertReviewSchedules(schedules: ReviewSchedule[]) {
  if (schedules.length === 0) return
  await getDb()
    .from('review_schedules')
    .upsert(schedules, { onConflict: 'learner_id,skill_id' })
}

// ─────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────

export async function createSession(learnerId: string): Promise<Session> {
  const id  = generateId()
  const now = new Date().toISOString()
  await getDb().from('sessions').insert({ id, learner_id: learnerId, started_at: now })
  return { id, learner_id: learnerId, started_at: now, ended_at: null, tasks_count: 0, correct_count: 0, abandoned: false }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const { data } = await getDb()
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  return data
}

export async function incrementSessionCounts(sessionId: string, correct: boolean) {
  const { data } = await getDb()
    .from('sessions')
    .select('tasks_count, correct_count')
    .eq('id', sessionId)
    .maybeSingle()
  if (!data) return
  await getDb()
    .from('sessions')
    .update({
      tasks_count:   (data.tasks_count   ?? 0) + 1,
      correct_count: (data.correct_count ?? 0) + (correct ? 1 : 0),
    })
    .eq('id', sessionId)
}

export async function endSession(sessionId: string) {
  await getDb()
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
}

export async function getRecentSessions(learnerId: string, limit = 10): Promise<Session[]> {
  const { data } = await getDb()
    .from('sessions')
    .select('*')
    .eq('learner_id', learnerId)
    .order('started_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ─────────────────────────────────────────────
// ATTEMPTS
// ─────────────────────────────────────────────

export async function insertAttempt(attempt: Omit<AttemptEvent, 'id' | 'attempted_at'>): Promise<string> {
  const id = generateId()
  const attempted_at = new Date().toISOString()
  const { error } = await getDb().from('attempt_events').insert({
    ...attempt,
    id,
    attempted_at,
  })
  if (error) {
    const missingOptionalColumns = error.code === 'PGRST204' ||
      String(error.message ?? '').includes('attempt_events') && String(error.message ?? '').includes('column')
    if (!missingOptionalColumns) throw new Error(`Attempt persistence failed: ${error.message}`)

    // Migration-safe fallback for deployments that have not yet applied 002/003.
    // Core attempt continuity must keep working, while analytics fields remain
    // unavailable until the operator explicitly applies those migrations.
    const legacyRow = {
      id,
      learner_id: attempt.learner_id,
      skill_id: attempt.skill_id,
      question_id: attempt.question_id,
      session_id: attempt.session_id,
      correct: attempt.correct,
      latency_ms: attempt.latency_ms,
      revision_count: attempt.revision_count,
      error_type: attempt.error_type,
      difficulty_tier: attempt.difficulty_tier,
      question_format: attempt.question_format,
      attempted_at,
    }
    const { error: legacyError } = await getDb().from('attempt_events').insert(legacyRow)
    if (legacyError) throw new Error(`Attempt persistence failed: ${legacyError.message}`)
  }
  return id
}

export async function getLastAttemptForQuestion(learnerId: string, questionId: string): Promise<AttemptEvent | null> {
  const { data } = await getDb()
    .from('attempt_events')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('question_id', questionId)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function getRecentAttempts(learnerId: string, limit = 200): Promise<AttemptEvent[]> {
  const { data } = await getDb()
    .from('attempt_events')
    .select('*')
    .eq('learner_id', learnerId)
    .order('attempted_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getRecentAttemptsForSkill(learnerId: string, skillId: string, limit = 200): Promise<AttemptEvent[]> {
  const { data } = await getDb()
    .from('attempt_events')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('skill_id', skillId)
    .order('attempted_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getSessionBehaviorAttempts(learnerId: string, sessionId: string): Promise<AttemptEvent[]> {
  const { data } = await getDb()
    .from('attempt_events')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('session_id', sessionId)
    .order('attempted_at', { ascending: true })
  return data ?? []
}

// ─────────────────────────────────────────────
// FSRS SHADOW LOG (observational only — SM-2 remains the live scheduler)
// ─────────────────────────────────────────────

export async function getLastFsrsShadowEntry(learnerId: string, skillId: string): Promise<FsrsShadowLogEntry | null> {
  const { data } = await getDb()
    .from('fsrs_shadow_log')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('skill_id', skillId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function getFsrsShadowEntries(learnerId: string, limit: number): Promise<FsrsShadowLogEntry[]> {
  const { data } = await getDb()
    .from('fsrs_shadow_log')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function insertFsrsShadowLog(entry: Omit<FsrsShadowLogEntry, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getDb().from('fsrs_shadow_log').insert({
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`FSRS shadow log insert failed: ${error.message}`)
}

// ─────────────────────────────────────────────
// DKT SHADOW LOG (observational only — BKT remains the live knowledge model)
// ─────────────────────────────────────────────

// The learner's most recent attempts, oldest first — DKT's input sequence.
export async function getAttemptHistory(learnerId: string, limit: number): Promise<Array<{ id: string; skill_id: string; correct: boolean }>> {
  const { data } = await getDb()
    .from('attempt_events')
    .select('id, skill_id, correct, attempted_at')
    .eq('learner_id', learnerId)
    .order('attempted_at', { ascending: false })
    .limit(limit)
  return (data ?? []).reverse()
}

// Level 13: /engine reads the shadow logs back. They stay observational — this
// is a display of what they recorded, never an input to the engine.
export async function getDktShadowEntries(learnerId: string, limit: number): Promise<DktShadowLogEntry[]> {
  const { data } = await getDb()
    .from('dkt_shadow_log')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function insertDktShadowLog(entry: Omit<DktShadowLogEntry, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getDb().from('dkt_shadow_log').insert({
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`DKT shadow log insert failed: ${error.message}`)
}

// ─────────────────────────────────────────────
// BEHAVIOUR QUALITY SHADOW (Level 11 — requires migration 007)
// ─────────────────────────────────────────────

// Throws on failure; the attempt route swallows it, like the FSRS and DKT
// shadow writes — an observational log can never fail an attempt.
export async function insertBehaviorQualityShadow(entry: Omit<BehaviorQualityShadowEntry, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getDb().from('behavior_quality_shadow').insert({
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Behaviour quality shadow insert failed: ${error.message}`)
}

export async function getBehaviorQualityShadow(learnerId: string, limit: number): Promise<BehaviorQualityShadowEntry[]> {
  const { data } = await getDb()
    .from('behavior_quality_shadow')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ─────────────────────────────────────────────
// PER-SKILL BKT PARAMETERS (Level 16 — requires migration 008)
// ─────────────────────────────────────────────

export async function insertBktParamShadow(entry: Omit<BktParamShadowEntry, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getDb().from('bkt_param_shadow').insert({
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`BKT parameter shadow insert failed: ${error.message}`)
}

export async function getBktParamShadow(learnerId: string, limit: number): Promise<BktParamShadowEntry[]> {
  const { data } = await getDb()
    .from('bkt_param_shadow')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ─────────────────────────────────────────────
// ELO RATINGS (SCORE-1 — requires migration 009)
// ─────────────────────────────────────────────

// These four throw on failure; /api/attempt swallows it, like every other
// observational write — a rating is never worth losing an attempt over.

export async function getQuestionRating(questionId: string): Promise<QuestionRating | null> {
  const { data } = await getDb()
    .from('question_ratings')
    .select('*')
    .eq('question_id', questionId)
    .maybeSingle()
  return data ?? null
}

export async function upsertQuestionRating(rating: Omit<QuestionRating, 'updated_at'>): Promise<void> {
  const { error } = await getDb()
    .from('question_ratings')
    .upsert({ ...rating, updated_at: new Date().toISOString() }, { onConflict: 'question_id' })
  if (error) throw new Error(`Question rating upsert failed: ${error.message}`)
}

export async function getQuestionRatingsForSkills(skillIds: string[]): Promise<QuestionRating[]> {
  if (skillIds.length === 0) return []
  const { data } = await getDb()
    .from('question_ratings')
    .select('*')
    .in('skill_id', skillIds)
  return data ?? []
}

export async function getLearnerAbility(learnerId: string, phase: Phase): Promise<LearnerAbility | null> {
  const { data } = await getDb()
    .from('learner_ability')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('phase', phase)
    .maybeSingle()
  return data ?? null
}

export async function upsertLearnerAbility(ability: Omit<LearnerAbility, 'updated_at'>): Promise<void> {
  const { error } = await getDb()
    .from('learner_ability')
    .upsert({ ...ability, updated_at: new Date().toISOString() }, { onConflict: 'learner_id,phase' })
  if (error) throw new Error(`Learner ability upsert failed: ${error.message}`)
}

// ─────────────────────────────────────────────
// SELECTION SHADOW (SCORE-3 — requires migration 010)
// ─────────────────────────────────────────────

// Throws on failure; /api/session swallows it — a comparison row can never
// cost a learner their next task.
export async function insertSelectionShadow(entry: Omit<SelectionShadowEntry, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getDb().from('selection_shadow').insert({
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Selection shadow insert failed: ${error.message}`)
}

export async function getSelectionShadow(learnerId: string, limit: number): Promise<SelectionShadowEntry[]> {
  const { data } = await getDb()
    .from('selection_shadow')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ─────────────────────────────────────────────
// EXAM RUNS (EXAM-2 — requires migration 011)
// ─────────────────────────────────────────────

// These throw: unlike the shadow logs, the exam *is* these rows, so a missing
// migration has to surface as an error rather than an exam that forgets.

export async function createExamRun(run: Omit<ExamRun, 'id' | 'created_at'>): Promise<ExamRun> {
  const row = { ...run, id: generateId(), created_at: new Date().toISOString() }
  const { error } = await getDb().from('exam_runs').insert(row)
  if (error) throw new Error(`Exam run insert failed: ${error.message}`)
  return row
}

export async function getExamRun(runId: string, learnerId: string): Promise<ExamRun | null> {
  const { data } = await getDb()
    .from('exam_runs')
    .select('*')
    .eq('id', runId)
    .eq('learner_id', learnerId)
    .maybeSingle()
  return data ?? null
}

export async function updateExamRun(runId: string, patch: Partial<Omit<ExamRun, 'id' | 'learner_id'>>): Promise<void> {
  const { error } = await getDb().from('exam_runs').update(patch).eq('id', runId)
  if (error) throw new Error(`Exam run update failed: ${error.message}`)
}

export async function getExamRuns(learnerId: string, limit: number): Promise<ExamRun[]> {
  const { data } = await getDb()
    .from('exam_runs')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getExamItems(runId: string): Promise<ExamItemEvent[]> {
  const { data } = await getDb()
    .from('exam_item_events')
    .select('*')
    .eq('run_id', runId)
    .order('position', { ascending: true })
  return data ?? []
}

export async function getLearnerExamItems(learnerId: string, limit: number): Promise<ExamItemEvent[]> {
  const { data } = await getDb()
    .from('exam_item_events')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function insertExamItem(item: Omit<ExamItemEvent, 'id' | 'created_at'>): Promise<ExamItemEvent> {
  const row = { ...item, id: generateId(), created_at: new Date().toISOString() }
  const { error } = await getDb().from('exam_item_events').insert(row)
  if (error) throw new Error(`Exam item insert failed: ${error.message}`)
  return row
}

export async function updateExamItem(itemId: string, patch: Partial<Omit<ExamItemEvent, 'id' | 'run_id' | 'learner_id'>>): Promise<void> {
  const { error } = await getDb().from('exam_item_events').update(patch).eq('id', itemId)
  if (error) throw new Error(`Exam item update failed: ${error.message}`)
}

// ─────────────────────────────────────────────
// EXPLANATION GRADES (Level 10 — requires migration 006)
// ─────────────────────────────────────────────

// Throws on failure; the attempt route swallows it, so a deployment without
// migration 006 loses the grade record but still scores the attempt.
export async function insertExplanationGrade(entry: Omit<ExplanationGrade, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getDb().from('explanation_grades').insert({
    ...entry,
    id: generateId(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Explanation grade insert failed: ${error.message}`)
}

export async function getExplanationGrades(learnerId: string, limit: number): Promise<ExplanationGrade[]> {
  const { data } = await getDb()
    .from('explanation_grades')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ─────────────────────────────────────────────
// MOTIVATION STATE
// ─────────────────────────────────────────────

export async function getMotivationState(learnerId: string): Promise<MotivationState | null> {
  const { data } = await getDb()
    .from('motivation_states')
    .select('*')
    .eq('learner_id', learnerId)
    .maybeSingle()
  return data
}

export async function upsertMotivationState(state: MotivationState) {
  await getDb()
    .from('motivation_states')
    .upsert(state, { onConflict: 'learner_id' })
}
