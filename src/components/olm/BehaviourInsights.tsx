import type { BehaviourInsights as Insights } from '@/lib/analytics/profile'
import type { MotivationStateValue } from '@/types'
import { DayBars } from '@/components/viz/DayBars'
import { Meter } from '@/components/viz/Meter'

// How you work, not what you know (OLM-4). Every number here was already
// logged on each attempt — hesitation, revisions, motivation state, the
// engine's behaviour discount, the shadow interval — and none was ever shown.
// Activity-log features carry real signal about performance (Latif 2023), and a
// learner is entitled to see what the engine reads off their behaviour. Copy is
// one plain line per card; the field each card reads is noted beside it here.

const MOOD_TEXT: Record<MotivationStateValue, string> = {
  winning: 'In flow', neutral: 'Steady', bored: 'Too easy', frustrated: 'Struggling',
}

function Card({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="p-4 rounded-xl bg-c-bg4 border border-[var(--border)] flex flex-col" data-testid={testId}>
      <p className="text-[12px] text-c-text font-medium mb-2">{title}</p>
      <div className="flex-1">{children}</div>
    </div>
  )
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
const pct = (part: number, whole: number) => whole === 0 ? 0 : Math.round(part / whole * 100)

export function BehaviourInsights({ insights }: { insights: Insights }) {
  if (insights.attempts === 0 && insights.hints.items === 0) {
    return <p className="text-[12px] text-c-ghost" data-testid="behaviour-empty">Answer a few questions to see this.</p>
  }
  const moods = (Object.keys(MOOD_TEXT) as MotivationStateValue[]).filter(m => insights.motivation.counts[m] > 0)
  const moodTotal = moods.reduce((s, m) => s + insights.motivation.counts[m], 0)
  const { discount, interval, hints, hesitation, revisions, streaks } = insights

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="behaviour-insights">
      {/* latency_ms, median per week */}
      <Card title="Your pace" testId="insight-pace">
        <DayBars unit="s per answer" height={40}
          days={insights.pace.map(w => ({ key: w.key, label: w.label, count: w.medianLatencyMs === null ? 0 : Math.round(w.medianLatencyMs / 1000) }))} />
      </Card>

      {/* hesitation_ms: time before the first touch */}
      <Card title="Time to start" testId="insight-hesitation">
        {hesitation.medianMs === null
          ? <p className="text-[12px] text-c-ghost">Not logged yet.</p>
          : <>
              <p className="font-mono text-[22px] text-c-text leading-none mb-1">{seconds(hesitation.medianMs)}</p>
              <p className="text-[11px] text-c-faint">before your first click{hesitation.slowStarts > 0 && <> · {hesitation.slowStarts} slow start{hesitation.slowStarts === 1 ? '' : 's'}</>}</p>
            </>}
      </Card>

      {/* revision_count */}
      <Card title="Changed answers" testId="insight-revisions">
        <p className="font-mono text-[22px] text-c-text leading-none mb-1">{pct(revisions.revised, revisions.n)}%</p>
        <p className="text-[11px] text-c-faint">{revisions.revised} of {revisions.n} changed before submitting</p>
      </Card>

      {/* motivation_state on each answer */}
      <Card title="Your mood" testId="insight-mood">
        {moods.length === 0
          ? <p className="text-[12px] text-c-ghost">Not logged yet.</p>
          : <div className="space-y-1.5">
              {moods.map(m => (
                <div key={m} className="grid grid-cols-[100px_1fr_32px] items-center gap-2">
                  <span className="text-[11px] text-c-muted">{MOOD_TEXT[m]}</span>
                  <Meter value={insights.motivation.counts[m] / moodTotal} title={`${MOOD_TEXT[m]}: ${insights.motivation.counts[m]} answers`} />
                  <span className="font-mono text-[10px] text-c-faint text-right">{pct(insights.motivation.counts[m], moodTotal)}%</span>
                </div>
              ))}
              {streaks.maxConsecutiveErrors >= 3 && (
                <p className="text-[11px] text-c-faint pt-1">Worst run: {streaks.maxConsecutiveErrors} wrong in a row</p>
              )}
            </div>}
      </Card>

      {/* behavior_modifier: the engine's evidence discount */}
      <Card title="Answer weight" testId="insight-discount">
        {discount.meanModifier === null
          ? <p className="text-[12px] text-c-ghost">Not logged yet.</p>
          : <>
              <p className="font-mono text-[22px] text-c-text leading-none mb-1">{Math.round(discount.meanModifier * 100)}%</p>
              <p className="text-[11px] text-c-faint">{discount.discounted} of {discount.n} counted less (after 2 misses, or over 15s)</p>
            </>}
      </Card>

      {/* exam_item_events, Practice exams */}
      {hints.items > 0 && (
        <Card title="Hints used" testId="insight-hints">
          <p className="font-mono text-[22px] text-c-text leading-none mb-1">{pct(hints.withHint, hints.items)}%</p>
          <p className="text-[11px] text-c-faint">on exam questions{hints.rapid > 0 && <> · {hints.rapid} within 4s</>}</p>
        </Card>
      )}

      {/* behavior_quality_shadow: measured, not applied */}
      {interval.meanDeltaDays !== null && (
        <details className="group p-4 rounded-xl bg-c-bg4 border border-[var(--border)] sm:col-span-2 lg:col-span-3" data-testid="insight-interval">
          <summary className="cursor-pointer list-none text-[12px] font-mono text-c-faint hover:text-c-text">
            <span className="group-open:hidden">Review timing (test) ↓</span><span className="hidden group-open:inline">Review timing (test) ↑</span>
          </summary>
          <p className="text-[12px] text-c-muted mt-2">
            If your speed counted, reviews would come {Math.abs(interval.meanDeltaDays).toFixed(1)} days {interval.meanDeltaDays >= 0 ? 'later' : 'sooner'} on average. Not used yet.
          </p>
        </details>
      )}
    </div>
  )
}
