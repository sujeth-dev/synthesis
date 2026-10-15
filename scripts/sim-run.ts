/**
 * Runs the learner simulator over the real 120-skill curriculum under both
 * schedulers (SM-2 and FSRS) with an identical simulated population, then
 * writes:
 *   Research/sim/results/scheduler-comparison.json  (committed — small summary)
 *   Research/sim/results/scheduler-comparison.md    (committed — FSRS-4 write-up)
 *   Research/sim/output/<scheduler>_events.csv       (gitignored — full event log,
 *                                                     DKT-ready columns first)
 *
 * All output is SYNTHETIC: simulated learners, not real users.
 *
 * Usage: npx tsx scripts/sim-run.ts [--learners 2000] [--days 90] [--seed 2026]
 */
import fs from 'node:fs'
import path from 'node:path'
import { simulate, type SimEvent } from '../src/lib/sim/run'
import { curriculumSkills } from '../src/lib/sim/skills'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const learners = arg('learners', 2000)
const days = arg('days', 90)
const seed = arg('seed', 2026)

const root = path.resolve(__dirname, '..')
const resultsDir = path.join(root, 'Research/sim/results')
const outputDir = path.join(root, 'Research/sim/output')
fs.mkdirSync(resultsDir, { recursive: true })
fs.mkdirSync(outputDir, { recursive: true })

const COLUMNS: (keyof SimEvent)[] = [
  'student_id', 'skill_id', 'correct', 'timestamp',
  'is_review', 'latency_ms', 'true_recall', 'bkt_p_correct', 'sm2_p_recall', 'fsrs_p_recall',
]

function writeCsv(file: string, events: SimEvent[]) {
  const stream = fs.createWriteStream(file)
  stream.write(COLUMNS.join(',') + '\n')
  for (const e of events) {
    stream.write(COLUMNS.map(c => {
      const v = e[c]
      if (typeof v === 'boolean') return v ? '1' : '0'
      return v === null ? '' : String(v)
    }).join(',') + '\n')
  }
  stream.end()
}

const skills = curriculumSkills()
const reports = []
for (const scheduler of ['sm2', 'fsrs'] as const) {
  const t0 = Date.now()
  const { report, events } = simulate({ seed, learners, days, scheduler, skills })
  writeCsv(path.join(outputDir, `${scheduler}_events.csv`), events)
  reports.push(report)
  console.log(`${scheduler}: ${events.length} attempts in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

const summary = {
  synthetic: true,
  note: 'Simulated learners with a known ground-truth memory model (src/lib/sim/learner.ts). Not real-user evidence.',
  config: { seed, learners, days, skills: skills.length },
  generated_at: new Date().toISOString(),
  reports,
}
fs.writeFileSync(path.join(resultsDir, 'scheduler-comparison.json'), JSON.stringify(summary, null, 2) + '\n')

const [sm2, fsrs] = reports
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const f3 = (x: number) => x.toFixed(3)
const md = [
  '# SM-2 vs FSRS on simulated learners (FSRS-4)\n',
  `**SYNTHETIC** -- ${learners} simulated learners x ${days} days over the real ${skills.length}-skill curriculum, seed ${seed}. ` +
    'Both schedulers see the identical population (same learners, same luck); only the scheduler driving review due dates differs. ' +
    'The ground-truth memory model is `src/lib/sim/learner.ts`. Not evidence about real learners.\n',
  '| | SM-2 (live today) | FSRS |', '|---|---|---|',
  `| Reviews per learner | ${sm2.reviewsPerLearner.toFixed(1)} | ${fsrs.reviewsPerLearner.toFixed(1)} |`,
  `| Skills learned per learner | ${sm2.skillsLearnedPerLearner.toFixed(1)} | ${fsrs.skillsLearnedPerLearner.toFixed(1)} |`,
  `| True retention at end (learned skills) | ${pct(sm2.endRetention)} | ${pct(fsrs.endRetention)} |`,
  `| Learned skills forgotten at end (recall < 70%) | ${pct(sm2.forgottenFraction)} | ${pct(fsrs.forgottenFraction)} |`,
  '',
  '**Recall prediction on review attempts** (how well each scheduler\'s own memory estimate predicts the answer; ' +
    'SM-2\'s is the conventional 0.9^(elapsed/interval) reading). Run under SM-2 scheduling:\n',
  '| | AUC | Log-loss |', '|---|---|---|',
  `| SM-2 | ${f3(sm2.recallPrediction.sm2.auc)} | ${f3(sm2.recallPrediction.sm2.logLoss)} |`,
  `| FSRS (default parameters) | ${f3(sm2.recallPrediction.fsrs.auc)} | ${f3(sm2.recallPrediction.fsrs.logLoss)} |`,
  '',
  '## Reading this',
  `- FSRS spends ${pct(fsrs.reviewsPerLearner / sm2.reviewsPerLearner - 1)} more reviews and in return cuts forgotten skills from ` +
    `${pct(sm2.forgottenFraction)} to ${pct(fsrs.forgottenFraction)}; skills learned per learner move from ` +
    `${sm2.skillsLearnedPerLearner.toFixed(1)} to ${fsrs.skillsLearnedPerLearner.toFixed(1)} (the extra reviews take some time from new topics).`,
  '- FSRS ranks recall better (higher AUC) but its default parameters are over-confident here (worse log-loss). ' +
    'Fitting its parameters to real review logs (FSRS-6) is what fixes calibration; that needs real data.',
  '- Recommendation: FSRS is ready to switch on (`SCHEDULER=fsrs`) if more reviews for better retention is the trade-off you want. ' +
    'Keep shadow logging on either way, so the real-data comparison (`npm run fsrs:compare`) accumulates.',
].join('\n') + '\n'
fs.writeFileSync(path.join(resultsDir, 'scheduler-comparison.md'), md)
console.log(JSON.stringify(reports, null, 2))
