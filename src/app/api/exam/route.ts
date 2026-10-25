import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import {
  createExamRun, getExamRun, updateExamRun, getExamItems, insertExamItem, updateExamItem, insertAttempt,
} from '@/lib/db/queries'
import { getAllNodes } from '@/lib/graph'
import { PHASE_EVALUATION_FILES, type PhaseKey } from '@/lib/phases'
import {
  checkpointTimeLimitSec, chooseNextItem, coldStartExamRating, examAbility, isHintAbuse, stopReason,
  type ExamMode, type StopReason,
} from '@/lib/exam/policy'
import { buildDebrief } from '@/lib/exam/debrief'
import type { ExamItemEvent, ExamRun, Phase, PhaseEvaluationQuestion } from '@/types'

// The Exam Room's server (EXAM-2). Measurement-only by decision: this route
// writes exam_runs, exam_item_events and, at finish, attempt_events — never
// learner_skill_states, review_schedules or motivation_states, so an exam can
// neither raise nor lower what the adaptive session believes.
//
// The server holds the run: it picks every item, keeps the deadline, and never
// sends a correct option, a misconception or an explanation before finish.

const PHASE_EVAL_DIR = path.join(process.cwd(), 'content', 'questions', 'phase-evaluation')

// /api/attempt clamps latency at five minutes, which suits a practice question
// and would silently cut a long analyse item. The exam keeps its own ceiling: an
// hour, past which the tab was plainly left open.
const EXAM_MAX_LATENCY_MS = 60 * 60 * 1000

// Network slack on the deadline, so an answer clicked at 0:00 still lands.
const DEADLINE_GRACE_MS = 5000

function loadBank(phase: PhaseKey): PhaseEvaluationQuestion[] | null {
  const fileName = PHASE_EVALUATION_FILES[phase]
  if (!fileName) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(PHASE_EVAL_DIR, fileName), 'utf-8'))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** What the learner may see of an item before the run is finished. */
function publicItem(q: PhaseEvaluationQuestion, event: ExamItemEvent, mode: ExamMode) {
  return {
    question_id: q.id,
    skill_id: q.skill_id,
    bloom_level: q.bloom_level,
    stem: q.stem,
    options: q.options.map(o => ({ id: o.id, text: o.text })),
    time_target_sec: q.time_target_sec,
    position: event.position,
    selected_option_id: event.selected_option_id,
    marked: event.marked,
    hint_level: event.hint_level,
    // Hints already earned are returned so a reload does not lose them.
    hints: mode === 'practice' ? q.hints.slice(0, event.hint_level) : [],
  }
}

function publicRun(run: ExamRun) {
  return {
    id: run.id, phase: run.phase, mode: run.mode, status: run.status,
    started_at: run.started_at, deadline_at: run.deadline_at, stop_reason: run.stop_reason,
  }
}

function deadlinePassed(run: ExamRun, now: number, grace = 0): boolean {
  return run.deadline_at !== null && now > Date.parse(run.deadline_at) + grace
}

function responsesOf(items: ExamItemEvent[]) {
  return items
    .filter(i => i.selected_option_id !== null)
    .map(i => ({
      question_id: i.question_id, bloom_level: i.bloom_level, rating: i.rating,
      correct: i.correct === true, hint_level: i.hint_level,
    }))
}

async function serveNext(run: ExamRun, bank: PhaseEvaluationQuestion[], items: ExamItemEvent[], now: number) {
  const ability = examAbility(responsesOf(items))
  const next = chooseNextItem(bank, items.map(i => i.question_id), ability.theta, q => coldStartExamRating(q.difficulty))
  if (!next) return null
  const event = await insertExamItem({
    run_id: run.id, learner_id: run.learner_id,
    question_id: next.id, skill_id: next.skill_id, bloom_level: next.bloom_level,
    position: items.length, rating: coldStartExamRating(next.difficulty),
    time_target_sec: next.time_target_sec, served_at: new Date(now).toISOString(),
    selected_option_id: null, correct: null, latency_ms: null, answered_at: null,
    hint_level: 0, last_hint_at: null, hint_abuse: false, marked: false,
  })
  return { question: next, event }
}

