/**
 * What each behaviour signal does to the evaluation, computed by the app's own
 * functions -- nothing is re-implemented here.
 *
 *   npx tsx scripts/behaviour-effects.ts
 *
 * Writes Research/sim/results/behaviour-effects.json for the lab's Behaviours
 * tab. Four measurements:
 *   1. latency -> SM-2 quality and FSRS rating (bktToQuality / fsrsRatingFromCorrectness)
 *   2. the shadow behaviour-aware tier over hesitation x revisions (adaptiveTier)
 *   3. how far one answer moves p_know under each evidence modifier (bktUpdate)
 *   4. one scripted 12-answer session through the motivation model and BKT, with
 *      the real timing and with the Level 7 bug's ~100 ms timing
 *
 * SYNTHETIC / ILLUSTRATIVE: the session in (4) is hand-written. The functions are real.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bktUpdate, initSkillState } from '../src/lib/bkt'
import { bktToQuality } from '../src/lib/sm2'
import { adaptiveQuality, adaptiveTier, LONG_HESITATION_MS, REPEATED_REVISIONS, type AttemptBehaviorSignals } from '../src/lib/sm2/adaptive'
import { fsrsRatingFromCorrectness, Rating } from '../src/lib/fsrs'
import { deriveBehaviorEvidenceModifier, initMotivationState, SLOW_RESPONSE_THRESHOLD_MS, updateMotivationState } from '../src/lib/motivation'
import { reasoningQualityFromCategory } from '../src/lib/feynman/classifier'
import { CRUSHED_LATENCY_MS } from '../src/lib/sim/run'

const RATING_NAME: Record<number, string> = { [Rating.Again]: 'Again', [Rating.Hard]: 'Hard', [Rating.Good]: 'Good', [Rating.Easy]: 'Easy' }

// 1. latency -> grade, right answers, every 0.5 s to 20 s.
const latencyGrid = Array.from({ length: 41 }, (_, i) => i * 500)
const latencyToGrade = latencyGrid.map(ms => ({
  latency_ms: ms, sm2_quality: bktToQuality(true, ms), fsrs_rating: RATING_NAME[fsrsRatingFromCorrectness(true, ms)],
}))

const sig = (latency_ms: number, hesitation_ms: number, revision_count: number, guided = false): AttemptBehaviorSignals =>
  ({ latency_ms, hesitation_ms, revision_count, guided_reflection: guided })

// 2. adaptive tier matrix (right answers). Only combinations the app can
// actually receive: the server clamps hesitation to the latency it is a prefix
// of, so "long hesitation" on a quick answer cannot occur. Each row is one
// latency; the columns vary what the learner did before and during the answer.
const adaptiveMatrix = [2000, 6000, 12_000].flatMap(latency => [
  { column: 'brief pause, no changes', hesitation_ms: 500, revision_count: 0 },
  { column: 'paused most of the time, no changes', hesitation_ms: latency - 500, revision_count: 0 },
  { column: 'brief pause, changed answer 3 times', hesitation_ms: 500, revision_count: 3 },
].map(c => ({
  latency_ms: latency, ...c,
  live_tier: adaptiveTier(true, sig(latency, 0, 0)), adaptive_tier: adaptiveTier(true, sig(latency, c.hesitation_ms, c.revision_count)),
})))
// The one place long hesitation can matter: guided reflections, which are
// minutes long by design, start at the middle tier instead of one set by duration.
const guidedReflection = [3000, 12_000].map(h => ({ latency_ms: 240_000, hesitation_ms: h, tier: adaptiveTier(true, sig(240_000, h, 0, true)) }))
const wrongAnswerTier = adaptiveTier(false, sig(2000, 1000, 3))

// 3. p_know movement under each evidence modifier, from a grid of priors.
const priors = Array.from({ length: 19 }, (_, i) => +(0.05 + i * 0.05).toFixed(2))
const evidenceCases = [
  { key: 'full', label: 'Full evidence (reasoning 1.0, behaviour 1.0)', reasoningQuality: 1, behavior: 1 },
  { key: 'behaviour_085', label: 'Slow answer (behaviour 0.85)', reasoningQuality: 1, behavior: 0.85 },
  { key: 'behaviour_065', label: 'Slow and struggling (behaviour 0.65)', reasoningQuality: 1, behavior: 0.65 },
  { key: 'reasoning_method_only', label: 'Right answer, method-only explanation', reasoningQuality: reasoningQualityFromCategory('method-only'), behavior: 1 },
  { key: 'reasoning_gap', label: 'Right answer, explanation with a gap', reasoningQuality: reasoningQualityFromCategory('gap'), behavior: 1 },
]
const movement = evidenceCases.map(c => ({
  ...c,
  after_correct: priors.map(p => bktUpdate({ ...initSkillState('x', 's', p) }, true, 0, c).p_know - p),
  after_wrong: priors.map(p => bktUpdate({ ...initSkillState('x', 's', p) }, false, 0, c).p_know - p),
}))

// 4. one session, real timing vs the old ~100 ms signal.
// Hesitation and revisions are scripted too. They do not enter BKT or the
// motivation model (only the shadow scheduling quality reads them), so they are
// carried through to show what /engine would list beside each answer.
const SESSION = [
  { correct: true, latency_ms: 3000, hesitation_ms: 800, revision_count: 0 },
  { correct: true, latency_ms: 4000, hesitation_ms: 1000, revision_count: 3 },
  { correct: true, latency_ms: 18_000, hesitation_ms: 12_000, revision_count: 1 },
  { correct: true, latency_ms: 20_000, hesitation_ms: 9000, revision_count: 3 },
  { correct: false, latency_ms: 17_000, hesitation_ms: 6000, revision_count: 2 },
  { correct: false, latency_ms: 21_000, hesitation_ms: 14_000, revision_count: 1 },
  { correct: false, latency_ms: 16_000, hesitation_ms: 5000, revision_count: 0 },
  { correct: true, latency_ms: 5000, hesitation_ms: 1500, revision_count: 0 },
  { correct: true, latency_ms: 4000, hesitation_ms: 1000, revision_count: 2 },
  { correct: true, latency_ms: 3000, hesitation_ms: 700, revision_count: 0 },
  { correct: true, latency_ms: 4000, hesitation_ms: 900, revision_count: 0 },
  { correct: true, latency_ms: 3000, hesitation_ms: 600, revision_count: 0 },
]
function runSession(signalLatency: (ms: number) => number) {
  let skill = initSkillState('x', 's'), mot = initMotivationState('x')
  return SESSION.map(a => {
    const latency = signalLatency(a.latency_ms)
    const modifier = deriveBehaviorEvidenceModifier(mot, latency)
    skill = bktUpdate(skill, a.correct, 0, { reasoningQuality: 1, behavior: modifier })
    mot = updateMotivationState(mot, a.correct, latency, skill)
    const signals = sig(a.latency_ms, a.hesitation_ms, a.revision_count)
    return { correct: a.correct, real_latency_ms: a.latency_ms, told_latency_ms: latency,
      hesitation_ms: a.hesitation_ms, revision_count: a.revision_count, behavior_modifier: modifier,
      motivation_state: mot.state, slow_response_streak: mot.slow_response_streak, consecutive_errors: mot.consecutive_errors,
      p_know: skill.p_know, live_quality: bktToQuality(a.correct, latency), adaptive_quality: adaptiveQuality(a.correct, signals) }
  })
}
const session = { measured: runSession(ms => ms), speed_lost: runSession(() => CRUSHED_LATENCY_MS) }

const out = {
  synthetic: true, illustration: true,
  note: 'Computed by the app\'s own functions. The 12-answer session is hand-written, so it illustrates mechanism and is not a measurement of learners.',
  thresholds: { slow_response_ms: SLOW_RESPONSE_THRESHOLD_MS, long_hesitation_ms: LONG_HESITATION_MS, repeated_revisions: REPEATED_REVISIONS, easy_under_ms: 3000, good_under_ms: 8000, crushed_latency_ms: CRUSHED_LATENCY_MS },
  latency_to_grade: latencyToGrade,
  adaptive_matrix: adaptiveMatrix, guided_reflection: guidedReflection, wrong_answer_tier: wrongAnswerTier,
  priors, movement, session,
}
const dest = path.resolve(__dirname, '../Research/sim/results/behaviour-effects.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')
console.log('adaptive matrix (live -> adaptive):', adaptiveMatrix.map(m => `${m.latency_ms / 1000}s h${m.hesitation_ms / 1000}s r${m.revision_count}: ${m.live_tier}->${m.adaptive_tier}`).join(' | '))
console.log('guided', JSON.stringify(guidedReflection), 'wrong', wrongAnswerTier)
for (const [k, rows] of Object.entries(session)) console.log(k.padEnd(11), rows.map(r => `${r.motivation_state[0]}${r.behavior_modifier.toFixed(2)}/${r.p_know.toFixed(2)}`).join(' '))
console.log('movement @p=0.5 correct:', movement.map(m => `${m.key}=${m.after_correct[9].toFixed(3)}`).join(' '))
console.log('wrote ' + path.relative(process.cwd(), dest))
