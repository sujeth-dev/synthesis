import type { SkillEdge, SkillNode } from '@/types'
import nodesJson from '../../../content/graph/nodes.json'
import edgesJson from '../../../content/graph/edges.json'
import type { SimSkill } from './run'

// Imported directly rather than via @/lib/graph, whose require('@/…') only
// resolves under Next's bundler — the simulator also runs under vitest and tsx.
const allNodes = nodesJson as SkillNode[]
const allEdges = edgesJson as SkillEdge[]

// Synaptic's real skill graph as simulator input: live (non-deprecated) nodes
// in a study order where every hard prerequisite comes before its dependents.
// Ties keep content/graph/nodes.json order.
export function curriculumSkills(): SimSkill[] {
  const nodes = allNodes.filter(n => !n.deprecated)
  const live = new Set(nodes.map(n => n.id))
  const hardPrereqs = new Map(nodes.map(n => [n.id, [] as string[]]))
  for (const e of allEdges) {
    if (e.strength === 'hard' && live.has(e.from) && live.has(e.to)) hardPrereqs.get(e.to)!.push(e.from)
  }

  const ordered: SimSkill[] = []
  const placed = new Set<string>()
  while (ordered.length < nodes.length) {
    const next = nodes.find(n => !placed.has(n.id) && hardPrereqs.get(n.id)!.every(p => placed.has(p)))
    if (!next) throw new Error('Skill graph has a hard-prerequisite cycle')
    placed.add(next.id)
    ordered.push({ id: next.id, hardPrereqs: hardPrereqs.get(next.id)! })
  }
  return ordered
}
