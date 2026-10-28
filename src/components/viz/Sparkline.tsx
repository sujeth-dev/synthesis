// A trend in a word's space (OLM-1): values on a fixed 0-1 scale so two skills'
// sparklines compare, drawn at its real pixel size so the end dot stays round.

export function Sparkline({ values, width = 96, height = 24, colour = 'var(--blue)', title }: {
  values: number[]
  width?: number
  height?: number
  colour?: string
  title?: string
}) {
  if (values.length === 0) return <span className="text-[10px] text-c-ghost font-mono">—</span>
  const pad = 3
  const x = (i: number) => values.length === 1 ? width / 2 : pad + (i / (values.length - 1)) * (width - 2 * pad)
  const y = (v: number) => pad + (1 - Math.min(1, Math.max(0, v))) * (height - 2 * pad)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <line x1={pad} x2={width - pad} y1={y(0.5)} y2={y(0.5)} stroke="var(--border)" strokeDasharray="2 2" />
      <polyline points={points} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="2.5" fill={colour} stroke="var(--bg2)" strokeWidth="1.5" />
    </svg>
  )
}
