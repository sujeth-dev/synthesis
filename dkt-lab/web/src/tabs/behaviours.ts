import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { pct } from '../ui/format'
import { loadJson } from '../data'
import { canvas } from './models'

// One page on the behaviour signals: how each is registered, what it changes in
// the evaluation, and where it can be seen in the app. The numbers and curves
// come from app/behaviour-effects.json (scripts/behaviour-effects.ts, which calls
// the app's own functions) and app/latency-signal-impact.json, both copied
// unchanged. The diagrams are schematics drawn here and labelled as such.

type Tier = 'again' | 'hard' | 'good' | 'easy'
interface Row {
  correct: boolean; real_latency_ms: number; told_latency_ms: number; hesitation_ms: number; revision_count: number
  behavior_modifier: number; motivation_state: string; slow_response_streak: number; consecutive_errors: number
  p_know: number; live_quality: number; adaptive_quality: number
}
interface EffectsFile {
  note: string
  thresholds: { slow_response_ms: number; long_hesitation_ms: number; repeated_revisions: number; easy_under_ms: number; good_under_ms: number; crushed_latency_ms: number }
  latency_to_grade: { latency_ms: number; sm2_quality: number; fsrs_rating: string }[]
  adaptive_matrix: { latency_ms: number; column: string; hesitation_ms: number; revision_count: number; live_tier: Tier; adaptive_tier: Tier }[]
  guided_reflection: { latency_ms: number; hesitation_ms: number; tier: Tier }[]
  priors: number[]
  movement: { key: string; label: string; after_correct: number[]; after_wrong: number[] }[]
  session: { measured: Row[]; speed_lost: Row[] }
}
interface LatencyFile { evidence: Record<'sm2_measured' | 'sm2_crushed', { attempts: number; quality: Record<string, number> }>; config: { learners: number; days: number; seed: number } }

