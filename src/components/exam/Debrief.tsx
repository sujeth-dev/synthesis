'use client'
import Link from 'next/link'
import type { BloomLevel } from '@/types'
import type { Debrief as DebriefData, LevelResult } from '@/lib/exam/debrief'
import { pCorrect } from '@/lib/exam/ability'
import { ELO_START } from '@/lib/elo'

// The exam debrief (EXAM-4): by kind of thinking, then by item, then by mistake.
// Ability is shown as the chance of answering a medium item right, with a ±1 SE
// band, because "62% ± 14" reads and "θ = 0.31" does not. The band stays as wide
// as the run made it — two items at a level do not buy a narrow one.

export const BLOOM_LABEL: Record<BloomLevel, string> = {
  remember: 'Remember', understand: 'Understand', apply: 'Apply',
  analyze: 'Analyze', evaluate: 'Evaluate', create: 'Create',
}

const STOP_SENTENCE: Record<string, string> = {
  precision: 'The exam stopped once it was confident enough in your result.',
  max_length: 'The exam reached its 24-item cap before it was fully confident — the bands below are wider for it.',
  time: 'Time ran out. Unanswered items count as wrong.',
  bank: 'The exam used every question in this phase.',
}

const PACE_LABEL = { on_pace: 'On pace', slow: 'Slow', over: 'Well over' } as const

const pct = (theta: number) => pCorrect(theta, ELO_START) * 100

function LevelRow({ level }: { level: LevelResult }) {
  if (level.theta === null || level.se === null) {
    return (
      <div className="grid grid-cols-[96px_1fr_64px] items-center gap-3 py-2" data-testid={`level-${level.level}`}>
        <span className="text-[13px] text-c-text">{BLOOM_LABEL[level.level]}</span>
        <span className="text-[12px] text-c-faint">not sampled</span>
        <span />
      </div>
    )
  }
  const mid = pct(level.theta)
  const lo = pct(level.theta - level.se)
  const hi = pct(level.theta + level.se)
  const tip = `${BLOOM_LABEL[level.level]}: ${Math.round(mid)}% (±1 SE ${Math.round(lo)}–${Math.round(hi)}%), ${level.correct} of ${level.n} right`
  return (
    <div className="grid grid-cols-[96px_1fr_64px] items-center gap-3 py-2" data-testid={`level-${level.level}`}>
      <span className="text-[13px] text-c-text">{BLOOM_LABEL[level.level]}</span>
      {/* Positioned in percent so the dot stays round at any width. */}
      <div className="relative h-4 cursor-default" role="img" aria-label={tip} title={tip}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-hi)]" />
        <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-[var(--border-hi)]" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-c-blue opacity-30"
          style={{ left: `${lo}%`, width: `${Math.max(0.5, hi - lo)}%` }} />
        <div className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-c-blue ring-2 ring-[var(--bg2)]"
          style={{ left: `${mid}%` }} />
      </div>
      <span className="font-mono text-[12px] text-c-muted text-right" data-testid={`level-score-${level.level}`}>
        {level.correct}/{level.n}
      </span>
    </div>
  )
}

