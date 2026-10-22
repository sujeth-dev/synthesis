import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f3, int, signed } from '../ui/format'
import { provenance } from '../ui/provenance'
import { loadCurves, loadDiagnostics } from '../data'
import type { CurveFidelity, CurvePoint, Diagnostics } from '../data'
import { canvas } from './models'
import { renderBeforeAfterCurves } from './before-after'
import type { TabContext } from '../main'

// Learning curves. Two measurements are shown deliberately, because they
// disagree and the disagreement is the finding (see dkt-lab/FINDINGS-CURVES.md):
//
//   * the cohort curve holds the (student, skill) population fixed, so its shape
//     is a statement about the models;
//   * the aggregate curve averages whoever happens to still be answering, which
//     on ASSISTments 2009 drifts *downwards* for reasons that are not about
//     learning at all.
//
// The old version of this tab showed only the aggregate curve, capped at
// opportunity 20, and mentioned the selection effect in prose. That was enough
// to make DKT look like it could not represent learning, which is not what the
// data supports. Everything here is read from diagnostics.json as computed
// offline; nothing is recomputed in the browser.

const MODEL_KEYS = ['bkt', 'dkt'] as const
const BASELINE_KEYS = ['skill_rate', 'skill_and_student'] as const
const BASELINE_LABEL: Record<string, string> = {
  global_rate: 'global rate',
  skill_rate: 'skill difficulty only',
  student_rate: 'student ability only',
  skill_and_student: 'difficulty + ability',
}

const num = (p: CurvePoint, k: string) => p[k] as number

// Node.append() rejects null, unlike h()'s child list, so sections that may be
// absent for a dataset are filtered here rather than at every call site.
const appendAll = (root: HTMLElement, ...kids: (HTMLElement | null)[]) =>
  root.append(...kids.filter((k): k is HTMLElement => k !== null))

export async function renderCurves(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) return

  let diag: Diagnostics | null = null
  try {
    diag = await loadDiagnostics(d.id)
  } catch {
    diag = null                         // a dataset exported before Lab 7
  }

  root.append(h('h1', 'Learning curves'))
  try { await renderBeforeAfterCurves(root) } catch (err) {
    root.append(h('div.note', `Before/after curves unavailable: ${(err as Error).message}`))
  }
  root.append(h('h2', { style: { marginTop: '36px' } }, 'The same question on the public datasets'), provenance(d),
    h('p.lede', 'Average P(correct) on a student’s n-th attempt at a skill, for held-out students: '
      + 'the observed rate, and the mean prediction each model made before seeing that answer. '
      + 'A model that represents learning follows the black line — and, more importantly, rises as fast as it does.'))

  if (!diag) {
    await legacyOnly(root, d.id)
    return
  }

  const cohort = diag.cohort_curve
  const cohortFid = diag.cohort_curve_fidelity
  const raw = diag.raw_curve
  const rawFid = diag.raw_curve_fidelity

  if (!cohort.points.length) {
    root.append(h('div.card.warn-card',
      h('h3', 'This dataset cannot have a learning curve'),
      h('p', `Every (student, skill) pair in ${d.name} is answered at most `
        + `${diag.dataset_audit.max_opportunity} time(s), so there is no n-th attempt to plot. `
        + 'Any “curve” for it would be a single point.'),
      h('p.small.muted', 'Earlier versions of this lab published exactly that single point as a learning curve.')))
  } else {
    root.append(
      h('h2', 'Same learners at every point'),
      h('p', cohort.note),
      curveCard(cohort.points, `Cohort learning curve for ${d.name}`,
        `Pairs: ${int(cohort.pairs)} · first ${cohort.min_opportunities} opportunities`),
      fidelityCard(cohortFid, 'Does the model reproduce the observed growth?',
        'Slope ratio 1.00 reproduces the observed growth exactly; 0.00 is a flat line; negative runs backwards. '
        + 'The baselines contain no notion of practice on a skill, so their ratios show what “flat” looks like.'),
      pointsTable(cohort.points, [...MODEL_KEYS, ...BASELINE_KEYS]),
    )
  }

  if (raw.points.length) {
    appendAll(root,
      h('h2', { style: { marginTop: '28px' } }, 'Everyone, bucketed by opportunity'),
      h('p', raw.note),
      h('p.small.muted', `Measured out to opportunity ${raw.points[raw.points.length - 1].to} `
        + `(the data reaches ${raw.max_opportunity_in_data}); opportunities past 20 are grouped into widening buckets, `
        + `and buckets with fewer than ${raw.min_rows} answers are skipped rather than ending the curve.`),
      curveCard(raw.points, `Aggregate learning curve for ${d.name}`, 'All held-out rows', true),
      selectionNote(rawFid, cohortFid),
      h('div.card', { style: { marginTop: '16px' } },
        h('h3', 'Answers per bucket'),
        countsCard(raw.points)),
    )
  }

  appendAll(root,
    h('h2', { style: { marginTop: '28px' } }, 'Why the curve looks the way it does'),
    mechanismCard(diag),
    positionCard(diag),
    auditCard(diag, d.name),
    h('p.small.muted', { style: { marginTop: '16px' } },
      `Protocol: ${diag.protocol}. Reproduction check against the committed metrics: `
      + `${diag.reproduction_check.ok ? 'passed' : 'FAILED'} `
      + `(largest difference ${diag.reproduction_check.max_abs_delta.toExponential(1)}).`),
  )
}

