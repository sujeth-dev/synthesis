import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { getAllSkillStates } from '@/lib/db/queries'
import { getAllNodes, getAllEdges } from '@/lib/graph'
import type { MasteryState } from '@/types'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [nodes, edges, skillStates] = await Promise.all([
    Promise.resolve(getAllNodes()),
    Promise.resolve(getAllEdges()),
    getAllSkillStates(user.id),
  ])

  const stateMap = new Map(skillStates.map(s => [s.skill_id, s]))

  const nodesWithState = nodes.map(node => {
    const state = stateMap.get(node.id)
    return {
      ...node,
      mastery_state: (state?.mastery_state ?? 'blocked') as MasteryState,
      p_know:         state?.p_know ?? 0,
    }
  })

  return NextResponse.json({ nodes: nodesWithState, edges })
}
