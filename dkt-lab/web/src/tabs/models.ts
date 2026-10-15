import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f4, int, signed } from '../ui/format'
import { provenance } from '../ui/provenance'
import { loadMetrics, loadSummary, loadJson, type Metrics } from '../data'
import type { TabContext } from '../main'

const METRICS: { key: 'auc' | 'log_loss' | 'rmse' | 'accuracy'; label: string; higher: boolean }[] = [
  { key: 'auc', label: 'AUC', higher: true },
  { key: 'log_loss', label: 'Log-loss', higher: false },
  { key: 'rmse', label: 'RMSE', higher: false },
  { key: 'accuracy', label: 'Accuracy (p ≥ 0.5)', higher: true },
]

export async function renderModels(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) return
  const [m, summary] = await Promise.all([loadMetrics(d.id), loadSummary()])
  root.append(h('h1', 'Model comparison'), provenance(d),
    h('p.lede', `Next-step prediction on ${int(m.bkt.n)} held-out answers. Both models see only a student’s earlier answers and are scored on identical rows.`))

  root.append(h('div.grid.cols-2',
    h('div.card', h('h3', 'BKT vs DKT on this dataset'), metricTable(m)),
    h('div.card', h('h3', 'Training'), h('p.small', `BKT: per-skill EM, fitted in ${m.bkt.fit_seconds}s. DKT: LSTM, hidden ${m.dkt_config.hidden_size}, learning rate ${m.dkt_config.lr}, ${m.dkt_history.length} epochs, ${m.dkt.train_seconds}s on CPU.`),
      (() => { const c = canvas('DKT validation AUC per epoch'); trainingChart(c, m); return h('div.chart.short', c) })()),
  ))

  const roc = canvas('ROC curves for BKT and DKT')
  const skillC = canvas('Per-skill AUC for BKT and DKT')
  const top = m.per_skill_auc.slice(0, 25)
  root.append(h('div.grid.cols-2', { style: { marginTop: '16px' } },
    h('div.card', h('h3', 'ROC curves'), legend(), h('div.chart', roc)),
    h('div.card', h('h3', `Per-skill AUC · ${top.length} most-tested skills`), legend(),
      h('p.small.muted', `Skills with ≥ 50 test answers and both outcomes present. DKT is higher on ${top.filter(r => r.dkt > r.bkt).length} of ${top.length}.`),
      h('div.chart.tall', skillC)),
  ))
  chart(roc, () => {
    const c = palette()
    const line = (r: { fpr: number[]; tpr: number[] }, color: string, label: string) => ({ label, data: r.fpr.map((x, i) => ({ x, y: r.tpr[i] })), borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2, tension: 0 })
    return {
      type: 'line',
      data: { datasets: [line(m.roc.bkt, c.bkt, `BKT (AUC ${m.bkt.auc.toFixed(3)})`), line(m.roc.dkt, c.dkt, `DKT (AUC ${m.dkt.auc.toFixed(3)})`),
        { label: 'chance', data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], borderColor: c.ink3, borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }] },
      options: { scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'false positive rate' } }, y: { min: 0, max: 1, title: { display: true, text: 'true positive rate' } } } },
    }
  })
  chart(skillC, () => {
    const c = palette()
    return {
      type: 'bar',
      data: { labels: top.map(r => trunc(r.label, 28)), datasets: [
        { label: 'BKT', data: top.map(r => r.bkt), backgroundColor: c.bkt, borderRadius: 2 },
        { label: 'DKT', data: top.map(r => r.dkt), backgroundColor: c.dkt, borderRadius: 2 }] },
      options: { indexAxis: 'y', scales: { x: { min: 0.4, max: 1, title: { display: true, text: 'AUC' } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 10 } } } } },
    }
  })

  root.append(h('h2', 'Across datasets'), h('div.card', h('div.table-wrap', h('table',
    h('thead', h('tr', h('th', 'Dataset'), h('th', 'Type'), h('th.num', 'n'), h('th.num', 'BKT AUC'), h('th.num', 'DKT AUC'), h('th.num', 'Δ AUC'),
      h('th.num', 'BKT log-loss'), h('th.num', 'DKT log-loss'), h('th.num', 'BKT RMSE'), h('th.num', 'DKT RMSE'), h('th.num', 'BKT acc.'), h('th.num', 'DKT acc.'))),
    h('tbody', summary.datasets.map(r => h('tr',
      h('td', h('a', { href: `#/models/${r.id}` }, r.name)), h('td', h(`span.badge.${r.kind_label.startsWith('real') ? 'real' : 'synthetic'}`, r.kind_label)),
      h('td.num', int(r.n)),
      ...(['auc', 'log_loss', 'rmse', 'accuracy'] as const).flatMap((k, i) => {
        const hi = METRICS[i].higher
        const bw = hi ? r.bkt[k] > r.dkt[k] : r.bkt[k] < r.dkt[k]
        const cells = [h(`td.num.bkt-c${bw ? '.win' : ''}`, f4(r.bkt[k])), h(`td.num.dkt-c${!bw ? '.win' : ''}`, f4(r.dkt[k]))]
        return k === 'auc' ? [...cells, h('td.num', signed(r.auc_gain))] : cells
      }),
    )))))),
    h('p.small.muted', 'Bold = better of the two on that metric. Δ AUC = DKT − BKT.'))

  const tuning = await loadJson<unknown>('dkt_tuning.json').catch(() => null)
  if (tuning) {
    const { renderTuning } = await import('./tuning')
    renderTuning(root, tuning as never)
  }
}

function metricTable(m: Metrics): HTMLElement {
  return h('div.table-wrap', h('table',
    h('thead', h('tr', h('th', 'Metric'), h('th.num', 'BKT'), h('th.num', 'DKT'), h('th.num', 'DKT − BKT'))),
    h('tbody', METRICS.map(({ key, label, higher }) => {
      const b = m.bkt[key], k = m.dkt[key]
      const dktWins = higher ? k > b : k < b
      return h('tr', h('td', label, h('span.muted.small', higher ? ' ↑' : ' ↓')), h(`td.num.bkt-c${!dktWins ? '.win' : ''}`, f4(b)), h(`td.num.dkt-c${dktWins ? '.win' : ''}`, f4(k)), h('td.num', signed(k - b, 4)))
    }))))
}

function trainingChart(c: HTMLCanvasElement, m: Metrics) {
  chart(c, () => ({
    type: 'line',
    data: { labels: m.dkt_history.map(e => e.epoch), datasets: [{ label: 'DKT val AUC', data: m.dkt_history.map(e => e.val_auc), borderColor: palette().dkt, backgroundColor: palette().dkt, pointRadius: 3, borderWidth: 2 }] },
    options: { scales: { x: { title: { display: true, text: 'epoch' } }, y: { title: { display: true, text: 'validation AUC' } } } },
  }))
}

export const canvas = (label: string) => h('canvas', { role: 'img', 'aria-label': label }) as HTMLCanvasElement
export const legend = () => h('div.legend', h('span.key.bkt', 'BKT'), h('span.key.dkt', 'DKT'))
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
