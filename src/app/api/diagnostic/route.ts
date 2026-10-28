import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { placeLearner, getAllNodes, getHardPrereqs } from '@/lib/graph'
import { gradeDiagnosticResults } from '@/lib/diagnostic/grade'
import { initSkillState } from '@/lib/bkt'
import { initSM2 } from '@/lib/sm2'
import { initMotivationState } from '@/lib/motivation'
import {
  setDiagnosticDone, bulkUpsertSkillStates, bulkUpsertReviewSchedules,
  upsertMotivationState,
} from '@/lib/db/queries'
import type { LearnerSkillState, Question } from '@/types'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { results } = await req.json()

  // The client sends the learner's raw answer and never a verdict, so the answers
  // are graded here before placement. Until this existed, placeLearner read an
  // absent `correct` on every row, scored every skill at the 0.05 floor, and left
  // every prerequisite-gated skill blocked for every learner.
  const diagnosticQuestions: Question[] = require('../../../../content/questions/diagnostic/questions.json')
  const placement = placeLearner(gradeDiagnosticResults(Array.isArray(results) ? results : [], diagnosticQuestions))
  const allNodes  = getAllNodes().filter(n => !n.deprecated)

  const tempMap = new Map<string, number>()
  for (const [sid, score] of Object.entries(placement.skill_scores)) tempMap.set(sid, score as number)

  const skillStates: LearnerSkillState[] = allNodes.map(node => {
    const initialPKnow = placement.skill_scores[node.id]
    const prereqs      = getHardPrereqs(node.id)
    const blocked      = prereqs.length > 0 && prereqs.some(pid => (tempMap.get(pid) ?? 0.05) < 0.40)
    return initSkillState(user.id, node.id, initialPKnow, blocked)
  })

  const schedules = allNodes.map(n => initSM2(user.id, n.id))

  await Promise.all([
    bulkUpsertSkillStates(skillStates),
    bulkUpsertReviewSchedules(schedules),
    upsertMotivationState(initMotivationState(user.id)),
    setDiagnosticDone(user.id, placement.entry_node),
  ])

  return NextResponse.json({ entry_node: placement.entry_node, skill_count: skillStates.length })
}
