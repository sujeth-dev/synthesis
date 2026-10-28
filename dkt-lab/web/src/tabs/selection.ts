// Selection: the rule cascade that runs today against the weighted score that
// runs beside it in shadow. Reads selector-comparison.json, written by
// `npm run selector:compare` (scripts/selector-compare.ts). Nothing here
// computes a reported number; the weights, the term readings and the reason
// sentences all come from the scorer's own output.
import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f3, int, pct, signed } from '../ui/format'
import { loadJson } from '../data'
import { canvas } from './models'

type TermName = 'urgency' | 'gain' | 'behaviour' | 'cognitive' | 'variety'

interface Term { name: TermName; raw: number; weight: number; contribution: number }
interface Side {
  skill_id: string; label: string; score: number; p_know: number; terms: Term[]; reason: string
}
interface Example {
  dominant_term: TermName; branch: string; day: number; candidate_count: number
  rules: Side; score: Side
}
interface SelectorFile {
  generated_at: string
  config: { learners: number; days: number; seed: number }
  weights: Record<TermName, number>
  tie_epsilon: number
  agreement: {
    decisions: number; agreed: number; tied: number; disagreed: number
    agreement_excluding_ties: number
    by_term: { term: TermName; count: number; mean_gap: number }[]
  }
  examples: Example[]
  outcomes: { metric: string; rules: number; score: number; delta: number }[]
  caveat: string
}

// What each term reads, and where it came from. The weights are not repeated
// here — they are read from the file, so this page cannot drift from the
// scorer.
const TERMS: Record<TermName, { reads: string; source: string }> = {
  urgency: {
    reads: 'How far past its own review interval a skill has drifted. 0 when freshly reviewed, 0.5 at the due date, 1 a full interval overdue. A skill never yet reviewed reads 0.',
    source: 'Pavlik & Anderson 2008; Settles & Meeder 2016',
  },
  gain: {
    reads: 'Expected movement in p_know from one more attempt, multiplied by how much ground is left to mastery. Highest on a skill barely started, lowest on one nearly mastered.',
    source: 'Corbett & Anderson 1994',
  },
  behaviour: {
    reads: 'Where the learner is. Frustrated favours what they already know, bored favours what they do not, neutral is indifferent.',
    source: 'Latif 2023; Research/lab/02-engines.md',
  },
  cognitive: {
    reads: 'Whether the difficulty tier on offer suits how well the skill is known: easier tiers below the learning threshold, harder tiers above it.',
    source: 'Shahzad 2024; Anderson & Krathwohl 2001',
  },
  variety: {
    reads: 'Whether this skill has just been served. 1 if it is absent from the last five, falling to 0 for the one served most recently.',
    source: 'Rohrer & Taylor 2007',
  },
}

// Which direction is good. Stated per metric rather than inferred, because
// more reviews is not better and fewer attempts is not worse.
const BETTER: Record<string, 'higher' | 'lower' | 'neutral'> = {
  'attempts': 'neutral',
  'review attempts': 'neutral',
  'skills learned / learner': 'higher',
  'end retention': 'higher',
  'forgotten fraction': 'lower',
  'mean end p_know': 'higher',
  'p_know gain / attempt': 'higher',
  'overdue at end / learner': 'lower',
}

const DECIMALS: Record<string, number> = { 'attempts': 0, 'review attempts': 0 }

/** Reads the outcome rows rather than restating a conclusion written by hand. */
function verdictLine(f: SelectorFile): string {
  const get = (metric: string) => f.outcomes.find(o => o.metric === metric)
  const wins: string[] = []
  const losses: string[] = []
  for (const row of f.outcomes) {
    const dir = BETTER[row.metric]
    if (dir === 'neutral' || Math.abs(row.delta) < 1e-9) continue
    const better = dir === 'higher' ? row.delta > 0 : row.delta < 0
    ;(better ? wins : losses).push(row.metric)
  }
  const retention = get('end retention')
  const skills = get('skills learned / learner')
  if (!retention || !skills) return 'Read the outcome table below.'
  const head = `The two selectors agree on ${pct(f.agreement.agreement_excluding_ties)} of decisions where the score is not indifferent.`
  if (wins.length && losses.length) {
    return `${head} The score trades coverage for durability: ${signed(retention.delta)} retention and ${signed(get('forgotten fraction')!.delta)} on the fraction forgotten, against ${signed(skills.delta, 2)} skills learned per learner. A different trade-off, not a win.`
  }
  if (!wins.length) return `${head} The score is no better than the cascade on any outcome that matters here.`
  return `${head} The score is ahead on ${wins.length} of ${wins.length + losses.length} directional outcomes.`
}

