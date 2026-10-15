/**
 * DKT-11 demo: runs the bundled DKT model (src/lib/dkt/model/synaptic-dkt.json)
 * in TypeScript on one simulated learner's history and prints what it predicts
 * for their next attempt on each skill, next to live BKT's estimate.
 * No database or Python needed. The model is trained on simulated learners.
 *
 * Usage: npx tsx scripts/dkt-predict.ts [--attempts 60] [--seed 7]
 */
import { getBundledDktModel } from '../src/lib/dkt/shadow'
import { predictNext } from '../src/lib/dkt'
import { simulate } from '../src/lib/sim/run'
import { curriculumSkills } from '../src/lib/sim/skills'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

async function main() {
  const model = await getBundledDktModel()
  const { events } = simulate({ seed: arg('seed', 7), learners: 1, days: 60, scheduler: 'sm2', skills: curriculumSkills() })
  const history = events.slice(0, arg('attempts', 60))
  const predictions = predictNext(model, history.map(e => ({ skill_id: e.skill_id, correct: e.correct })))

  const practiced = [...new Set(history.map(e => e.skill_id))]
  const lastBkt = new Map(history.map(e => [e.skill_id, e.bkt_p_correct]))
  console.log(`Model trained on ${model.synthetic ? 'SIMULATED' : 'real'} learners; ${model.skills.length} skills.`)
  console.log(`Learner history: ${history.length} attempts on ${practiced.length} skills ` +
    `(${history.filter(e => e.correct).length} correct).\n`)
  console.log('Practiced skills — P(correct on next attempt):')
  console.log('  skill'.padEnd(42) + 'DKT     BKT (before last attempt)')
  for (const s of practiced) {
    console.log(`  ${s.padEnd(40)}${predictions.get(s)!.toFixed(3)}   ${lastBkt.get(s)!.toFixed(3)}`)
  }
  const unseen = model.skills.filter(s => !practiced.includes(s))
    .map(s => [s, predictions.get(s)!] as const).sort((a, b) => b[1] - a[1]).slice(0, 5)
  // Caveat printed with the numbers: in training data only stronger learners
  // reach advanced skills, so DKT's estimates for unpracticed skills run high.
  console.log('\nNot yet practiced — highest predicted P(correct). BKT has no estimate for these;')
  console.log('DKT does, but they run high: in the training data only stronger learners reached advanced skills.')
  for (const [s, p] of unseen) console.log(`  ${s.padEnd(40)}${p.toFixed(3)}`)
}

main()