export function Debrief({ debrief, skillLabels, phaseLabel, mode }: {
  debrief: DebriefData
  skillLabels: Record<string, string>
  phaseLabel: string
  mode: string
}) {
  const label = (id: string) => skillLabels[id] ?? id
  const overall = pct(debrief.theta)
  const answered = debrief.items.filter(i => i.answered).length

  return (
    <div className="max-w-2xl w-full mx-auto animate-slide-up" data-testid="exam-debrief">
      <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.14em] mb-3 text-center">
        {phaseLabel} · {mode === 'checkpoint' ? 'Checkpoint' : 'Practice'} debrief
      </p>
      <h1 className="font-serif italic text-[30px] text-c-text mb-2 text-center">
        {debrief.correct} of {debrief.n} right · {Math.round(overall)}% on a medium item
      </h1>
      <p className="text-[13px] text-c-muted mb-8 text-center">
        {debrief.stop_reason ? STOP_SENTENCE[debrief.stop_reason] : 'You submitted before the exam needed to stop.'}
        {' '}Overall ±1 SE: {Math.round(pct(debrief.theta - debrief.se))}–{Math.round(pct(debrief.theta + debrief.se))}%.
      </p>

      <section className="p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4">
        <h2 className="text-[14px] text-c-text font-medium mb-1">By kind of thinking</h2>
        <p className="text-[12px] text-c-faint mb-3">
          Dot: your chance on a medium item at that level. Band: ±1 standard error. Dashed line: 50%.
        </p>
        {debrief.levels.map(l => <LevelRow key={l.level} level={l} />)}
        <div className="grid grid-cols-[96px_1fr_64px] gap-3 mt-1">
          <span />
          <div className="flex justify-between font-mono text-[10px] text-c-ghost"><span>0%</span><span>50%</span><span>100%</span></div>
          <span />
        </div>
      </section>

      <section className="p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4">
        <h2 className="text-[14px] text-c-text font-medium mb-3">How you worked</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div><p className="font-mono text-[20px] text-c-text">{answered}/{debrief.n}</p><p className="text-[11px] text-c-faint">answered</p></div>
          <div><p className="font-mono text-[20px] text-c-text">{debrief.items.filter(i => i.pace === 'on_pace').length}</p><p className="text-[11px] text-c-faint">within time target</p></div>
          <div>
            <p className="font-mono text-[20px] text-c-text">{debrief.hints.items_with_hint}</p>
            <p className="text-[11px] text-c-faint">
              items with a hint{debrief.hints.second_hints > 0 ? ` (${debrief.hints.second_hints} took both)` : ''}
            </p>
          </div>
        </div>
        {debrief.hints.rapid_requests > 0 && (
          <p className="text-[12px] text-c-yellow mb-3" data-testid="rapid-hints">
            ⚑ {debrief.hints.rapid_requests} hint{debrief.hints.rapid_requests === 1 ? ' was' : 's were'} asked for within
            four seconds — before the question could have been read. Hints help most after a real attempt.
          </p>
        )}
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-c-faint text-left">
              <th className="font-normal py-1">#</th><th className="font-normal">Level</th><th className="font-normal">Skill</th>
              <th className="font-normal">Result</th><th className="font-normal text-right">Time / target</th><th className="font-normal text-right">Pace</th>
            </tr>
          </thead>
          <tbody>
            {debrief.items.map((item, i) => (
              <tr key={item.question_id} className="border-t border-[var(--border)]">
                <td className="py-1.5 font-mono text-c-ghost">{i + 1}</td>
                <td className="text-c-muted">{BLOOM_LABEL[item.bloom_level]}</td>
                <td className="text-c-muted truncate max-w-[160px]">{label(item.skill_id)}</td>
                <td className={item.correct ? 'text-c-green' : 'text-c-red'}>
                  {!item.answered ? '— unanswered' : item.correct ? '✓ right' : '✗ wrong'}{item.hint_level > 0 ? ` · ${item.hint_level} hint${item.hint_level > 1 ? 's' : ''}` : ''}
                </td>
                <td className="font-mono text-c-muted text-right">
                  {item.latency_ms === null ? '—' : `${Math.round(item.latency_ms / 1000)}s`} / {item.time_target_sec}s
                </td>
                <td className="text-c-muted text-right">{item.pace ? PACE_LABEL[item.pace] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {debrief.misconceptions.length > 0 && (
        <section className="p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4">
          <h2 className="text-[14px] text-c-text font-medium mb-3">What tripped you up</h2>
          <div className="space-y-4">
            {debrief.misconceptions.map(m => (
              <div key={m.question_id} className="border-l-2 border-c-red/50 pl-4" data-testid={`misconception-${m.question_id}`}>
                <p className="font-mono text-[10px] text-c-faint uppercase tracking-wider mb-1">{BLOOM_LABEL[m.bloom_level]} · {label(m.skill_id)}</p>
                <p className="text-[13px] text-c-text mb-2 whitespace-pre-wrap">{m.stem}</p>
                <p className="text-[12px] text-c-red mb-1">You chose: {m.chosen}</p>
                {m.misconception && <p className="text-[12px] text-c-muted mb-1">Why it's tempting: {m.misconception}</p>}
                <p className="text-[12px] text-c-green mb-1">Answer: {m.correct_answer}</p>
                <p className="text-[12px] text-c-muted">{m.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {debrief.revisit.length > 0 && (
        <section className="p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-6">
          <h2 className="text-[14px] text-c-text font-medium mb-3">What to revisit</h2>
          <ul className="space-y-2">
            {debrief.revisit.map(r => (
              <li key={r.skill_id} className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-c-text">
                  {label(r.skill_id)}
                  <span className="text-c-faint"> — missed {r.missed}, at {r.levels.map(l => BLOOM_LABEL[l]).join(', ')}</span>
                </span>
                <Link href={`/learn/skill/${r.skill_id}`} className="text-[12px] font-mono text-c-purple hover:underline flex-shrink-0">Study →</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-c-faint text-center mb-4">
        Exam results are a measurement only. They do not change your mastery, review schedule or session.
      </p>
      <Link href="/dashboard" className="block w-full py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium text-center transition-all">
        Back to dashboard
      </Link>
    </div>
  )
}
