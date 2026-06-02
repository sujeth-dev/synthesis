import { getDb, generateId } from '@/lib/db'
import type {
  LearnerProfile, LearnerSkillState, ReviewSchedule,
  AttemptEvent, Session, MotivationState,
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
  await getDb().from('attempt_events').insert({
    ...attempt,
    id,
    attempted_at: new Date().toISOString(),
  })
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
