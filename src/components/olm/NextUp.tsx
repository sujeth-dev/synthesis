import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Suggestion } from '@/lib/session/suggest'
import { REASON_TEXT } from '@/lib/session/suggest'
import type { ScoreTermName } from '@/lib/session/score'
import { Meter } from '@/components/viz/Meter'

// The dashboard's reasoning line (OLM-5), now the page's hero. "The reasoning
// line is the most important piece of copy" (Research/lab/12-design-spec.md:
// 101-122): the learner sees what the session will start with and why, and the
// button to start it sits in the same card. Since LIVE-1 the weighted score
// chooses, so its terms are the reason; the old rule order's pick is named
// only when it would have differed. Under SELECTOR=rules the card falls back
// to the rule's pick with the score marked advisory. Explanations are
// generated from the model's own parameters, not written after the fact.
// Only terms that actually added to the score are drawn; the weights and
// raw scores sit behind "How it's scored" so the first read stays plain.

const TERM_LABEL: Record<ScoreTermName, string> = {
  urgency:   'Due for review',
  gain:      'Room to learn',
  behaviour: 'Suits your current state',
  cognitive: 'Right kind of thinking',
  variety:   'Variety',
}

// Below this a term is drawn as noise rather than as a reason.
const MIN_SHOWN_CONTRIBUTION = 0.005
// Runners-up this close to the pick are a close call, not a clear loss.
const CLOSE_CALL = 0.02

export function NextUp({ suggestion, label, context, actions }: {
  suggestion: Suggestion
  label: (id: string) => string
  /** One line of where the learner is, e.g. the active phase and its progress. */
  context?: ReactNode
  /** The buttons that start the session. */
  actions?: ReactNode
}) {
  const { selector, served, rule, score, agreed, tied, runnersUp } = suggestion
  const live = selector === 'score'
  const shown = score
    ? [...score.terms].filter(t => t.contribution >= MIN_SHOWN_CONTRIBUTION).sort((a, b) => b.contribution - a.contribution)
    : []
  const close = score ? runnersUp.filter(r => score.score - r.score < CLOSE_CALL) : []

  return (
    <div className="rounded-2xl border border-[var(--border)] border-t-4 border-t-c-purple bg-c-bg2 overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.16)]" data-testid="next-up">
      <div className="grid md:grid-cols-[1fr_minmax(0,340px)]">
        <div className="p-6 sm:p-7 flex flex-col">
          <p className="font-mono text-[11px] text-c-purple uppercase tracking-[0.16em] mb-3">Your next session</p>
          {served ? (
            <div data-testid="reason-line">
              <p className="text-[13px] text-c-faint mb-1">Starts with</p>
              <h2 className="font-serif italic text-[30px] sm:text-[34px] leading-[1.1] text-c-text mb-2">{label(served.skill_id)}</h2>
              <p className="text-[15px] text-c-muted leading-[1.6]">— {REASON_TEXT[served.reason]}.</p>
            </div>
          ) : (
            <p className="text-[15px] text-c-muted">Nothing is waiting in this phase right now.</p>
          )}
          {context && <div className="mt-4 text-[12px] font-mono text-c-faint">{context}</div>}
          {actions && <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        <div className="p-6 border-t md:border-t-0 md:border-l border-[var(--border)] bg-c-bg4/60">
          {!score && served && (
            <p className="text-[12px] text-c-faint" data-testid="suggested-next-none">
              Only one skill was eligible, so there was nothing to weigh it against.{' '}
              <Link href="/engine" className="hover:text-c-text underline">See every decision →</Link>
            </p>
          )}
          {!score && !served && (
            <p className="text-[12px] text-c-faint">Pick any skill in the phase below, or take the phase exam.</p>
          )}

          {score && (
            <div data-testid="suggested-next">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] text-c-text font-medium">{live ? 'Why this one' : 'Suggested next'}</p>
                {!live && (
                  <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--border)] text-c-faint">advisory</span>
                )}
              </div>
              <p className="text-[13px] text-c-muted leading-[1.55] mb-4" data-testid="score-reason">
                {live
                  ? <>{score.reason}{!agreed && !tied && rule && <> The old rule order would have started with <span className="text-c-text">{label(rule.skill_id)}</span>.</>}</>
                  : agreed
                    ? 'The multi-metric score picks the same skill.'
                    : tied
                      ? <>The score sees no real difference between <span className="text-c-text">{label(score.skill_id)}</span> and the session&apos;s pick.</>
                      : <>The score would pick <span className="text-c-text">{label(score.skill_id)}</span>. {score.reason}</>}
              </p>
              <div className="space-y-2 mb-4">
                {shown.map(t => (
                  <div key={t.name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[12px] text-c-muted">{TERM_LABEL[t.name] ?? t.name}</span>
                      <span className="font-mono text-[11px] text-c-faint">{Math.round(t.raw * 100)}%</span>
                    </div>
                    <Meter value={t.raw} title={`${TERM_LABEL[t.name] ?? t.name}: reads ${t.raw.toFixed(2)}, weight ${t.weight}, adds ${t.contribution.toFixed(3)}`} />
                  </div>
                ))}
              </div>
              {close.length > 0 && (
                <p className="text-[12px] text-c-faint mb-3">
                  Close call: {close.map(r => label(r.skill_id)).join(' and ')} scored almost the same.
                </p>
              )}
              <details className="group">
                <summary className="cursor-pointer list-none text-[12px] font-mono text-c-faint hover:text-c-text">
                  <span className="group-open:hidden">How it&apos;s scored ↓</span>
                  <span className="hidden group-open:inline">Hide scoring ↑</span>
                </summary>
                <div className="mt-3 space-y-1">
                  {[...score.terms].sort((a, b) => b.contribution - a.contribution).map(t => (
                    <div key={t.name} className="grid grid-cols-[1fr_auto_auto] gap-3 font-mono text-[11px] text-c-faint">
                      <span>{TERM_LABEL[t.name] ?? t.name}</span>
                      <span>{t.raw.toFixed(2)} × {t.weight}</span>
                      <span className="text-c-muted w-12 text-right">+{t.contribution.toFixed(3)}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-c-faint pt-2">
                    Total {score.score.toFixed(2)}.
                    {runnersUp.length > 0 && <> Next best: {runnersUp.map(r => `${label(r.skill_id)} ${r.score.toFixed(2)}`).join(', ')}.</>}
                  </p>
                  <p className="text-[11px] text-c-ghost pt-1">
                    {live
                      ? 'Chosen by the weighted score from the skills the rules make eligible.'
                      : 'Sessions follow the rule order (SELECTOR=rules); the score is shown for comparison.'}
                    <Link href="/engine" className="ml-1 hover:text-c-text underline">See every decision →</Link>
                  </p>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
