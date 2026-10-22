import { h } from '../ui/dom'
import { f3, f4, signed } from '../ui/format'
import { loadJson } from '../data'

// Everything on this tab is read from results the Synaptic app itself produced
// and the pipeline copied unchanged into public/data/app/ (export.py;
// check_web.py fails if a copy drifts from its source). Nothing is computed or
// typed in here, so re-running the app's comparison scripts and re-exporting is
// the only way these numbers change.

interface Arm {
  arm: string; config: string; attempts: number; cohortPairs: number; gate: string
  dkt: { auc: number; logLoss: number; slopeRatio: number }
  bkt: { auc: number; logLoss: number; slopeRatio: number }
  heldOutAuc: Record<string, number>
}
interface ArmsFile { synthetic: boolean; learners: number; seed: number; source: string; note: string; arms: Arm[] }

interface GateFile {
  synthetic: boolean; learners: number; seed: number
  decision: {
    recommend: boolean; reason: string
    checks: {
      sampleSize: { pass: boolean; n: number; required: number }
      ranking: { pass: boolean; aucGain: number; required: number; logLossOk: boolean }
      growth: { pass: boolean; measured: boolean; dktSlopeRatio: number; bktSlopeRatio: number; maxLoss: number }
    }
  }
}

interface HeldOutFile { models: { live_bkt: { auc: number }; fitted_bkt: { auc: number } } }

interface ParamsFile {
  synthetic: boolean; learners: number; seed: number; attempts: number; fittedSkills: number
  provenance: { source: string; rows: number; learners: number; synthetic: boolean; min_sequences: number }
  live: { auc: number; logLoss: number; slopeRatio: number }
  fitted: { auc: number; logLoss: number; slopeRatio: number }
  cohortPairs: number
}

const verdict = (pass: boolean) => h(pass ? 'strong' : 'strong.fail', pass ? 'pass' : 'FAIL')