export async function renderSelection(root: HTMLElement): Promise<void> {
  const f = await loadJson<SelectorFile>('selector-comparison.json')
  const a = f.agreement
  const termNames = Object.keys(f.weights) as TermName[]

  root.append(
    h('h1', 'Selection: which skill next, and why'),
    h('p.lede', 'Knowledge tracing says what a learner knows and the scheduler says when to ask again. Something still has to choose which of a dozen eligible skills to serve right now. The app does that with a rule cascade: the first non-empty tier wins, broken by one key. Beside it, in shadow, a weighted score rates every candidate on five terms and has to state a reason. This page is the comparison, and it is not a recommendation to switch.'),
    h('div.flow',
      h('div.step', h('h3', h('span.step-n', '1'), 'The same pool'),
        h('p.small', { style: { margin: 0 } }, 'Hard constraints stay in the cascade: locked prerequisites, blocked skills, the pinned guided arc. Both selectors are handed the identical list of eligible candidates.')),
      h('div.step', h('h3', h('span.step-n', '2'), 'Five readings'),
        h('p.small', { style: { margin: 0 } }, 'Each candidate gets a 0–1 reading on urgency, learning gain, behaviour, cognitive level and variety, weighted and summed. A wheel-spinning guard then penalises a skill the learner keeps failing.')),
      h('div.step', h('h3', h('span.step-n', '3'), 'A choice with a reason'),
        h('p.small', { style: { margin: 0 } }, 'Highest score wins, ties break on skill id, and 12% of the time a runner-up is served instead so the system keeps learning. Every pick carries the sentence that explains it.'))),
    h('div.prov',
      h('span.badge.synthetic', 'synthetic (Synaptic simulator)'),
      h('strong', `${int(f.config.learners)} simulated learners × ${f.config.days} days, seed ${f.config.seed}`),
      h('span.muted', 'Source: npm run selector:compare → public/data/selector-comparison.json'),
      h('span.muted', `Generated ${f.generated_at.slice(0, 10)}`)),
    h('p.verdict', verdictLine(f)),
  )

  // ── the terms ──────────────────────────────────────────────────────────────
  root.append(
    h('h2', { style: { marginTop: '32px' } }, 'The five terms'),
    h('p.lede', 'Weights read from the scorer itself, so this table cannot drift from the code. Urgency and gain carry equal, dominant weight: keep what is already learned alive, and spend the rest of the time where there is most still to gain.'),
    h('div.card', h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Term'), h('th.num', 'Weight'), h('th', 'What it reads'), h('th', 'Where it comes from'))),
      h('tbody', termNames.map(name => h('tr',
        h('td', h('strong', name)),
        h('td.num', f.weights[name].toFixed(2)),
        h('td.small', TERMS[name].reads),
        h('td.small.muted', TERMS[name].source))))))),
  )

  // ── agreement ──────────────────────────────────────────────────────────────
  const split = canvas('How often the two selectors pick the same skill')
  const byTerm = canvas('Which term drove each disagreement')
  root.append(
    h('h2', { style: { marginTop: '32px' } }, 'How often they disagree'),
    h('p.lede', `From a run that follows the rules and records what the score would have done, so the population is identical. Only decisions with at least two candidates count — a pinned arc has one by construction. A disagreement counts as a tie when the two picks are within ${f.tie_epsilon} of each other on score, which separates a real difference of opinion from a coin flip.`),
    h('div.grid.tiles', { style: { marginBottom: '16px' } },
      h('div.card.tile', h('div.label', 'Decisions'), h('div.value', int(a.decisions))),
      h('div.card.tile.bkt', h('div.label', 'Same pick'), h('div.value', int(a.agreed)), h('div.small.muted', pct(a.agreed / a.decisions))),
      h('div.card.tile', h('div.label', 'Score indifferent'), h('div.value', int(a.tied)), h('div.small.muted', pct(a.tied / a.decisions))),
      h('div.card.tile.dkt', h('div.label', 'Real disagreement'), h('div.value', int(a.disagreed)), h('div.small.muted', pct(a.disagreed / a.decisions))),
      h('div.card.tile', h('div.label', 'Agreement, ties excluded'), h('div.value', pct(a.agreement_excluding_ties)))),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'The split'), h('div.chart.short', split)),
      h('div.card', h('h3', 'What drove the disagreements'),
        h('div.chart.short', byTerm),
        h('p.small.muted', { style: { marginBottom: 0 } }, 'Each disagreement is attributed to the term where the score’s pick beat the cascade’s pick by the most. Mean gap is how much that term contributed on top — a large count with a small gap means the term is a tiebreaker, not a driver.'))),
    h('div.card', { style: { marginTop: '16px' } }, h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Dominant term'), h('th.num', 'Disagreements'), h('th.num', 'Share'), h('th.num', 'Mean gap'), h('th.num', 'Weight'))),
      h('tbody', a.by_term.map(t => h('tr',
        h('td', h('strong', t.term)),
        h('td.num', int(t.count)),
        h('td.num', pct(t.count / Math.max(1, a.disagreed))),
        h('td.num', f3(t.mean_gap)),
        h('td.num', f.weights[t.term].toFixed(2)))))))),
  )

  const p = palette()
  chart(split, () => ({
    type: 'doughnut',
    data: {
      labels: ['Same pick', 'Score indifferent', 'Real disagreement'],
      datasets: [{ data: [a.agreed, a.tied, a.disagreed], backgroundColor: [p.bkt, p.ink3, p.dkt], borderWidth: 0 }],
    },
    options: {
      cutout: '58%',
      plugins: { legend: { display: true, position: 'bottom', labels: { color: p.ink2, boxWidth: 12 } } },
      scales: { x: { display: false }, y: { display: false } },
    },
  }))
  chart(byTerm, () => ({
    type: 'bar',
    data: {
      labels: a.by_term.map(t => t.term),
      datasets: [{ data: a.by_term.map(t => t.count), backgroundColor: p.dkt, borderRadius: 2 }],
    },
    options: { indexAxis: 'y', scales: { x: { title: { display: true, text: 'disagreements' } } } },
  }))

  // ── worked examples ────────────────────────────────────────────────────────
  if (f.examples.length > 0) renderExamples(root, f)

  // ── outcomes ───────────────────────────────────────────────────────────────
  const outcomeC = canvas('Outcome difference between the two selectors')
  root.append(
    h('h2', { style: { marginTop: '32px' } }, 'Whether the disagreements were better'),
    h('p.lede', 'Agreement says how often they differ, not who was right. These are two independent runs over the same seeded population, one following each selector, under the simulator’s own memory model. Attempts are matched exactly, so nothing here is an exposure difference.'),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'Outcomes'), h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', ''), h('th.num', 'Rules (live today)'), h('th.num', 'Score (shadow)'), h('th.num', 'Δ'))),
        h('tbody', f.outcomes.map(row => {
          const d = DECIMALS[row.metric] ?? (Math.abs(row.rules) > 10 ? 1 : 4)
          const dir = BETTER[row.metric]
          const scoreBetter = dir === 'neutral' ? false : dir === 'higher' ? row.delta > 0 : row.delta < 0
          const rulesBetter = dir !== 'neutral' && Math.abs(row.delta) > 1e-9 && !scoreBetter
          return h('tr',
            h('td', row.metric, dir === 'neutral' ? h('span.small.muted', ' (neither better)') : null),
            h('td', { class: `num${rulesBetter ? ' win' : ''}` }, row.rules.toFixed(d)),
            h('td', { class: `num${scoreBetter ? ' win' : ''}` }, row.score.toFixed(d)),
            h('td.num', { class: dir === 'neutral' || Math.abs(row.delta) < 1e-9 ? 'num' : `num delta ${scoreBetter ? 'up' : 'down'}` }, signed(row.delta, d)))
        }))))),
      h('div.card', h('h3', 'The trade, in one picture'),
        h('div.chart.short', outcomeC),
        h('p.small.muted', { style: { marginBottom: 0 } }, 'Change from the cascade, as a percentage of its own value, oriented so bars to the right mean the score did better. Neutral metrics are left out.'))),
    h('div.card.warn-card', { style: { marginTop: '16px' } },
      h('h3', 'What this cannot tell you'),
      h('p.small', f.caveat),
      h('p.small', 'The learners are simulated under a memory model written in this repository, so a run like this can show a selector is no worse — never that it is better for a real person. The score can also only be as good as the signals it is given: this measurement holds the Elo question ratings at their starting value, and exploration is switched off so the ranking is what is being compared.'),
      h('p.small', { style: { marginBottom: 0 } }, h('strong', 'An earlier version of this page reported the opposite result. '), 'The selector read the wall clock rather than the simulated calendar, so every simulated due date sat months in the real past: the cascade saw every schedule as overdue and the score, which was given the simulated clock, saw almost nothing due. The two policies were being compared on different clocks, and the urgency term — weighted highest alongside gain — could not have been exercised. The clock is now injected, the run is deterministic, and the numbers above are the corrected ones.')),
  )

  chart(outcomeC, () => {
    const rows = f.outcomes.filter(o => BETTER[o.metric] !== 'neutral' && Math.abs(o.rules) > 1e-9)
    const values = rows.map(o => (BETTER[o.metric] === 'higher' ? 1 : -1) * (o.delta / Math.abs(o.rules)) * 100)
    return {
      type: 'bar',
      data: {
        labels: rows.map(o => o.metric),
        datasets: [{
          data: values,
          backgroundColor: values.map(v => (v >= 0 ? p.good : p.bad)),
          borderRadius: 2,
        }],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { title: { display: true, text: '% better for the score →' } } },
      },
    }
  })
}