// ── curves ──────────────────────────────────────────────────────────────────
function curveCard(points: CurvePoint[], label: string, caption: string, withBaselines = false): HTMLElement {
  const c = canvas(label)
  const card = h('div.card',
    h('div.legend',
      h('span.key.actual', 'Actual'),
      h('span.key.bkt', 'BKT predicted'),
      h('span.key.dkt', 'DKT predicted'),
      withBaselines ? h('span.key.muted', 'difficulty + ability (no learning)') : null),
    h('div.chart.tall', c),
    h('p.small.muted', caption))
  chart(c, () => {
    const p = palette()
    const line = (lbl: string, key: string, color: string, dash: number[] = []) => ({
      label: lbl, data: points.map(pt => num(pt, key)), borderColor: color, backgroundColor: color,
      borderDash: dash, pointRadius: 2.5, borderWidth: 2,
    })
    const datasets: unknown[] = [
      line('Actual', 'actual', p.actual),
      line('BKT', 'bkt', p.bkt, [6, 3]),
      line('DKT', 'dkt', p.dkt, [2, 2]),
    ]
    if (withBaselines) datasets.push({ ...line('difficulty + ability', 'skill_and_student', p.ink3, [1, 4]), pointRadius: 0, borderWidth: 1.5 })
    return {
      type: 'line',
      data: { labels: points.map(pt => pt.label), datasets },
      options: {
        scales: {
          x: { title: { display: true, text: 'practice opportunity on the skill' } },
          y: { title: { display: true, text: 'P(correct)' } },
        },
      },
    }
  })
  return card
}

function countsCard(points: CurvePoint[]): HTMLElement {
  const c = canvas('Number of answers in each opportunity bucket')
  const el = h('div.chart.short', c)
  chart(c, () => ({
    type: 'bar',
    data: { labels: points.map(p => p.label), datasets: [{ data: points.map(p => p.n), backgroundColor: palette().ink3, borderRadius: 2 }] },
    options: {
      scales: {
        x: { grid: { display: false }, title: { display: true, text: 'opportunity' } },
        y: { type: 'logarithmic', title: { display: true, text: 'answers (log)' } },
      },
    },
  }))
  return el
}

// ── fidelity and the selection effect ───────────────────────────────────────
function fidelityCard(fid: CurveFidelity, title: string, note: string): HTMLElement {
  const keys = [...MODEL_KEYS, ...BASELINE_KEYS].filter(k => fid.models[k])
  const verdict = (ratio: number) =>
    Math.abs(1 - ratio) <= 0.2 ? 'good' : Math.abs(1 - ratio) <= 0.5 ? 'warn' : 'bad'
  return h('div.card', { style: { marginTop: '16px' } },
    h('h3', title),
    h('p.small.muted', note),
    fid.actual_slope !== undefined
      ? h('p.small', 'Observed slope: ', h('strong', signed(fid.actual_slope, 5)), ' P(correct) per opportunity')
      : null,
    h('div.table-wrap', h('table',
      h('thead', h('tr', ['Model', 'Slope ratio', 'Slope', 'Curve MAE', 'Bias'].map((t, i) => h(i ? 'th.num' : 'th', t)))),
      h('tbody', keys.map(k => {
        const m = fid.models[k]
        const isModel = (MODEL_KEYS as readonly string[]).includes(k)
        return h('tr', { class: isModel ? '' : 'muted-row' },
          h('td', isModel ? h('strong', { class: `${k}-c` }, k.toUpperCase()) : BASELINE_LABEL[k] ?? k),
          h(`td.num.${verdict(m.slope_ratio)}-c`, m.slope_ratio.toFixed(2)),
          h('td.num', signed(m.slope, 5)),
          h('td.num', f3(m.mae)),
          h('td.num', signed(m.bias, 4)))
      })))))
}

