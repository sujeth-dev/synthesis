/**
 * Four demo learners with a full, recent history, so every screen has
 * something real-shaped to show: dashboard (next-session card, review
 * forecast, Bloom profile, "How you work"), /profile, /engine and the Exam
 * Room's debriefs.
 *
 *   npx tsx scripts/seed-demo-learners.ts [--dry-run] [--only alex@demo.com [--seed 7]]
 *
 * EVERY ROW IT WRITES IS SYNTHETIC. Outcomes and response times come from the
 * simulator's learner model (src/lib/sim/learner.ts). Everything else is the
 * app's own code, run in the order the routes run it:
 *  - each session asks the live selector (selectNextTaskDetailed + the score
 *    ranker, SELECTOR=score) what to serve, including review batches and the
 *    pinned guided arc;
 *  - each answer goes through BKT, SM-2, FSRS, motivation, the behaviour
 *    discount, the rule-based explanation classifier and every shadow log;
 *  - each exam is run by the exam policy and debriefed by buildDebrief.
 *
 * Two things are deliberately not written. question_ratings is shared across
 * all learners and is real calibration data, so synthetic answers stay out of
 * it (and learner_ability with it). Explanations are graded by the rule-based
 * classifier, with confidence 0, the sentinel for "no model graded this".
 *
 * Replaces each persona's profile by email; ON DELETE CASCADE removes their old
 * rows. Nobody else is touched.
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

import { createClient } from '@supabase/supabase-js'
import { generateId } from '../src/lib/db'
import { getAllNodes, getHardPrereqs, computeUnblocked, placeLearner } from '../src/lib/graph'
import { bktUpdate, initSkillState } from '../src/lib/bkt'
import { hasFittedParams, paramsFor, fittedParamsProvenance } from '../src/lib/bkt/params'
import { bktToQuality, initSM2, reconcileBktSm2, reconcileBktSm2OnLoad } from '../src/lib/sm2'
import { adaptiveFsrsRating, adaptiveQuality } from '../src/lib/sm2/adaptive'
import { computeFsrsSchedule, fsrsRatingFromCorrectness, type FsrsCardState } from '../src/lib/fsrs'
import {
  buildAttemptBehaviorSnapshot, deriveBehaviorEvidenceModifier, initMotivationState, updateMotivationState,
} from '../src/lib/motivation'
import { classifyExplanation, reasoningQualityFromCategory } from '../src/lib/feynman/classifier'
import { initialDktState, predictSkill, stepDkt } from '../src/lib/dkt'
import { getBundledDktModel } from '../src/lib/dkt/shadow'
import {
  DEFAULT_REVIEW_OFFER_SIZE, SESSION_TASK_CAP, canChooseTopicSwitch, getGuidedArcProgress,
  selectNextTaskDetailed, type ArcAttemptEvidence,
} from '../src/lib/session/engine'
import { scoreRanker } from '../src/lib/session/selector'
import { buildSelectionShadowRow } from '../src/lib/session/shadow'
import { ELO_START } from '../src/lib/elo'
import { PHASE_EVALUATION_FILES, type PhaseKey } from '../src/lib/phases'
import {
  checkpointTimeLimitSec, chooseNextItem, coldStartExamRating, examAbility, isHintAbuse, stopReason,
  BLOOM_ORDER, type ExamMode, type StopReason,
} from '../src/lib/exam/policy'
import { pCorrect } from '../src/lib/exam/ability'
import { buildDebrief } from '../src/lib/exam/debrief'
import { createRng, type Rng } from '../src/lib/sim/rng'
import {
  practice, sampleLearnerParams, trueRecallProbability, type LearnerArchetype, type LearnerParams, type TrueSkillMemory,
} from '../src/lib/sim/learner'
import type {
  LearnerSkillState, MotivationState, PhaseEvaluationQuestion, Question, ReviewSchedule, SessionMode,
} from '../src/types'

// ─── A simulated clock behind `Date` ─────────────────────────────────────────
// The engine stamps times with `new Date()` (bktUpdate's last_attempted_at, the
// motivation cooldown). Run on the wall clock, one frustrated streak early in a
// simulated month would keep every later answer inside a ten-minute cooldown
// measured in real time. While simulating, `new Date()` and `Date.now()` read
// the simulated clock; the real one is restored before anything is written.
const RealDate = Date
const realRandom = Math.random
let simNow: number | null = null
class SimDate extends RealDate {
  constructor(...args: unknown[]) {
    super(...((args.length === 0 && simNow !== null ? [simNow] : args) as [number]))
  }
  static now(): number { return simNow ?? RealDate.now() }
}
function useSimClock(on: boolean) { globalThis.Date = (on ? SimDate : RealDate) as DateConstructor }

const DAY_MS = 86_400_000
const EXAM_GUESS = 0.25
const MAX_LATENCY = 5 * 60 * 1000
const QUESTIONS_DIR = path.join(ROOT, 'content', 'questions', 'by-skill')
const PHASE_EVAL_DIR = path.join(ROOT, 'content', 'questions', 'phase-evaluation')

interface ExamPlan {
  phase: PhaseKey
  mode: ExamMode
  /** Days before today. */
  daysAgo: number
  /** True ability on the exam's normal-ogive scale. */
  theta: number
  /** How much harder each step up Bloom's levels is for this learner. */
  levelDrop: number
  /** Answer time as a multiple of each item's target. */
  pace: number
  /** Chance of asking for a hint on an item (practice only). */
  hintRate: number
  /** Asks for hints within seconds of seeing the item. */
  rapidHints: boolean
}

