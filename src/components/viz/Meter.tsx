// A single 0-1 quantity as a thin bar (OLM-1). Skill meters are the most-used
// open-learner-model visualisation (Bull & Kay); pairing a belief meter with an
// evidence meter is what Al Shanfari et al. (2020) found helps learners judge
// their own knowledge. The value is always also given as text in `title`.

export function Meter({ value, colour = 'var(--blue)', title, testId, className = '' }: {
  value: number
  colour?: string
  title?: string
  testId?: string
  className?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={`h-1.5 rounded-full bg-c-bg3 overflow-hidden ${className}`} title={title ?? `${pct}%`}
      role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={title} data-testid={testId}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
    </div>
  )
}