function selectionNote(rawFid: CurveFidelity, cohortFid: CurveFidelity): HTMLElement | null {
  const rawSlope = rawFid.actual_slope
  const cohortSlope = cohortFid.actual_slope
  if (rawSlope === undefined || cohortSlope === undefined) return null
  const flipped = Math.sign(rawSlope) !== Math.sign(cohortSlope)
  return h('div.card.warn-card', { style: { marginTop: '16px' } },
    h('h3', 'The selection effect, quantified'),
    h('p', 'Observed slope measured over everyone: ', h('strong', signed(rawSlope, 5)),
      '. Measured over a fixed cohort: ', h('strong', signed(cohortSlope, 5)), '.'),
    h('p', flipped
      ? 'These have opposite signs. Averaged across everyone, learners appear to get worse with practice — '
        + 'because the learners still answering a skill for the fifteenth time are disproportionately the ones '
        + 'getting it wrong. Judging a model against the aggregate curve therefore rewards it for predicting '
        + 'a decline that no individual learner experiences.'
      : 'The aggregate curve understates the growth any individual learner experiences, because later buckets '
        + 'average more persistent — and weaker — learners.'))
}

function pointsTable(points: CurvePoint[], keys: readonly string[]): HTMLElement {
  return h('div.card', { style: { marginTop: '16px' } },
    h('div.table-wrap', h('table',
      h('thead', h('tr', ['Opportunity', 'Answers', 'Actual', '95% CI', ...keys.map(k =>
        (MODEL_KEYS as readonly string[]).includes(k) ? k.toUpperCase() : BASELINE_LABEL[k] ?? k)]
        .map((t, i) => h(i ? 'th.num' : 'th', t)))),
      h('tbody', points.map(p => h('tr',
        h('td', p.label),
        h('td.num', int(p.n)),
        h('td.num', f3(p.actual)),
        h('td.num.muted', p.actual_ci ? `${f3(p.actual_ci[0])}–${f3(p.actual_ci[1])}` : '—'),
        ...keys.map(k => h(`td.num${(MODEL_KEYS as readonly string[]).includes(k) ? `.${k}-c` : '.muted'}`, f3(num(p, k)))),
      ))))))
}

// ── mechanism ───────────────────────────────────────────────────────────────
function mechanismCard(diag: Diagnostics): HTMLElement {
  const rows = MODEL_KEYS.map(k => {
    const e = diag.evidence_response[k]
    const c = diag.consistency[k]
    const s = diag.within_pair_spread.models[k]
    return h('tr',
      h('td', h('strong', { class: `${k}-c` }, k.toUpperCase())),
      h('td.num', e.after_correct.fraction_positive.toFixed(2)),
      h('td.num', e.after_wrong.fraction_negative.toFixed(2)),
      h('td.num', signed(e.separation, 4)),
      h('td.num', c.w1.toFixed(5)),
      h('td.num', f3(c.reconstruction_error)),
      h('td.num', s ? f3(s.mean_within_pair_sd) : '—'))
  })
  return h('div.card',
    h('h3', 'Does the model respond to the answer it just saw?'),
    h('p.small.muted', diag.evidence_response.note),
    h('p.small.muted', diag.consistency.note),
    h('div.table-wrap', h('table',
      h('thead', h('tr', ['Model', 'Moves up after correct', 'Moves down after wrong', 'Separation',
        'Cross-skill thrash (w1)', 'Reconstruction error', 'Within-pair SD']
        .map((t, i) => h(i ? 'th.num' : 'th', t)))),
      h('tbody', rows))),
    h('p.small.muted', `Measured on ${int(diag.evidence_response.students_sampled)} held-out students. `
      + 'A model whose updates go the wrong way a quarter of the time is right on average and noisy per answer, '
      + 'which is what a shallow aggregate curve looks like from the inside.'))
}