function skillLabels(skillIds: string[]): Record<string, string> {
  const wanted = new Set(skillIds)
  const labels: Record<string, string> = {}
  for (const node of getAllNodes()) if (wanted.has(node.id)) labels[node.id] = node.label
  return labels
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const runId = req.nextUrl.searchParams.get('run_id')
  if (!runId) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const run = await getExamRun(runId, user.id)
  if (!run) return NextResponse.json({ error: 'Unknown run' }, { status: 404 })
  const bank = loadBank(run.phase as PhaseKey) ?? []
  const byId = new Map(bank.map(q => [q.id, q]))
  const items = await getExamItems(run.id)
  return NextResponse.json({
    run: publicRun(run),
    items: items.flatMap(e => {
      const q = byId.get(e.question_id)
      return q ? [publicItem(q, e, run.mode)] : []
    }),
    debrief: run.status === 'finished' ? run.debrief : null,
    skill_labels: run.status === 'finished' ? skillLabels(items.map(i => i.skill_id)) : {},
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json() as Record<string, unknown>
  const action = body.action
  const now = Date.now()

  if (action === 'start') {
    const phase = body.phase as PhaseKey
    const mode = body.mode as ExamMode
    if (mode !== 'practice' && mode !== 'checkpoint') {
      return NextResponse.json({ error: "mode must be 'practice' or 'checkpoint'" }, { status: 400 })
    }
    const bank = typeof phase === 'string' ? loadBank(phase) : null
    if (!bank || bank.length === 0) return NextResponse.json({ error: 'Unknown or unauthored phase' }, { status: 400 })

    const limitSec = mode === 'checkpoint' ? checkpointTimeLimitSec(bank) : 0
    const run = await createExamRun({
      learner_id: user.id, phase: phase as Phase, mode, status: 'active',
      started_at: new Date(now).toISOString(),
      deadline_at: mode === 'checkpoint' ? new Date(now + limitSec * 1000).toISOString() : null,
      finished_at: null, stop_reason: null, theta: null, se: null, n_items: null, debrief: null,
    })
    const first = await serveNext(run, bank, [], now)
    if (!first) return NextResponse.json({ error: 'Empty bank' }, { status: 500 })
    return NextResponse.json({
      run: publicRun(run), time_limit_sec: limitSec || null,
      item: publicItem(first.question, first.event, mode),
    })
  }

  const runId = typeof body.run_id === 'string' ? body.run_id : null
  if (!runId) return NextResponse.json({ error: 'run_id required' }, { status: 400 })
  const run = await getExamRun(runId, user.id)
  if (!run) return NextResponse.json({ error: 'Unknown run' }, { status: 404 })
  const bank = loadBank(run.phase as PhaseKey)
  if (!bank) return NextResponse.json({ error: 'Phase bank missing' }, { status: 500 })
  const byId = new Map(bank.map(q => [q.id, q]))
  const items = await getExamItems(run.id)

  if (action === 'finish') {
    if (run.status === 'finished') {
      return NextResponse.json({ debrief: run.debrief, skill_labels: skillLabels(items.map(i => i.skill_id)) })
    }
    const stop = (run.stop_reason as StopReason | null) ?? (deadlinePassed(run, now) ? 'time' : null)
    const debrief = buildDebrief(items.flatMap(e => {
      const q = byId.get(e.question_id)
      return q ? [{
        question: q, rating: e.rating, selected_option_id: e.selected_option_id,
        latency_ms: e.latency_ms, hint_level: e.hint_level, hint_abuse: e.hint_abuse,
      }] : []
    }), stop)

    // One attempt_events row per answered item, written once at the end so a
    // revised answer is recorded as its final value rather than twice.
    for (const e of items) {
      if (e.selected_option_id === null) continue
      await insertAttempt({
        learner_id: user.id, skill_id: e.skill_id, question_id: e.question_id, session_id: null,
        correct: e.correct === true, latency_ms: e.latency_ms ?? 0, revision_count: 0, error_type: null,
        difficulty_tier: 'same', question_format: 'mcq',
        p_know_before: null, p_know_after: null,
        motivation_state: null, consecutive_errors: null,
        slow_response_streak: null, behavior_modifier: null, hesitation_ms: null,
      })
    }

    await updateExamRun(run.id, {
      status: 'finished', finished_at: new Date(now).toISOString(), stop_reason: stop,
      theta: debrief.theta, se: debrief.se, n_items: debrief.n, debrief,
    })
    return NextResponse.json({ debrief, skill_labels: skillLabels(items.map(i => i.skill_id)) })
  }

  if (run.status !== 'active') return NextResponse.json({ error: 'Run already finished' }, { status: 409 })

  const questionId = typeof body.question_id === 'string' ? body.question_id : null
  const event = items.find(i => i.question_id === questionId)
  const question = questionId ? byId.get(questionId) : undefined
  if (!event || !question) return NextResponse.json({ error: 'Item not served in this run' }, { status: 400 })

  if (action === 'mark') {
    await updateExamItem(event.id, { marked: body.marked === true })
    return NextResponse.json({ ok: true })
  }

  if (action === 'hint') {
    if (run.mode !== 'practice') return NextResponse.json({ error: 'No hints in a checkpoint' }, { status: 403 })
    if (event.hint_level >= question.hints.length) {
      return NextResponse.json({ hint_level: event.hint_level, hints: question.hints })
    }
    const since = now - Date.parse(event.last_hint_at ?? event.served_at)
    const level = event.hint_level + 1
    await updateExamItem(event.id, {
      hint_level: level, last_hint_at: new Date(now).toISOString(),
      hint_abuse: event.hint_abuse || isHintAbuse(since),
    })
    return NextResponse.json({ hint_level: level, hints: question.hints.slice(0, level) })
  }

  if (action === 'answer') {
    if (deadlinePassed(run, now, DEADLINE_GRACE_MS)) {
      await updateExamRun(run.id, { stop_reason: 'time' })
      return NextResponse.json({ time_up: true }, { status: 409 })
    }
    const selected = typeof body.selected_option_id === 'string' ? body.selected_option_id : null
    if (!selected || !question.options.some(o => o.id === selected)) {
      return NextResponse.json({ error: 'selected_option_id is not an option of this item' }, { status: 400 })
    }
    const rawLatency = typeof body.latency_ms === 'number' ? body.latency_ms : 0
    const patch = {
      selected_option_id: selected,
      correct: selected === question.correct_option_id,
      latency_ms: Math.round(Math.min(EXAM_MAX_LATENCY_MS, Math.max(0, rawLatency))),
      answered_at: new Date(now).toISOString(),
      ...(typeof body.marked === 'boolean' ? { marked: body.marked } : {}),
    }
    await updateExamItem(event.id, patch)
    const updated = items.map(i => i.id === event.id ? { ...i, ...patch } : i)

    // Revisiting an earlier item changes the estimate but serves nothing new.
    const isLatest = event.position === items.length - 1
    if (!isLatest) return NextResponse.json({ ok: true })

    const ability = examAbility(responsesOf(updated))
    const stop = stopReason(ability, bank.length - updated.length, false)
    if (stop) {
      await updateExamRun(run.id, { stop_reason: stop })
      return NextResponse.json({ done: true, stop_reason: stop })
    }
    const next = await serveNext(run, bank, updated, now)
    if (!next) {
      await updateExamRun(run.id, { stop_reason: 'bank' })
      return NextResponse.json({ done: true, stop_reason: 'bank' })
    }
    return NextResponse.json({ item: publicItem(next.question, next.event, run.mode) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
