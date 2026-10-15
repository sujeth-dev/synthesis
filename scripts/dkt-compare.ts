/**
 * DKT-12: DKT vs live BKT on the same attempts, plus the DKT-13 cutover gate.
 *
 *   npx tsx scripts/dkt-compare.ts --sim [--learners 300] [--seed 9001]
 *       Fresh simulated population (a seed the model never trained on), run
 *       through the app's own TypeScript DKT and BKT. SYNTHETIC. Writes
 *       Research/dkt/results/dkt12_comparison.{md,json}.
 *
 *   npx tsx scripts/dkt-compare.ts
 *       Real learners: reads dkt_shadow_log (needs SUPABASE_DB_URL in
 *       .env.local, migration 005, and DKT_SHADOW=1 running for a while).
 */
import fs from 'node:fs'
import path from 'node:path'
import { compareDktVsBkt, cutoverDecision, MIN_ATTEMPTS_FOR_DECISION, type ShadowRow } from '../src/lib/dkt/compare'
import { initialDktState, predictSkill, stepDkt } from '../src/lib/dkt'
import { getBundledDktModel } from '../src/lib/dkt/shadow'
import { auc, logLoss } from '../src/lib/sim/metrics'
import { simulate } from '../src/lib/sim/run'
import { curriculumSkills } from '../src/lib/sim/skills'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const ROOT = path.resolve(__dirname, '..')

async function simRows(learners: number, seed: number) {
  const model = await getBundledDktModel()
  const { events } = simulate({ seed, learners, days: 90, scheduler: 'sm2', skills: curriculumSkills() })
  const rows: (ShadowRow & { true_recall: number })[] = []
  let student = ''
  let state = initialDktState(model)
  let seen = 0
  for (const e of events) {
    if (e.student_id !== student) { student = e.student_id; state = initialDktState(model); seen = 0 }
    // Same protocol as the live shadow hook: predict from everything before
    // this attempt; a learner's very first attempt has no history to use.
    const p = seen > 0 ? predictSkill(model, state, e.skill_id) : undefined
    if (p !== undefined) {
      rows.push({ dkt_p_correct: p, bkt_p_correct: e.bkt_p_correct, correct: e.correct, true_recall: e.true_recall })
    }
    state = stepDkt(model, state, e)
    seen++
  }
  return { rows, synthetic: true, modelSynthetic: model.synthetic }
}

async function dbRows() {
  for (const line of fs.existsSync(path.join(ROOT, '.env.local')) ? fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n') : []) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.trim().startsWith('#')) process.env[line.slice(0, eq).trim()] ??= line.slice(eq + 1).trim()
  }
  if (!process.env.SUPABASE_DB_URL) {
    console.error('SUPABASE_DB_URL not set in .env.local. For a synthetic run without a database use --sim.')
    process.exit(1)
  }
  // pg ships without type declarations; type just the surface used here.
  type Row = ShadowRow & { model_synthetic: boolean }
  type PgClient = { connect(): Promise<void>; query(sql: string): Promise<{ rows: Row[] }>; end(): Promise<void> }
  const { Client } = require('pg') as { Client: new (config: object) => PgClient }
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT dkt_p_correct, bkt_p_correct, correct, model_synthetic FROM dkt_shadow_log')
    return { rows, synthetic: false, modelSynthetic: rows.some(r => r.model_synthetic) }
  } finally {
    await client.end()
  }
}

async function main() {
  const sim = process.argv.includes('--sim')
  const learners = arg('learners', 300)
  const seed = arg('seed', 9001)
  const { rows, synthetic, modelSynthetic } = sim ? await simRows(learners, seed) : await dbRows()
  const comparison = compareDktVsBkt(rows)
  const decision = cutoverDecision(comparison)

  const lines = [
    '# DKT vs live BKT (DKT-12) and cutover gate (DKT-13)\n',
    synthetic
      ? `**SYNTHETIC** -- ${learners} fresh simulated learners (seed ${seed}, never seen in training), run through the app's own TypeScript DKT and BKT. Validates the evaluation pipeline; not evidence about real learners.\n`
      : `**Real learners** -- rows from \`dkt_shadow_log\`.${modelSynthetic ? ' Note: the DKT model producing them was trained on simulated learners.' : ''}\n`,
    '| Model | AUC | Log-loss |', '|---|---|---|',
    `| DKT (TypeScript, bundled model) | ${comparison.dkt.auc.toFixed(4)} | ${comparison.dkt.logLoss.toFixed(4)} |`,
    `| Live BKT | ${comparison.bkt.auc.toFixed(4)} | ${comparison.bkt.logLoss.toFixed(4)} |`,
  ]
  if (sim) {
    const truth = (rows as (ShadowRow & { true_recall: number })[]).map(r => ({ predicted: r.true_recall * 0.9 + (1 - r.true_recall) * 0.22, actual: r.correct }))
    lines.push(`| Ceiling (true recall, approx.) | ${auc(truth).toFixed(4)} | ${logLoss(truth).toFixed(4)} |`)
  }
  lines.push('', `Attempts compared: ${comparison.n} (decision needs >= ${MIN_ATTEMPTS_FOR_DECISION}).`, '',
    `**Cutover gate:** ${decision.recommend ? 'DKT clears the bar -- recommend a human review of switching.' : `do not switch (${decision.reason.replace(/_/g, ' ')}).`}`,
    synthetic ? '\nA live switch must only ever be decided on real-learner rows (run without `--sim`).' : '')
  const report = lines.join('\n') + '\n'
  console.log(report)

  if (sim) {
    const dir = path.join(ROOT, 'Research/dkt/results')
    fs.writeFileSync(path.join(dir, 'dkt12_comparison.md'), report)
    fs.writeFileSync(path.join(dir, 'dkt12_comparison.json'),
      JSON.stringify({ synthetic, learners, seed, comparison, decision }, null, 2) + '\n')
  }
}

main()
