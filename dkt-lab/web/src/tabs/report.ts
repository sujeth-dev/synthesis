// Report outputs: the reference lab's [VALUE] / [TABLE] / [GRAPH] / [TEXT]
// placeholders, filled with this lab's numbers. Each has a copy button;
// graphs open as a PNG (canvas.toDataURL) in a new view.
import { h } from '../ui/dom'
import { chart, chartPng, palette } from '../ui/charts'
import { f3, f4, int, pct, signed } from '../ui/format'
import { provenance } from '../ui/provenance'
import { verdict } from '../ui/verdict'
import { loadCurves, loadMetrics, loadStats, loadSummary } from '../data'
import { canvas } from './models'
import type { TabContext } from '../main'

export async function renderReport(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) return
  const [{ stats: s }, m, cv, summary] = await Promise.all([loadStats(d.id), loadMetrics(d.id), loadCurves(d.id), loadSummary()])
  root.append(h('h1', 'Report outputs'), provenance(d),
    h('p.lede', 'Drop-in values, tables, graphs and text for a write-up. Every value is read from the exported results for the selected dataset (or across all datasets where marked). Copy buttons copy plain text; tables copy as Markdown.'))

  // VALUES
  const values: [string, string][] = [
    ['Dataset', `${d.name} (${d.kind_label})`],
    ['Number of Students', int(s.students)],
    ['Number of Skills', int(s.skills)],
    ['Number of Interactions', int(s.interactions)],
    ['Percent Correct', pct(s.pct_correct)],
    ['Median Sequence Length', String(s.sequence_length.median)],
    ['Test Answers Scored', int(m.bkt.n)],
    ['BKT AUC', f4(m.bkt.auc)],
    ['DKT AUC', f4(m.dkt.auc)],
    ['AUC Difference (DKT − BKT)', signed(m.dkt.auc - m.bkt.auc, 4)],
    ['BKT Log-loss', f4(m.bkt.log_loss)],
    ['DKT Log-loss', f4(m.dkt.log_loss)],
    ['BKT RMSE', f4(m.bkt.rmse)],
    ['DKT RMSE', f4(m.dkt.rmse)],
    ['BKT Accuracy', pct(m.bkt.accuracy, 2)],
    ['DKT Accuracy', pct(m.dkt.accuracy, 2)],
    ['DKT Training Time (s, CPU)', String(m.dkt.train_seconds)],
  ]
  root.append(h('h2', 'Values'), h('div.ph-grid', values.map(([k, v]) => ph('VALUE', k, h('span.val', v), v))))

  // TABLES
  const mdTable = (head: string[], rows: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n')
  const tables: [string, string[], string[][]][] = [
    ['Model Comparison', ['Metric', 'BKT', 'DKT', 'DKT − BKT'], (['auc', 'log_loss', 'rmse', 'accuracy'] as const).map(k => [k === 'auc' ? 'AUC' : k === 'log_loss' ? 'Log-loss' : k === 'rmse' ? 'RMSE' : 'Accuracy', f4(m.bkt[k]), f4(m.dkt[k]), signed(m.dkt[k] - m.bkt[k], 4)])],
    ['Dataset Statistics', ['Field', 'Value'], [['Dataset', d.name], ['Type', d.kind_label], ['Students', int(s.students)], ['Skills', int(s.skills)], ['Interactions', int(s.interactions)], ['% correct', pct(s.pct_correct)], ['Sequence length (median / p90 / max)', `${s.sequence_length.median} / ${Math.round(s.sequence_length.p90)} / ${s.sequence_length.max}`], ['Split (train/val/test students)', `${s.split.train.students} / ${s.split.val.students} / ${s.split.test.students}`], ['Source', d.source_url], ['Licence', d.licence]]],
    ['Cross-dataset Summary (all datasets)', ['Dataset', 'Type', 'BKT AUC', 'DKT AUC', 'Δ AUC', 'BKT log-loss', 'DKT log-loss'], summary.datasets.map(r => [r.name, r.kind_label, f4(r.bkt.auc), f4(r.dkt.auc), signed(r.auc_gain, 4), f4(r.bkt.log_loss), f4(r.dkt.log_loss)])],
    ['Learning Curve', ['Opportunity', 'Answers', 'Actual', 'BKT', 'DKT'], cv.points.map(p => [String(p.opportunity), int(p.n), f3(p.actual), f3(p.bkt), f3(p.dkt)])],
    ['Model Configuration', ['Parameter', 'Value'], [['BKT', 'per-skill 2-state HMM, EM (≤ 30 iterations), no forgetting'], ['DKT hidden units', String(m.dkt_config.hidden_size)], ['DKT learning rate', String(m.dkt_config.lr)], ['DKT batch size', String(m.dkt_config.batch_size)], ['DKT epochs', String(m.dkt_history.length)], ['Split', '70/15/15 by student, seed 42'], ['Evaluation rows', 'all test answers except each student’s first']]],
  ]
  root.append(h('h2', 'Tables'), ...tables.map(([name, head, rows]) => ph('TABLE', name,
    h('div.table-wrap', h('table', h('thead', h('tr', head.map(x => h('th', x)))), h('tbody', rows.map(r => h('tr', r.map(c => h('td', c))))))), mdTable(head, rows))))

  // GRAPHS
  root.append(h('h2', 'Graphs'), h('p.small.muted', '“Open PNG” renders the chart canvas with toDataURL into a new view you can save.'))
  const graphs: [string, () => unknown][] = [
    ['ROC Curves (BKT vs DKT)', () => {
      const c = palette()
      const ln = (r: { fpr: number[]; tpr: number[] }, color: string, label: string) => ({ label, data: r.fpr.map((x, i) => ({ x, y: r.tpr[i] })), borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2 })
      return { type: 'line', data: { datasets: [ln(m.roc.bkt, c.bkt, `BKT AUC ${f3(m.bkt.auc)}`), ln(m.roc.dkt, c.dkt, `DKT AUC ${f3(m.dkt.auc)}`)] },
        options: { plugins: { legend: { display: true, labels: { color: c.ink2 } }, title: { display: true, text: `ROC — ${d.name}`, color: c.ink } }, scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'false positive rate' } }, y: { min: 0, max: 1, title: { display: true, text: 'true positive rate' } } } } }
    }],
    ['Learning Curve', () => {
      const c = palette()
      const ds = (label: string, data: number[], color: string) => ({ label, data, borderColor: color, backgroundColor: color, pointRadius: 2, borderWidth: 2 })
      return { type: 'line', data: { labels: cv.points.map(p => p.opportunity), datasets: [ds('Actual', cv.points.map(p => p.actual), c.actual), ds('BKT', cv.points.map(p => p.bkt), c.bkt), ds('DKT', cv.points.map(p => p.dkt), c.dkt)] },
        options: { plugins: { legend: { display: true, labels: { color: c.ink2 } }, title: { display: true, text: `Learning curve — ${d.name}`, color: c.ink } }, scales: { x: { title: { display: true, text: 'opportunity' } }, y: { title: { display: true, text: 'P(correct)' } } } } }
    }],
    ['AUC by Dataset (all datasets)', () => {
      const c = palette()
      return { type: 'bar', data: { labels: summary.datasets.map(r => r.name.replace(/ \(.*\)$/, '')), datasets: [
        { label: 'BKT', data: summary.datasets.map(r => r.bkt.auc), backgroundColor: c.bkt }, { label: 'DKT', data: summary.datasets.map(r => r.dkt.auc), backgroundColor: c.dkt }] },
        options: { plugins: { legend: { display: true, labels: { color: c.ink2 } }, title: { display: true, text: 'Held-out AUC, BKT vs DKT', color: c.ink } }, scales: { y: { min: 0.5, max: 1 } } } }
    }],
    ['Per-skill AUC', () => {
      const c = palette(), top = m.per_skill_auc.slice(0, 15)
      return { type: 'bar', data: { labels: top.map(r => r.label.slice(0, 24)), datasets: [{ label: 'BKT', data: top.map(r => r.bkt), backgroundColor: c.bkt }, { label: 'DKT', data: top.map(r => r.dkt), backgroundColor: c.dkt }] },
        options: { indexAxis: 'y', plugins: { legend: { display: true, labels: { color: c.ink2 } }, title: { display: true, text: `Per-skill AUC — ${d.name}`, color: c.ink } }, scales: { x: { min: 0.4, max: 1 }, y: { ticks: { autoSkip: false, font: { size: 10 } } } } } }
    }],
  ]
  for (const [name, build] of graphs) {
    const c = canvas(name)
    const open = h('button.btn.small', { type: 'button', onclick: () => openPng(c, name) }, 'Open PNG')
    root.append(ph('GRAPH', name, h('div.chart', c), null, open))
    chart(c, build as never)
  }

  // TEXT
  const best = [...summary.datasets].sort((a, b) => b.auc_gain - a.auc_gain)
  const realRows = summary.datasets.filter(r => r.kind_label === 'real')
  const texts: [string, string][] = [
    ['Key Findings', `${verdict(m)} Across the ${summary.datasets.length} datasets, DKT − BKT AUC ranges from ${signed(best[best.length - 1].auc_gain)} (${best[best.length - 1].name}) to ${signed(best[0].auc_gain)} (${best[0].name}). ` +
      (realRows.length ? `On the real datasets the gap is ${realRows.map(r => `${signed(r.auc_gain)} (${r.name})`).join(' and ')}.` : '')],
    ['Dataset Description', `${d.name} is ${d.kind === 'real' ? 'real learner data' : `synthetic data — ${d.kind_label}`}: ${int(s.students)} students, ${int(s.skills)} skills and ${int(s.interactions)} interactions (${pct(s.pct_correct)} correct; median ${s.sequence_length.median} answers per student). Source: ${d.source_url}. Licence: ${d.licence}`],
    ['Method', `Students were split 70/15/15 (train/validation/test) by student with a fixed seed. BKT was fitted per skill with EM on the training students; DKT is a single-layer LSTM with ${m.dkt_config.hidden_size} hidden units trained for ${m.dkt_history.length} epochs. Both predict each test answer from the student’s earlier answers only and are scored on the same ${int(m.bkt.n)} answers (every test answer except each student’s first).`],
    ['Limitations', `Neither model sees elapsed time and classic BKT has no forgetting. Results come from one split and one seed. ${d.kind === 'synthetic' ? 'This dataset is synthetic, so results describe the simulator, not real learners. ' : ''}Two of the lab’s four datasets are synthetic, and the ASSISTments files come from public mirrors of the official releases.`],
  ]
  root.append(h('h2', 'Text'), ...texts.map(([k, v]) => ph('TEXT', k, h('p', { style: { margin: 0 } }, v), v)))
}

function ph(kind: string, name: string, body: HTMLElement, copyText: string | null, extra?: HTMLElement): HTMLElement {
  const status = h('span.copied', { 'aria-live': 'polite' })
  const btn = copyText !== null ? h('button.btn.small', { type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(copyText); status.textContent = 'copied' } catch { status.textContent = 'copy blocked — select the text instead' }
    setTimeout(() => { status.textContent = '' }, 1600)
  } }, 'Copy') : null
  return h('div.ph', h('div.ph-head', h('span.tag', `[${kind}: `), h('span', name), h('span.tag', ']'), h('span.spacer'), status, extra ?? null, btn), h('div.ph-body', body))
}

function openPng(c: HTMLCanvasElement, name: string): void {
  const url = chartPng(c)
  const w = window.open('', '_blank')
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = `${name}.png`; a.click(); return }
  w.document.title = `${name}.png`
  const img = w.document.createElement('img')
  img.src = url
  img.alt = name
  img.style.maxWidth = '100%'
  const p = w.document.createElement('p')
  p.textContent = 'Right-click → Save image as… (or long-press on mobile).'
  p.style.font = '14px system-ui'
  w.document.body.append(p, img)
}