interface Persona {
  email: string
  name: string
  password: string
  archetype: LearnerArchetype
  days: number
  seed: number
  /** Hour of day sessions usually start. */
  hour: number
  /** P(correct) on the placement test. */
  placement: number
  /** Share of an answer spent before the first interaction. */
  hesitation: [number, number]
  /** P(changing an answer) per question. */
  revisionRate: number
  /** P(writing the reflection after a completed guided arc). */
  reflectionRate: number
  /** Adjustments to the sampled simulator learner, to make the personas distinct. */
  tune?: Partial<LearnerParams>
  exams: ExamPlan[]
}

// Seeds were chosen so the four end in different moods (Sam frustrated, Alex
// and Jordan bored, Demo neutral) and the dashboard shows each kind of next
// step. Most seeds end frustrated: the motivation model enters it after three
// misses, and the last session of a simulated month usually contains three.
const PERSONAS: Persona[] = [
  {
    email: 'alex@demo.com', name: 'Alex Chen', password: 'demo1234', archetype: 'fast',
    days: 35, seed: 101, hour: 19, placement: 0.75, hesitation: [0.08, 0.2], revisionRate: 0.08, reflectionRate: 0.7,
    tune: { learnRate: 0.6, slip: 0.04, speed: 0.7, studyProbability: 0.8 },
    exams: [
      { phase: 'phase_1_computer_basics', mode: 'practice', daysAgo: 12, theta: 0.7, levelDrop: 0.08, pace: 0.8, hintRate: 0.1, rapidHints: false },
      { phase: 'phase_1_computer_basics', mode: 'checkpoint', daysAgo: 4, theta: 1.0, levelDrop: 0.06, pace: 0.85, hintRate: 0, rapidHints: false },
    ],
  },
  {
    email: 'sam@demo.com', name: 'Sam Rivera', password: 'demo1234', archetype: 'slow',
    days: 30, seed: 202, hour: 21, placement: 0.3, hesitation: [0.3, 0.6], revisionRate: 0.35, reflectionRate: 0.3,
    tune: { learnRate: 0.15, slip: 0.14, speed: 1.5, studyProbability: 0.6 },
    exams: [
      { phase: 'phase_1_computer_basics', mode: 'practice', daysAgo: 6, theta: -0.5, levelDrop: 0.22, pace: 1.6, hintRate: 0.55, rapidHints: true },
    ],
  },
  {
    email: 'jordan@demo.com', name: 'Jordan Park', password: 'demo1234', archetype: 'forgetful',
    days: 42, seed: 306, hour: 8, placement: 0.55, hesitation: [0.12, 0.35], revisionRate: 0.15, reflectionRate: 0.5,
    tune: { studyProbability: 0.5 },
    exams: [
      { phase: 'phase_1_computer_basics', mode: 'checkpoint', daysAgo: 20, theta: 0.1, levelDrop: 0.12, pace: 1.25, hintRate: 0, rapidHints: false },
      { phase: 'phase_1_computer_basics', mode: 'practice', daysAgo: 3, theta: 0.3, levelDrop: 0.1, pace: 1.0, hintRate: 0.3, rapidHints: false },
    ],
  },
  {
    email: 'demo@synaptic.local', name: 'Demo (synthetic)', password: 'demo-synthetic', archetype: 'average',
    days: 45, seed: 305, hour: 17, placement: 0.5, hesitation: [0.1, 0.3], revisionRate: 0.15, reflectionRate: 0.5,
    exams: [
      { phase: 'phase_1_computer_basics', mode: 'practice', daysAgo: 15, theta: 0.0, levelDrop: 0.15, pace: 1.1, hintRate: 0.35, rapidHints: false },
      { phase: 'phase_1_computer_basics', mode: 'checkpoint', daysAgo: 2, theta: 0.4, levelDrop: 0.12, pace: 1.05, hintRate: 0, rapidHints: false },
    ],
  },
]

