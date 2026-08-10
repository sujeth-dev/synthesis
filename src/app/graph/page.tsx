'use client'
import { useState, useEffect, useMemo } from 'react'
import { Navbar }           from '@/components/layout/Navbar'
import { GraphView }        from '@/components/graph/GraphView'
import { SkillDetailPanel } from '@/components/graph/SkillDetailPanel'
import type { GraphNodeWithState } from '@/components/graph/GraphView'
import type { SkillEdge } from '@/types'

// ─── Legend config ────────────────────────────────────────────────────────────

const LEGEND = [
  { color: '#34d399', label: 'Mastered' },
  { color: '#7c6eff', label: 'Intermediate' },
  { color: '#5a8a9f', label: 'Beginner' },
  { color: '#5a5a72', label: 'Locked'   },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [nodes,    setNodes]    = useState<GraphNodeWithState[]>([])
  const [edges,    setEdges]    = useState<SkillEdge[]>([])
  const [selected, setSelected] = useState<GraphNodeWithState | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/graph')
        if (!r.ok) throw new Error('not ok')
        const data = await r.json()
        setNodes(data.nodes ?? [])
        setEdges(data.edges ?? [])
      } catch {
        setError('Could not load your learning graph. Please refresh.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Keep selected node fresh when data updates
  useEffect(() => {
    if (selected) {
      const fresh = nodes.find(n => n.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  const nodesMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes]
  )

  const stats = useMemo(() => ({
    mastered: nodes.filter(n => n.mastery_state === 'mastered').length,
    learning: nodes.filter(n => n.mastery_state === 'learning' || n.mastery_state === 'fragile').length,
    ready:    nodes.filter(n => n.mastery_state === 'ready').length,
    total:    nodes.length,
  }), [nodes])

  // Active learning node (learning or fragile, highest p_know)
  const activeNode = useMemo(() => {
    const candidates = nodes.filter(n => n.mastery_state === 'learning' || n.mastery_state === 'fragile')
    if (candidates.length === 0) return nodes.find(n => n.mastery_state === 'ready') ?? null
    return candidates.sort((a, b) => b.p_know - a.p_know)[0] ?? null
  }, [nodes])

  // Filtered nodes for search — pass full node list but highlight matches
  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes
    const q = search.trim().toLowerCase()
    return nodes.filter(n => n.label.toLowerCase().includes(q))
  }, [nodes, search])

  // When search changes, auto-select the first match if exactly one result
  useEffect(() => {
    if (filteredNodes.length === 1) setSelected(filteredNodes[0])
  }, [filteredNodes])

  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />

      <div className="px-6 py-6">

        {/* ── Header + stats ──────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto mb-4 animate-slide-up">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
            <div>
              <h1 className="font-serif italic text-[28px] text-c-text leading-none mb-1.5">
                Learning Graph
              </h1>
              <p className="text-[13px] text-c-faint font-mono">
                Click any node to explore — scroll or pinch to zoom
              </p>
            </div>

            {/* Stats */}
            {!loading && !error && (
              <div className="flex items-center gap-6">
                {[
                  { val: stats.mastered, label: 'Mastered',    color: '#34d399' },
                  { val: stats.learning, label: 'In progress', color: '#7c6eff' },
                  { val: stats.ready,    label: 'Beginner',    color: '#5a8a9f' },
                  { val: stats.total,    label: 'Total',       color: 'var(--text-faint)' },
                ].map(s => (
                  <div key={s.label} className="flex items-baseline gap-1.5">
                    <span className="font-serif text-[22px] font-semibold" style={{ color: s.color }}>
                      {s.val}
                    </span>
                    <span className="font-mono text-[12px] text-c-faint uppercase tracking-[0.07em]">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Controls row: Legend + Search + Go-to-active */}
          {!loading && !error && (
            <div className="flex flex-wrap items-center gap-4 pt-3 pb-1 border-t border-[var(--border)]">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4">
                {LEGEND.map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="font-mono text-[12px] text-c-muted">{l.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <svg width="20" height="8">
                    <line x1="0" y1="4" x2="20" y2="4" stroke="rgba(124,110,255,0.65)" strokeWidth="2" />
                  </svg>
                  <span className="font-mono text-[12px] text-c-muted">Required</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="20" height="8">
                    <line x1="0" y1="4" x2="20" y2="4" stroke="rgba(120,120,160,0.50)" strokeWidth="1.5" strokeDasharray="6 4" />
                  </svg>
                  <span className="font-mono text-[12px] text-c-muted">Helpful</span>
                </div>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Search input */}
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none"
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search skills…"
                  className="pl-8 pr-3 py-2 rounded-lg bg-c-bg2 border border-[var(--border)] text-c-text placeholder:text-c-ghost text-[13px] focus:border-c-purple/50 focus:outline-none focus:ring-1 focus:ring-c-purple/30 transition-colors w-44"
                />
                {search && (
                  <button
                    onClick={() => { setSearch(''); setSelected(null) }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-c-ghost hover:text-c-faint text-[16px] leading-none"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Go to active skill button */}
              {activeNode && (
                <button
                  onClick={() => setSelected(activeNode)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-c-purple/10 border border-c-purple/25 text-c-purple text-[13px] font-mono hover:bg-c-purple/20 transition-all"
                  title={`Jump to: ${activeNode.label}`}
                >
                  <span className="w-2 h-2 rounded-full bg-c-purple inline-block" />
                  Go to active
                </button>
              )}
            </div>
          )}

          {/* Search result count */}
          {search.trim() && !loading && !error && (
            <p className="text-[12px] font-mono text-c-faint mt-2">
              {filteredNodes.length === 0
                ? 'No skills match that search.'
                : `${filteredNodes.length} skill${filteredNodes.length !== 1 ? 's' : ''} found — click the result below`}
            </p>
          )}
        </div>

        {/* ── Main content area ────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-32 gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-c-purple/30 border-t-c-purple animate-spin" />
            <p className="text-[13px] text-c-faint font-mono">Loading your graph…</p>
          </div>
        ) : error ? (
          <div className="max-w-6xl mx-auto rounded-xl border border-[var(--border)] bg-c-bg2 px-5 py-4">
            <p className="text-[14px] text-c-yellow font-mono">{error}</p>
          </div>
        ) : (
          /* Split layout: graph | detail panel */
          <div className="max-w-6xl mx-auto flex gap-4 items-start">
            {/* Graph canvas — fills viewport height */}
            <div
              className="rounded-xl border border-[var(--border)] bg-c-bg4 overflow-hidden transition-all duration-300 flex-shrink-0"
              style={{
                flex:   selected ? '0 0 62%' : '1 1 100%',
                height: 'calc(100vh - 220px)',
                minHeight: 480,
              }}
            >
              <GraphView
                nodes={search.trim() ? filteredNodes : nodes}
                edges={edges}
                onSelect={setSelected}
                activeId={activeNode?.id ?? null}
              />
            </div>

            {/* Detail panel — overlay-style, does not shrink canvas */}
            {selected && (
              <div
                className="animate-slide-up flex-shrink-0"
                style={{ width: '36%', minWidth: 280, maxWidth: 380 }}
              >
                <SkillDetailPanel
                  node={selected}
                  edges={edges}
                  nodesMap={nodesMap}
                  onClose={() => setSelected(null)}
                />
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