/**
 * One disagreement, kept whole. Counts say how often the selectors differ; this
 * is the only part of the page that shows what a difference looked like, with
 * both candidates' term readings and the sentence each selector would have
 * shown the learner.
 */
function renderExamples(root: HTMLElement, f: SelectorFile): void {
  const terms = Array.from(new Set(f.examples.map(e => e.dominant_term)))
  let active = terms[0]

  const body = h('div')
  const buttons = h('div.row', { style: { marginBottom: '12px' } })

  const side = (s: Side, who: 'rules' | 'score', chosen: boolean): HTMLElement =>
    h(`div.card.side.${who === 'rules' ? 'bkt' : 'dkt'}`,
      h('h3', who === 'rules' ? 'The cascade picked' : 'The score picked',
        h('span.panel-tag', { class: chosen ? 'panel-tag after' : 'panel-tag' }, chosen ? 'served' : 'shadow')),
      h('div.vs', h('span.bigstat', s.score.toFixed(3), h('small', 'weighted score')),
        h('span.arrow', '·'), h('span.small', h('strong', s.label), h('br'), `p_know ${pct(s.p_know)}`)),
      h('div.meters', { style: { marginTop: '12px' } }, s.terms.map(t => h(`div.meter.${who === 'rules' ? 'bkt' : 'dkt'}`,
        h('div.mlab', h('span', t.name), h('span', f3(t.contribution))),
        h('div.track', h('div.fill', { style: { width: `${Math.round(t.raw * 100)}%` } })),
        h('div.mlab', h('span.muted', `reads ${pct(t.raw, 0)}`), h('span.muted', `× ${t.weight.toFixed(2)}`))))),
      h('p.small', { style: { marginTop: '12px', marginBottom: 0 } }, h('em', `“${s.reason}”`)))

  function draw(): void {
    while (buttons.firstChild) buttons.removeChild(buttons.firstChild)
    for (const t of terms) {
      buttons.append(h('button.btn', {
        type: 'button', class: t === active ? 'btn active' : 'btn',
        onclick: () => { active = t; draw() },
      }, t))
    }
    while (body.firstChild) body.removeChild(body.firstChild)
    const shown = f.examples.filter(e => e.dominant_term === active)
    for (const e of shown) {
      body.append(
        h('p.small.muted', { style: { margin: '14px 0 6px' } },
          `Day ${e.day} · ${e.candidate_count} candidates · cascade arm “${e.branch}” · the two picks differed most on `,
          h('strong', e.dominant_term)),
        h('div.grid.cols-2', side(e.rules, 'rules', true), side(e.score, 'score', false)),
      )
    }
  }
  draw()

  root.append(
    h('h2', { style: { marginTop: '32px' } }, 'One decision, both ways'),
    h('p.lede', 'Up to two real disagreements per dominant term, taken from the measured run exactly as the scorer produced them — the same term readings and the same reason sentence a learner would be shown. The cascade’s pick is what the simulated learner actually got; the score’s pick is what was logged beside it.'),
    buttons, body,
  )
}
