import Link from 'next/link'
import type { Suggestion } from '@/lib/session/suggest'
import { REASON_TEXT } from '@/lib/session/suggest'
import type { ScoreTermName } from '@/lib/session/score'
import { Meter } from '@/components/viz/Meter'

// The dashboard's reasoning line (OLM-5). "The reasoning line is the most
// important piece of copy" (Research/lab/12-design-spec.md:101-122): the
// learner sees what the session will start with and why. Since LIVE-1 the
// weighted score chooses, so its terms are the reason; the old rule order's
// pick is named only when it would have differed. Under SELECTOR=rules the
// card falls back to the rule's pick with the score marked advisory.
// Explanations are generated from the model's own parameters, not written
// after the fact.

const TERM_LABEL: Record<ScoreTermName, string> = {
  urgency:   'Due for review',
  gain:      'Room to learn',
  behaviour: 'Suits your current state',
  cognitive: 'Right kind of thinking',
  variety:   'Variety',
}

export function NextUp({ suggestion, label }: { suggestion: Suggestion; label: (id: string) => string }) {
  const { selector, served, rule, score, agreed, tied, runnersUp } = suggestion
  const live = selector === 'score'
  return (
    <div className="p-6 rounded-2xl border border-[var(--border)] bg-c-bg2 self-start" data-testid="next-up">
      <p className="font-mono text-[11px] text-c-purple uppercase tracking-[0.16em] mb-2">Your next session</p>
      {served ? (
        <p className="text-[15px] text-c-text leading-[1.6] mb-4" data-testid="reason-line">
          Starts with <span className="font-semibold">{label(served.skill_id)}</span> — {REASON_TEXT[served.reason]}.
        </p>
      ) : (
        <p className="text-[14px] text-c-muted mb-4">Nothing is waiting in this phase right now.</p>
      )}

      {!score && served && (
        <p className="pt-4 border-t border-[var(--border)] text-[11px] text-c-faint" data-testid="suggested-next-none">
          Only one skill was eligible, so there was nothing to weigh it against.{' '}
          <Link href="/engine" className="hover:text-c-text underline">See every decision →</Link>
        </p>
      )}

      {score && (
        <div className="pt-4 border-t border-[var(--border)]" data-testid="suggested-next">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[12px] text-c-text font-medium">{live ? 'Why this one' : 'Suggested next'}</p>
            {!live && (
              <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--border)] text-c-faint">advisory</span>
            )}
          </div>
          <p className="text-[12px] text-c-muted mb-3" data-testid="score-reason">
            {live
              ? <>{score.reason}{!agreed && !tied && rule && <> The old rule order would have started with <span className="text-c-text">{label(rule.skill_id)}</span>.</>}</>
              : agreed
                ? 'The multi-metric score picks the same skill.'
                : tied
                  ? <>The score sees no real difference between <span className="text-c-text">{label(score.skill_id)}</span> and the session&apos;s pick.</>
                  : <>The score would pick <span className="text-c-text">{label(score.skill_id)}</span>. {score.reason}</>}
          </p>
          <div className="space-y-1.5 mb-3">
            {[...score.terms].sort((a, b) => b.contribution - a.contribution).map(t => (
              <div key={t.name} className="grid grid-cols-[150px_1fr_40px] items-center gap-2">
                <span className="text-[11px] text-c-faint">{TERM_LABEL[t.name] ?? t.name}</span>
                <Meter value={t.raw} title={`${TERM_LABEL[t.name] ?? t.name}: reads ${t.raw.toFixed(2)}, weight ${t.weight}, adds ${t.contribution.toFixed(3)}`} />
                <span className="font-mono text-[10px] text-c-ghost text-right">×{t.weight}</span>
              </div>
            ))}
          </div>
          {runnersUp.length > 0 && (
            <p className="text-[11px] text-c-ghost">
              Almost picked: {runnersUp.map(r => `${label(r.skill_id)} (${r.score.toFixed(2)})`).join(', ')} · its pick scored {score.score.toFixed(2)}.
            </p>
          )}
          <p className="text-[10px] text-c-ghost mt-2">
            {live
              ? 'Chosen by the weighted score from the skills the rules make eligible.'
              : 'Sessions follow the rule order (SELECTOR=rules); the score is shown for comparison.'}
            <Link href="/engine" className="ml-1 hover:text-c-text underline">See every decision →</Link>
          </p>
        </div>
      )}
    </div>
  )
}
