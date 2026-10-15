/**
 * Runs the learner simulator over the real 120-skill curriculum under both
 * schedulers (SM-2 and FSRS) with an identical simulated population, then
 * writes:
 *   Research/sim/results/scheduler-comparison.json  (committed — small summary)
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
console.log(JSON.stringify(reports, null, 2))
