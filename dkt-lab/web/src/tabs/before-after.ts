import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f3, f4, pct, signed } from '../ui/format'
import { loadJson } from '../data'
import { canvas } from './models'

// "Before -> after" for the app's own models. Every number and every plotted
// point is read from results the Synaptic app produced:
//   app/learning-curves-before-after.json  (scripts/learning-curves-before-after.ts)
//   app/level14_arms.json                  (Level 14 runs)
//   app/dkt12_comparison.json              (the cutover gate)
// copied unchanged by pipeline/export.py and checked by check_web.py. Prose below
// only ever describes what those files say; it quotes no figure that is not
// computed from them.

type ModelKey = 'live_bkt' | 'per_skill_bkt' | 'dkt_before' | 'dkt_after'
interface CurvePoint extends Record<ModelKey, number> { opportunity: number; n: number; actual: number }
interface CurvesFile {
  synthetic: boolean; learners: number; seed: number; attempts: number; cohortPairs: number; source: string
  models: Record<ModelKey, string>
  cohort: { minOpportunities: number; observedSlope: number; slopes: Record<ModelKey, { slope: number; slopeRatio: number }>; points: CurvePoint[] }
}
interface Arm { arm: string; config: string; dkt: { auc: number; logLoss: number; slopeRatio: number }; bkt: { auc: number; logLoss: number; slopeRatio: number }; gate: string }
interface ArmsFile { arms: Arm[] }
interface GateFile { decision: { recommend: boolean; reason: string; checks: { ranking: { aucGain: number; required: number }; growth: { dktSlopeRatio: number; bktSlopeRatio: number; maxLoss: number } } } }

async function load() {
  const [curves, arms, gate] = await Promise.all([
    loadJson<CurvesFile>('app/learning-curves-before-after.json'),
    loadJson<ArmsFile>('app/level14_arms.json'),
    loadJson<GateFile>('app/dkt12_comparison.json'),
  ])
  const before = arms.arms.find(a => a.arm === 'A')!
  const best = arms.arms.reduce((a, b) => (b.dkt.auc > a.dkt.auc ? b : a))
  const after = arms.arms[arms.arms.length - 1]
  return { curves, arms, gate, before, after, best }
}

const chip = (delta: number, higherIsBetter: boolean, digits = 3) =>
  h(`span.chip.${Math.abs(delta) < 5e-4 ? 'same' : (delta > 0) === higherIsBetter ? 'up' : 'down'}`, signed(delta, digits))

const prov = (c: CurvesFile) => h('div.prov', h('span.badge.synthetic', 'synthetic (Synaptic simulator)'),
  h('strong', `${c.learners} fresh simulated learners, seed ${c.seed} (never seen in training)`),
  h('span.muted', 'Source: Research/dkt/results/learning-curves-before-after.json (copied unchanged)'))

/** Compact before/after scoreboard for the Model comparison tab. */
export async function renderBeforeAfterScoreboard(root: HTMLElement): Promise<void> {
  const { curves, before, after, best, gate } = await load()
  const s = curves.cohort.slopes
  const g = gate.decision.checks
  const row = (label: string, b: string, a: string, delta: HTMLElement, read: string) =>
    h('tr', h('td', label), h('td.num', b), h('td.num', a), h('td.num', delta), h('td.small.muted', read))
  root.append(h('div.card', { style: { marginBottom: '16px' } },
    h('h3', 'Synaptic’s own DKT: before → after', h('a.small', { href: '#/curves' }, 'see the curves →')),
    h('p.small.muted', `Separate from the dataset below: this is the DKT inside the app, on ${curves.learners} simulated learners (synthetic). “Before” is the model the app shipped with until Level 14; “after” is the one it ships now.`),
    h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', ''), h('th.num', 'Before'), h('th.num', 'After'), h('th.num', 'Change'), h('th', 'In plain words'))),
      h('tbody',
        row('Ranking (AUC)', f4(before.dkt.auc), f4(after.dkt.auc), chip(after.dkt.auc - before.dkt.auc, true, 4),
          'Slightly better at putting right answers above wrong ones.'),
        row('Log-loss (lower is better)', f4(before.dkt.logLoss), f4(after.dkt.logLoss), chip(after.dkt.logLoss - before.dkt.logLoss, false, 4),
          'Its probabilities are a little more honest.'),
        row('Real growth reproduced', pct(s.dkt_before.slopeRatio), pct(s.dkt_after.slopeRatio), chip(s.dkt_after.slopeRatio - s.dkt_before.slopeRatio, true),
          'How much of the learners’ actual improvement its curve shows.'),
        row('…for comparison, BKT', pct(s.live_bkt.slopeRatio), pct(s.live_bkt.slopeRatio), h('span.chip.same', 'unchanged'),
          'The model it would replace. Still ahead by a wide margin.'),
        row('Cutover gate', before.gate.replace(/_/g, ' '), gate.decision.reason.replace(/_/g, ' '), h('span.chip.same', 'still no'),
          'Needs both ranking and growth; DKT fails both.')))),
    h('p.small.muted', `Why not just keep the best-ranking variant? The arm with the best AUC (${best.arm}, ${f4(best.dkt.auc)}) reproduced only ${pct(best.dkt.slopeRatio)} of real growth; adding the reconstruction term gave up ${f4(best.dkt.auc - after.dkt.auc)} AUC to gain ${pct(after.dkt.slopeRatio - best.dkt.slopeRatio)} growth. The gate needs an AUC gain of ${g.ranking.required} over BKT and growth within ${g.growth.maxLoss} of BKT’s.`)))
}