const NS = 'http://www.w3.org/2000/svg'
function svg(tag: string, attrs: Record<string, string | number> = {}, ...kids: (Element | string)[]): SVGElement {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  for (const k of kids) el.append(k)
  return el as SVGElement
}
const secs = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s`
const code = (t: string) => h('code', t)
const li = (items: (string | HTMLElement)[]) => h('ul', items.map(i => h('li', i)))

// ── 1. one answer on a timeline ─────────────────────────────────────────────
function timeline(): HTMLElement {
  const x = (t: number) => 50 + t * 50       // 0..16 s across 800 px
  const text = (tx: number, ty: number, s: string, anchor = 'middle', weight = 400, fill = 'var(--ink-2)') =>
    svg('text', { x: tx, y: ty, 'text-anchor': anchor, 'font-size': 12.5, 'font-weight': weight, fill, style: 'font-family:var(--sans)' }, s)
  const marker = (t: number, color: string, label: string, sub: string, above = true) => svg('g', {},
    svg('line', { x1: x(t), x2: x(t), y1: 104, y2: 136, stroke: color, 'stroke-width': 2 }),
    svg('circle', { cx: x(t), cy: 120, r: 6, fill: color }),
    text(x(t), above ? 90 : 158, label, 'middle', 600, 'var(--ink)'),
    text(x(t), above ? 74 : 174, sub))
  const bracket = (t0: number, t1: number, y: number, color: string, label: string) => svg('g', {},
    svg('path', { d: `M${x(t0)} ${y - 6} V${y} H${x(t1)} V${y - 6}`, fill: 'none', stroke: color, 'stroke-width': 2 }),
    text((x(t0) + x(t1)) / 2, y + 17, label, 'middle', 600, color))
  return h('div', { style: { overflowX: 'auto' } }, svg('svg', { viewBox: '0 55 900 205', width: '100%', role: 'img', 'aria-label': 'Timeline of one answer: question shown, first touch, two settled changes, submit; hesitation and latency are marked.', style: 'min-width:640px;max-width:900px' },
    svg('line', { x1: x(0), x2: x(16), y1: 120, y2: 120, stroke: 'var(--line)', 'stroke-width': 3 }),
    marker(0, 'var(--ink)', 'Question shown', 'timer starts'),
    marker(4, 'var(--bkt)', 'First touch', 'first click or keystroke'),
    marker(8, 'var(--warn)', 'Change of mind', 'settled → revision 1', false),
    marker(11, 'var(--warn)', 'Change of mind', 'settled → revision 2', false),
    marker(14, 'var(--good)', 'Submit', 'timer stops'),
    bracket(0, 4, 205, 'var(--bkt)', 'hesitation = 4 s'),
    bracket(0, 14, 232, 'var(--good)', 'latency = 14 s'),
  ))
}

// ── 2. the grade bands ──────────────────────────────────────────────────────
function gradeChart(e: EffectsFile, c: HTMLCanvasElement) {
  chart(c, () => {
    const p = palette()
    return {
      type: 'line',
      data: { datasets: [{ label: 'Right answer', data: e.latency_to_grade.map(g => ({ x: g.latency_ms / 1000, y: g.sm2_quality })), stepped: 'before', borderColor: p.ink, backgroundColor: p.ink, borderWidth: 3, pointRadius: 0 }] },
      options: {
        scales: {
          x: { type: 'linear', min: 0, max: 20, title: { display: true, text: 'seconds to answer' } },
          y: { min: 2, max: 6, ticks: { stepSize: 1, callback: (v: number) => ({ 3: '3 · Hard', 4: '4 · Good', 5: '5 · Easy' } as Record<number, string>)[v] ?? '' }, title: { display: true, text: 'SM-2 quality · FSRS rating' } },
        },
        plugins: { tooltip: { callbacks: { label: (ctx: { parsed: { x: number; y: number } }) => `${ctx.parsed.x} s → quality ${ctx.parsed.y}` } } },
      },
    }
  })
}

// ── 3. how much one answer moves what the engine believes ───────────────────
function movementChart(e: EffectsFile, c: HTMLCanvasElement, key: 'after_correct' | 'after_wrong') {
  chart(c, () => {
    const p = palette()
    const colors = [p.ink, p.good, p.warn, p.synthetic, p.bad]
    return {
      type: 'line',
      data: { datasets: e.movement.map((m, i) => ({ label: m.label, data: e.priors.map((x, j) => ({ x, y: m[key][j] })), borderColor: colors[i], backgroundColor: colors[i], borderWidth: i === 0 ? 3 : 2, borderDash: i === 0 ? [] : [i * 2, 3], pointRadius: 0, tension: 0.2 })) },
      options: {
        scales: {
          x: { type: 'linear', min: 0.05, max: 0.95, ticks: { callback: (v: number) => `${Math.round(v * 100)}%` }, title: { display: true, text: 'what the engine believed before (p_know)' } },
          y: { ticks: { callback: (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)} pts` }, title: { display: true, text: 'change in p_know from this one answer' } },
        },
        plugins: { tooltip: { callbacks: { label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(1)} pts` } } },
      },
    }
  })
}

// ── 4. one session, real timing vs the old signal ───────────────────────────
function sessionChart(e: EffectsFile, c: HTMLCanvasElement) {
  chart(c, () => {
    const p = palette()
    const line = (label: string, rows: Row[], color: string, dash: number[]) => ({ label, data: rows.map((r, i) => ({ x: i + 1, y: r.p_know })), borderColor: color, backgroundColor: color, borderDash: dash, borderWidth: 2.5, pointRadius: 3, tension: 0.15 })
    return {
      type: 'line',
      data: { datasets: [line('Timing measured', e.session.measured, p.good, []), line('Timing lost (old bug)', e.session.speed_lost, p.bad, [6, 4])] },
      options: {
        scales: { x: { type: 'linear', min: 1, max: 12, ticks: { stepSize: 1 }, title: { display: true, text: 'answer number in the session' } },
          y: { min: 0, max: 1, ticks: { callback: (v: number) => `${Math.round(v * 100)}%` }, title: { display: true, text: 'p_know: what the engine believes' } } },
        plugins: { tooltip: { callbacks: { label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(0)}%` } } },
      },
    }
  })
}

const STATE_CHIP: Record<string, string> = { neutral: 'same', winning: 'up', bored: 'same', frustrated: 'down' }

