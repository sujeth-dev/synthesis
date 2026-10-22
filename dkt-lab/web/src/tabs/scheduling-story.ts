import { h, clear } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { pct } from '../ui/format'
import { loadJson } from '../data'
import { canvas } from './models'

// The scheduling loop as a conversation. Reads app/scheduling-walkthrough.json,
// which scripts/scheduling-walkthrough.ts wrote by pushing seven hand-scripted
// answers through the app's real scheduling functions (updateSM2, the FSRS
// scheduler, the shadow adaptive quality). It is an illustration of one learner,
// not a measurement; the population results are in the tables further down the
// page. All grades, gaps and recall figures below come from that file.

type Kind = 'measured' | 'speed_lost' | 'behaviour_aware'
type Sched = 'sm2' | 'fsrs'
interface Answer { correct: boolean; latency_ms: number; hesitation_ms: number; revision_count: number; what: string }
interface Step {
  day: number; what: string; correct: boolean; latency_ms: number; hesitation_ms: number; revision_count: number
  grade: number; gradeName: string; intervalDays: number; recallBefore: number | null
}
interface WalkFile { note: string; crushed_latency_ms: number; answers: Answer[]; worlds: Record<`${Sched}_${Kind}`, Step[]> }

const KINDS: { kind: Kind; label: string; blurb: string }[] = [
  { kind: 'measured', label: 'Speed measured (today)', blurb: 'The browser times every answer and the scheduler grades right answers by how fast they were: under 3 s is easy, under 8 s is good, slower is hard.' },
  { kind: 'speed_lost', label: 'Speed lost (the old bug)', blurb: 'The timer read the clock too early, so the scheduler was told every answer took a tenth of a second. Every right answer looked effortless.' },
  { kind: 'behaviour_aware', label: 'Behaviour-aware (shadow)', blurb: 'Also reads hesitation and answer changes: a long stare or repeated changes of mind demote the grade one step. Computed and logged, not applied.' },
]

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 1 : 0)} s`
const gap = (days: number) => `${days} day${days === 1 ? '' : 's'}${days >= 365 ? ` (about ${(days / 365).toFixed(1)} years)` : ''}`

function bubbles(f: WalkFile, sched: Sched, kind: Kind): HTMLElement[] {
  const steps = f.worlds[`${sched}_${kind}`], measured = f.worlds[`${sched}_measured`]
  const out: HTMLElement[] = []
  steps.forEach((s, i) => {
    out.push(h('div.bubble.sys', i === 0 ? `Day ${s.day} · first time on this skill` : `Day ${s.day} · back exactly when it was due`))
    const detail = [`${secs(s.latency_ms)} to answer`, s.hesitation_ms >= 1000 ? `${secs(s.hesitation_ms)} before touching it` : null,
      s.revision_count > 0 ? `changed answer ${s.revision_count}×` : null].filter(Boolean).join(' · ')
    out.push(h('div.bubble.you', h('span.who', 'Learner'), `${s.correct ? '✔' : '✘'} ${s.what}`, h('br'), h('span', { style: { opacity: '0.7', fontSize: '12px' } }, detail)))
    const heard = kind === 'speed_lost' ? ` I was told it took ${secs(f.crushed_latency_ms)}.` : ''
    const recall = s.recallBefore !== null ? ` Chance you still remembered it: ${pct(s.recallBefore, 0)}.` : ''
    out.push(h('div.bubble.app', h('span.who', sched === 'sm2' ? 'SM-2' : 'FSRS'),
      `Graded ${s.gradeName}.${heard}${recall} See you in ${gap(s.intervalDays)}.`))
    const m = measured[i]
    if (kind !== 'measured' && m.grade !== s.grade) {
      out.push(h('div.bubble.app.warn', h('span.who', 'What changed'),
        kind === 'speed_lost'
          ? `With the real ${secs(s.latency_ms)} this would have been ${m.gradeName}, ${gap(m.intervalDays)} out, not ${gap(s.intervalDays)}.`
          : `One step lower than speed alone gives (${m.gradeName}): ${s.hesitation_ms >= 10_000 ? 'the long hesitation' : 'the repeated changes of mind'} say it was effortful.`))
    }
  })
  return out
}

function longest(f: WalkFile, sched: Sched, kind: Kind): number {
  return Math.max(...f.worlds[`${sched}_${kind}`].map(s => s.intervalDays))
}

export async function renderLoopStory(root: HTMLElement): Promise<void> {
  const f = await loadJson<WalkFile>('app/scheduling-walkthrough.json')
  let kind: Kind = 'measured'

  const stage = h('div')
  const controls = h('div.seg', { role: 'group', 'aria-label': 'What the scheduler is told' })
  const paint = () => {
    clear(controls)
    for (const k of KINDS) controls.append(h('button', { type: 'button', 'aria-pressed': String(k.kind === kind), onclick: () => { kind = k.kind; paint() } }, k.label))
    clear(stage)
    const blurb = KINDS.find(k => k.kind === kind)!.blurb
    const col = (sched: Sched, name: string, tagline: string) => h('div.card',
      h('h3', name, h('span.chip', `longest gap set: ${gap(longest(f, sched, kind))}`)),
      h('p.small.muted', { style: { marginTop: 0 } }, tagline),
      h('div.chat', bubbles(f, sched, kind)))
    stage.append(
      h('p.small', { style: { margin: '10px 0 12px' } }, h('strong', 'In this view: '), blurb),
      h('div.grid.cols-2',
        col('sm2', 'SM-2 (what the app runs)', 'A fixed recipe: each success multiplies the gap, a miss resets it to one day.'),
        col('fsrs', 'FSRS (built, logged beside it)', 'Models how stable the memory is and aims for about 90% recall when you return.')))
  }
  paint()

  root.append(
    h('h2', { style: { marginTop: '8px' } }, 'The loop, as a conversation'),
    h('div.prov', h('span.badge.synthetic', 'illustration'), h('strong', 'one scripted learner, seven answers'),
      h('span.muted', 'Source: Research/sim/results/scheduling-walkthrough.json (copied unchanged)'),
      h('span.muted', f.note)),
    h('p.lede', 'Every question ends the same way: the learner answers, the app turns that answer into a grade, and the grade decides when the skill comes back. Pick what the scheduler is told and watch the same seven answers produce different calendars.'),
    controls, stage,
  )

  // How the gap grows, all six worlds on one log axis.
  const c = canvas('Review gap after each answer, for SM-2 and FSRS under three signals')
  const worldKeys = Object.keys(f.worlds) as (keyof WalkFile['worlds'])[]
  const dash: Record<Kind, number[]> = { measured: [], speed_lost: [6, 4], behaviour_aware: [2, 3] }
  const name: Record<Kind, string> = { measured: 'speed measured', speed_lost: 'speed lost', behaviour_aware: 'behaviour-aware' }
  root.append(h('div.card', { style: { marginTop: '16px' } },
    h('h3', 'How the gap between reviews grows'),
    h('div.legend', h('span.key.muted', 'SM-2 (grey)'), h('span.key', { style: { color: 'var(--synthetic)' } }, 'FSRS (purple)'),
      h('span.small.muted', 'solid = speed measured · dashed = speed lost · dotted = behaviour-aware')),
    h('div.chart', c),
    h('p.small.muted', 'Log scale: each equal step up means ten times longer. When the app is told every answer was instant, FSRS pushes the next review years out after a handful of right answers; only the wrong answer at step 5 pulls it back.')))
  chart(c, () => {
    const p = palette()
    return {
      type: 'line',
      data: { labels: f.answers.map((_, i) => `after answer ${i + 1}`), datasets: worldKeys.map(k => {
        const [sched, ...rest] = k.split('_'); const kd = rest.join('_') as Kind
        const color = sched === 'sm2' ? p.ink3 : p.synthetic
        return { label: `${sched === 'sm2' ? 'SM-2' : 'FSRS'}, ${name[kd]}`, data: f.worlds[k].map(s => s.intervalDays),
          borderColor: color, backgroundColor: color, borderDash: dash[kd], borderWidth: 2, pointRadius: 3, tension: 0 }
      }) },
      options: { scales: { y: { type: 'logarithmic', min: 1, title: { display: true, text: 'days until the next review' } } },
        plugins: { tooltip: { callbacks: { label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${gap(ctx.parsed.y)}` } } } },
    }
  })
}
