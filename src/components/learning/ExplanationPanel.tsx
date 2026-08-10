'use client'
import { useState } from 'react'
import type { Explanation, ExplanationDepth } from '@/types'
import { mdToHtml } from '@/components/ui/mdToHtml'
import { ProgressiveExplanation } from '@/components/learning/ProgressiveExplanation'

type Sub = 'body' | 'real_world' | 'build_task' | 'explain_back'

const DEPTH_LEVELS: { id: ExplanationDepth; label: string; color: string }[] = [
  { id: 'beginner', label: 'Beginner', color: 'var(--green)'  },
  { id: 'mid',      label: 'Mid',      color: 'var(--yellow)' },
  { id: 'advanced', label: 'Advanced', color: 'var(--orange, #f97316)' },
  { id: 'expert',   label: 'Expert',   color: 'var(--purple)'  },
]

function DepthTrack({ depth }: { depth: ExplanationDepth }) {
  const activeIdx = DEPTH_LEVELS.findIndex(d => d.id === depth)
  const active = DEPTH_LEVELS[activeIdx]
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-[11px] font-mono text-c-faint uppercase tracking-[0.14em]">Depth</span>
      <div className="flex items-center gap-1.5">
        {DEPTH_LEVELS.map((lvl, idx) => {
          const isPast   = idx < activeIdx
          const isActive = idx === activeIdx
          return (
            <div key={lvl.id} className="flex items-center gap-1.5">
              {idx > 0 && (
                <div
                  className={`h-px w-4 ${isPast || isActive ? '' : 'opacity-20'}`}
                  style={{ background: isPast ? active.color : isActive ? active.color : 'var(--border)' }}
                />
              )}
              <div
                className="w-2.5 h-2.5 rounded-full transition-all"
                style={{
                  background: isPast || isActive ? active.color : 'transparent',
                  border: `2px solid ${isPast || isActive ? active.color : 'var(--border)'}`,
                  opacity: isPast ? 0.5 : 1,
                }}
                title={lvl.label}
              />
            </div>
          )
        })}
      </div>
      <span
        className="text-[11px] font-mono font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded"
        style={{ color: active.color, background: active.color + '18' }}
      >
        {active.label}
      </span>
    </div>
  )
}

interface Props {
  explanation:     Explanation
  depth?:          ExplanationDepth
  onExplainBack?:  (text: string) => void
  onBuildTaskDone?: () => void
}

