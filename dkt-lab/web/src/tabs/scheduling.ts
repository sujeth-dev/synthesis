import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { f3, pct } from '../ui/format'
import { loadJson } from '../data'
import { canvas } from './models'
import { renderLoopStory } from './scheduling-story'

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
    h('h1', 'Scheduling: when should the app ask again?'),
    h('p.lede', 'Knowledge tracing estimates what a learner knows; the scheduler decides when they should see it again. The app runs SM-2 today and logs FSRS beside it. This page starts with one learner and one skill, then the whole simulated population, then what happened when the timing signal was broken.'),
    h('div.flow',
      h('div.step', h('h3', h('span.step-n', '1'), 'Answer'), h('p.small', { style: { margin: 0 } }, 'Right or wrong, how long it took, how long the learner hesitated, how often they changed their mind.')),
      h('div.step', h('h3', h('span.step-n', '2'), 'Grade'), h('p.small', { style: { margin: 0 } }, 'The scheduler turns that into one of four grades: Again, Hard, Good or Easy (SM-2 calls them 1, 3, 4 and 5).')),
      h('div.step', h('h3', h('span.step-n', '3'), 'Come back'), h('p.small', { style: { margin: 0 } }, 'A better grade means a longer wait. A miss shortens the wait sharply.'))),
  )
  await renderLoopStory(root)
  root.append(
    h('h2', { style: { marginTop: '36px' } }, 'SM-2 vs FSRS across a whole population'),
    h('div.prov', h('span.badge.synthetic', 'synthetic (Synaptic simulator)'), h('strong', `${r.config.learners.toLocaleString('en-US')} simulated learners × ${r.config.days} days, ${r.config.skills} skills, seed ${r.config.seed}`),
      h('span.muted', 'Source: Research/sim/results/scheduler-comparison.json (copied unchanged)'), h('span.muted', r.note)),
    h('p.lede', 'The same simulated population run under each scheduler, so only the review timing differs. Not evidence about real learners.'),
  )
  root.append(h('div.grid.cols-2', { style: { marginBottom: '16px' } },
    h('div.card', h('h3', 'Why they behave differently'),
      h('p.small', h('strong', 'SM-2 '), 'is a fixed recipe from 1987: each time you recall a card the gap before the next review is multiplied by an “ease” number, and a miss resets it to a day. It never models forgetting itself, so it cannot tell a shaky memory from a solid one except through that one number.'),
      h('p.small', { style: { marginBottom: 0 } }, h('strong', 'FSRS '), 'models memory directly: it tracks how stable a memory is and how hard the card is, and schedules the next review for when predicted recall falls to about 90%. It asks for more reviews and forgets less.')),
    h('div.card', h('h3', 'What both of them are fed'),
      h('p.small', 'Exactly the same evidence from each answer: right or wrong, and how fast. That is why a broken speed signal hurts both, and why FSRS is hurt more: it trusts the grade to place the next review years out.'),
      h('p.small.muted', { style: { marginBottom: 0 } }, 'The last section of this page shows that failure on the whole population.'))))
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
  await renderLatencyImpact(root)
}

interface Mix { attempts: number; quality: Record<string, number> }
interface LatencyFile {
  synthetic: boolean; note?: string
  config: { learners: number; days: number; seed: number; skills: number; crushed_latency_ms: number }
  evidence: Record<'sm2_measured' | 'sm2_crushed' | 'fsrs_measured' | 'fsrs_crushed', Mix>
  outcomes: Record<'sm2_measured' | 'sm2_crushed' | 'fsrs_measured' | 'fsrs_crushed', Report>
}

