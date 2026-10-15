// "How BKT and DKT work": an interactive, side-by-side explainer. Every number
// on this page is computed live, in the browser, from the exported per-skill
// BKT parameters and DKT weights. Nothing is pre-rendered.
import { h, clear, prefersReducedMotion } from '../ui/dom'
import { provenance } from '../ui/provenance'
import { loadBktParams, loadJson, loadSamples } from '../data'
import { bktStep, pCorrect, type BktParams, type BktStep } from '../models/bkt'
import { initialDktState, loadDktModel, predictAll, stepDkt, type DktModel, type DktState, type DktWeightsFile } from '../models/dkt'
import { auc } from '../models/metrics'
import type { TabContext } from '../main'

interface Answer { skill: string; correct: boolean }

interface Trace {
  seq: Answer[]
  // index t = state BEFORE answer t (t = 0..n)
  bktBelief: Float64Array[]          // P(L) per skill
  bktSteps: BktStep[]                // update for answer t
  dktState: DktState[]
  dktPred: Float64Array[]            // P(correct) per skill
}

const TRANSFER_SHOW = 8
const MAX_BUILD = 60

export async function renderExplainer(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) return
  const [paramsFile, samples, weights] = await Promise.all([
    loadBktParams(d.id), loadSamples(d.id), loadJson<DktWeightsFile>(`${d.id}/dkt_weights.json`),
  ])
  const model = loadDktModel(weights)
  const params = new Map(paramsFile.skills.map(s => [s.skill_id, s]))
  const label = (s: string) => params.get(s)?.label ?? s
  const concept = (s: string) => params.get(s)?.hidden_concept

  root.append(
    h('h1', 'How BKT and DKT work'),
    provenance(d),
    h('p.lede', 'The same answers flow into both models. BKT updates one independent belief per skill with Bayes’ rule. DKT pushes every answer through an LSTM whose hidden state then predicts all skills at once. Everything below is computed live in your browser from the fitted parameters and trained weights for this dataset.'),
  )

  // ── source: sample student or custom sequence ────────────────────────────
  let seq: Answer[] = []
  let t = 0
  let timer: number | undefined
  let trace: Trace

  const sourceSel = h('select', { 'aria-label': 'Sequence source' },
    samples.students.map((s, i) => h('option', { value: String(i) }, `Held-out student ${s.student_id} · ${Math.min(s.length, samples.max_steps)} answers`)),
    h('option', { value: 'custom' }, 'Build my own sequence…')) as HTMLSelectElement
  const builder = h('div.card', { style: { display: 'none', marginTop: '10px' } })
  const skillSel = h('select', { 'aria-label': 'Skill to answer' },
    [...paramsFile.skills].sort((a, b) => b.n_train_sequences - a.n_train_sequences)
      .map(s => h('option', { value: s.skill_id }, `${s.label}${s.hidden_concept !== undefined ? ` (concept ${s.hidden_concept})` : ''}`))) as HTMLSelectElement
  const addAnswer = (correct: boolean) => {
    if (seq.length >= MAX_BUILD) return
    seq = [...seq, { skill: skillSel.value, correct }]
    load(seq.length)
  }
  builder.append(
    h('h3', 'Build a sequence', h('span.small.muted', `up to ${MAX_BUILD} answers`)),
    h('div.row', skillSel,
      h('button.btn', { type: 'button', onclick: () => addAnswer(true) }, '✓ Right'),
      h('button.btn', { type: 'button', onclick: () => addAnswer(false) }, '✗ Wrong'),
      h('button.btn', { type: 'button', onclick: () => { seq = seq.slice(0, -1); load(seq.length) } }, 'Undo'),
      h('button.btn', { type: 'button', onclick: () => { seq = []; load(0) } }, 'Clear')),
    h('p.small.muted', { style: { marginBottom: 0 } }, 'Tip: answer one skill several times, then look at the DKT panel for skills that moved without being practised.'))

  root.append(h('div.row', h('label.row', h('span.muted.small', 'Answers from'), sourceSel)), builder)

  // ── controls ─────────────────────────────────────────────────────────────
  const playBtn = h('button.btn.primary', { type: 'button', 'aria-label': 'Play' }, '▶ Play') as HTMLButtonElement
  const backBtn = h('button.btn', { type: 'button', 'aria-label': 'Step back' }, '◀ Step') as HTMLButtonElement
  const fwdBtn = h('button.btn', { type: 'button', 'aria-label': 'Step forward' }, 'Step ▶') as HTMLButtonElement
  const resetBtn = h('button.btn', { type: 'button', 'aria-label': 'Back to start' }, '⟲') as HTMLButtonElement
  const scrub = h('input', { type: 'range', min: '0', max: '0', value: '0', 'aria-label': 'Scrub through answers' }) as HTMLInputElement
  const speed = h('select', { 'aria-label': 'Playback speed' }, h('option', { value: '1400' }, 'Slow'), h('option', { value: '800', selected: true }, 'Normal'), h('option', { value: '350' }, 'Fast')) as HTMLSelectElement
  const pos = h('span.mono.small')
  const chips = h('div.seq', { role: 'list', 'aria-label': 'Answer sequence' })
  root.append(h('div.controls', resetBtn, backBtn, playBtn, fwdBtn, scrub, speed, pos), chips)

  // ── panels ───────────────────────────────────────────────────────────────
  const bktMath = h('div.math', { 'aria-live': 'polite' })
  const bktMeters = h('div.meters')
  const dktStrip = h('div.hstrip', { role: 'img', 'aria-label': 'LSTM hidden state' })
  const dktAll = h('div', { role: 'img', 'aria-label': 'DKT prediction for every skill' })
  const dktMeters = h('div.meters')
  const dktTransfer = h('div.meters')
  const dktNote = h('p.small.muted')
  root.append(h('div.grid.cols-2',
    h('section.card.side.bkt', { 'aria-label': 'BKT' },
      h('h3', h('span', 'BKT · one independent meter per skill'), h('span.key.bkt', 'P(mastered)')),
      h('p.small.muted', 'Only the answered skill’s meter moves. Parameters per skill were fitted with EM on the training students.'),
      bktMath, h('div', { style: { height: '10px' } }), bktMeters),
    h('section.card.side.dkt', { 'aria-label': 'DKT' },
      h('h3', h('span', `DKT · LSTM, ${model.H} hidden units`), h('span.key.dkt', 'P(correct next)')),
      h('p.small.muted', 'Hidden state after this answer (each cell = one unit, rust positive, grey negative):'),
      dktStrip,
      h('p.small.muted', { style: { margin: '8px 0 2px' } }, `Prediction for all ${model.skills.length} skills (bar height), answered skill marked:`),
      dktAll,
      h('h3', { style: { marginTop: '12px' } }, h('span.small', 'Recently answered skills (and the next one)')), dktMeters,
      h('h3', { style: { marginTop: '12px' } }, h('span.small', 'Biggest moves on skills not yet practised (transfer)')), dktTransfer, dktNote),
  ))

  const predCard = h('div.card', { style: { marginTop: '16px' } })
  root.append(predCard)

  root.append(h('h2', 'What’s different'), h('div.card', h('ul.diff-list',
    h('li', h('div.b', h('strong', 'BKT: per skill, independent. '), 'Each skill is its own two-state hidden Markov model. An answer on fractions cannot change the belief about decimals.'),
      h('div.d', h('strong', 'DKT: whole history, cross-skill. '), 'One recurrent network reads every answer in order; any answer can shift the prediction for any skill, which is how it captures transfer between related skills.')),
    h('li', h('div.b', h('strong', 'Interpretable parameters. '), 'Four numbers per skill — prior, learn, slip, guess — that a teacher can read.'),
      h('div.d', h('strong', 'Learned weights. '), `About ${(4 * model.H * (2 * model.skills.length + model.H + 2) + model.skills.length * (model.H + 1)).toLocaleString('en-US')} weights for this dataset. Accurate, but no single number means “mastery”.`)),
    h('li', h('div.b', h('strong', 'Mastery is a probability. '), 'P(mastered) is explicit; P(correct) follows from slip and guess.'),
      h('div.d', h('strong', 'Only P(correct). '), 'DKT predicts the next answer; “mastery” has to be read off as a high predicted P(correct).')),
    h('li', h('div.both', h('strong', 'Neither model forgets. '), 'Classic BKT has no forgetting (mastery is absorbing), and neither model sees how much time passed between answers. A learner who comes back after three months gets the same prediction as one who answered yesterday. The DKT tuning experiments on the Model comparison tab test what adding time does.')))))

  // ── behaviour ────────────────────────────────────────────────────────────
  function bktParamsOf(skill: string): BktParams {
    const p = params.get(skill)
    return p ?? { p_init: 0.3, p_transit: 0.1, p_slip: 0.1, p_guess: 0.25 }
  }

  function buildTrace(answers: Answer[]): Trace {
    const S = model.skills.length
    const belief = new Float64Array(S)
    model.skills.forEach((s, i) => { belief[i] = bktParamsOf(s).p_init })
    let st = initialDktState(model)
    const tr: Trace = { seq: answers, bktBelief: [belief.slice()], bktSteps: [], dktState: [st], dktPred: [predictAll(model, st)] }
    for (const a of answers) {
      const i = model.skillIndex.get(a.skill)!
      const step = bktStep(belief[i], a.correct, bktParamsOf(a.skill))
      belief[i] = step.next
      tr.bktSteps.push(step)
      tr.bktBelief.push(belief.slice())
      st = stepDkt(model, st, a)
      tr.dktState.push(st)
      tr.dktPred.push(predictAll(model, st))
    }
    return tr
  }

  function load(at = 0): void {
    stop()
    trace = buildTrace(seq)
    scrub.max = String(seq.length)
    t = Math.min(at, seq.length)
    clear(chips)
    seq.forEach((a, i) => chips.append(h(`button.step.c${a.correct ? 1 : 0}`, {
      type: 'button', role: 'listitem', title: `${i + 1}. ${label(a.skill)}: ${a.correct ? 'right' : 'wrong'}`,
      'aria-label': `Answer ${i + 1}, ${label(a.skill)}, ${a.correct ? 'right' : 'wrong'}`, onclick: () => go(i + 1),
    }, a.correct ? '✓' : '✗')))
    draw()
  }

  function go(next: number): void {
    t = Math.max(0, Math.min(seq.length, next))
    draw()
  }

  function stop(): void {
    if (timer !== undefined) window.clearInterval(timer)
    timer = undefined
    playBtn.textContent = '▶ Play'
    playBtn.setAttribute('aria-label', 'Play')
  }

  function play(): void {
    if (timer !== undefined) { stop(); return }
    if (t >= seq.length) t = 0
    playBtn.textContent = '❚❚ Pause'
    playBtn.setAttribute('aria-label', 'Pause')
    const tick = () => { if (t >= seq.length) { stop(); return } go(t + 1) }
    tick()
    timer = window.setInterval(tick, Number(speed.value))
  }

  // Skills shown as meters: the most recently answered ones up to the cursor,
  // plus the next skill to be answered (long sequences would otherwise list dozens).
  const SHOWN = 12
  const seqSkills = () => {
    const recent: string[] = []
    for (let i = Math.min(t, seq.length) - 1; i >= 0 && recent.length < SHOWN; i--) if (!recent.includes(seq[i].skill)) recent.push(seq[i].skill)
    const next = seq[t]?.skill
    if (next && !recent.includes(next)) recent.unshift(next)
    return recent.slice(0, SHOWN)
  }

  function meter(kind: 'bkt' | 'dkt', skill: string, value: number, prev: number, extra = '', cls = ''): HTMLElement {
    const delta = value - prev
    const dTxt = Math.abs(delta) >= 0.0005 ? h(`span.delta.${delta > 0 ? 'up' : 'down'}`, `${delta > 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(1)}`) : h('span.delta', '')
    const c = concept(skill)
    return h(`div.meter.${kind}${cls}`,
      h('div.mlab', h('span', { title: label(skill) }, label(skill), c !== undefined ? h('span.muted', ` · c${c}`) : ''), h('span.mono', `${(value * 100).toFixed(0)}%`, ' ', dTxt)),
      h('div.track', h('div.fill', { style: { width: `${(value * 100).toFixed(1)}%` } })),
      extra ? h('div.small.muted', extra) : null)
  }

  function draw(): void {
    pos.textContent = `${t} / ${seq.length}`
    scrub.value = String(t)
    backBtn.disabled = t === 0
    fwdBtn.disabled = t >= seq.length
    ;[...chips.children].forEach((c, i) => {
      c.classList.toggle('future', i >= t)
      c.classList.toggle('now', i === t - 1)
    })
    const cur = t > 0 ? seq[t - 1] : undefined
    const curIdx = cur ? model.skillIndex.get(cur.skill)! : -1
    const prevT = Math.max(0, t - 1)

    // BKT
    clear(bktMath)
    if (!cur) {
      bktMath.append(h('div', h('span.lbl', 'Start: '), 'every skill begins at its fitted prior p_init. Press ▶ or Step to feed in the first answer.'))
    } else {
      const s = trace.bktSteps[t - 1]
      const p = bktParamsOf(cur.skill)
      const right = cur.correct
      bktMath.append(
        h('div', h('span.lbl', `Answer ${t}: `), h('strong', label(cur.skill)), right ? ' ✓ right' : ' ✗ wrong'),
        h('div', h('span.lbl', 'params  '), `prior ${f(p.p_init)} · learn ${f(p.p_transit)} · slip ${f(p.p_slip)} · guess ${f(p.p_guess)}`),
        h('div', h('span.lbl', '1 prior   '), `P(L) = ${f(s.prior)}   → predicted P(correct) = ${f(s.prior)}·(1−${f(p.p_slip)}) + ${f(1 - s.prior)}·${f(p.p_guess)} = ${f(s.pCorrect)}`),
        h('div', h('span.lbl', '2 likelihood '), right
          ? `P(right | mastered) = 1−slip = ${f(s.likelihoodMastered)},  P(right | not) = guess = ${f(s.likelihoodUnmastered)}`
          : `P(wrong | mastered) = slip = ${f(s.likelihoodMastered)},  P(wrong | not) = 1−guess = ${f(s.likelihoodUnmastered)}`),
        h('div', h('span.lbl', '3 posterior '), `P(L | answer) = ${f(s.prior)}·${f(s.likelihoodMastered)} / ${f(s.evidence)} = ${f(s.posterior)}`),
        h('div', h('span.lbl', '4 learn   '), `P(L next) = ${f(s.posterior)} + ${f(1 - s.posterior)}·${f(p.p_transit)} = `, h('strong', f(s.next))),
      )
    }
    clear(bktMeters)
    for (const sk of seqSkills()) {
      const i = model.skillIndex.get(sk)!
      bktMeters.append(meter('bkt', sk, trace.bktBelief[t][i], trace.bktBelief[prevT][i],
        `P(correct) ${(pCorrect(trace.bktBelief[t][i], bktParamsOf(sk)) * 100).toFixed(0)}%`, i === curIdx ? '.active' : ''))
    }
    if (!seq.length) bktMeters.append(h('p.small.muted', 'No answers yet.'))
    else bktMeters.append(h('p.small.muted', { style: { gridColumn: '1 / -1', margin: '4px 0 0' } }, `Showing the next skill and up to ${SHOWN} most recently answered skills.`))

    // DKT hidden state strip
    const hState = trace.dktState[t].h
    clear(dktStrip)
    dktStrip.style.gridTemplateColumns = `repeat(${Math.min(50, hState.length)}, 1fr)`
    for (const v of hState) {
      const a = Math.min(1, Math.abs(v))
      dktStrip.append(h('i', { style: { backgroundColor: `color-mix(in srgb, ${v >= 0 ? 'var(--dkt)' : 'var(--ink-2)'} ${Math.round(a * 100)}%, var(--surface-2))` }, title: v.toFixed(3) }))
    }
    // all-skill bars
    clear(dktAll)
    const pred = trace.dktPred[t], prevPred = trace.dktPred[prevT]
    dktAll.append(allSkillBars(pred, prevPred, curIdx, model))

    // practised skills
    clear(dktMeters)
    const practised = new Set(seq.slice(0, t).map(a => a.skill))
    for (const sk of seqSkills()) {
      const i = model.skillIndex.get(sk)!
      dktMeters.append(meter('dkt', sk, pred[i], prevPred[i], '', i === curIdx ? '.active' : ''))
    }
    if (!seq.length) dktMeters.append(h('p.small.muted', 'No answers yet.'))
    // transfer: largest |change| at this step among skills never practised so far
    clear(dktTransfer)
    if (cur) {
      const movers = model.skills.map((sk, i) => ({ sk, i, d: pred[i] - prevPred[i] }))
        .filter(m => !practised.has(m.sk)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, TRANSFER_SHOW)
      for (const m of movers) dktTransfer.append(meter('dkt', m.sk, pred[m.i], prevPred[m.i], '', '.transfer'))
      const total = model.skills.filter((sk, i) => !practised.has(sk) && Math.abs(pred[i] - prevPred[i]) >= 0.01).length
      const cc = concept(cur.skill)
      const sameConcept = cc !== undefined ? movers.filter(m => concept(m.sk) === cc).length : null
      dktNote.textContent = `This answer moved ${total} never-practised skill${total === 1 ? '' : 's'} by at least 1 point. BKT moved none: it cannot.` +
        (sameConcept !== null ? ` ${sameConcept} of the ${movers.length} biggest movers share the answered exercise’s hidden concept (c${cc}), which neither model was told.` : '')
    } else {
      dktNote.textContent = 'Before any answer DKT predicts from an all-zero state: its learned base rate per skill.'
    }

    drawPredictions()
  }

  function drawPredictions(): void {
    clear(predCard)
    const n = seq.length
    const rows = seq.map((a, i) => {
      const k = model.skillIndex.get(a.skill)!
      return { a, i, bkt: pCorrect(trace.bktBelief[i][k], bktParamsOf(a.skill)), dkt: trace.dktPred[i][k] }
    })
    const next = t < n ? rows[t] : undefined
    const scored = rows.slice(1, t) // same protocol as the evaluation: skip each student's first answer
    const aB = auc(scored.map(r => ({ p: r.bkt, y: r.a.correct })))
    const aD = auc(scored.map(r => ({ p: r.dkt, y: r.a.correct })))
    predCard.append(
      h('h3', 'Next-answer prediction vs what actually happened', h('span.legend', h('span.key.bkt', 'BKT'), h('span.key.dkt', 'DKT'), h('span.key.actual', 'actual'))),
      next ? h('p', `Answer ${t + 1} will be on `, h('strong', label(next.a.skill)), `. BKT predicts `, h('strong.mono', { style: { color: 'var(--bkt)' } }, pctS(next.bkt)),
        `, DKT predicts `, h('strong.mono', { style: { color: 'var(--dkt)' } }, pctS(next.dkt)), ` chance of a right answer. Actual: `, h('strong', next.a.correct ? 'right' : 'wrong'), '.')
        : h('p.muted', n ? 'End of sequence.' : 'Add answers to see predictions.'),
      timeline(rows, t),
      h('p.small', `Running AUC over answers 2–${Math.max(t, 1)} (${scored.length} scored): `,
        h('strong.mono', { style: { color: 'var(--bkt)' } }, `BKT ${aB === null ? '—' : aB.toFixed(3)}`), ' · ',
        h('strong.mono', { style: { color: 'var(--dkt)' } }, `DKT ${aD === null ? '—' : aD.toFixed(3)}`),
        h('span.muted', ' — one student is far too few for a stable AUC; the dataset-level numbers are on the Model comparison tab. “—” until both right and wrong answers have been seen.')),
    )
  }

  sourceSel.addEventListener('change', () => {
    if (sourceSel.value === 'custom') {
      builder.style.display = ''
      seq = []
    } else {
      builder.style.display = 'none'
      const s = samples.students[Number(sourceSel.value)]
      seq = s.steps.map(([skill, c]) => ({ skill, correct: c === 1 }))
    }
    load(0)
  })
  playBtn.addEventListener('click', play)
  fwdBtn.addEventListener('click', () => { stop(); go(t + 1) })
  backBtn.addEventListener('click', () => { stop(); go(t - 1) })
  resetBtn.addEventListener('click', () => { stop(); go(0) })
  scrub.addEventListener('input', () => { stop(); go(Number(scrub.value)) })
  speed.addEventListener('change', () => { if (timer !== undefined) { stop(); play() } })
  root.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'ArrowRight') { stop(); go(t + 1) }
    if (e.key === 'ArrowLeft') { stop(); go(t - 1) }
  })
  // Stop playback when navigating away.
  window.addEventListener('hashchange', stop, { once: true })

  const first = samples.students[0]
  seq = first ? first.steps.map(([skill, c]) => ({ skill, correct: c === 1 })) : []
  load(0)
  if (prefersReducedMotion()) speed.value = '1400'
}