/** The before -> after learning-curve story for the Learning curves tab. */
export async function renderBeforeAfterCurves(root: HTMLElement): Promise<void> {
  const { curves, arms, before, after, gate } = await load()
  const armB = arms.arms.find(a => a.arm === 'B')!
  const pts = curves.cohort.points
  const first = pts[0], last = pts[pts.length - 1]
  const s = curves.cohort.slopes
  const gapBefore = s.live_bkt.slopeRatio - s.dkt_before.slopeRatio
  const gapAfter = s.live_bkt.slopeRatio - s.dkt_after.slopeRatio
  const c = (a: number) => pct(a, 0)

  root.append(
    h('h2', { style: { marginTop: '4px' } }, 'Before → after: what we changed in the app, and what the curves did'),
    prov(curves),
    h('p.lede', `A learning curve answers one question: after the 1st, 2nd, 3rd… attempt on a skill, how often is the next answer right? The grey line below is what the simulated learners really did. A good model's line should climb at the same rate. Same ${curves.cohortPairs.toLocaleString('en-US')} learner-skill pairs at every point, so the shape is about the models and not about who dropped out.`),
    h('div.flow',
      h('div.step.before', h('h3', h('span.step-n', '1'), 'The problem'),
        h('p.small', { style: { margin: 0 } }, `The app’s DKT started too optimistic (${c(first.dkt_before)} predicted on attempt 1; learners really got ${c(first.actual)}) and then climbed too slowly. It reproduced only ${c(s.dkt_before.slopeRatio)} of the real growth. The cutover gate never looked at this: it only compared ranking.`)),
      h('div.step.fix', h('h3', h('span.step-n', '2'), 'What we changed'),
        h('ul',
          h('li', h('strong', 'Retrained DKT'), ' to also reproduce the answer it just saw (reconstruction term, λ = 0.1) and to stop when validation stops improving.'),
          h('li', h('strong', 'Rebuilt the gate'), ' to measure growth on the same fixed cohort, and to report every failed condition.'),
          h('li', h('strong', 'Gave BKT per-skill parameters'), ' (measured in shadow; not switched on).'))),
      h('div.step.after', h('h3', h('span.step-n', '3'), 'What it did'),
        h('p.small', { style: { margin: '0 0 6px' } }, `DKT’s growth went from ${c(s.dkt_before.slopeRatio)} to ${c(s.dkt_after.slopeRatio)} of real, a gain of ${signed(s.dkt_after.slopeRatio - s.dkt_before.slopeRatio)}. BKT sits at ${c(s.live_bkt.slopeRatio)}, so the gap narrowed from ${f3(gapBefore)} to ${f3(gapAfter)} but did not close.`),
        h('p.small.muted', { style: { margin: 0 } }, `Gate: ${gate.decision.recommend ? 'recommend review' : 'still do not switch'}.`))),
  )

  const lc = canvas('Cohort learning curve before the changes'), la = canvas('Cohort learning curve after the changes')
  const key = (cls: string, text: string) => h(`span.key.${cls}`, text)
  const legendFor = (dktText: string) => h('div.legend', key('actual', 'Real learners'), key('bkt', 'BKT (live engine)'), key('dkt', dktText))
  root.append(h('div.grid.cols-2',
    h('div.card', h('h3', h('span', h('span.panel-tag', 'Before'), ' DKT as shipped through Level 13')), legendFor('DKT (before)'), h('div.chart', lc),
      h('p.small.muted', `Attempt 1: DKT says ${c(first.dkt_before)}, reality ${c(first.actual)}. Attempt ${last.opportunity}: DKT ${c(last.dkt_before)}, reality ${c(last.actual)}. Flatter than the grey line.`)),
    h('div.card', h('h3', h('span', h('span.panel-tag.after', 'After'), ' DKT as bundled now')), legendFor('DKT (after)'), h('div.chart', la),
      h('p.small.muted', `Attempt 1: DKT says ${c(first.dkt_after)}, reality ${c(first.actual)}. Attempt ${last.opportunity}: DKT ${c(last.dkt_after)}, reality ${c(last.actual)}. Steeper, still flatter than reality.`)),
  ))
  const draw = (cv: HTMLCanvasElement, dktKey: 'dkt_before' | 'dkt_after') => chart(cv, () => {
    const p = palette()
    const line = (label: string, color: string, k: 'actual' | ModelKey, dash: number[] = [], width = 2, radius = 0) =>
      ({ label, data: pts.map(pt => ({ x: pt.opportunity, y: pt[k] })), borderColor: color, backgroundColor: color, borderDash: dash, borderWidth: width, pointRadius: radius, tension: 0.15 })
    return {
      type: 'line',
      data: { datasets: [line('Real learners', p.actual, 'actual', [], 3, 3), line('BKT', p.bkt, 'live_bkt', [6, 3]), line('DKT', p.dkt, dktKey, [], 2.5, 2)] },
      options: {
        scales: {
          x: { type: 'linear', min: 1, max: 10, ticks: { stepSize: 1 }, title: { display: true, text: 'attempt number on the skill' } },
          y: { min: 0.1, max: 0.8, ticks: { callback: (v: number) => `${Math.round(v * 100)}%` }, title: { display: true, text: 'answered correctly' } },
        },
        plugins: { tooltip: { callbacks: { label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(1)}%` } } },
      },
    }
  })
  draw(lc, 'dkt_before'); draw(la, 'dkt_after')

  // Growth reproduced, as bars: the one number the lines are summarising.
  const bars = canvas('Share of real learning growth each model reproduces')
  const order: ModelKey[] = ['dkt_before', 'dkt_after', 'per_skill_bkt', 'live_bkt']
  const nice: Record<ModelKey, string> = { dkt_before: 'DKT before', dkt_after: 'DKT after', per_skill_bkt: 'BKT per-skill (shadow)', live_bkt: 'BKT live' }
  root.append(h('div.grid.cols-2', { style: { marginTop: '16px' } },
    h('div.card', h('h3', 'The one number behind the lines'),
      h('p.small.muted', 'Growth reproduced = the slope of the model’s curve divided by the slope of the real one. 100% would mean the model climbs exactly as fast as the learners do.'),
      h('div.chart.short', bars)),
    h('div.card.warn-card', h('h3', 'Honest reading'),
      h('ul.small', { style: { margin: 0, paddingLeft: '18px' } },
        h('li', `The change is real but modest: ${signed(s.dkt_after.slopeRatio - s.dkt_before.slopeRatio)} growth, about ${(100 * (s.dkt_after.slopeRatio - s.dkt_before.slopeRatio) / gapBefore).toFixed(0)}% of the gap to BKT.`),
        h('li', `Where the gain came from: ${signed(armB.dkt.slopeRatio - before.dkt.slopeRatio)} from simply training longer with early stopping (arm B), and ${signed(after.dkt.slopeRatio - armB.dkt.slopeRatio)} from the reconstruction term. The lab’s own simulator experiment had predicted a larger gain from the term alone (about +0.15).`),
        h('li', `Ranking barely moved (${signed(after.dkt.auc - before.dkt.auc, 4)} AUC). The gate wants ${gate.decision.checks.ranking.required} over BKT; it has ${f4(gate.decision.checks.ranking.aucGain)}.`),
        h('li', 'Per-skill BKT improves ranking and calibration but leaves growth where it was; it is the cheaper upgrade, and it stays off until real learner data fits it.'),
        h('li', 'All of this is simulated learners, so it shows the method works, not what real students will do.')))))
  root.append(h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'Why the two models’ lines behave differently, and why both graphs are valid'),
    h('div.grid.cols-2',
      h('div', h('p.small', h('strong', 'The grey line is always about one skill. '), 'Each point is “how often was the learner right on their n-th attempt at that skill”. Nothing from other skills is mixed into it, in this graph or in the aggregate one.'),
        h('p.small.muted', { style: { marginBottom: 0 } }, 'The aggregate and cohort curves on the public datasets below differ in who is counted at each point (everyone still answering, versus the same learner-skill pairs throughout), not in which skills are counted.')),
      h('div', h('p.small', h('strong', 'What differs between the models is what they may look at. '), 'BKT updates a skill only from that skill’s own answers. DKT keeps one memory across all skills, so an answer on skill A can move its prediction for skill B.'),
        h('p.small.muted', { style: { marginBottom: 0 } }, 'That sharing can help when skills are related and adds noise when they are not. It is one plausible reason DKT’s per-answer predictions jump more than BKT’s; this page does not test it in isolation.'))),
    h('p.small.muted', { style: { marginBottom: 0 } }, 'Both graphs are valid measurements. The cohort curve is the one to judge models by, because the population stays fixed.')))
  chart(bars, () => {
    const p = palette()
    return {
      type: 'bar',
      data: { labels: order.map(k => `${nice[k]}: ${c(s[k].slopeRatio)}`), datasets: [{
        data: order.map(k => s[k].slopeRatio),
        backgroundColor: [p.dkt + '66', p.dkt, p.bkt + '66', p.bkt], borderRadius: 3, barThickness: 22 }] },
      options: { indexAxis: 'y', scales: { x: { min: 0, max: 1, ticks: { callback: (v: number) => `${Math.round(v * 100)}%` }, title: { display: true, text: 'share of real growth reproduced (100% = perfect)' } }, y: { grid: { display: false } } } },
    }
  })
}
