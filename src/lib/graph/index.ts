import type { SkillNode, SkillEdge, LearnerSkillState, Phase } from '@/types'
import { MASTERY_THRESHOLD } from '@/lib/bkt'

let _nodes: SkillNode[] | null = null
let _edges: SkillEdge[] | null = null

function getNodes(): SkillNode[] {
  if (!_nodes) _nodes = require('../../../content/graph/nodes.json') as SkillNode[]
  return _nodes
}
function getEdges(): SkillEdge[] {
  if (!_edges) _edges = require('../../../content/graph/edges.json') as SkillEdge[]
  return _edges
}

export const getAllNodes  = () => getNodes()
export const getAllEdges  = () => getEdges()
export const getNodeById = (id: string) => getNodes().find(n => n.id === id)
export const getNodesByPhase = (phase: Phase) => getNodes().filter(n => n.phase === phase && !n.deprecated)

export function getHardPrereqs(skill_id: string): string[] {
  return getEdges().filter(e => e.to === skill_id && e.strength === 'hard').map(e => e.from)
}

export function prereqsSatisfied(skill_id: string, skillStates: Map<string, LearnerSkillState>): boolean {
  return getHardPrereqs(skill_id).every(prereqId => {
    const s = skillStates.get(prereqId)
    return s && s.p_know >= MASTERY_THRESHOLD
  })
}

export function computeUnblocked(skillStates: Map<string, LearnerSkillState>): Set<string> {
  const unblocked = new Set<string>()
  for (const node of getNodes().filter(n => !n.deprecated)) {
    const prereqs = getHardPrereqs(node.id)
    if (prereqs.length === 0 || prereqsSatisfied(node.id, skillStates)) unblocked.add(node.id)
  }
  return unblocked
}

export function placeLearner(diagnosticResults: Array<{ skill_id: string; correct: boolean; graph_placement_weight?: Record<string, number> }>): { entry_node: string; skill_scores: Record<string, number> } {
  const scores: Record<string, number> = {}
  for (const r of diagnosticResults) {
    const weights = r.graph_placement_weight ?? { [r.skill_id]: 1.0 }
    for (const [sid, w] of Object.entries(weights))
      scores[sid] = (scores[sid] ?? 0) + (r.correct ? w : 0)
  }
  const maxScore = Math.max(...Object.values(scores), 1)
  const normalized: Record<string, number> = {}
  for (const [k, v] of Object.entries(scores)) normalized[k] = 0.05 + (v / maxScore) * 0.60
  const sorted = topologicalSort(getNodes().filter(n => !n.deprecated), getEdges())
  const entry = sorted.find(n => (normalized[n.id] ?? 0.05) < 0.65)
  return { entry_node: entry?.id ?? sorted[0]?.id ?? 'p1_what_is_computer', skill_scores: normalized }
}

function topologicalSort(nodes: SkillNode[], edges: SkillEdge[]): SkillNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const inDeg   = new Map(nodes.map(n => [n.id, 0]))
  for (const e of edges) if (e.strength === 'hard') inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
  const queue  = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0)
  const result: SkillNode[] = []
  while (queue.length > 0) {
    const node = queue.shift()!; result.push(node)
    for (const e of edges.filter(e2 => e2.from === node.id && e2.strength === 'hard')) {
      const nd = (inDeg.get(e.to) ?? 1) - 1; inDeg.set(e.to, nd)
      if (nd === 0) { const n = nodeMap.get(e.to); if (n) queue.push(n) }
    }
  }
  return result
}

export function getGraphVersion(): string {
  try { return (require('../../../content/graph/meta.json') as any).graph_version ?? '1.0.0' } catch { return '1.0.0' }
}