function positionCard(diag: Diagnostics): HTMLElement | null {
  const bins = diag.position_slices.bins
  if (bins.length < 2) return null
  const c = canvas('DKT and BKT AUC and calibration error by depth into the sequence')
  const card = h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'Ranking and calibration as a sequence runs on'),
    h('p.small.muted', diag.position_slices.note
      + '. AUC is a ranking measure; ECE is calibration — how far the predicted probabilities sit from observed rates. '
      + 'The two can move in opposite directions, and only the second affects a curve.'),
    h('div.chart.short', c))
  chart(c, () => {
    const p = palette()
    const labels = bins.map(b => `${b.from}–${b.to}`)
    const ds = (label: string, data: number[], color: string, axis: string, dash: number[] = []) => ({
      label, data, borderColor: color, backgroundColor: color, borderDash: dash,
      pointRadius: 2, borderWidth: 2, yAxisID: axis,
    })
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          ds('DKT AUC', bins.map(b => b.dkt.auc), p.dkt, 'y'),
          ds('BKT AUC', bins.map(b => b.bkt.auc), p.bkt, 'y'),
          ds('DKT ECE', bins.map(b => b.dkt.ece), p.dkt, 'y1', [3, 3]),
          ds('BKT ECE', bins.map(b => b.bkt.ece), p.bkt, 'y1', [3, 3]),
        ],
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'position in the student’s sequence' } },
          y: { title: { display: true, text: 'AUC (solid)' } },
          y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'ECE (dashed)' } },
        },
      },
    }
  })
  return card
}

function auditCard(diag: Diagnostics, name: string): HTMLElement {
  const a = diag.dataset_audit
  const rows: [string, string][] = [
    ['Longest run of attempts on one skill', int(a.max_opportunity)],
    ['Mean attempts per (student, skill)', a.mean_attempts_per_student_skill.toFixed(2)],
    ['Pairs answered only once', `${(a.fraction_pairs_with_one_attempt * 100).toFixed(0)}%`],
    ['Longest student sequence', int(a.max_sequence_length)],
  ]
  if (a.raw_multi_skill) {
    rows.push(['Rows from problems tagged with several skills',
      `${(a.raw_multi_skill.fraction_rows_from_multi_skill_problems * 100).toFixed(0)}%`])
  }
  return h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'Can this dataset support a learning curve?'),
    h('div.table-wrap', h('table',
      h('tbody', rows.map(([k, v]) => h('tr', h('td', k), h('td.num', v)))))),
    a.raw_multi_skill
      ? h('p.small.muted', `In ${name}, one problem can be tagged with several skills and so becomes several `
        + 'consecutive rows. Where that happens, part of each “practice opportunity” counts re-tagging rather '
        + 'than practice.')
      : null)
}

// ── fallback ────────────────────────────────────────────────────────────────
async function legacyOnly(root: HTMLElement, id: string): Promise<void> {
  const cv = await loadCurves(id)
  const c = canvas('Learning curve: actual vs BKT vs DKT by practice opportunity')
  root.append(
    h('div.card.warn-card', h('p', 'No curve diagnostics for this dataset — showing the legacy aggregate curve. '
      + 'Run pipeline/diagnose.py to generate the controlled measurement.')),
    h('div.card',
      h('div.legend', h('span.key.actual', 'Actual'), h('span.key.bkt', 'BKT predicted'), h('span.key.dkt', 'DKT predicted')),
      h('div.chart.tall', c)))
  chart(c, () => {
    const p = palette()
    const ds = (label: string, data: number[], color: string, dash: number[] = []) => ({
      label, data, borderColor: color, backgroundColor: color, borderDash: dash, pointRadius: 2.5, borderWidth: 2,
    })
    return {
      type: 'line',
      data: {
        labels: cv.points.map(pt => pt.opportunity),
        datasets: [ds('Actual', cv.points.map(pt => pt.actual), p.actual),
          ds('BKT', cv.points.map(pt => pt.bkt), p.bkt, [6, 3]),
          ds('DKT', cv.points.map(pt => pt.dkt), p.dkt, [2, 2])],
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'practice opportunity on the skill' } },
          y: { title: { display: true, text: 'P(correct)' } },
        },
      },
    }
  })
}