// Free-text answers for explain questions and reflections. Which one is used
// follows the simulated outcome; the grade is whatever the classifier makes of it.
const GOOD_EXPLANATIONS = [
  'It matters because the computer has no idea what the name means — the label is just how I find the value again.',
  'This works because each step changes the state, so the result depends on what came before — that is why the order matters.',
  'The reason is that the machine only follows exact instructions, which means it cannot guess what I intended.',
]
const WEAK_EXPLANATIONS = [
  'You follow the steps: set it up, run it, then read the result.',
  'I think it is about memory, but I am not really sure how it works.',
]

function loadQuestions(skillId: string): Question[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, `${skillId}.json`), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadBank(phase: PhaseKey): PhaseEvaluationQuestion[] {
  const file = PHASE_EVALUATION_FILES[phase]
  if (!file) throw new Error(`No exam bank for ${phase}`)
  return JSON.parse(fs.readFileSync(path.join(PHASE_EVAL_DIR, file), 'utf8'))
}

type Row = Record<string, unknown>

interface Rows {
  profile: Row
  states: LearnerSkillState[]
  schedules: ReviewSchedule[]
  motivation: MotivationState
  sessions: Row[]
  attempts: Row[]
  grades: Row[]
  behaviour: Row[]
  params: Row[]
  fsrs: Row[]
  dkt: Row[]
  selection: Row[]
  examRuns: Row[]
  examItems: Row[]
}

function between(rng: Rng, [low, high]: [number, number]): number {
  return low + rng.next() * (high - low)
}

