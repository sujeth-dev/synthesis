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
  precision: 'Stopped once it had enough answers.',
  max_length: 'Reached the 24-question limit.',
  time: 'Time ran out. Unanswered = wrong.',
  bank: 'Used every question in this phase.',
}

const PACE_LABEL = { on_pace: 'On pace', slow: 'Slow', over: 'Too slow' } as const

const pct = (theta: number) => pCorrect(theta, ELO_START) * 100

// At or below this many items a level's estimate is flagged as thin.
const FEW = 2

function LevelRow({ level }: { level: LevelResult }) {
  if (level.theta === null || level.se === null) {
    return (
      <div className="grid grid-cols-[96px_1fr_64px] items-center gap-3 py-2" data-testid={`level-${level.level}`}>
        <span className="text-[13px] text-c-text">{BLOOM_LABEL[level.level]}</span>
        <span className="text-[12px] text-c-faint">no questions</span>
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
      <span className="font-mono text-[12px] text-c-muted text-right" title={level.n <= FEW ? 'Few questions at this level, so the band is wide' : undefined}>
        <span data-testid={`level-score-${level.level}`}>{level.correct}/{level.n}</span>
        {level.n <= FEW && <span className="block font-sans text-[10px] text-c-faint">few questions</span>}
      </span>
    </div>
  )
}

export function Debrief({ debrief, skillLabels, phaseLabel, mode, phase }: {
  debrief: DebriefData
  skillLabels: Record<string, string>
  phaseLabel: string
  mode: string
  /** The phase key, for the retake link. */
  phase?: string
}) {
  const label = (id: string) => skillLabels[id] ?? id
  const overall = pct(debrief.theta)
  const answered = debrief.items.filter(i => i.answered).length
  // Strongest and weakest sampled level, so the learner does not have to read
  // them off the dot chart. Ties keep Bloom order.
  const sampled = debrief.levels.filter(l => l.theta !== null && l.n > 0)
  const strongest = sampled.reduce<LevelResult | null>((b, l) => !b || (l.theta as number) > (b.theta as number) ? l : b, null)
  const weakest = sampled.reduce<LevelResult | null>((b, l) => !b || (l.theta as number) < (b.theta as number) ? l : b, null)
  const firstRevisit = debrief.revisit[0]

  return (
    <div className="max-w-2xl w-full mx-auto animate-slide-up" data-testid="exam-debrief">
      <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.14em] mb-3 text-center">
        {phaseLabel} · {mode === 'checkpoint' ? 'Checkpoint' : 'Practice'} results
      </p>
      <h1 className="font-serif italic text-[36px] sm:text-[42px] leading-[1.1] text-c-text mb-3 text-center">
        {debrief.correct} of {debrief.n} right
      </h1>
      <p className="text-[15px] text-c-muted mb-1 text-center">
        About <span className="text-c-text font-medium">{Math.round(overall)}%</span> chance on a typical question in this phase
        <span className="text-c-faint"> (likely {Math.round(pct(debrief.theta - debrief.se))}–{Math.round(pct(debrief.theta + debrief.se))}%)</span>
      </p>
      <p className="text-[12px] text-c-faint mb-8 text-center">
        {debrief.stop_reason ? STOP_SENTENCE[debrief.stop_reason] : 'You submitted before the exam needed to stop.'}
      </p>

      {(strongest || firstRevisit) && (
        <section className="p-5 sm:p-6 rounded-2xl bg-c-bg2 border border-[var(--border)] border-t-4 border-t-c-purple mb-4" data-testid="debrief-next">
          <p className="font-mono text-[11px] text-c-purple uppercase tracking-[0.16em] mb-4">What to do next</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-5">
            {strongest && (
              <div>
                <p className="text-[11px] text-c-faint mb-1">Strongest</p>
                <p className="text-[16px] text-c-text">{BLOOM_LABEL[strongest.level]}</p>
                <p className="font-mono text-[11px] text-c-muted">{strongest.correct}/{strongest.n} right</p>
              </div>
            )}
            {weakest && weakest !== strongest && (
              <div>
                <p className="text-[11px] text-c-faint mb-1">Weakest</p>
                <p className="text-[16px] text-c-text">{BLOOM_LABEL[weakest.level]}</p>
                <p className="font-mono text-[11px] text-c-muted">{weakest.correct}/{weakest.n} right</p>
              </div>
            )}
            {firstRevisit && (
              <div>
                <p className="text-[11px] text-c-faint mb-1">Revisit first</p>
                <p className="text-[16px] text-c-text">{label(firstRevisit.skill_id)}</p>
                <p className="font-mono text-[11px] text-c-muted">missed {firstRevisit.missed}</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {firstRevisit && (
              <Link href={`/learn/skill/${firstRevisit.skill_id}`} className="px-5 py-2.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium">
                Study {label(firstRevisit.skill_id)} →
              </Link>
            )}
            {phase && (
              <Link href={`/learn/exam/${phase}`} className="px-5 py-2.5 rounded-xl border border-[var(--border-hi)] text-c-muted hover:text-c-text text-[14px]">
                Retake later
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4">
        <h2 className="text-[14px] text-c-text font-medium mb-1">By question type</h2>
        <p className="text-[12px] text-c-faint mb-3">Dot = your chance of a right answer. Bar = likely range.</p>
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
          <div><p className="font-mono text-[20px] text-c-text">{debrief.items.filter(i => i.pace === 'on_pace').length}</p><p className="text-[11px] text-c-faint">on time</p></div>
          <div>
            <p className="font-mono text-[20px] text-c-text">{debrief.hints.items_with_hint}</p>
            <p className="text-[11px] text-c-faint">
              used a hint{debrief.hints.second_hints > 0 ? ` (${debrief.hints.second_hints} used both)` : ''}
            </p>
          </div>
        </div>
        {debrief.hints.rapid_requests > 0 && (
          <p className="text-[12px] text-c-yellow mb-3" data-testid="rapid-hints">
            ⚑ {debrief.hints.rapid_requests} hint{debrief.hints.rapid_requests === 1 ? '' : 's'} asked within 4s. Try the question first.
          </p>
        )}
        <details className="group">
        <summary className="cursor-pointer list-none text-[12px] font-mono text-c-faint hover:text-c-text mb-2">
          <span className="group-open:hidden">Every question ({debrief.items.length}) ↓</span><span className="hidden group-open:inline">Hide questions ↑</span>
        </summary>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12px]">
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
        </div>
        </details>
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
        This exam doesn&apos;t change your progress or reviews.
      </p>
      <Link href="/dashboard" className="block w-full py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium text-center transition-all">
        Back to dashboard
      </Link>
    </div>
  )
}
