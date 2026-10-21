/**
 * Level 13: one demo learner with a full engine history, so /engine has
 * something to show the moment a database is connected.
 *
 *   npx tsx scripts/seed-demo.ts [--days 45] [--seed 4242] [--email demo@synaptic.local]
 *   npx tsx scripts/seed-demo.ts --dry-run    (builds every row, writes nothing)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local and
 * migrations 001-007 applied.
 *
 * EVERY ROW IT WRITES IS SYNTHETIC. The outcomes and response times come from
 * src/lib/sim/learner.ts — the simulator's learner model, reused rather than a
 * second invented one — and are then run through the app's own engine modules
 * (BKT, SM-2, FSRS, motivation, the Level 11 adaptive quality, DKT shadow, and
 * the rule-based explanation classifier), so the rows are exactly the shape the
 * live route writes. No real learner behaviour is represented here.
 */
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'

const ROOT = path.resolve(__dirname, '..')
for (const line of fs.existsSync(path.join(ROOT, '.env.local'))
  ? fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const eq = line.indexOf('=')
  if (eq > 0 && !line.trim().startsWith('#')) process.env[line.slice(0, eq).trim()] ??= line.slice(eq + 1).trim()
}
const dryRun = process.argv.includes('--dry-run')
if (!dryRun && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local.')
  process.exit(1)
}

import { getDb, generateId } from '../src/lib/db'
import { bktUpdate, initSkillState } from '../src/lib/bkt'
import { bktToQuality, initSM2, reconcileBktSm2 } from '../src/lib/sm2'
import { adaptiveFsrsRating, adaptiveQuality } from '../src/lib/sm2/adaptive'
import { computeFsrsSchedule, fsrsRatingFromCorrectness, type FsrsCardState } from '../src/lib/fsrs'
import { buildAttemptBehaviorSnapshot, deriveBehaviorEvidenceModifier, updateMotivationState } from '../src/lib/motivation'
import { classifyExplanation, reasoningQualityFromCategory } from '../src/lib/feynman/classifier'
import { initialDktState, predictSkill, stepDkt } from '../src/lib/dkt'
import { getBundledDktModel } from '../src/lib/dkt/shadow'
import { simulate } from '../src/lib/sim/run'
import { curriculumSkills } from '../src/lib/sim/skills'
import type { LearnerSkillState, MotivationState, ReviewSchedule } from '../src/types'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

// One explanation in six, so the Reasoning section has both grades to show.
const EXPLAIN_EVERY = 6
const EXPLANATIONS = [
  'It matters because the computer has no idea what the name means — the label is just how I find the value again.',
  'You follow the steps: set it up, run it, then read the result.',
  'I think it is about memory, but I am not really sure how it works.',
]

