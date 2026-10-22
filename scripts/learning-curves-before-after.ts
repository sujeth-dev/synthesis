/**
 * The learning-curve data behind the lab's "before -> after" graph.
 *
 *   npx tsx scripts/learning-curves-before-after.ts [--learners 300] [--seed 9001]
 *
 * One simulated population (the same seed as `npm run dkt:compare -- --sim`,
 * never seen in training), scored by every model on the identical attempts, then
 * averaged per attempt number two ways:
 *
 *   cohort    the (learner, skill) pairs with >= 10 attempts, restricted to their
 *             first 10, so every point averages the SAME pairs. Its shape is a
 *             statement about the models. This is what the gate's growth test uses.
 *   aggregate whoever happens to still be answering at attempt k. Its shape also
 *             reflects WHO stops, which is why the lab stopped trusting it.
 *
 * Models: live BKT; per-skill BKT (shadow arm); DKT "before" (the model committed
 * before Level 14, read from git); DKT "after" (the bundled model).
 *
 * The slope ratios here are re-derived by compareGrowth() and must agree with it
 * to 1e-9, otherwise this script exits non-zero: the graph and the gate cannot
 * silently disagree about the same quantity. SYNTHETIC.
 *
 * Writes Research/dkt/results/learning-curves-before-after.json.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { paramsFor } from '../src/lib/bkt/params'
import {
  compareGrowth, MIN_COHORT_BUCKET_ROWS, MIN_COHORT_OPPORTUNITIES, withOpportunityIndex,
  type IndexedOpportunityRow, type OpportunityRow,
} from '../src/lib/dkt/compare'
import { initialDktState, loadDktModel, predictSkill, stepDkt, type DktModel, type DktWeightsFile } from '../src/lib/dkt'
import { getBundledDktModel } from '../src/lib/dkt/shadow'
import { simulate } from '../src/lib/sim/run'
import { curriculumSkills } from '../src/lib/sim/skills'

// The commit just before Level 14 retrained the bundled model (Level 13).
const BEFORE_REF = 'b71e301'
const AGGREGATE_MAX_OPPORTUNITY = 20

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const ROOT = path.resolve(__dirname, '..')
const learners = arg('learners', 300)
const seed = arg('seed', 9001)

const MODELS = ['live_bkt', 'per_skill_bkt', 'dkt_before', 'dkt_after'] as const
type ModelKey = typeof MODELS[number]
type Row = OpportunityRow & Record<ModelKey, number>

function modelFromGit(ref: string): DktModel {
  const json = execSync(`git show ${ref}:src/lib/dkt/model/synaptic-dkt.json`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString()
  return loadDktModel(JSON.parse(json) as DktWeightsFile)
}

async function scoredRows(): Promise<Row[]> {
  const before = modelFromGit(BEFORE_REF)
  const after = await getBundledDktModel()
  const { events } = simulate({ seed, learners, days: 90, scheduler: 'sm2', skills: curriculumSkills(), shadowBktParams: paramsFor })
  const rows: Row[] = []
  let student = ''
  let stateB = initialDktState(before), stateA = initialDktState(after), seen = 0
  for (const e of events) {
    if (e.student_id !== student) { student = e.student_id; stateB = initialDktState(before); stateA = initialDktState(after); seen = 0 }
    // Same protocol as the live shadow hook and dkt-compare.ts: predict from
    // everything before this attempt; a learner's first attempt has no history.
    const pb = seen > 0 ? predictSkill(before, stateB, e.skill_id) : undefined
    const pa = seen > 0 ? predictSkill(after, stateA, e.skill_id) : undefined
    if (pb !== undefined && pa !== undefined) {
      rows.push({
        learner_id: e.student_id, skill_id: e.skill_id, correct: e.correct,
        // compareGrowth wants these two names; the full set rides alongside.
        dkt_p_correct: pa, bkt_p_correct: e.bkt_p_correct,
        live_bkt: e.bkt_p_correct, per_skill_bkt: e.bkt_shadow_p_correct!, dkt_before: pb, dkt_after: pa,
      })
    }
    stateB = stepDkt(before, stateB, e)
    stateA = stepDkt(after, stateA, e)
    seen++
  }
  return rows
}

type Point = { opportunity: number; n: number; actual: number } & Record<ModelKey, number>

function curve(bucketOf: (rows: IndexedOpportunityRow[]) => IndexedOpportunityRow[][], indexed: IndexedOpportunityRow[], minRows: number) {
  const points: Point[] = []
  bucketOf(indexed).forEach((bucket, i) => {
    if (bucket.length < minRows) return
    const mean = (pick: (r: IndexedOpportunityRow) => number) => bucket.reduce((a, r) => a + pick(r), 0) / bucket.length
    const p = { opportunity: i + 1, n: bucket.length, actual: mean(r => (r.correct ? 1 : 0)) } as Point
    for (const m of MODELS) p[m] = mean(r => (r as unknown as Row)[m])
    points.push(p)
  })
  return points
}

function slope(xs: number[], ys: number[], ws: number[]): number {
  const total = ws.reduce((a, b) => a + b, 0)
  const mean = (v: number[]) => v.reduce((a, b, i) => a + b * ws[i], 0) / total
  const xm = mean(xs), ym = mean(ys)
  const variance = xs.reduce((a, x, i) => a + ws[i] * (x - xm) ** 2, 0) / total
  return xs.reduce((a, x, i) => a + ws[i] * (x - xm) * (ys[i] - ym), 0) / total / variance
}

async function main() {
  const rows = await scoredRows()
  const indexed = withOpportunityIndex(rows) as IndexedOpportunityRow[]

  const maxByPair = new Map<string, number>()
  for (const r of indexed) {
    const key = `${r.learner_id}\u0000${r.skill_id}`
    maxByPair.set(key, Math.max(maxByPair.get(key) ?? 0, r.opportunity))
  }
  const cohortRows = indexed.filter(r =>
    (maxByPair.get(`${r.learner_id}\u0000${r.skill_id}`) ?? 0) >= MIN_COHORT_OPPORTUNITIES && r.opportunity <= MIN_COHORT_OPPORTUNITIES)
  const byOpportunity = (limit: number) => (all: IndexedOpportunityRow[]) => {
    const buckets: IndexedOpportunityRow[][] = Array.from({ length: limit }, () => [])
    for (const r of all) if (r.opportunity <= limit) buckets[r.opportunity - 1].push(r)
    return buckets
  }
  const cohort = curve(byOpportunity(MIN_COHORT_OPPORTUNITIES), cohortRows, MIN_COHORT_BUCKET_ROWS)
  const aggregate = curve(byOpportunity(AGGREGATE_MAX_OPPORTUNITY), indexed, MIN_COHORT_BUCKET_ROWS)

  const xs = cohort.map(p => p.opportunity), ws = cohort.map(p => p.n)
  const observedSlope = slope(xs, cohort.map(p => p.actual), ws)
  const slopes = Object.fromEntries(MODELS.map(m => {
    const s = slope(xs, cohort.map(p => p[m]), ws)
    return [m, { slope: s, slopeRatio: s / observedSlope }]
  })) as Record<ModelKey, { slope: number; slopeRatio: number }>

  // Cross-check against the gate's own growth comparison, which uses the same
  // cohort construction through a different code path.
  const gate = compareGrowth(rows)
  const drift = Math.max(
    Math.abs(gate.actualSlope - observedSlope),
    Math.abs(gate.dkt.slopeRatio - slopes.dkt_after.slopeRatio),
    Math.abs(gate.bkt.slopeRatio - slopes.live_bkt.slopeRatio))
  if (!(drift < 1e-9)) {
    console.error(`curve slopes disagree with compareGrowth by ${drift}; refusing to write`)
    process.exit(1)
  }

  const out = {
    synthetic: true, learners, seed, attempts: rows.length, cohortPairs: gate.pairs,
    source: `scripts/learning-curves-before-after.ts; DKT "before" is src/lib/dkt/model/synaptic-dkt.json at git ${BEFORE_REF}, "after" is the bundled model`,
    models: {
      live_bkt: 'Live BKT (one global parameter set)',
      per_skill_bkt: 'BKT with per-skill fitted parameters (shadow arm, synthetic fit)',
      dkt_before: 'DKT before Level 14 (8 epochs, no reconstruction term)',
      dkt_after: 'DKT after Level 14 (10 epochs + early stopping, lambda_r 0.1; the bundled model)',
    },
    cohort: { minOpportunities: MIN_COHORT_OPPORTUNITIES, observedSlope, slopes, points: cohort },
    aggregate: { maxOpportunity: AGGREGATE_MAX_OPPORTUNITY, points: aggregate },
    crossCheck: { against: 'compareGrowth() in src/lib/dkt/compare.ts', maxAbsDifference: drift },
  }
  const dest = path.join(ROOT, 'Research/dkt/results/learning-curves-before-after.json')
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')

  const f = (v: number) => v.toFixed(4)
  console.log(`attempts ${rows.length}, cohort pairs ${gate.pairs}, cross-check drift ${drift.toExponential(1)}`)
  console.log('cohort slope ratios (1.0 = reproduces observed growth):')
  for (const m of MODELS) console.log(`  ${m.padEnd(14)} ${f(slopes[m].slopeRatio)}`)
  console.log('cohort curve  k   actual  ' + MODELS.map(m => m.slice(0, 9).padEnd(9)).join(' '))
  for (const p of cohort) console.log(`  ${String(p.opportunity).padStart(2)} n=${String(p.n).padStart(5)} ${f(p.actual)} ` + MODELS.map(m => f(p[m]).padEnd(9)).join(' '))
  console.log('aggregate curve (first/last): ' + [aggregate[0], aggregate[aggregate.length - 1]].map(p => `k=${p.opportunity} n=${p.n} actual=${f(p.actual)}`).join('  ->  '))
  console.log('wrote ' + path.relative(ROOT, dest))
}

main()
