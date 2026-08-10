'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre'
import type { SkillEdge, SkillNode, MasteryState } from '@/types'
import { getMasteryTier } from '@/lib/bkt'

// ─── Types ───────────────────────────────────────────────────────────────────

export type GraphNodeWithState = SkillNode & {
  mastery_state: MasteryState
  p_know: number
}

interface Props {
  nodes:    GraphNodeWithState[]
  edges:    SkillEdge[]
  onSelect: (node: GraphNodeWithState | null) => void
  /** ID of the currently active/learning node — gets a pulsing ring */
  activeId?: string | null
}

// ─── Mastery colours ─────────────────────────────────────────────────────────

export const MASTERY_COLOUR: Record<MasteryState, string> = {
  mastered: '#2f5d3a',
  fragile:  '#e8a84a',
  learning: '#e8a84a',
  ready:    '#d96e34',
  blocked:  '#a8a49c',
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_W = 210   // wider: was 175
const NODE_H = 64    // taller: was 52

// ─── Dagre layout ─────────────────────────────────────────────────────────────

function computeLayout(
  skillNodes: GraphNodeWithState[],
  skillEdges: SkillEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // More spacing so nodes don't crowd each other
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 })

  skillNodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  skillEdges.forEach(e => g.setEdge(e.from, e.to))
  dagreLayout(g)

  const nodes: Node[] = skillNodes.map(n => {
    const pos = g.node(n.id)
    return {
      id:       n.id,
      type:     'skillNode',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data:     { skillNode: n },
    }
  })

  const edges: Edge[] = skillEdges.map((e, i) => ({
    id:     `e-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type:   'smoothstep',
    animated: false,
    style: {
      // Thicker, more visible edges
      stroke:          e.strength === 'hard' ? 'rgba(124,110,255,0.65)' : 'rgba(120,120,160,0.40)',
      strokeWidth:     e.strength === 'hard' ? 2 : 1.5,
      strokeDasharray: e.strength === 'hard' ? undefined : '8 5',
    },
  }))

  return { nodes, edges }
}

// ─── Custom skill node ────────────────────────────────────────────────────────

interface SkillNodeProps {
  data:      { skillNode: GraphNodeWithState }
  selected?: boolean
}

function SkillNodeComponent({ data, selected }: SkillNodeProps) {
  const sn      = data.skillNode
  const color   = MASTERY_COLOUR[sn.mastery_state]
  const blocked = sn.mastery_state === 'blocked'
  // Truncate at 26 chars (wider node)
  const label   = sn.label.length > 26 ? sn.label.slice(0, 25) + '…' : sn.label

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: color, opacity: 0.7, width: 8, height: 8, border: 'none' }}
      />

      <div
        style={{
          width:        NODE_W,
          height:       NODE_H,
          background:   selected ? 'var(--node-bg-sel)' : 'var(--node-bg)',
          border:       `${selected ? 2 : 1.5}px solid ${selected ? color : color + '80'}`,
          borderRadius: 10,
          opacity:      blocked ? 0.55 : 1,
          position:     'relative',
          display:      'flex',
          alignItems:   'center',
          padding:      '0 13px',
          overflow:     'hidden',
          cursor:       'pointer',
          boxShadow:    selected
            ? `0 0 0 3px ${color}30, 0 4px 16px rgba(0,0,0,0.22)`
            : '0 1px 4px rgba(0,0,0,0.14)',
          transition:   'border-color 0.15s, box-shadow 0.15s, transform 0.1s',
        }}
      >
        {/* p_know progress strip at bottom — taller and more visible */}
        {!blocked && sn.p_know > 0 && (
          <div
            style={{
              position:     'absolute',
              bottom:       0,
              left:         0,
              width:        `${Math.max(0, sn.p_know * 100)}%`,
              height:       5,   // was 3
              background:   color,
              opacity:      0.55, // was 0.45
              borderRadius: '0 3px 0 0',
            }}
          />
        )}

        {/* Mastery dot with glow */}
        <div
          style={{
            width:        10,   // was 8
            height:       10,
            borderRadius: '50%',
            background:   color,
            flexShrink:   0,
            marginRight:  10,
            boxShadow:    blocked ? 'none' : `0 0 6px ${color}99`,
          }}
        />

        {/* Skill label */}
        <span
          style={{
            fontFamily:   'system-ui, -apple-system, sans-serif',
            fontSize:     13,   // was 11
            fontWeight:   blocked ? 400 : 500,
            color:        blocked ? 'var(--node-blocked)' : 'var(--node-text)',
            flex:         1,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            userSelect:   'none',
            letterSpacing: '0.01em',
            lineHeight:   '1.3',
          }}
        >
          {label}
        </span>

        {/* Learner-facing mastery tier */}
        {!blocked && sn.p_know > 0 && (
          <span
            style={{
              fontFamily:    'ui-monospace, monospace',
              fontSize:      11,   // was 9
              color:         color,
              opacity:       0.85, // was 0.75
              flexShrink:    0,
              marginLeft:    7,
              fontWeight:    500,
            }}
          >
            {getMasteryTier(sn.p_know)}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: color, opacity: 0.7, width: 8, height: 8, border: 'none' }}
      />
    </>
  )
}

// nodeTypes must be defined outside render to avoid remounting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = { skillNode: SkillNodeComponent }

// ─── MiniMap node colour ──────────────────────────────────────────────────────

function minimapNodeColor(node: Node): string {
  const sn = (node.data as { skillNode: GraphNodeWithState }).skillNode
  return MASTERY_COLOUR[sn.mastery_state] + '99'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GraphView({ nodes: skillNodes, edges: skillEdges, onSelect, activeId }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    if (skillNodes.length === 0) return
    const { nodes: n, edges: e } = computeLayout(skillNodes, skillEdges)
    setNodes(n)
    setEdges(e)
  }, [skillNodes, skillEdges])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const found = skillNodes.find(n => n.id === node.id) ?? null
      onSelect(found)
    },
    [skillNodes, onSelect],
  )

  const handlePaneClick = useCallback(() => onSelect(null), [onSelect])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.15}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background
        color="var(--border-hi)"
        variant={BackgroundVariant.Lines}
        gap={32}
        size={1}
      />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={minimapNodeColor}
        maskColor="rgba(0,0,0,0.25)"
        style={{ width: 160, height: 100 }}
        pannable
        zoomable
      />
    </ReactFlow>
  )
}