async function main() {
  const email = arg('email', 'demo@synaptic.local')
  const days = Number(arg('days', '45'))
  const seed = Number(arg('seed', '4242'))
  const db = dryRun ? null : getDb()
  const model = await getBundledDktModel()

  const { events } = simulate({ seed, learners: 1, days, scheduler: 'sm2', skills: curriculumSkills() })
  if (events.length === 0) { console.error('The simulated learner studied nothing; try a larger --days.'); process.exit(1) }

  const learnerId = generateId()
  const profile = {
    id: learnerId, email, display_name: 'Demo (synthetic)',
    password_hash: bcrypt.hashSync('demo-synthetic', 10),
    created_at: events[0].timestamp, diagnostic_done: true,
    entry_node: events[0].skill_id, streak_days: 0,
    last_session_at: events[events.length - 1].timestamp, graph_version: 1,
  }

  const skillStates = new Map<string, LearnerSkillState>()
  const schedules = new Map<string, ReviewSchedule>()
  const fsrsCards = new Map<string, FsrsCardState | null>()
  let motivation: MotivationState = {
    learner_id: learnerId, state: 'neutral', consecutive_errors: 0,
    slow_response_streak: 0, intervention_cooldown_until: null,
    updated_at: events[0].timestamp,
  }
  let dktState = initialDktState(model)
  let seen = 0

  const attemptRows: Record<string, unknown>[] = []
  const gradeRows: Record<string, unknown>[] = []
  const behaviorRows: Record<string, unknown>[] = []
  const fsrsRows: Record<string, unknown>[] = []
  const dktRows: Record<string, unknown>[] = []

  events.forEach((event, index) => {
    const now = new Date(event.timestamp)
    const skillId = event.skill_id
    const before = skillStates.get(skillId) ?? initSkillState(learnerId, skillId)
    const schedule = schedules.get(skillId) ?? initSM2(learnerId, skillId, now)

    const isExplain = index % EXPLAIN_EVERY === 0
    const explanationText = EXPLANATIONS[index % EXPLANATIONS.length]
    const category = isExplain ? classifyExplanation(explanationText) : null
    const correct = isExplain ? category === 'meaning-included' : event.correct
    const reasoningQuality = category ? reasoningQualityFromCategory(category) : 1

    // Hesitation and revisions are not in the simulator's learner model, so
    // they are derived deterministically from the attempt here and are the one
    // part of this history with no behavioural basis at all.
    const latency = event.latency_ms
    const hesitation = Math.round(latency * (index % 5 === 0 ? 0.55 : 0.15))
    const revisions = index % 7 === 0 ? 2 : index % 3 === 0 ? 1 : 0

    const behaviorModifier = deriveBehaviorEvidenceModifier(motivation, latency)
    const after = bktUpdate(before, correct, schedule.repetitions, { reasoningQuality, behavior: behaviorModifier })
    motivation = { ...updateMotivationState(motivation, correct, latency, after), updated_at: event.timestamp }

    const signals = {
      latency_ms: latency, hesitation_ms: hesitation,
      revision_count: revisions, guided_reflection: false,
    }
    const liveQuality = bktToQuality(correct, latency)
    const behaviorQuality = adaptiveQuality(correct, signals)
    const liveSchedule = reconcileBktSm2(after.p_know, before.mastery_state === 'mastered', schedule, liveQuality, now)
    const adaptiveSchedule = behaviorQuality === liveQuality
      ? liveSchedule
      : reconcileBktSm2(after.p_know, before.mastery_state === 'mastered', schedule, behaviorQuality, now)
    const fsrs = computeFsrsSchedule(fsrsCards.get(skillId) ?? null, fsrsRatingFromCorrectness(correct, latency), now)

    const attemptId = generateId()
    const snapshot = buildAttemptBehaviorSnapshot(motivation, behaviorModifier, hesitation)
    attemptRows.push({
      id: attemptId, learner_id: learnerId, skill_id: skillId,
      question_id: `${skillId}_${isExplain ? 'explain1' : `q${(index % 5) + 1}`}`,
      session_id: null, correct, latency_ms: latency, revision_count: revisions,
      error_type: null, difficulty_tier: event.is_review ? 'review' : 'same',
      question_format: isExplain ? 'explain' : 'mcq', attempted_at: event.timestamp,
      p_know_before: before.p_know, p_know_after: after.p_know, ...snapshot,
    })
    if (isExplain && category) {
      gradeRows.push({
        id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
        explanation_text: explanationText, prior_explanation_text: null,
        category, confidence: 0, reasoning_quality: reasoningQuality,
        rationale: 'rule-based classifier (no model key in the seeding environment)',
        prompt_version: 'none', served_by: 'rule-based-fallback', from_cache: false,
        grader_latency_ms: 0, created_at: event.timestamp,
      })
    }
    behaviorRows.push({
      id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
      correct, latency_ms: latency, hesitation_ms: hesitation, revision_count: revisions,
      guided_reflection: false, live_quality: liveQuality, adaptive_quality: behaviorQuality,
      live_fsrs_rating: fsrsRatingFromCorrectness(correct, latency),
      adaptive_fsrs_rating: adaptiveFsrsRating(correct, signals),
      live_interval_days: liveSchedule.interval_days,
      adaptive_interval_days: adaptiveSchedule.interval_days,
      applied: false, created_at: event.timestamp,
    })
    fsrsRows.push({
      id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
      sm2_interval_days: liveSchedule.interval_days, fsrs_interval_days: fsrs.interval_days,
      fsrs_stability: fsrs.stability, fsrs_difficulty: fsrs.difficulty,
      fsrs_due_at: fsrs.due_at, created_at: event.timestamp,
    })
    // Same protocol as the live shadow hook: predict from everything before
    // this attempt, so a learner's first attempt has no history to use.
    const dktP = seen > 0 ? predictSkill(model, dktState, skillId) : undefined
    if (dktP !== undefined) {
      dktRows.push({
        id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
        dkt_p_correct: dktP,
        bkt_p_correct: before.p_know * (1 - before.p_slip) + (1 - before.p_know) * before.p_guess,
        correct, history_length: seen, model_synthetic: model.synthetic, created_at: event.timestamp,
      })
    }
    dktState = stepDkt(model, dktState, { skill_id: skillId, correct })
    seen++

    skillStates.set(skillId, { ...after, last_attempted_at: event.timestamp })
    schedules.set(skillId, liveSchedule)
    fsrsCards.set(skillId, { stability: fsrs.stability, difficulty: fsrs.difficulty, last_review: event.timestamp })
  })

  async function insertAll(table: string, rows: Record<string, unknown>[]) {
    if (!db) return
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 500))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }

  if (db) {
    // Replacing the demo learner cascades every row keyed on it.
    await db.from('learner_profiles').delete().eq('email', email)
    await db.from('learner_profiles').insert(profile)
    await db.from('learner_skill_states').insert([...skillStates.values()])
    await db.from('review_schedules').insert([...schedules.values()])
    await db.from('motivation_states').insert(motivation)
  }
  await insertAll('attempt_events', attemptRows)
  await insertAll('explanation_grades', gradeRows)
  await insertAll('behavior_quality_shadow', behaviorRows)
  await insertAll('fsrs_shadow_log', fsrsRows)
  await insertAll('dkt_shadow_log', dktRows)

  console.log(dryRun
    ? `DRY RUN — nothing written. SYNTHETIC demo learner ${email}:`
    : `Seeded SYNTHETIC demo learner ${email} (password: demo-synthetic)`)
  console.log(`  ${attemptRows.length} attempts across ${skillStates.size} skills over ${days} days (seed ${seed})`)
  console.log(`  ${gradeRows.length} graded explanations, ${behaviorRows.length} behaviour-quality rows,`)
  console.log(`  ${fsrsRows.length} FSRS shadow rows, ${dktRows.length} DKT shadow rows`)
  console.log(dryRun ? '  Re-run without --dry-run to write them.' : '  Sign in and open /engine.')
}

main().catch(error => { console.error(error); process.exit(1) })
