import type { BehaviourInsights as Insights } from '@/lib/analytics/profile'
import type { MotivationStateValue } from '@/types'
import { DayBars } from '@/components/viz/DayBars'
import { Meter } from '@/components/viz/Meter'

// How you work, not what you know (OLM-4). Every number here was already
// logged on each attempt — hesitation, revisions, motivation state, the
// engine's behaviour discount, the shadow interval — and none was ever shown.
// Activity-log features carry real signal about performance (Latif 2023), and a
// learner is entitled to see what the engine reads off their behaviour. Each
// card names the field it is computed from.

const MOOD_TEXT: Record<MotivationStateValue, string> = {
  winning: 'In flow', neutral: 'Steady', bored: 'Under-challenged', frustrated: 'Struggling',
}

function Card({ title, source, children, testId }: { title: string; source: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="p-4 rounded-xl bg-c-bg4 border border-[var(--border)] flex flex-col" data-testid={testId}>
      <p className="text-[12px] text-c-text font-medium mb-2">{title}</p>
      <div className="flex-1">{children}</div>
      <p className="font-mono text-[9px] text-c-ghost mt-3">from {source}</p>
    </div>
  )
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
const pct = (part: number, whole: number) => whole === 0 ? 0 : Math.round(part / whole * 100)

export function BehaviourInsights({ insights, windowDays }: { insights: Insights; windowDays: number }) {
  if (insights.attempts === 0 && insights.hints.items === 0) {
    return <p className="text-[12px] text-c-ghost" data-testid="behaviour-empty">Answer a few questions and this shows how you work, not just what you know.</p>
  }
  const moods = (Object.keys(MOOD_TEXT) as MotivationStateValue[]).filter(m => insights.motivation.counts[m] > 0)
  const moodTotal = moods.reduce((s, m) => s + insights.motivation.counts[m], 0)
  const { discount, interval, hints, hesitation, revisions, streaks } = insights

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="behaviour-insights">
      <Card title="Your pace" source="latency_ms, median per week" testId="insight-pace">
        <DayBars unit="s median per answer" height={40}
          days={insights.pace.map(w => ({ key: w.key, label: w.label, count: w.medianLatencyMs === null ? 0 : Math.round(w.medianLatencyMs / 1000) }))} />
        <p className="text-[11px] text-c-faint mt-2">Median seconds per answer, by week. Medians, so one abandoned tab does not set it.</p>
      </Card>

      <Card title="Getting started" source="hesitation_ms — time before your first touch" testId="insight-hesitation">
        {hesitation.medianMs === null
          ? <p className="text-[12px] text-c-ghost">Not logged yet.</p>
          : <>
              <p className="font-mono text-[22px] text-c-text leading-none mb-1">{seconds(hesitation.medianMs)}</p>
              <p className="text-[11px] text-c-faint">median before you first touch an answer.
                {hesitation.slowStarts > 0 && <> You stared for over 15s on {hesitation.slowStarts} of {hesitation.n}.</>}
              </p>
            </>}
      </Card>

      <Card title="Second-guessing" source="revision_count" testId="insight-revisions">
        <p className="font-mono text-[22px] text-c-text leading-none mb-1">{pct(revisions.revised, revisions.n)}%</p>
        <p className="text-[11px] text-c-faint">of answers changed at least once before submitting ({revisions.revised} of {revisions.n}).</p>
      </Card>

      <Card title="How the engine read your mood" source="motivation_state on each answer" testId="insight-mood">
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
              {(streaks.maxConsecutiveErrors >= 3 || streaks.maxSlowStreak >= 3) && (
                <p className="text-[11px] text-c-faint pt-1">
                  Hardest stretch: {streaks.maxConsecutiveErrors} wrong in a row{streaks.maxSlowStreak >= 3 ? `, ${streaks.maxSlowStreak} slow answers in a row` : ''}.
                </p>
              )}
            </div>}
      </Card>

      <Card title="How much your answers counted" source="behavior_modifier — the engine's evidence discount" testId="insight-discount">
        {discount.meanModifier === null
          ? <p className="text-[12px] text-c-ghost">Not logged yet.</p>
          : <>
              <p className="font-mono text-[22px] text-c-text leading-none mb-1">{Math.round(discount.meanModifier * 100)}%</p>
              <p className="text-[11px] text-c-faint">
                average weight the engine gave an answer. {discount.discounted} of {discount.n} were discounted:
                an answer after two misses in a row counts 20% less, and one slower than 15 seconds 15% less,
                because a struggling or distracted answer says less about what you know.
              </p>
            </>}
      </Card>

      <Card title="What your behaviour would do to reviews" source="behavior_quality_shadow — not applied" testId="insight-interval">
        {interval.meanDeltaDays === null
          ? <p className="text-[12px] text-c-ghost">No reviews scheduled yet.</p>
          : <>
              <p className="font-mono text-[22px] text-c-text leading-none mb-1">
                {interval.meanDeltaDays >= 0 ? '+' : '−'}{Math.abs(interval.meanDeltaDays).toFixed(1)} days
              </p>
              <p className="text-[11px] text-c-faint">
                average change to a review interval if your pace and hesitation were counted: longer on {interval.longer},
                shorter on {interval.shorter}, of {interval.n}. Measured in shadow; your schedule does not use it yet.
              </p>
            </>}
      </Card>

      {hints.items > 0 && (
        <Card title="Hint reliance" source="exam_item_events, Practice exams" testId="insight-hints">
          <p className="font-mono text-[22px] text-c-text leading-none mb-1">{pct(hints.withHint, hints.items)}%</p>
          <p className="text-[11px] text-c-faint">
            of exam questions where you asked for a hint{hints.secondHints > 0 ? `; ${hints.secondHints} took both` : ''}.
            {hints.rapid > 0 && <> {hints.rapid} asked within four seconds — before the question could be read.</>}
          </p>
        </Card>
      )}

      <p className="text-[10px] text-c-ghost sm:col-span-2 lg:col-span-3">Last {windowDays} days.</p>
    </div>
  )
}