function sessionStrip(e: EffectsFile): HTMLElement {
  const m = e.session.measured, s = e.session.speed_lost
  const cell = (r: Row, other: Row, i: number) => h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 7px', fontSize: '12px', minWidth: '78px', background: 'var(--surface)' } },
    h('div.muted', { style: { fontFamily: 'var(--mono)', fontSize: '11px' } }, `#${i + 1} ${r.correct ? '✔' : '✘'} ${secs(r.real_latency_ms)}`),
    h(`span.chip.${STATE_CHIP[r.motivation_state] ?? 'same'}`, r.motivation_state),
    h('div', { style: { fontFamily: 'var(--mono)', marginTop: '3px' } }, `×${r.behavior_modifier.toFixed(2)}`),
    h('div.muted', { style: { fontSize: '11px' } }, other.behavior_modifier !== r.behavior_modifier || other.motivation_state !== r.motivation_state ? `old bug: ×${other.behavior_modifier.toFixed(2)} ${other.motivation_state}` : 'same as old bug'))
  return h('div', { style: { display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' } }, m.map((r, i) => cell(r, s[i], i)))
}

// ── 5. the shadow tier matrix ───────────────────────────────────────────────
function tierCell(live: Tier, adaptive: Tier): HTMLElement {
  const changed = live !== adaptive
  return h('td', changed ? { style: { background: 'var(--dkt-soft)' } } : {},
    h('span.mono', live), changed ? h('span', { class: 'arrow' }, ' → ') : null, changed ? h('strong', { style: { color: 'var(--dkt)' } }, adaptive) : null)
}
function matrix(e: EffectsFile): HTMLElement {
  const cols = [...new Set(e.adaptive_matrix.map(m => m.column))]
  const lats = [...new Set(e.adaptive_matrix.map(m => m.latency_ms))]
  return h('div.table-wrap', h('table',
    h('thead', h('tr', h('th', 'Answer took'), ...cols.map(c => h('th', c)))),
    h('tbody', lats.map(l => h('tr', h('td', secs(l)), ...cols.map(c => { const m = e.adaptive_matrix.find(x => x.latency_ms === l && x.column === c)!; return tierCell(m.live_tier, m.adaptive_tier) }))))))
}

// ── 6. where it appears in the app ──────────────────────────────────────────
function learnerWire(): HTMLElement {
  const badge = (n: number, style: Record<string, string>) => h('span', { style: { position: 'absolute', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--dkt)', color: '#fff', font: '600 12px/22px var(--mono)', textAlign: 'center', ...style } }, String(n))
  const box = (style: Record<string, string>, label: string) => h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 12px', background: 'var(--surface-2)', fontSize: '13px', color: 'var(--ink-2)', ...style } }, label)
  return h('div', { style: { position: 'relative', border: '2px solid var(--line)', borderRadius: '10px', padding: '18px 40px 18px 18px', background: 'var(--surface)', maxWidth: '520px' }, role: 'img', 'aria-label': 'Schematic of the Study screen with five numbered points' },
    h('div.muted.small', { style: { marginBottom: '8px', fontFamily: 'var(--mono)' } }, '/learn  ·  schematic, not a screenshot'),
    h('div', { style: { position: 'relative', marginBottom: '8px' } }, box({ borderColor: 'var(--good)' }, 'Banner: “You’re on a streak! Keep it up.”'), badge(5, { right: '-30px', top: '8px' })),
    h('div', { style: { position: 'relative', marginBottom: '8px' } }, box({ minHeight: '46px' }, 'Question text appears  →  timer starts'), badge(1, { right: '-30px', top: '12px' })),
    h('div', { style: { position: 'relative', display: 'grid', gap: '6px', marginBottom: '8px' } }, box({}, '○  Option A'), box({}, '○  Option B'), box({}, '○  Option C'),
      badge(2, { right: '-30px', top: '4px' }), badge(3, { right: '-30px', top: '60px' })),
    h('div', { style: { position: 'relative' } }, h('div', { style: { display: 'inline-block', background: 'var(--ink)', color: 'var(--bg)', borderRadius: '6px', padding: '6px 16px', fontSize: '13px' } }, 'Submit'), badge(4, { right: '-30px', top: '0' })))
}

function engineSchematic(e: EffectsFile): HTMLElement {
  const rows = e.session.measured
  const pick = [1, 2, 3, 5, 6, 7]
  const heads: [string, string][] = [['When', ''], ['Skill', ''], ['Format', ''], ['Correct', ''], ['Latency', 'hl'], ['Hesitation', 'hl'], ['Revisions', 'hl'], ['Motivation', 'hl'], ['Behaviour mod', 'hl'], ['p_know', '']]
  const prior = (i: number) => (i === 0 ? 0.1 : rows[i - 1].p_know)
  return h('div.table-wrap', h('table',
    h('thead', h('tr', heads.map(([t, c]) => h('th', c ? { style: { background: 'var(--dkt-soft)', color: 'var(--dkt)' } } : {}, t)))),
    h('tbody', pick.map(i => { const r = rows[i]; return h('tr',
      h('td.muted', `answer #${i + 1}`), h('td.muted', 'skill_id'), h('td.muted', 'mcq'), h('td', r.correct ? 'yes' : 'no'),
      h('td', secs(r.real_latency_ms)), h('td', secs(r.hesitation_ms)), h('td', String(r.revision_count)), h('td', r.motivation_state),
      h('td', r.behavior_modifier.toFixed(2)), h('td', `${pct(prior(i), 0)} → ${pct(r.p_know, 0)}`)) }))))
}

export async function renderBehaviours(root: HTMLElement): Promise<void> {
  const [e, lat] = await Promise.all([loadJson<EffectsFile>('app/behaviour-effects.json'), loadJson<LatencyFile>('app/latency-signal-impact.json')])
  const t = e.thresholds
  const strong = (s: string) => h('strong', s)

  root.append(
    h('h1', 'Behaviours: what is measured, how, and what it changes'),
    h('div.prov', h('span.badge.synthetic', 'illustration'), h('strong', 'computed by the app’s own functions'),
      h('span.muted', 'Source: Research/sim/results/behaviour-effects.json and latency-signal-impact.json (copied unchanged)'), h('span.muted', e.note)),
    h('p.lede', 'While a learner answers, the app records how long they took, how long they paused before touching the answer, and how often they changed their mind. From those it derives how many slow answers and mistakes they have strung together. This page follows each signal from the browser to the engine, shows what it does to the evaluation, and says where to look for it in the running app.'),
    h('div.grid.cols-3', { style: { marginBottom: '8px' } },
      h('div.card', h('h3', 'Measured in the browser'), li([strong('Latency'), strong('Hesitation'), strong('Revisions')]), h('p.small.muted', { style: { marginBottom: 0 } }, 'Only the browser can see them.')),
      h('div.card', h('h3', 'Derived on the server'), li([strong('Slow-answer streak'), strong('Consecutive errors'), strong('Behaviour modifier'), strong('Motivation state')]), h('p.small.muted', { style: { marginBottom: 0 } }, 'Built from the three above and correctness.')),
      h('div.card', h('h3', 'What they feed'), li([strong('BKT'), ' how much one answer counts', strong('SM-2 / FSRS'), ' the grade and so the next date', strong('Session'), ' easier or harder next question']))),
  )

  // 1
  root.append(
    h('h2', { style: { marginTop: '28px' } }, '1. How one answer is registered'),
    h('div.card', timeline(),
      h('p.small.muted', { style: { marginBottom: 0 } }, `Schematic with example times. A change of mind counts once it has settled for ${(1500 / 1000).toFixed(1)} s, so typing a sentence is one burst, not many retries. Re-picking a different option always counts. The server never lets hesitation exceed latency.`)),
    h('div.pipeline', { style: { marginTop: '14px' } },
      h('div.node', h('b', '1 · Browser'), 'three timestamps and a change counter', h('div.small.muted', 'src/lib/timing/answer-timing.ts')), h('span.gap', '→'),
      h('div.node', h('b', '2 · POST /api/attempt'), 'checks and clamps; derives streaks and the modifier', h('div.small.muted', 'src/app/api/attempt/route.ts')), h('span.gap', '→'),
      h('div.node', h('b', '3 · attempt_events'), 'one row per answer, every signal stored', h('div.small.muted', 'latency_ms, hesitation_ms, revision_count, …')), h('span.gap', '→'),
      h('div.node', h('b', '4 · Engine'), 'BKT, SM-2/FSRS, session picker', h('div.small.muted', 'bktUpdate, updateSM2, session/engine.ts')), h('span.gap', '→'),
      h('div.node.now', h('b', '5 · You can see it'), '/engine and the Study screen')),
  )

  // 2 signal cards
  const sig = (n: string, title: string, registered: (string | HTMLElement)[], effect: (string | HTMLElement)[], where: (string | HTMLElement)[]) =>
    h('details.feature', { open: n === '1' },
      h('summary', h('span.fnum', `SIGNAL ${n}`), h('span.ftitle', title)),
      h('div.fbody', h('dl',
        h('dt', 'How it is registered'), h('dd', li(registered)),
        h('dt', 'What it changes'), h('dd', li(effect)),
        h('dt', 'Where to see it'), h('dd', li(where)))))
  root.append(
    h('h2', { style: { marginTop: '28px' } }, '2. Each signal: registered, effect, where to see it'),
    sig('1', 'Latency: time to answer',
      ['The browser stamps when the question appears and again at Submit; latency is the difference.', h('span', 'Stored as ', code('attempt_events.latency_ms'), '.')],
      [`Picks the review grade: under ${secs(t.easy_under_ms)} is Easy (SM-2 quality 5), under ${secs(t.good_under_ms)} is Good (4), slower is Hard (3); a wrong answer is Again (1). That grade sets how long until the skill returns.`, `An answer over ${secs(t.slow_response_ms)} counts as slow for the streak below.`],
      ['/engine → “Per-attempt signals” → column Latency.', '/engine → “Scheduling” → the Live quality column.']),
    sig('2', 'Hesitation: time to first touch',
      ['The browser stamps the first click or keystroke; hesitation is that time minus the moment the question appeared.', h('span', 'Stored as ', code('attempt_events.hesitation_ms'), '; the server cuts it to the latency.')],
      ['Recorded with each attempt and the motivation snapshot. It does not enter BKT.', h('span', `In the shadow scheduling grade, hesitation of ${secs(t.long_hesitation_ms)} or more would demote a grade one step. `, strong('In practice that never fires for an ordinary answer'), `: hesitation cannot exceed latency, and any answer over ${secs(t.good_under_ms)} is already the lowest grade. It matters only for guided reflections (the matrix below).`)],
      ['/engine → “Per-attempt signals” → column Hesitation.']),
    sig('3', 'Revisions: changes of mind',
      ['The browser counts a different option picked, or a text edit after a settled pause.', h('span', 'Stored as ', code('attempt_events.revision_count'), ' and in the shadow log.')],
      [`Live: nothing. In the shadow grade, ${t.repeated_revisions} or more revisions demote the grade one step (Easy → Good, Good → Hard). This is the one behaviour signal that can change a grade for an ordinary answer.`],
      ['/engine → “Per-attempt signals” → column Revisions.', '/engine → “Scheduling” → second table: Live quality next to Adaptive quality.']),
    sig('4', 'Slow-answer streak and consecutive errors',
      [`The server counts answers in a row over ${secs(t.slow_response_ms)}, and wrong answers in a row. A faster answer, or a right one, resets each.`, h('span', 'Stored as ', code('slow_response_streak'), ' and ', code('consecutive_errors'), '.')],
      ['Two wrong in a row take 0.20 off the behaviour modifier; a slow answer, or three slow in a row, takes 0.15 off. The modifier never goes below 0.5.', 'Three errors in a row, or four slow answers in a row, mark the learner frustrated.'],
      ['/engine → “Per-attempt signals” → columns Motivation and Behaviour mod.']),
    sig('5', 'Behaviour modifier and motivation state (derived)',
      ['Derived on the server from the streaks, then stored.', h('span', code('behavior_modifier'), ' and ', code('motivation_state'), ' on each attempt.')],
      ['BKT: the answer’s weight is 0.6 × reasoning quality + 0.4 × behaviour modifier, so a modifier of 0.65 turns full-weight evidence (1.00) into 0.86: the answer moves what the engine believes less, up or down.', 'Session: a frustrated learner is handed an easy review they already know; a bored one gets a harder question.', 'Screen: a banner appears for streak, frustrated or bored.'],
      ['Study screen (/learn) → the banner above the question.', '/engine → “Per-attempt signals” → Motivation and Behaviour mod.']),
  )

  // 3 graphs
  const g1 = canvas('How response time maps to a review grade'), g2 = canvas('Change in p_know after a correct answer'), g3 = canvas('Change in p_know after a wrong answer'), g4 = canvas('A scripted session: p_know with measured and lost timing'), g5 = canvas('Share of right answers at each SM-2 grade, measured versus lost timing')
  root.append(
    h('h2', { style: { marginTop: '28px' } }, '3. What the signals do to the evaluation'),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'Latency → review grade'), h('div.chart', g1), h('p.small.muted', { style: { marginBottom: 0 } }, 'Right answers only. The thresholds are fixed numbers set by hand, not fitted to learners.')),
      h('div.card', h('h3', 'The shadow grade: what changes it'), matrix(e),
        h('p.small.muted', 'Each cell is the live grade, then the behaviour-aware grade when it differs (highlighted). Only combinations the app can receive are shown. Logged, not applied, unless ADAPTIVE_QUALITY=1.'),
        h('p.small', { style: { marginBottom: 0 } }, strong('Guided reflections: '), `a ${secs(e.guided_reflection[0].latency_ms)} reflection starts at the middle tier, and ${secs(e.guided_reflection[0].hesitation_ms)} of hesitation keeps it at ${e.guided_reflection[0].tier}; ${secs(e.guided_reflection[1].hesitation_ms)} drops it to ${e.guided_reflection[1].tier}. A wrong answer is ${'again'} whatever else happened.`))),
    h('div.legend', { style: { marginTop: '16px' } }, e.movement.map((m, i) => h('span.key', { style: { color: ['var(--ink)', 'var(--good)', 'var(--warn)', 'var(--synthetic)', 'var(--bad)'][i] } }, m.label))),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'One answer moving the engine’s belief: right answer'), h('div.chart', g2)),
      h('div.card', h('h3', 'One answer moving the engine’s belief: wrong answer'), h('div.chart', g3))),
    h('p.small.muted', 'Lower lines mean a weaker effect. The top line is full evidence; slow answers and thin explanations count for less, in both directions, so a struggling learner’s estimate moves more cautiously. Computed with the app’s bktUpdate from a grid of starting beliefs.'),
  )
  gradeChart(e, g1); movementChart(e, g2, 'after_correct'); movementChart(e, g3, 'after_wrong')

  const m = e.session.measured, s = e.session.speed_lost
  const firstFrustrated = (rows: Row[]) => rows.findIndex(r => r.motivation_state === 'frustrated') + 1
  root.append(
    h('div.card', { style: { marginTop: '16px' } },
      h('h3', 'A scripted session, with the timing measured and with the old bug'),
      h('p.small.muted', `Twelve answers written by hand (so this shows mechanism, not a measurement). Same answers both times; only what the engine is told about their speed differs. With real timing the engine sees the struggle ${firstFrustrated(s) - firstFrustrated(m) === 1 ? 'one answer' : `${firstFrustrated(s) - firstFrustrated(m)} answers`} earlier (frustrated at answer ${firstFrustrated(m)}, against ${firstFrustrated(s)}) and damps the evidence harder.`),
      h('div.legend', h('span.key', { style: { color: 'var(--good)' } }, 'timing measured'), h('span.key', { style: { color: 'var(--bad)' } }, 'timing lost (old bug)')),
      h('div.chart', g4), h('div', { style: { marginTop: '12px' } }, sessionStrip(e)),
      h('p.small.muted', { style: { marginBottom: 0 } }, 'Each box: the real time taken, the motivation state, the behaviour modifier, and what the old bug would have shown. After the wrong answers, p_know falls less in the measured run because the modifier damps those answers. The state stays frustrated afterwards because the app holds a state for 10 minutes once it flips to frustrated or bored.')),
  )
  sessionChart(e, g4)

  const q = (k: 'sm2_measured' | 'sm2_crushed', g: string) => lat.evidence[k].quality[g] ?? 0
  root.append(
    h('div.card', { style: { marginTop: '16px' } },
      h('h3', 'When the timing signal was dead, the grades collapsed'),
      h('p.small.muted', `${lat.config.learners} simulated learners over ${lat.config.days} days. Before the fix every answer looked like ${secs(t.crushed_latency_ms)}.`),
      h('div.chart.short', g5),
      h('p.small.muted', { style: { marginBottom: 0 } }, `Hard and Good never occurred; Easy rose from ${pct(q('sm2_measured', '5'))} to ${pct(q('sm2_crushed', '5'))} of answers. More in the Scheduling tab.`)),
  )
  chart(g5, () => {
    const p = palette()
    const labels = [['1', 'Again (1)'], ['3', 'Hard (3)'], ['4', 'Good (4)'], ['5', 'Easy (5)']]
    return {
      type: 'bar',
      data: { labels: labels.map(l => l[1]), datasets: [
        { label: 'Timing measured', data: labels.map(([g]) => q('sm2_measured', g)), backgroundColor: p.good, borderRadius: 3 },
        { label: 'Timing lost (old bug)', data: labels.map(([g]) => q('sm2_crushed', g)), backgroundColor: p.bad, borderRadius: 3 }] },
      options: { plugins: { legend: { display: true, labels: { color: p.ink2, boxWidth: 12 } } }, scales: { y: { ticks: { callback: (v: number) => `${Math.round(v * 100)}%` }, title: { display: true, text: 'share of all answers' } } } },
    }
  })

  // 4 where in app
  root.append(
    h('h2', { style: { marginTop: '28px' } }, '4. Where to see each behaviour in the running app'),
    h('div.note', 'The two layouts below are schematics, not screenshots: the app needs a database to show real rows, and none was available here. The /engine layout uses the page’s own column headings and fills them with the scripted session above, so it shows the shape of what you will see. Real screenshots can replace these after you run npm run seed:demo.'),
    h('div.card', { style: { marginTop: '12px' } }, h('h3', 'Study screen: where behaviour is captured and felt'),
      h('div.grid.cols-2', learnerWire(),
        h('ol.small', { style: { margin: 0, paddingLeft: '18px' } },
          h('li', 'The timer starts when the question renders.'), h('li', 'The first click or keystroke stamps hesitation.'),
          h('li', 'Changing an option, or editing text after a pause, adds a revision.'), h('li', 'Submit stops the timer and sends latency, hesitation and revisions.'),
          h('li', 'The banner reflects the motivation state the last answers produced; a frustrated learner is also handed an easier review next.')))),
    h('div.card', { style: { marginTop: '16px' } }, h('h3', '/engine → “Per-attempt signals”'), engineSchematic(e),
      h('p.small.muted', 'Highlighted columns are the behaviour signals. Skill and Format are placeholders; every other cell is from the scripted measured session.'),
      h('p.small', { style: { marginBottom: 0 } }, 'Open it from the Engine link in the app’s top bar. Scheduling, further down the same page, lists the live and behaviour-aware grades side by side.')),
    h('div.card', { style: { marginTop: '16px' } }, h('h3', 'The map'),
      h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', 'Behaviour'), h('th', 'Learner sees'), h('th', '/engine shows'), h('th', 'Database column'))),
        h('tbody',
          ([
            ['Latency', 'Nothing directly; reviews come back sooner or later', 'Per-attempt signals → Latency; Scheduling → Live quality', 'attempt_events.latency_ms'],
            ['Hesitation', 'Nothing', 'Per-attempt signals → Hesitation', 'attempt_events.hesitation_ms'],
            ['Revisions', 'Nothing', 'Per-attempt signals → Revisions; Scheduling → Adaptive quality', 'attempt_events.revision_count, behavior_quality_shadow'],
            ['Slow streak', 'Nothing directly', 'Folded into Behaviour mod and Motivation', 'attempt_events.slow_response_streak'],
            ['Consecutive errors', 'Nothing directly', 'Folded into Behaviour mod and Motivation', 'attempt_events.consecutive_errors'],
            ['Behaviour modifier', 'Nothing directly', 'Per-attempt signals → Behaviour mod; p_know before → after', 'attempt_events.behavior_modifier'],
            ['Motivation state', 'A banner above the question; an easier or harder next question', 'Per-attempt signals → Motivation', 'attempt_events.motivation_state'],
          ] as string[][]).map(r => h('tr', h('td', strong(r[0])), h('td.small', r[1]), h('td.small', r[2]), h('td', code(r[3])))))))),
    h('h2', { style: { marginTop: '28px' } }, '5. Limits'),
    h('div.card.warn-card', li([
      'No real learner has used these signals yet; the session above is scripted and the population results are simulated.',
      'Every threshold (3 s, 8 s, 15 s, 10 s, 2 revisions, 1.5 s settle) and the 0.6 / 0.4 weights were set by hand and have not been fitted to data.',
      'The simulator has no hesitation or revision behaviour, so no offline run can show whether the behaviour-aware grade helps. It needs real rows in the shadow log.',
      'Hesitation, taken alone, cannot change an ordinary answer’s shadow grade (see signal 2). If you want it to matter, the rule needs a different trigger, for example hesitation as a share of latency.',
    ])),
  )
}
