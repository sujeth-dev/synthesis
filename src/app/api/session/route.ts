import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { getSessionGate, MAX_REVIEW_ITEMS, planReviewDebt, selectNextTask, SESSION_TASK_CAP } from '@/lib/session/engine'
import { getAllNodes, getHardPrereqs } from '@/lib/graph'
import { initSkillState } from '@/lib/bkt'
import { initSM2, reconcileBktSm2OnLoad } from '@/lib/sm2'
import { getMotivationState, getAllSkillStates, getReviewSchedules,
         createSession, getSession, endSession,
         bulkUpsertSkillStates, bulkUpsertReviewSchedules } from '@/lib/db/queries'
import type { LearnerSkillState, Question, ReviewSchedule, SessionMode } from '@/types'
import fs from 'fs'
import path from 'path'

const QUESTIONS_DIR = path.join(process.cwd(), 'content', 'questions', 'by-skill')

function loadQuestions(skillId: string): Question[] {
  try {
    const raw = fs.readFileSync(path.join(QUESTIONS_DIR, `${skillId}.json`), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { action, session_id, seen_skills = [], seen_question_ids = [], mode, task_limit } = await req.json()

    if (action === 'start') {
      const [session, schedules] = await Promise.all([
        createSession(user.id),
        getReviewSchedules(user.id),
      ])
      const now = new Date()
      const overdueCount = schedules.filter(schedule =>
        schedule.repetitions > 0 && new Date(schedule.due_at) <= now
      ).length
      const reviewPlan = planReviewDebt(overdueCount)
      return NextResponse.json({
        session_id: session.id,
        review_offer_count: reviewPlan.reviewOfferCount,
        additional_review_count: reviewPlan.additionalReviewCount,
        deferred_review_count: reviewPlan.deferredReviewCount,
        session_task_cap: SESSION_TASK_CAP,
      })
    }

    if (action === 'next') {
      if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
      const session = await getSession(session_id)
      if (!session || session.learner_id !== user.id) return NextResponse.json({ error: 'Invalid session' }, { status: 403 })
      const sessionMode = (mode as SessionMode | undefined) ?? 'learn'
      const grantedLimit = Math.min(MAX_REVIEW_ITEMS, Math.max(0, Math.floor(Number(task_limit) || 0)))
      const gate = getSessionGate(session.tasks_count, sessionMode, grantedLimit)
      if (gate === 'complete') {
        return NextResponse.json({ task: null, done: true, reason: 'session_cap' })
      }
      if (gate === 'consent_required') {
        return NextResponse.json({
          task: null,
          done: false,
          consent_required: true,
          can_continue: true,
          tasks_completed: session.tasks_count,
        })
      }

      const [allStatesRaw, allSchedulesRaw, motivation] = await Promise.all([
        getAllSkillStates(user.id),
        getReviewSchedules(user.id),
        getMotivationState(user.id),
      ])
      let allStates = allStatesRaw
      let allSchedules = allSchedulesRaw

      // Auto-sync: initialize states for any new nodes added after onboarding
      const allNodeIds  = new Set(getAllNodes().filter(n => !n.deprecated).map(n => n.id))
      const existingIds = new Set(allStates.map(s => s.skill_id))
      const newNodeIds  = Array.from(allNodeIds).filter(id => !existingIds.has(id))
      if (newNodeIds.length > 0) {
        const stateMap  = new Map(allStates.map(s => [s.skill_id, s]))
        const newStates = newNodeIds.map(id => {
          const prereqs = getHardPrereqs(id)
          const blocked = prereqs.length > 0 && prereqs.some(pid => (stateMap.get(pid)?.p_know ?? 0) < 0.40)
          return initSkillState(user.id, id, undefined, blocked)
        })
        const newSchedules = newNodeIds.map(id => initSM2(user.id, id))
        await Promise.all([
          bulkUpsertSkillStates(newStates),
          bulkUpsertReviewSchedules(newSchedules),
        ])
        allStates = [...allStates, ...newStates]
        allSchedules = [...allSchedules, ...newSchedules]
      }

      const statesBySkill = new Map(allStates.map(state => [state.skill_id, state]))
      const refreshedStates: LearnerSkillState[] = []
      const refreshedSchedules: ReviewSchedule[] = []
      const reconciledStates = new Map(statesBySkill)
      const reconciledSchedules = new Map(allSchedules.map(schedule => [schedule.skill_id, schedule]))

      for (const schedule of allSchedules) {
        const state = statesBySkill.get(schedule.skill_id)
        if (!state) continue
        const refreshed = reconcileBktSm2OnLoad(state, schedule)
        reconciledStates.set(state.skill_id, refreshed.state)
        reconciledSchedules.set(schedule.skill_id, refreshed.schedule)
        if (refreshed.state !== state) refreshedStates.push(refreshed.state)
        if (refreshed.schedule !== schedule) refreshedSchedules.push(refreshed.schedule)
      }

      if (refreshedStates.length > 0 || refreshedSchedules.length > 0) {
        await Promise.all([
          bulkUpsertSkillStates(refreshedStates),
          bulkUpsertReviewSchedules(refreshedSchedules),
        ])
      }

      if (!motivation) return NextResponse.json({ error: 'Motivation state missing — run /api/onboard first' }, { status: 400 })

      const skillStates     = reconciledStates
      const reviewSchedules = reconciledSchedules

      const questionsCache = new Map<string, Question[]>()
      for (const sid of Array.from(skillStates.keys())) {
        const qs = loadQuestions(sid)
        if (qs.length > 0) questionsCache.set(sid, qs)
      }

      const task = selectNextTask({
        skillStates, reviewSchedules, motivationState: motivation,
        seenSkillsThisSession:      seen_skills,
        seenQuestionIdsThisSession: new Set(seen_question_ids),
        questionsCache,
        mode: sessionMode,
      })

      if (!task) return NextResponse.json({ task: null, done: true })
      return NextResponse.json({ task, done: false })
    }

    if (action === 'end') {
      if (session_id) await endSession(session_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/session] Unhandled error:', message)
    return NextResponse.json({ error: `Internal server error: ${message}` }, { status: 500 })
  }
}