async function buildPersona(persona: Persona, dayStart: number): Promise<Rows> {
  const rng = createRng(persona.seed)
  const params = { ...sampleLearnerParams(rng, persona.archetype), ...persona.tune }
  // The engine picks a question within a tier with Math.random; seeding it
  // makes a persona the same history on every run.
  const engineRng = createRng(persona.seed * 7 + 1)
  Math.random = () => engineRng.next()
  const model = await getBundledDktModel()
  const learnerId = generateId()
  const nodes = getAllNodes().filter(node => !node.deprecated)
  const start = dayStart - persona.days * DAY_MS

  // ── Placement, through the same placeLearner the diagnostic route uses.
  simNow = start + persona.hour * 3_600_000
  const diagnostic = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'questions', 'diagnostic', 'questions.json'), 'utf8')) as
    { skill_id: string; graph_placement_weight?: Record<string, number> }[]
  const placement = placeLearner(diagnostic.map(q => ({
    skill_id: q.skill_id, correct: rng.next() < persona.placement, graph_placement_weight: q.graph_placement_weight,
  })))
  const states = new Map<string, LearnerSkillState>()
  const schedules = new Map<string, ReviewSchedule>()
  for (const node of nodes) {
    const prereqs = getHardPrereqs(node.id)
    const blocked = prereqs.length > 0 && prereqs.some(pid => (placement.skill_scores[pid] ?? 0.05) < 0.40)
    states.set(node.id, initSkillState(learnerId, node.id, placement.skill_scores[node.id], blocked))
    schedules.set(node.id, initSM2(learnerId, node.id, new Date(simNow)))
  }
  let motivation = initMotivationState(learnerId)

  const questionsCache = new Map<string, Question[]>()
  for (const node of nodes) {
    const qs = loadQuestions(node.id)
    if (qs.length > 0) questionsCache.set(node.id, qs)
  }

  const rows: Rows = {
    profile: {}, states: [], schedules: [], motivation, sessions: [], attempts: [], grades: [],
    behaviour: [], params: [], fsrs: [], dkt: [], selection: [], examRuns: [], examItems: [],
  }
  const memories = new Map<string, TrueSkillMemory>()
  const fsrsCards = new Map<string, FsrsCardState>()
  let dktState = initialDktState(model)
  let dktSeen = 0
  const studyDays: number[] = []
  let lastSessionAt = simNow

  function answer(
    skillId: string, question: { id: string; format: string }, difficultyTier: string,
    sessionId: string, reflection: boolean,
  ): boolean {
    const clock = simNow!
    const nowDays = (clock - start) / DAY_MS
    const prereqRecall = getHardPrereqs(skillId).reduce(
      (p, id) => p * Math.max(0.05, trueRecallProbability(memories.get(id), nowDays)), 1)
    const outcome = practice(rng, params, memories.get(skillId), nowDays, prereqRecall)
    memories.set(skillId, outcome.memory)

    const isExplain = question.format === 'explain'
    const text = isExplain ? rng.pick(outcome.correct ? GOOD_EXPLANATIONS : WEAK_EXPLANATIONS) : null
    const category = text ? classifyExplanation(text) : null
    const correct = category ? category === 'meaning-included' : outcome.correct
    const reasoningQuality = category ? reasoningQualityFromCategory(category) : 1

    const latency = Math.min(MAX_LATENCY, Math.max(100, Math.round(outcome.latencyMs * (isExplain ? 3 : 1))))
    const hesitation = Math.min(latency, Math.round(latency * between(rng, persona.hesitation)))
    const revisions = rng.next() < persona.revisionRate ? (rng.next() < 0.3 ? 2 : 1) : 0

    const state = states.get(skillId)!
    const schedule = schedules.get(skillId)!
    const wasMastered = state.mastery_state === 'mastered'
    const behaviorModifier = deriveBehaviorEvidenceModifier(motivation, latency)
    const evidence = { reasoningQuality, behavior: behaviorModifier }
    const fitted = paramsFor(skillId)
    const live = bktUpdate(state, correct, schedule.repetitions, evidence)
    const fittedUpdated = hasFittedParams(skillId)
      ? bktUpdate({ ...state, p_transit: fitted.p_transit, p_slip: fitted.p_slip, p_guess: fitted.p_guess }, correct, schedule.repetitions, evidence)
      : live

    const signals = { latency_ms: latency, hesitation_ms: hesitation, revision_count: revisions, guided_reflection: reflection }
    const liveQuality = bktToQuality(correct, latency)
    const behaviorQuality = adaptiveQuality(correct, signals)
    const liveSchedule = reconcileBktSm2(live.p_know, wasMastered, schedule, liveQuality, new Date(clock))
    const adaptiveSchedule = behaviorQuality === liveQuality
      ? liveSchedule
      : reconcileBktSm2(live.p_know, wasMastered, schedule, behaviorQuality, new Date(clock))
    const fsrs = computeFsrsSchedule(fsrsCards.get(skillId) ?? null, fsrsRatingFromCorrectness(correct, latency), new Date(clock))

    motivation = updateMotivationState(motivation, correct, latency, live)
    const snapshot = buildAttemptBehaviorSnapshot(motivation, behaviorModifier, hesitation)
    const at = new Date(clock).toISOString()
    const attemptId = generateId()

    rows.attempts.push({
      id: attemptId, learner_id: learnerId, skill_id: skillId, question_id: question.id,
      session_id: sessionId, correct, latency_ms: latency, revision_count: revisions, error_type: null,
      difficulty_tier: difficultyTier, question_format: question.format, attempted_at: at,
      p_know_before: state.p_know, p_know_after: live.p_know, ...snapshot,
    })
    if (text && category) {
      rows.grades.push({
        id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
        explanation_text: text, prior_explanation_text: null, category, confidence: 0,
        reasoning_quality: reasoningQuality, rationale: 'rule-based classifier (synthetic demo data, no model graded this)',
        prompt_version: 'none', served_by: 'rule-based-fallback', from_cache: false, grader_latency_ms: 0, created_at: at,
      })
    }
    rows.behaviour.push({
      id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
      correct, latency_ms: latency, hesitation_ms: hesitation, revision_count: revisions, guided_reflection: reflection,
      live_quality: liveQuality, adaptive_quality: behaviorQuality,
      live_fsrs_rating: fsrsRatingFromCorrectness(correct, latency), adaptive_fsrs_rating: adaptiveFsrsRating(correct, signals),
      live_interval_days: liveSchedule.interval_days, adaptive_interval_days: adaptiveSchedule.interval_days,
      applied: false, created_at: at,
    })
    rows.params.push({
      id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId, correct,
      p_know_before: state.p_know, live_p_know_after: live.p_know,
      live_p_transit: state.p_transit, live_p_slip: state.p_slip, live_p_guess: state.p_guess,
      fitted_p_know_after: fittedUpdated.p_know, fitted_p_transit: fitted.p_transit,
      fitted_p_slip: fitted.p_slip, fitted_p_guess: fitted.p_guess,
      has_fitted_params: hasFittedParams(skillId), applied: false,
      params_synthetic: fittedParamsProvenance().synthetic, created_at: at,
    })
    rows.fsrs.push({
      id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId,
      sm2_interval_days: liveSchedule.interval_days, fsrs_interval_days: fsrs.interval_days,
      fsrs_stability: fsrs.stability, fsrs_difficulty: fsrs.difficulty, fsrs_due_at: fsrs.due_at, created_at: at,
    })
    const dktP = dktSeen > 0 ? predictSkill(model, dktState, skillId) : undefined
    if (dktP !== undefined) {
      rows.dkt.push({
        id: generateId(), learner_id: learnerId, skill_id: skillId, attempt_id: attemptId, dkt_p_correct: dktP,
        bkt_p_correct: state.p_know * (1 - state.p_slip) + (1 - state.p_know) * state.p_guess,
        correct, history_length: dktSeen, model_synthetic: model.synthetic, created_at: at,
      })
    }
    dktState = stepDkt(model, dktState, { skill_id: skillId, correct })
    dktSeen += 1

    states.set(skillId, live)
    schedules.set(skillId, liveSchedule)
    fsrsCards.set(skillId, { stability: fsrs.stability, difficulty: fsrs.difficulty, last_review: at })

    // The prerequisite unlock /api/attempt runs on a new mastery.
    if (live.mastery_state === 'mastered' && !wasMastered) {
      const unblocked = computeUnblocked(states)
      for (const [id, s] of Array.from(states)) {
        if (s.mastery_state === 'blocked' && unblocked.has(id)) states.set(id, { ...s, mastery_state: 'ready' })
      }
    }

    simNow = clock + latency + Math.round(between(rng, [8_000, 40_000]))
    return correct
  }

  /** One `next` call, ranked by the live score exactly as /api/session does. */
  function next(sessionId: string, mode: SessionMode, seenSkills: string[], seenQuestions: Set<string>,
    pinned?: string, arcHistory: ArcAttemptEvidence[] = [], lastQuestionId?: string) {
    const now = new Date(simNow!)
    const ranker = scoreRanker({
      skillStates: states, reviewSchedules: schedules, motivation: motivation.state, questionsCache,
      recentSkillIds: [...seenSkills].reverse(), now, learnerRating: ELO_START,
    })
    const trace = selectNextTaskDetailed({
      skillStates: states, reviewSchedules: schedules, motivationState: motivation,
      seenSkillsThisSession: seenSkills, seenQuestionIdsThisSession: seenQuestions, questionsCache,
      mode, currentSkillId: pinned, arcHistory, lastQuestionId, now, rank: ranker.rank,
    })
    const ranking = ranker.last()
    if (ranking) {
      rows.selection.push({
        id: generateId(), learner_id: learnerId,
        ...buildSelectionShadowRow(trace, ranking.chosen, ranking.ranked, ranking.explored, sessionId, true),
        created_at: now.toISOString(),
      })
    }
    return trace.task
  }

  for (let day = 0; day < persona.days; day++) {
    // The last simulated day is yesterday, and it is always a study day, so the
    // history ends recently and reviews are coming due around now.
    const lastDay = day === persona.days - 1
    if (!lastDay && rng.next() >= params.studyProbability) continue
    simNow = start + day * DAY_MS + (persona.hour + rng.next() * 2) * 3_600_000
    studyDays.push(day)

    for (const [id, schedule] of Array.from(schedules)) {
      const refreshed = reconcileBktSm2OnLoad(states.get(id)!, schedule, new Date(simNow))
      states.set(id, refreshed.state)
      schedules.set(id, refreshed.schedule)
    }

    const sessionId = generateId()
    const startedAt = simNow
    const seenSkills: string[] = []
    const seenQuestions = new Set<string>()
    let tasks = 0
    let correctCount = 0
    const record = (skillId: string, questionId: string, correct: boolean) => {
      seenSkills.push(skillId); seenQuestions.add(questionId); tasks += 1; if (correct) correctCount += 1
    }

    // Consent-based review batch, accepted, as on /learn.
    const overdue = Array.from(schedules.values()).filter(s => s.repetitions > 0 && s.due_at <= new Date(simNow!).toISOString()).length
    for (let i = 0; i < Math.min(overdue, DEFAULT_REVIEW_OFFER_SIZE) && tasks < SESSION_TASK_CAP; i++) {
      const task = next(sessionId, 'review', seenSkills, seenQuestions)
      if (!task) break
      record(task.skill_id, task.question.id, answer(task.skill_id, task.question, task.difficulty_tier, sessionId, false))
    }

    // Learn: the first pick is ranked; the page then pins that skill's guided arc.
    let pinned: string | undefined
    let arc: ArcAttemptEvidence[] = []
    let lastQuestion: string | undefined
    while (tasks < SESSION_TASK_CAP) {
      const task = next(sessionId, 'learn', seenSkills, seenQuestions, pinned, arc, lastQuestion)
      if (!task) {
        if (!pinned) break
        pinned = undefined; arc = []
        continue
      }
      pinned = task.skill_id
      const correct = answer(task.skill_id, task.question, task.difficulty_tier, sessionId, false)
      record(task.skill_id, task.question.id, correct)
      arc.push({ correct, difficulty_tier: task.difficulty_tier })
      lastQuestion = task.question.id

      const progress = getGuidedArcProgress(arc)
      if (progress.core_complete && canChooseTopicSwitch(states.get(task.skill_id)!.p_know, progress)) {
        if (tasks < SESSION_TASK_CAP && rng.next() < persona.reflectionRate) {
          const reflection = { id: `${task.skill_id}_explain_back`, format: 'explain' }
          record(task.skill_id, reflection.id, answer(task.skill_id, reflection, 'same', sessionId, true))
        }
        pinned = undefined; arc = []; lastQuestion = undefined
      }
    }

    rows.sessions.push({
      id: sessionId, learner_id: learnerId, started_at: new Date(startedAt).toISOString(),
      ended_at: new Date(simNow).toISOString(), tasks_count: tasks, correct_count: correctCount, abandoned: false,
    })
    lastSessionAt = simNow
  }

  // ── Exams, run by the exam policy. Measurement-only, as in /api/exam: they
  // add attempt rows and nothing else.
  for (const plan of persona.exams) {
    const bank = loadBank(plan.phase)
    const runId = generateId()
    const startedAt = dayStart - plan.daysAgo * DAY_MS + (persona.hour - 1) * 3_600_000
    const limitSec = plan.mode === 'checkpoint' ? checkpointTimeLimitSec(bank) : 0
    const deadline = plan.mode === 'checkpoint' ? startedAt + limitSec * 1000 : null
    let clock = startedAt
    let stop: StopReason | null = null
    const items: {
      question: PhaseEvaluationQuestion; rating: number; position: number; served_at: number
      selected_option_id: string | null; correct: boolean | null; latency_ms: number | null; answered_at: number | null
      hint_level: number; last_hint_at: number | null; hint_abuse: boolean; marked: boolean
    }[] = []
    const responses = () => items.filter(i => i.selected_option_id !== null).map(i => ({
      question_id: i.question.id, bloom_level: i.question.bloom_level, rating: i.rating,
      correct: i.correct === true, hint_level: i.hint_level,
    }))

    for (;;) {
      const q = chooseNextItem(bank, items.map(i => i.question.id), examAbility(responses()).theta, x => coldStartExamRating(x.difficulty))
      if (!q) { stop = 'bank'; break }
      const item = {
        question: q, rating: coldStartExamRating(q.difficulty), position: items.length, served_at: clock,
        selected_option_id: null as string | null, correct: null as boolean | null, latency_ms: null as number | null,
        answered_at: null as number | null, hint_level: 0, last_hint_at: null as number | null, hint_abuse: false, marked: false,
      }
      items.push(item)

      const levelIndex = BLOOM_ORDER.indexOf(q.bloom_level)
      const latency = Math.round(q.time_target_sec * 1000 * plan.pace * (0.6 + rng.next() * 0.8))
      if (plan.mode === 'practice') {
        const wantsHint = rng.next() < plan.hintRate * (q.difficulty === 'hard' ? 1.5 : q.difficulty === 'easy' ? 0.5 : 1)
        for (let level = 1; level <= (wantsHint ? (rng.next() < 0.4 ? 2 : 1) : 0); level++) {
          const since = plan.rapidHints ? 1_500 + rng.next() * 2_000 : 15_000 + rng.next() * 30_000
          const at = (item.last_hint_at ?? item.served_at) + since
          item.hint_abuse = item.hint_abuse || isHintAbuse(since)
          item.hint_level = level
          item.last_hint_at = at
        }
      }
      if (deadline !== null && clock + latency > deadline) { stop = 'time'; clock = deadline; break }

      // The exam scores on a Rasch model with no guessing term; a person facing
      // four options still guesses, so the simulated answer gets the floor.
      const known = pCorrect(plan.theta - plan.levelDrop * levelIndex, item.rating)
      const p = Math.min(0.97, EXAM_GUESS + (1 - EXAM_GUESS) * known + 0.12 * item.hint_level)
      const correct = rng.next() < p
      const distractors = q.options.filter(o => o.id !== q.correct_option_id)
      item.selected_option_id = correct ? q.correct_option_id : rng.pick(distractors).id
      item.correct = correct
      item.latency_ms = latency
      clock += latency
      item.answered_at = clock
      item.marked = rng.next() < 0.08
      clock += 2_000 + Math.round(rng.next() * 4_000)

      stop = stopReason(examAbility(responses()), bank.length - items.length, false)
      if (stop) break
    }

    const debrief = buildDebrief(items.map(i => ({
      question: i.question, rating: i.rating, selected_option_id: i.selected_option_id,
      latency_ms: i.latency_ms, hint_level: i.hint_level, hint_abuse: i.hint_abuse,
    })), stop)
    const finishedAt = new Date(clock + 20_000).toISOString()
    rows.examRuns.push({
      id: runId, learner_id: learnerId, phase: plan.phase, mode: plan.mode, status: 'finished',
      started_at: new Date(startedAt).toISOString(), deadline_at: deadline === null ? null : new Date(deadline).toISOString(),
      finished_at: finishedAt, stop_reason: stop, theta: debrief.theta, se: debrief.se, n_items: debrief.n,
      debrief, created_at: new Date(startedAt).toISOString(),
    })
    for (const i of items) {
      rows.examItems.push({
        id: generateId(), run_id: runId, learner_id: learnerId, question_id: i.question.id, skill_id: i.question.skill_id,
        bloom_level: i.question.bloom_level, position: i.position, rating: i.rating, time_target_sec: i.question.time_target_sec,
        served_at: new Date(i.served_at).toISOString(), selected_option_id: i.selected_option_id, correct: i.correct,
        latency_ms: i.latency_ms, answered_at: i.answered_at === null ? null : new Date(i.answered_at).toISOString(),
        hint_level: i.hint_level, last_hint_at: i.last_hint_at === null ? null : new Date(i.last_hint_at).toISOString(),
        hint_abuse: i.hint_abuse, marked: i.marked, created_at: new Date(i.served_at).toISOString(),
      })
      if (i.selected_option_id === null) continue
      rows.attempts.push({
        id: generateId(), learner_id: learnerId, skill_id: i.question.skill_id, question_id: i.question.id,
        session_id: null, correct: i.correct === true, latency_ms: i.latency_ms ?? 0, revision_count: 0, error_type: null,
        difficulty_tier: 'same', question_format: 'mcq', attempted_at: finishedAt,
        p_know_before: null, p_know_after: null, motivation_state: null, consecutive_errors: null,
        slow_response_streak: null, behavior_modifier: null, hesitation_ms: null,
      })
    }
  }

  // Consecutive study days ending on the last one.
  let streak = 0
  for (let i = studyDays.length - 1; i >= 0 && studyDays[i] === persona.days - 1 - streak; i--) streak += 1

  rows.profile = {
    id: learnerId, email: persona.email, display_name: persona.name,
    password_hash: bcrypt.hashSync(persona.password, 10),
    created_at: new Date(start).toISOString(), diagnostic_done: true, entry_node: placement.entry_node,
    streak_days: streak, last_session_at: new Date(lastSessionAt).toISOString(), graph_version: '1.0.0',
  }
  rows.states = Array.from(states.values())
  rows.schedules = Array.from(schedules.values())
  rows.motivation = motivation
  return rows
}

