// Chart.js wrapper. Every chart reads its colours from CSS tokens, so the
// fixed model colours (BKT blue, DKT rust) and both themes come for free, and
// charts are rebuilt when the theme changes.
//
// The @ts-ignore below is deliberate: the Synaptic repo's root tsconfig globs
// **/*.ts, so the main app's type-check also reads this file, and chart.js is
// installed only in dkt-lab/web. Inside dkt-lab the import resolves normally.
// @ts-ignore -- resolved from dkt-lab/web/node_modules; see comment above
import { Chart, registerables } from 'chart.js'
import { cssVar, onThemeChange } from './theme'
import { prefersReducedMotion } from './dom'

Chart.register(...registerables)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Config = any
interface Live { canvas: HTMLCanvasElement; build: () => Config; chart: { destroy(): void; toBase64Image(): string } }

const live: Live[] = []

export const palette = () => ({
  bkt: cssVar('--bkt'), dkt: cssVar('--dkt'), actual: cssVar('--actual'), ink: cssVar('--ink'),
  ink2: cssVar('--ink-2'), ink3: cssVar('--ink-3'), line: cssVar('--line'), surface: cssVar('--surface'),
  good: cssVar('--good'), warn: cssVar('--warn'), bad: cssVar('--bad'), synthetic: cssVar('--synthetic'),
})

function baseOptions() {
  const p = palette()
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 300 },
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: p.ink, titleColor: p.surface, bodyColor: p.surface, borderWidth: 0, padding: 8 },
    },
    scales: {
      x: { grid: { color: p.line, drawTicks: false }, border: { color: p.line }, ticks: { color: p.ink3, padding: 6 }, title: { color: p.ink2 } },
      y: { grid: { color: p.line, drawTicks: false }, border: { color: p.line }, ticks: { color: p.ink3, padding: 6 }, title: { color: p.ink2 } },
    },
  }
}

function deepMerge(a: Config, b: Config): Config {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b
  const out = { ...(a ?? {}) }
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v)
  return out
}

// `build` returns {type, data, options}; options are merged over the themed base.
export function chart(canvas: HTMLCanvasElement, build: () => Config): void {
  const make = () => {
    const c = build()
    return new Chart(canvas, { ...c, options: deepMerge(baseOptions(), c.options ?? {}) })
  }
  live.push({ canvas, build, chart: make() })
}

export function destroyCharts(): void {
  while (live.length) live.pop()!.chart.destroy()
}

// PNG of a chart, drawn over the page background so it is legible when saved.
export function chartPng(canvas: HTMLCanvasElement): string {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = cssVar('--surface') || '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  return out.toDataURL('image/png')
}

onThemeChange(() => {
  for (const l of live) {
    l.chart.destroy()
    const c = l.build()
    l.chart = new Chart(l.canvas, { ...c, options: deepMerge(baseOptions(), c.options ?? {}) })
  }
})