const f = (x: number) => x.toFixed(3)
const pctS = (x: number) => `${(x * 100).toFixed(1)}%`

function allSkillBars(pred: Float64Array, prev: Float64Array, cur: number, model: DktModel): SVGSVGElement {
  const S = pred.length, W = 600, H = 56
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', String(H))
  svg.setAttribute('preserveAspectRatio', 'none')
  const bw = W / S
  for (let i = 0; i < S; i++) {
    const r = document.createElementNS(svg.namespaceURI, 'rect')
    const v = pred[i]
    r.setAttribute('x', String(i * bw + bw * 0.1))
    r.setAttribute('width', String(Math.max(bw * 0.8, 0.6)))
    r.setAttribute('y', String(H - v * H))
    r.setAttribute('height', String(v * H))
    const moved = Math.abs(v - prev[i]) >= 0.01
    r.setAttribute('fill', i === cur ? 'var(--ink)' : 'var(--dkt)')
    r.setAttribute('fill-opacity', i === cur || moved ? '1' : '0.35')
    const title = document.createElementNS(svg.namespaceURI, 'title')
    title.textContent = `${model.skills[i]}: ${(v * 100).toFixed(1)}%`
    r.append(title)
    svg.append(r)
  }
  return svg
}

function timeline(rows: { a: Answer; bkt: number; dkt: number }[], t: number): SVGSVGElement {
  const W = 720, H = 150, pad = 26
  const n = Math.max(rows.length, 1)
  const x = (i: number) => pad + (i + 0.5) * ((W - pad - 6) / n)
  const y = (v: number) => 8 + (1 - v) * (H - 30)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('width', '100%')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Predicted P(correct) per answer for BKT and DKT, with actual outcomes')
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(svg.namespaceURI, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
    svg.append(e)
    return e
  }
  for (const v of [0, 0.5, 1]) {
    el('line', { x1: pad, x2: W - 6, y1: y(v), y2: y(v), stroke: 'var(--line)' })
    el('text', { x: 2, y: y(v) + 4, 'font-size': 10, fill: 'var(--ink-3)' }).textContent = v.toFixed(1)
  }
  const shown = rows.slice(0, Math.min(rows.length, t + 1))
  for (const [key, color] of [['bkt', 'var(--bkt)'], ['dkt', 'var(--dkt)']] as const) {
    if (shown.length > 1) el('polyline', { points: shown.map((r, i) => `${x(i)},${y(r[key])}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2 })
    shown.forEach((r, i) => el('circle', { cx: x(i), cy: y(r[key]), r: 2.6, fill: color }))
  }
  rows.slice(0, t).forEach((r, i) => el('rect', { x: x(i) - 3, y: r.a.correct ? 1 : H - 20, width: 6, height: 6, fill: 'var(--actual)', rx: 1 }))
  if (t < rows.length) el('line', { x1: x(t), x2: x(t), y1: 4, y2: H - 14, stroke: 'var(--ink)', 'stroke-dasharray': '3 3' })
  el('text', { x: pad, y: H - 2, 'font-size': 10, fill: 'var(--ink-3)' }).textContent = '■ top = actual right, bottom = actual wrong · dashed line = next answer'
  return svg
}

