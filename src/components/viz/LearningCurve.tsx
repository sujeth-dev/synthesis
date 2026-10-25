// Error rate against practice opportunity (OLM-1): the learning curve of
// Cen, Koedinger & Junker (2006) and of dkt-lab/pipeline/curves.py. A falling
// curve is learning; a flat one is practice that is not landing. Uniformly
// scaled, so points stay round, and every point carries its count in a tooltip
// because a rate over two skills is not a rate over forty.

export interface CurvePoint {
  opportunity: number
  errorRate: number
  n: number
}

const W = 560
const H = 180
const L = 36
const R = 12
const T = 12
const B = 28

export function LearningCurve({ points, testId }: { points: CurvePoint[]; testId?: string }) {
  if (points.length < 2) {
    return <p className="text-[12px] text-c-ghost" data-testid={testId}>Not enough practice yet — a curve needs a second attempt on some skill.</p>
  }
  const maxOpp = Math.max(...points.map(p => p.opportunity))
  const x = (o: number) => L + ((o - 1) / Math.max(1, maxOpp - 1)) * (W - L - R)
  const y = (r: number) => T + (1 - r) * (H - T - B)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.opportunity).toFixed(1)},${y(p.errorRate).toFixed(1)}`).join(' ')
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const xTicks = Array.from(new Set([1, Math.ceil(maxOpp / 2), maxOpp]))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid={testId}
      aria-label={`Error rate by practice opportunity, from ${Math.round(points[0].errorRate * 100)}% on the first attempt to ${Math.round(points[points.length - 1].errorRate * 100)}% on attempt ${points[points.length - 1].opportunity}`}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--text-ghost)" fontFamily="var(--font-label)">{t * 100}%</text>
        </g>
      ))}
      {xTicks.map(o => (
        <text key={o} x={x(o)} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--text-ghost)" fontFamily="var(--font-label)">{o}</text>
      ))}
      <text x={(L + W - R) / 2} y={H - 0.5} textAnchor="middle" fontSize="9" fill="var(--text-faint)">attempt number on a skill</text>
      <path d={path} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
      {points.map(p => (
        <circle key={p.opportunity} cx={x(p.opportunity)} cy={y(p.errorRate)} r="4" fill="var(--blue)" stroke="var(--bg2)" strokeWidth="2">
          <title>{`Attempt ${p.opportunity}: ${Math.round(p.errorRate * 100)}% wrong, across ${p.n} skill${p.n === 1 ? '' : 's'}`}</title>
        </circle>
      ))}
    </svg>
  )
}
