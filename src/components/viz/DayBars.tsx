// Counts per day as bars on a shared baseline (OLM-1): the activity strip on
// /profile and the review forecast on /dashboard. One hue; the count is the
// height and is always in the tooltip and, when `showCounts`, printed above.

export interface DayCount {
  key: string
  label: string
  count: number
  /** A bar that means something different, e.g. reviews already overdue. */
  emphasis?: boolean
}

export function DayBars({ days, colour = 'var(--blue)', emphasisColour = 'var(--red)', unit, height = 56, showCounts = false, testId }: {
  days: DayCount[]
  colour?: string
  emphasisColour?: string
  unit: string
  height?: number
  showCounts?: boolean
  testId?: string
}) {
  const max = Math.max(1, ...days.map(d => d.count))
  return (
    <div className="flex items-end gap-1" data-testid={testId}>
      {days.map(d => (
        <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.label}: ${d.count} ${unit}`}>
          {showCounts && <span className="font-mono text-[9px] text-c-faint h-3">{d.count > 0 ? d.count : ''}</span>}
          <div className="w-full flex items-end" style={{ height }}>
            <div className="w-full rounded-t-[4px]"
              style={{
                height: d.count === 0 ? 2 : Math.max(4, (d.count / max) * height),
                background: d.count === 0 ? 'var(--bg3)' : d.emphasis ? emphasisColour : colour,
              }} />
          </div>
          {/* Allowed to overhang a narrow bar rather than be cut to an ellipsis. */}
          <span className="text-[9px] font-mono text-c-ghost whitespace-nowrap text-center">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
