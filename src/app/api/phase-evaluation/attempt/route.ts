import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { insertAttempt } from '@/lib/db/queries'
import { PHASE_EVALUATION_FILES, type PhaseKey } from '@/lib/phases'
import type { PhaseEvaluationQuestion } from '@/types'

const MIN_LATENCY = 100
const MAX_LATENCY = 5 * 60 * 1000

// Phase evaluations are a standalone macro-level self-check (see MASTER_PLAN.md's
// BLOOM-2..6) — attempts are recorded through the existing insertAttempt()/BKT
// storage for real signal, but deliberately skip the BKT/SM-2/motivation update
// pipeline /api/attempt runs: this isn't part of the adaptive guided session.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { phase, question_id, skill_id, selected_option_id, latency_ms } = body as {
    phase?: PhaseKey; question_id?: string; skill_id?: string
    selected_option_id?: string; latency_ms?: number
  }
  if (!phase || !question_id || !skill_id) {
    return NextResponse.json({ error: 'phase, question_id, and skill_id required' }, { status: 400 })
  }

  const fileName = PHASE_EVALUATION_FILES[phase]
  if (!fileName) return NextResponse.json({ error: 'Unknown or unauthored phase' }, { status: 400 })

  let question: PhaseEvaluationQuestion | undefined
  try {
    const questions: PhaseEvaluationQuestion[] = require(`@/../content/questions/phase-evaluation/${fileName}`)
    question = questions.find(q => q.id === question_id)
  } catch {
    return NextResponse.json({ error: 'Phase evaluation not found' }, { status: 404 })
  }
  if (!question || question.phase !== phase || question.skill_id !== skill_id) {
    return NextResponse.json({ error: 'Unknown question_id for this phase' }, { status: 400 })
  }

  const correct = selected_option_id === question.correct_option_id
  const safe_latency = Math.min(MAX_LATENCY, Math.max(MIN_LATENCY, latency_ms || 3000))

  await insertAttempt({
    learner_id: user.id, skill_id, question_id, session_id: null,
    correct, latency_ms: safe_latency, revision_count: 0, error_type: null,
    difficulty_tier: 'same', question_format: 'mcq',
    p_know_before: null, p_know_after: null,
    motivation_state: null, consecutive_errors: null,
    slow_response_streak: null, behavior_modifier: null, hesitation_ms: null,
  })

  return NextResponse.json({ correct, explanation_after: question.explanation_after })
}