// Reads Research/sim/results/latency-signal-impact.json, copied unchanged into
// public/data/app/ (see pipeline/export.py APP_RESULTS and check_web.py).
async function renderLatencyImpact(root: HTMLElement): Promise<void> {
  const r = await loadJson<LatencyFile>('app/latency-signal-impact.json')
  const arms: [string, 'sm2_measured' | 'sm2_crushed' | 'fsrs_measured' | 'fsrs_crushed'][] = [
    ['SM-2, speed measured', 'sm2_measured'], ['SM-2, speed lost', 'sm2_crushed'],
    ['FSRS, speed measured', 'fsrs_measured'], ['FSRS, speed lost', 'fsrs_crushed']]
  const tier = (key: typeof arms[number][1], q: string) => pct(r.evidence[key].quality[q] ?? 0)
  const ev: [string, string][] = [['Wrong (quality 1 / Again)', '1'], ['Right but slow (3 / Hard)', '3'], ['Right, medium (4 / Good)', '4'], ['Right and fast (5 / Easy)', '5']]
  root.append(
    h('h2', { style: { marginTop: '28px' } }, 'What a broken timing signal cost'),
    h('div.prov', h('span.badge.synthetic', 'synthetic (Synaptic simulator)'),
      h('strong', `${r.config.learners} learners × ${r.config.days} days, ${r.config.skills} skills, seed ${r.config.seed}`),
      h('span.muted', 'Source: Research/sim/results/latency-signal-impact.json (copied unchanged)')),
    h('div.flow',
      h('div.step.before', h('h3', h('span.step-n', '1'), 'What was broken'), h('p.small', { style: { margin: 0 } }, `The timer was read while the request was still being built, so it measured packing the data, not thinking time: the server saw about ${r.config.crushed_latency_ms} ms for every answer. Hesitation was always 0 and answer changes were never sent.`)),
      h('div.step.fix', h('h3', h('span.step-n', '2'), 'What we fixed'), h('p.small', { style: { margin: 0 } }, 'The browser now stamps when the question appears, when the learner first touches it, and when they submit. The server checks the numbers and stores all three measures.')),
      h('div.step.after', h('h3', h('span.step-n', '3'), 'What it changes'), h('p.small', { style: { margin: 0 } }, `Top-grade answers (“fast”) fall from ${pct(r.evidence.sm2_crushed.quality['5'] ?? 0)} of all SM-2 answers to ${pct(r.evidence.sm2_measured.quality['5'] ?? 0)}, and the middle grades exist again. Below: what that does to reviews and forgetting.`))),
    h('p.lede', `Both schedulers grade each right answer by how fast it was. In the app a bug made every answer look like it took ${r.config.crushed_latency_ms} ms, so every right answer was graded “fast”. This is the same simulated population run with the real speed and with the broken one; the learners still take just as long, only what the scheduler is told changes.`),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'What the scheduler is told'), h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', 'Answer graded as'), ...arms.map(([l]) => h('th.num', l)))),
        h('tbody', ev.map(([label, q]) => h('tr', h('td', label), ...arms.map(([, k]) => h('td.num', tier(k, q)))))))),
        h('p.small.muted', 'With the speed lost, the middle two grades never occur: every right answer becomes “fast”.')),
      h('div.card', h('h3', 'What that does'), h('div.table-wrap', h('table',
        h('thead', h('tr', h('th', ''), ...arms.map(([l]) => h('th.num', l)))),
        h('tbody',
          h('tr', h('td', 'Reviews per learner'), ...arms.map(([, k]) => h('td.num', r.outcomes[k].reviewsPerLearner.toFixed(1)))),
          h('tr', h('td', 'Retention at end'), ...arms.map(([, k]) => h('td.num', pct(r.outcomes[k].endRetention)))),
          h('tr', h('td', 'Learned skills forgotten'), ...arms.map(([, k]) => h('td.num', pct(r.outcomes[k].forgottenFraction)))))),
        h('p.small.muted', 'The scheduler asks for fewer reviews and more is forgotten: it believes everything is easier than it is.'))),
    ),
    h('p.small.muted', 'Not shown here: the behaviour-aware scheduling quality the app now computes in shadow (it also uses hesitation and retries). The simulator has no hesitation or retry behaviour, so no offline run can justify it; it needs real learner rows.'),
  )
}