async function write(rows: Rows) {
  // Not getDb(): it reads the URL when its module loads, which is before this
  // script has read .env.local (imports are hoisted above the loader).
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const insert = async (table: string, data: object[]) => {
    for (let i = 0; i < data.length; i += 500) {
      const { error } = await db.from(table).insert(data.slice(i, i + 500))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }
  const { error: deleteError } = await db.from('learner_profiles').delete().eq('email', rows.profile.email as string)
  if (deleteError) throw new Error(`delete: ${deleteError.message}`)
  await insert('learner_profiles', [rows.profile])
  await insert('learner_skill_states', rows.states)
  await insert('review_schedules', rows.schedules)
  await insert('motivation_states', [rows.motivation])
  await insert('sessions', rows.sessions)
  await insert('attempt_events', rows.attempts)
  await insert('explanation_grades', rows.grades)
  await insert('behavior_quality_shadow', rows.behaviour)
  await insert('bkt_param_shadow', rows.params)
  await insert('fsrs_shadow_log', rows.fsrs)
  await insert('dkt_shadow_log', rows.dkt)
  await insert('selection_shadow', rows.selection)
  await insert('exam_runs', rows.examRuns)
  await insert('exam_item_events', rows.examItems)
}

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
  const today = new RealDate()
  const dayStart = new RealDate(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  const seedOverride = process.argv.includes('--seed') ? Number(process.argv[process.argv.indexOf('--seed') + 1]) : null
  for (const base of PERSONAS.filter(p => !only || p.email === only)) {
    const persona = seedOverride === null ? base : { ...base, seed: seedOverride }
    useSimClock(true)
    let rows: Rows
    try {
      rows = await buildPersona(persona, dayStart)
    } finally {
      simNow = null
      useSimClock(false)
      Math.random = realRandom
    }
    const practiceAttempts = rows.attempts.filter(a => a.session_id !== null).length
    const states = rows.states.reduce<Record<string, number>>((acc, s) => { acc[s.mastery_state] = (acc[s.mastery_state] ?? 0) + 1; return acc }, {})
    const due = rows.schedules.filter(s => s.repetitions > 0 && RealDate.parse(s.due_at) <= RealDate.now()).length
    console.log(`${dryRun ? 'DRY RUN ' : ''}${persona.email} (${persona.name}, password ${persona.password})`)
    console.log(`  ${rows.sessions.length} sessions, ${practiceAttempts} practice answers, ${rows.grades.length} graded explanations, ${rows.selection.length} live selection decisions`)
    console.log(`  skills: ${Object.entries(states).map(([k, v]) => `${k} ${v}`).join(', ')}; reviews due now ${due}; mood ${rows.motivation.state}; streak ${rows.profile.streak_days}`)
    const practiceRows = rows.attempts.filter(a => a.session_id !== null)
    const moods = practiceRows.reduce<Record<string, number>>((acc, a) => { const m = String(a.motivation_state); acc[m] = (acc[m] ?? 0) + 1; return acc }, {})
    const discounted = practiceRows.filter(a => (a.behavior_modifier as number) < 1).length
    const accuracy = practiceRows.filter(a => a.correct).length / Math.max(1, practiceRows.length)
    console.log(`  accuracy ${(accuracy * 100).toFixed(0)}%; mood per answer ${Object.entries(moods).map(([k, v]) => `${k} ${v}`).join(', ')}; discounted ${discounted}`)
    console.log(`  exams: ${rows.examRuns.map(r => `${r.mode} ${String(r.n_items)} items, stop ${String(r.stop_reason)}`).join('; ')}`)
    if (!dryRun) await write(rows)
  }
  console.log(dryRun ? 'Nothing written.' : 'Written. Every row is synthetic.')
}

main().catch(error => { console.error(error); process.exit(1) })