export function ExplanationPanel({ explanation: e, depth, onExplainBack, onBuildTaskDone }: Props) {
  const [sub,         setSub]        = useState<Sub>('body')
  const [explainText, setExplainText] = useState('')
  const [buildDone,   setBuildDone]  = useState(false)

  const tabs: [Sub, string][] = [
    ['body', 'Explanation'],
    ...(e.real_world_usage    ? [['real_world',   'Used in practice'] as [Sub, string]] : []),
    ...(e.build_task          ? [['build_task',   'Build it']         as [Sub, string]] : []),
    ...(e.explain_back_prompt ? [['explain_back', 'Explain it back']  as [Sub, string]] : []),
  ]

  return (
    <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] border-t-4 border-t-c-purple overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-mono text-c-faint uppercase tracking-[0.14em]">Explanation</p>
          {depth && <DepthTrack depth={depth} />}
        </div>
        <h3 className="text-[18px] font-semibold text-c-text mb-3">{e.title}</h3>

        {e.key_insight && (
          <div className="mb-5 px-4 py-3.5 rounded-xl bg-c-purple/[0.10] border border-c-purple/25">
            <p className="text-[13px] text-c-purple italic leading-[1.6]">"{e.key_insight}"</p>
          </div>
        )}

        {/* Tabs — larger */}
        {tabs.length > 1 && (
          <div className="flex gap-1 border-b border-[var(--border)]">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSub(id)}
                className={`px-4 py-2.5 text-[12px] font-mono transition-colors border-b-2 -mb-px ${
                  sub === id
                    ? 'text-c-purple border-c-purple'
                    : 'text-c-faint border-transparent hover:text-c-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="px-6 py-5">

        {/* Main explanation */}
        {sub === 'body' && (
          <div>
            <ProgressiveExplanation body={e.body} />

            {e.common_mistakes && e.common_mistakes.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[var(--border)]">
                <p className="text-[11px] font-mono text-c-faint uppercase tracking-[0.14em] mb-3">
                  Common mistakes
                </p>
                <ul className="space-y-2.5">
                  {e.common_mistakes.map((m, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-c-muted">
                      <span className="text-c-red mt-1 flex-shrink-0">·</span>
                      <span className="leading-[1.55]">{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {e.mini_exercise && (
              <div className="mt-5 p-4 rounded-xl bg-c-bg3 border border-[var(--border)]">
                <p className="text-[11px] font-mono text-c-faint uppercase tracking-[0.14em] mb-2">Try it</p>
                <p className="text-[13px] text-c-muted leading-[1.6]">{e.mini_exercise}</p>
              </div>
            )}
          </div>
        )}

        {/* Real-world usage */}
        {sub === 'real_world' && e.real_world_usage && (
          <div>
            <p className="text-[12px] font-mono text-c-green uppercase tracking-[0.12em] mb-3">
              Production use
            </p>
            <div
              className="text-[14px] text-c-muted leading-[1.75]"
              dangerouslySetInnerHTML={{ __html: mdToHtml(e.real_world_usage) }}
            />
          </div>
        )}

        {/* Build task */}
        {sub === 'build_task' && e.build_task && (
          <div>
            <p className="text-[12px] font-mono text-c-yellow uppercase tracking-[0.12em] mb-2">Build task</p>
            <p className="text-[16px] font-semibold text-c-text mb-1">{e.build_task.title}</p>
            {e.build_task.context && (
              <p className="text-[13px] text-c-muted mb-4 leading-[1.55]">{e.build_task.context}</p>
            )}
            <ol className="space-y-2.5 mb-5">
              {e.build_task.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-[14px] text-c-muted leading-[1.5]">
                  <span className="font-mono text-[12px] text-c-faint mt-0.5 w-6 flex-shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {e.build_task.expected_output && (
              <div className="p-4 rounded-xl bg-c-bg3 border border-[var(--border)] mb-4">
                <p className="text-[11px] font-mono text-c-faint mb-1.5">Expected output</p>
                <p className="text-[13px] text-c-muted">{e.build_task.expected_output}</p>
              </div>
            )}
            {e.build_task.hint && !buildDone && (
              <p className="text-[13px] text-c-yellow mb-4">Hint: {e.build_task.hint}</p>
            )}
            {e.build_task.starter_code && (
              <pre className="text-[13px] bg-c-bg4 rounded-xl p-4 text-c-muted font-mono mb-5 overflow-x-auto leading-[1.7] border border-[var(--border)]">
                {e.build_task.starter_code}
              </pre>
            )}
            <button
              onClick={() => { setBuildDone(true); onBuildTaskDone?.() }}
              className="px-5 py-2.5 rounded-xl bg-c-yellow/10 border border-c-yellow/25 text-c-yellow text-[13px] font-medium hover:bg-c-yellow/20 transition-all"
            >
              {buildDone ? '✓ Marked complete' : 'Mark as done'}
            </button>
          </div>
        )}

        {/* Explain it back */}
        {sub === 'explain_back' && e.explain_back_prompt && (
          <div>
            <p className="text-[12px] font-mono text-c-blue uppercase tracking-[0.12em] mb-3">
              Explain it back
            </p>
            <p className="text-[14px] text-c-text mb-4 leading-[1.6]">{e.explain_back_prompt}</p>
            <textarea
              value={explainText}
              onChange={e2 => setExplainText(e2.target.value)}
              rows={5}
              placeholder="Write your explanation here…"
              className="w-full px-5 py-3.5 rounded-xl bg-c-bg3 border border-[var(--border)] text-c-text placeholder:text-c-ghost text-[14px] focus:border-c-blue/50 focus:outline-none focus:ring-2 focus:ring-c-blue/20 resize-none transition-colors mb-3 leading-[1.6]"
            />
            <button
              onClick={() => onExplainBack?.(explainText)}
              disabled={!explainText.trim()}
              className="px-5 py-2.5 rounded-xl bg-c-blue/10 border border-c-blue/25 text-c-blue text-[13px] font-medium hover:bg-c-blue/20 transition-all disabled:opacity-40"
            >
              Submit explanation
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
