import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { getSkillState, getReviewSchedule } from '@/lib/db/queries'
import { getNodeById, getHardPrereqs } from '@/lib/graph'
import type { Explanation, ExplanationDepth, Question, LearnerSkillState } from '@/types'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const skill_id = searchParams.get('skill_id')
  if (!skill_id) return NextResponse.json({ error: 'skill_id required' }, { status: 400 })

  const node = getNodeById(skill_id)
  if (!node) return NextResponse.json({ error: 'Unknown skill_id' }, { status: 404 })

  const [skillState, schedule] = await Promise.all([
    getSkillState(user.id, skill_id),
    getReviewSchedule(user.id, skill_id),
  ])

  if (!skillState) return NextResponse.json({ error: 'Skill not initialised — complete onboarding first' }, { status: 400 })

  if (skillState.mastery_state === 'blocked') {
    const prereqIds = getHardPrereqs(skill_id)
    const prereqs = prereqIds.map(id => {
      const n = getNodeById(id)
      return { id, label: n?.label ?? id }
    })
    return NextResponse.json({ blocked: true, prereqs })
  }

  const depth = chooseDepth(skillState)
  let explanation: Explanation | null = null
  try {
    explanation = require(`@/../content/explanations/${skill_id}/${depth}.json`) as Explanation
  } catch {
    for (const fb of ['beginner', 'mid', 'advanced', 'expert'] as ExplanationDepth[]) {
      try {
        explanation = require(`@/../content/explanations/${skill_id}/${fb}.json`) as Explanation
        break
      } catch { continue }
    }
  }

  let question: Question | null = null
  try {
    const allQs: Question[] = require(`@/../content/questions/by-skill/${skill_id}.json`)
    if (allQs.length > 0) question = allQs[Math.floor(Math.random() * allQs.length)]
  } catch { /* stub skill */ }

  const prereqIds = getHardPrereqs(skill_id)
  const prereqs = prereqIds.map(id => {
    const n = getNodeById(id)
    return { id, label: n?.label ?? id }
  })

  return NextResponse.json({
    blocked: false,
    node: {
      id:             node.id,
      label:          node.label,
      phase:          node.phase,
      intuition:      node.intuition,
      analogy:        node.analogy,
      why_it_matters: node.why_it_matters,
      question_ids:   node.question_ids,
    },
    state: {
      p_know:              skillState.p_know,
      mastery_state:       skillState.mastery_state,
      total_attempts:      skillState.total_attempts,
      consecutive_correct: skillState.consecutive_correct,
    },
    explanation,
    question,
    prereqs,
    depth,
    schedule: schedule ? {
      due_at:        schedule.due_at,
      repetitions:   schedule.repetitions,
      interval_days: schedule.interval_days,
    } : null,
  })
}

function chooseDepth(state: LearnerSkillState): ExplanationDepth {
  if (state.p_know >= 0.90) return 'expert'
  if (state.p_know >= 0.75) return 'advanced'
  if (state.p_know >= 0.45) return 'mid'
  return 'beginner'
}
