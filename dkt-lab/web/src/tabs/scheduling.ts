import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f3, pct } from '../ui/format'
import { loadJson } from '../data'
import { canvas } from './models'

interface Report {
  scheduler: 'sm2' | 'fsrs'
  learners: number; days: number; attempts: number; reviewAttempts: number
  reviewsPerLearner: number; skillsLearnedPerLearner: number; endRetention: number; forgottenFraction: number
  bkt: { logLoss: number; auc: number }
  recallPrediction: { sm2: { logLoss: number; auc: number }; fsrs: { logLoss: number; auc: number } }
}
interface SchedFile { synthetic: boolean; note: string; config: { seed: number; learners: number; days: number; skills: number }; generated_at: string; reports: Report[] }

export async function renderScheduling(root: HTMLElement): Promise<void> {
  const r = await loadJson<SchedFile>('scheduler-comparison.json')
  const sm2 = r.reports.find(x => x.scheduler === 'sm2')!
  const fsrs = r.reports.find(x => x.scheduler === 'fsrs')!
  root.append(
    h('h1', 'Scheduling: SM-2 vs FSRS'),
    h('div.prov', h('span.badge.synthetic', 'synthetic (Synaptic simulator)'), h('strong', `${r.config.learners.toLocaleString('en-US')} simulated learners × ${r.config.days} days, ${r.config.skills} skills, seed ${r.config.seed}`),
      h('span.muted', 'Source: Research/sim/results/scheduler-comparison.json (copied unchanged)'), h('span.muted', r.note)),
    h('p.lede', 'Knowledge tracing estimates what a learner knows; a scheduler decides when they should see it again. These are the repository’s existing simulator results: the same simulated population run under each scheduler, so only the review timing differs. Not evidence about real learners.'),
  )
  const rows: [string, (x: Report) => string, boolean][] = [
    ['Reviews per learner', x => x.reviewsPerLearner.toFixed(1), false],
    ['Skills learned per learner', x => x.skillsLearnedPerLearner.toFixed(1), true],
    ['True retention at end (learned skills)', x => pct(x.endRetention), true],
    ['Learned skills forgotten at end (recall < 70%)', x => pct(x.forgottenFraction), false],
    ['Attempts (total)', x => x.attempts.toLocaleString('en-US'), false],
    ['BKT AUC on this run', x => f3(x.bkt.auc), true],
  ]
  root.append(h('div.grid.cols-2',
    h('div.card', h('h3', 'Outcomes'), h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', ''), h('th.num', 'SM-2 (live today)'), h('th.num', 'FSRS'))),
      h('tbody', rows.map(([l, fn]) => h('tr', h('td', l), h('td.num', fn(sm2)), h('td.num', fn(fsrs))))))),
      h('p.small.muted', `FSRS spends ${pct(fsrs.reviewsPerLearner / sm2.reviewsPerLearner - 1)} more reviews and cuts forgotten skills from ${pct(sm2.forgottenFraction)} to ${pct(fsrs.forgottenFraction)}.`)),
    h('div.card', h('h3', 'Recall prediction on review attempts (run under SM-2)'), h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Memory model'), h('th.num', 'AUC'), h('th.num', 'Log-loss'))),
      h('tbody',
        h('tr', h('td', 'SM-2 implied recall 0.9^(elapsed/interval)'), h('td.num', f3(sm2.recallPrediction.sm2.auc)), h('td.num', f3(sm2.recallPrediction.sm2.logLoss))),
        h('tr', h('td', 'FSRS retrievability (default parameters)'), h('td.num', f3(sm2.recallPrediction.fsrs.auc)), h('td.num', f3(sm2.recallPrediction.fsrs.logLoss)))))),
      h('p.small.muted', 'FSRS ranks recall better but its default parameters are over-confident here (worse log-loss).')),
  ))
  const c = canvas('Retention and forgetting under SM-2 and FSRS')
  root.append(h('div.card', { style: { marginTop: '16px' } }, h('h3', 'Retention vs review cost'), h('div.chart.short', c)),
    h('p.small.muted', 'Why it is here: neither BKT nor DKT sees elapsed time (see Method & limitations). Schedulers are the part of the system that does, which is why the DKT tuning experiments add time features.'))
  chart(c, () => {
    const p = palette()
    return {
      type: 'bar',
      data: { labels: ['Retention at end', 'Forgotten at end', 'Reviews / learner ÷ 200'], datasets: [
        { label: 'SM-2', data: [sm2.endRetention, sm2.forgottenFraction, sm2.reviewsPerLearner / 200], backgroundColor: p.ink3, borderRadius: 2 },
        { label: 'FSRS', data: [fsrs.endRetention, fsrs.forgottenFraction, fsrs.reviewsPerLearner / 200], backgroundColor: p.synthetic, borderRadius: 2 }] },
      options: { plugins: { legend: { display: true, labels: { color: p.ink2, boxWidth: 12 } } }, scales: { y: { min: 0, max: 1 } } },
    }
  })
}
