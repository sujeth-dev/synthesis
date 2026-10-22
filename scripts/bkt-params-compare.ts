/**
 * Level 16: the app's one-global-parameter-set BKT against a per-skill
 * EM-fitted one, on the same attempts, by ranking AND by growth.
 *
 *   npx tsx scripts/bkt-params-compare.ts [--learners 300] [--seed 9001]
 *
 * Same population and seed as `npm run dkt:compare -- --sim`, so all three
 * models (live BKT, fitted BKT, DKT) are comparable on one page. SYNTHETIC:
 * simulated learners with a hand-written memory model, not evidence about real
 * learners -- and the committed parameter file is itself fitted on that
 * simulator, which is why src/lib/bkt/params.ts refuses to apply it live.
 *
 * Writes Research/bkt/results/per-skill-params.{md,json}.
 */
import fs from 'node:fs'
import path from 'node:path'
import { LIVE_PARAMS, fittedParamsProvenance, hasFittedParams, paramsFor } from '../src/lib/bkt/params'
import { compareGrowth, type OpportunityRow } from '../src/lib/dkt/compare'
import { auc, logLoss } from '../src/lib/sim/metrics'
import { simulate } from '../src/lib/sim/run'
import { curriculumSkills } from '../src/lib/sim/skills'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const ROOT = path.resolve(__dirname, '..')
const learners = arg('learners', 300)
const seed = arg('seed', 9001)

const { events } = simulate({
  seed, learners, days: 90, scheduler: 'sm2', skills: curriculumSkills(),
  // Both arms are traced inside one run, so they see the identical attempts in
  // the identical order and receive the identical overdue decay. Replaying the
  // events afterwards was tried first and was wrong: the live engine decays
  // p_know on an overdue load, so a replay without that measured parameters
  // against decay (max drift 0.44 against the simulator's own predictions).
  shadowBktParams: paramsFor,
})
const live = events.map(e => e.bkt_p_correct)
const fitted = events.map(e => e.bkt_shadow_p_correct!)

const score = (predicted: number[]) => {
  const pairs = predicted.map((p, i) => ({ predicted: p, actual: events[i].correct }))
  return { auc: auc(pairs), logLoss: logLoss(pairs) }
}
const growthOf = (predicted: number[]) => {
  // compareGrowth wants two model columns; pass the arm under test as both and
  // read the one ratio, so the cohort construction is shared with the DKT gate
  // rather than reimplemented here.
  const rows: OpportunityRow[] = events.map((e, i) => ({
    learner_id: e.student_id, skill_id: e.skill_id, correct: e.correct,
    dkt_p_correct: predicted[i], bkt_p_correct: predicted[i],
  }))
  return compareGrowth(rows)
}

const liveScore = score(live), fittedScore = score(fitted)
const liveGrowth = growthOf(live), fittedGrowth = growthOf(fitted)
const provenance = fittedParamsProvenance()
const fittedSkills = curriculumSkills().filter(s => hasFittedParams(s.id)).length

const report = [
  '# Live BKT vs per-skill fitted BKT (Level 16)\n',
  `**SYNTHETIC** -- ${learners} simulated learners (seed ${seed}) over the real ${curriculumSkills().length}-skill ` +
  'curriculum, both arms traced inside one run through the app\'s own `bktUpdate`. Not evidence about real learners.\n',
  `Parameters: ${fittedSkills} of ${curriculumSkills().length} skills fitted by EM from ` +
  `\`${provenance.source}\` (${provenance.rows} rows, ${provenance.learners} learners, ` +
  `${provenance.synthetic ? '**synthetic**' : 'real'}); skills with fewer than ` +
  `${provenance.min_sequences} sequences keep the global set.\n`,
  `The live engine uses one parameter set for every skill: p_transit ${LIVE_PARAMS.p_transit}, ` +
  `p_slip ${LIVE_PARAMS.p_slip}, p_guess ${LIVE_PARAMS.p_guess}, initial p_know ${LIVE_PARAMS.p_init}.\n`,
  `Attempts: ${events.length}.\n`,
  '| Model | AUC | Log-loss | Cohort slope | Slope ratio |', '|---|---|---|---|---|',
  `| Live BKT (one global set) | ${liveScore.auc.toFixed(4)} | ${liveScore.logLoss.toFixed(4)} | ` +
  `${liveGrowth.bkt.slope.toFixed(5)} | ${liveGrowth.bkt.slopeRatio.toFixed(4)} |`,
  `| Per-skill fitted BKT | ${fittedScore.auc.toFixed(4)} | ${fittedScore.logLoss.toFixed(4)} | ` +
  `${fittedGrowth.bkt.slope.toFixed(5)} | ${fittedGrowth.bkt.slopeRatio.toFixed(4)} |`,
  '',
  `Observed cohort slope ${liveGrowth.actualSlope.toFixed(5)} over ${liveGrowth.points} points, ` +
  `${liveGrowth.pairs} (learner, skill) pairs.`,
  '',
  'Both arms are traced inside one simulator run, so they see the identical attempts in',
  'the identical order and take the identical overdue `p_know` decay; only the parameters',
  'differ. The shadow arm never influences which skill is served or when.',
  '',
  'Nothing is switched by this report. `BKT_PER_SKILL=1` applies the fitted set, and',
  '`src/lib/bkt/params.ts` refuses even then while the parameter file is fitted on',
  'simulator output -- those parameters describe the simulator\'s memory model, not',
  'learners. A live switch needs a file fitted from real `attempt_events` rows and',
  'human sign-off (`DEVELOPMENT_LOOP.md:113`).',
].join('\n') + '\n'

console.log(report)
const dir = path.join(ROOT, 'Research/bkt/results')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'per-skill-params.md'), report)
fs.writeFileSync(path.join(dir, 'per-skill-params.json'), JSON.stringify({
  synthetic: true, learners, seed, attempts: events.length, provenance, fittedSkills,
  live: { ...liveScore, slope: liveGrowth.bkt.slope, slopeRatio: liveGrowth.bkt.slopeRatio },
  fitted: { ...fittedScore, slope: fittedGrowth.bkt.slope, slopeRatio: fittedGrowth.bkt.slopeRatio },
  observedSlope: liveGrowth.actualSlope, cohortPairs: liveGrowth.pairs, curvePoints: liveGrowth.points,
}, null, 2) + '\n')