export async function renderApp(root: HTMLElement): Promise<void> {
  const [arms, gate, params, heldOut] = await Promise.all([
    loadJson<ArmsFile>('app/level14_arms.json'),
    loadJson<GateFile>('app/dkt12_comparison.json'),
    loadJson<ParamsFile>('app/per-skill-params.json'),
    loadJson<HeldOutFile>('app/synaptic_dkt_results.json'),
  ])
  const current = arms.arms[arms.arms.length - 1]
  const checks = gate.decision.checks

  root.append(
    h('h1', 'Synaptic app: what was done with these findings'),
    h('div.prov', h('span.badge.synthetic', 'synthetic (Synaptic simulator)'),
      h('strong', `${arms.learners} fresh simulated learners, seed ${arms.seed}`),
      h('span.muted', 'Source: Research/dkt/results and Research/bkt/results (copied unchanged)')),
    h('p.lede', 'The other tabs ask which model is better on public datasets. This one reports what happened when the same questions were put to the real application: its DKT was retrained with the lab’s own recommended setting, its cutover gate now measures growth as well as ranking, and its BKT was given per-skill parameters. All of it runs on simulated learners, so it validates the method, not the result for real students.'),
  )

  root.append(h('div.card',
    h('h3', 'The app’s DKT, retrained'),
    h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Arm'), h('th', 'Training'), h('th.num', 'DKT AUC'), h('th.num', 'DKT log-loss'), h('th.num', 'DKT slope ratio'))),
      h('tbody',
        arms.arms.map(a => h('tr', h('td', a.arm), h('td', a.config), h('td.num', f4(a.dkt.auc)), h('td.num', f4(a.dkt.logLoss)), h('td.num', f4(a.dkt.slopeRatio)))),
        h('tr', h('td', 'BKT'), h('td', 'the app’s live engine, one global parameter set'), h('td.num', f4(current.bkt.auc)), h('td.num', f4(current.bkt.logLoss)), h('td.num', f4(current.bkt.slopeRatio)))))),
    h('p.small.muted', `Every arm scored on ${current.attempts.toLocaleString('en-US')} attempts and ${current.cohortPairs.toLocaleString('en-US')} cohort pairs. ${arms.note}`),
    h('p.small.muted', 'The last arm is the model the app ships. The reconstruction term raised growth fidelity, but by far less than the lab’s simulator experiment predicted, and the arm with the best AUC is not the arm with the best growth — the same split the Learning curves tab explains.'),
  ))

  root.append(h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'The cutover gate'),
    h('p.small.muted', 'The lab’s FINDINGS-CURVES.md proposed a growth condition for the gate; the app now enforces it, and reports every condition rather than only the first to fail.'),
    h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Condition'), h('th', 'Result'), h('th', 'Measured against the bar'))),
      h('tbody',
        h('tr', h('td', 'Sample size'), h('td', verdict(checks.sampleSize.pass)), h('td', `${checks.sampleSize.n.toLocaleString('en-US')} attempts, needs ${checks.sampleSize.required.toLocaleString('en-US')}`)),
        h('tr', h('td', 'Ranking'), h('td', verdict(checks.ranking.pass)), h('td', `AUC gain ${f4(checks.ranking.aucGain)}, needs ${checks.ranking.required}; log-loss ${checks.ranking.logLossOk ? 'no worse' : 'worse'}`)),
        h('tr', h('td', 'Growth'), h('td', verdict(checks.growth.pass)), h('td', checks.growth.measured
          ? `DKT slope ratio ${f4(checks.growth.dktSlopeRatio)} vs BKT ${f4(checks.growth.bktSlopeRatio)}, may lose at most ${checks.growth.maxLoss}`
          : 'not measurable on these rows'))))),
    h('p.small', h('strong', 'Verdict: '), gate.decision.recommend ? 'DKT clears the bar — a human reviews switching.' : `do not switch (${gate.decision.reason.replace(/_/g, ' ')}).`,
      ' A recommendation only; switching an experimental system live needs human sign-off.'),
  ))

  root.append(h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'BKT with per-skill parameters'),
    h('p.small.muted', `The app’s BKT uses one parameter set for every skill. Fitting each skill separately by EM — the BKT this lab has always used — was measured against it on ${params.attempts.toLocaleString('en-US')} attempts, both traced inside one simulator run so they see the same attempts and the same overdue decay.`),
    h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'BKT'), h('th.num', 'AUC'), h('th.num', 'Log-loss'), h('th.num', 'Slope ratio'))),
      h('tbody',
        h('tr', h('td', 'One global parameter set (live)'), h('td.num', f4(params.live.auc)), h('td.num', f4(params.live.logLoss)), h('td.num', f4(params.live.slopeRatio))),
        h('tr', h('td', 'Per-skill, EM-fitted'), h('td.num', f4(params.fitted.auc)), h('td.num', f4(params.fitted.logLoss)), h('td.num', f4(params.fitted.slopeRatio)))))),
    h('p.small.muted', `Per-skill parameters moved AUC by ${signed(params.fitted.auc - params.live.auc, 4)} and growth fidelity by ${signed(params.fitted.slopeRatio - params.live.slopeRatio, 4)}: ranking and calibration improve, growth does not. Only ${params.fittedSkills} of 120 skills were fitted (${params.provenance.source}, ${params.provenance.rows.toLocaleString('en-US')} rows, ${params.provenance.synthetic ? 'synthetic' : 'real'}); the rest keep the global set.`),
    h('p.small.muted', 'The fitted file is synthetic, so the app refuses to apply it even with BKT_PER_SKILL=1: those parameters describe the simulator’s memory model, not learners.'),
  ))

  root.append(h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'A correction to an earlier figure'),
    h('p.small', `The app's own Python evaluation (synaptic_dkt_results.json) reports the live BKT at ${f3(heldOut.models.live_bkt.auc)} against ${f3(heldOut.models.fitted_bkt.auc)} for a fitted BKT. That pair is confounded: the live engine decays p_know when a review is overdue and the fitted model does not, so it compared parameters and forgetting together. Traced fairly the gap is ${f3(params.live.auc)} against ${f3(params.fitted.auc)}. The direction holds; the size does not.`),
    h('p.small.muted', 'Neither model in the lab’s own Python evaluation sees elapsed time either — see Method & limitations.'),
  ))
}
