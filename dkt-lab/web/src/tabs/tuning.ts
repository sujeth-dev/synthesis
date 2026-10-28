// "DKT tuning" section of the Model comparison tab (Lab 6). Reads
// dkt_tuning.json written by dkt-lab/pipeline/tune.py; nothing is recomputed.
import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f4, int, signed } from '../ui/format'
import { canvas } from './models'

export interface TuningRun {
  dataset: string; phase: string; model: 'DKT' | 'BKT' | 'reference'; variant: string
  val_auc: number; test_auc: number; test_log_loss: number; test_rmse: number; n_test: number
  train_seconds: number; epochs_run?: number; best_epoch?: number
}
export interface Tuning {
  dataset: string
  rules: string[]
  runs: TuningRun[]
  final?: { best_dkt: string; best_bkt: string; dkt_test_auc: number; bkt_test_auc: number; test_auc_gain: number; dkt_test_log_loss: number; bkt_test_log_loss: number; meets_gate: boolean; gate: string }
  conclusion?: string
  next_steps?: { step: string; expected_gain: string; evidence: string }[]
  app_export?: { file: string | null; note: string }
}

const PHASES: Record<string, string> = {
  E: 'Fair BKT baselines (and references)',
  A: 'Training: early stopping, hidden size, learning rate, dropout',
  B: 'Time features',
  C: 'DKT+ regularisation',
  D: 'More data: 1,000 vs 3,000 vs 5,000 simulated learners',
}

export function renderTuning(root: HTMLElement, t: Tuning): void {
  const main = t.runs.filter(r => r.dataset === t.dataset)
  const bestVal = (model: string) => main.filter(r => r.model === model && r.phase !== 'D').reduce<TuningRun | null>((b, r) => (!b || r.val_auc > b.val_auc ? r : b), null)
  const bd = bestVal('DKT'), bb = bestVal('BKT')
  root.append(
    h('h2', { id: 'dkt-tuning' }, 'DKT tuning: can DKT win on the Synaptic simulator?'),
    h('div.prov', h('span.badge.synthetic', 'synthetic (Synaptic simulator)'), h('span', 'Experiments on simulated learners; see the Datasets tab.')),
    h('p.lede', 'In the app’s own evaluation DKT lost to a tuned per-skill BKT on simulator data. These experiments try to change that, in the order below. Every variant that was run is listed, including the ones that did not help.'),
    h('ul.small', t.rules.map(r => h('li', r))),
  )
  if (t.conclusion) root.append(h('p.verdict', t.conclusion))
  if (t.final) {
    root.append(h('p.small', `Chosen on validation: best DKT “${t.final.best_dkt}” vs best BKT “${t.final.best_bkt}”. Test AUC ${f4(t.final.dkt_test_auc)} vs ${f4(t.final.bkt_test_auc)} (${signed(t.final.test_auc_gain, 4)}); log-loss ${f4(t.final.dkt_test_log_loss)} vs ${f4(t.final.bkt_test_log_loss)}. App gate (${t.final.gate}): `,
      h('strong', t.final.meets_gate ? 'passed' : 'not passed'), '.'))
  }

  for (const phase of ['E', 'A', 'B', 'C', 'D']) {
    const rows = t.runs.filter(r => r.phase === phase && (phase === 'D' || r.dataset === t.dataset))
    if (!rows.length) continue
    root.append(h('div.card', { style: { marginTop: '14px' } }, h('h3', `${phase} · ${PHASES[phase]}`), h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Variant'), h('th.num', 'Val AUC'), h('th.num', 'Test AUC'), h('th.num', 'Test log-loss'), h('th.num', 'Test RMSE'), h('th.num', 'Epochs'), h('th.num', 'Training time'))),
      h('tbody', rows.map(r => h('tr',
        h(`td${r === bd || r === bb ? '.win' : ''}`, h('span', { style: { color: r.model === 'DKT' ? 'var(--dkt)' : r.model === 'BKT' ? 'var(--bkt)' : 'var(--ink-3)' } }, r.model === 'reference' ? 'ref · ' : `${r.model} · `), r.variant),
        h('td.num', f4(r.val_auc)), h('td.num', f4(r.test_auc)), h('td.num', f4(r.test_log_loss)), h('td.num', f4(r.test_rmse)),
        h('td.num', r.epochs_run ? `${r.epochs_run}${r.best_epoch ? ` (best ${r.best_epoch})` : ''}` : '—'),
        h('td.num', r.model === 'reference' ? '—' : `${r.train_seconds}s`),
      )))))))
  }
  root.append(h('p.small.muted', `Bold rows: the best DKT and best BKT by validation AUC (phases A–C, E). Test rows n = ${int(main[0]?.n_test ?? 0)}. References are not candidates: the app’s live BKT uses one global parameter set, and the ceiling uses the simulator’s hidden true recall, which no model can see.`))

  const sizeRows = t.runs.filter(r => r.phase === 'D')
  if (sizeRows.length) {
    const sizes = [...new Set(sizeRows.map(r => Number(/(\d[\d,]*) learners/.exec(r.variant)?.[1].replace(/,/g, '') ?? 0)))].sort((a, b) => a - b)
    const series = [...new Set(sizeRows.map(r => r.variant.replace(/ · .*$/, '')))]
    const c = canvas('Test AUC against number of simulated learners for BKT and DKT')
    root.append(h('div.card', { style: { marginTop: '14px' } }, h('h3', 'AUC vs training-data size'), h('div.chart', c),
      h('p.small.muted', 'Each size is a separate simulator run (same seed), split 70/15/15 by learner; models are re-fitted per size with the configuration chosen at 1,000 learners.')))
    chart(c, () => {
      const p = palette()
      const style = (s: string) => s.startsWith('DKT best overall') ? { c: p.dkt, d: [] } : s.startsWith('DKT') ? { c: p.dkt, d: [5, 4] } : s.includes('forgetting') ? { c: p.bkt, d: [5, 4] } : { c: p.bkt, d: [] }
      return {
        type: 'line',
        data: { labels: sizes.map(n => n.toLocaleString('en-US')), datasets: series.map(s => ({
          label: s, data: sizes.map(n => sizeRows.find(r => r.variant === `${s} · ${n} learners`)?.test_auc ?? null),
          borderColor: style(s).c, backgroundColor: style(s).c, borderDash: style(s).d, pointRadius: 3, borderWidth: 2 })) },
        options: { plugins: { legend: { display: true, labels: { color: p.ink2, boxWidth: 14 } } }, scales: { x: { title: { display: true, text: 'simulated learners' } }, y: { title: { display: true, text: 'test AUC' } } } },
      }
    })
  }

  if (t.next_steps?.length) {
    root.append(h('div.card', { style: { marginTop: '14px' } }, h('h3', 'Next steps, ranked by expected gain'), h('ol', t.next_steps.map(s => h('li', h('strong', s.step), ` — expected gain: ${s.expected_gain}. `, h('span.muted', `Evidence: ${s.evidence}`))))))
  }
  if (t.app_export) root.append(h('p.note', t.app_export.note))
  if (t.app_export) root.append(h('p.note', 'Update: the note above is the tuning run’s own and is generated, so it is left as written. Since then the app’s bundled DKT was retrained with the lab’s recommended reconstruction setting (lambda_r 0.1); it still does not meet the gate. See the Synaptic app tab.'))
}
