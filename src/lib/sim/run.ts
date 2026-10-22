// Learner simulator: drives the real engine modules (BKT, SM-2, FSRS) with
// simulated learners whose true memory is known, so schedulers and knowledge
// tracers can be compared against ground truth without real users.
//
// Runs entirely in-process — never through /api/* — so production data is
// never touched. Every result it produces is synthetic.

import { bktUpdate, initSkillState, MASTERY_THRESHOLD } from '@/lib/bkt'
import { bktToQuality, initSM2, reconcileBktSm2, reconcileBktSm2OnLoad } from '@/lib/sm2'
import { computeFsrsSchedule, fsrsRatingFromCorrectness, type FsrsCardState } from '@/lib/fsrs'
import { MAX_REVIEW_ITEMS, MIN_GUIDED_ARC_QUESTIONS } from '@/lib/session/engine'
import type { LearnerSkillState, ReviewSchedule } from '@/types'
import { createRng, type Rng } from './rng'
import { practice, sampleLearnerParams, trueRecallProbability, type LearnerParams, type TrueSkillMemory } from './learner'
import { auc, logLoss, mean, type Prediction } from './metrics'

export type { SchedulerKind } from '@/lib/fsrs/scheduler'
import type { SchedulerKind } from '@/lib/fsrs/scheduler'

export interface SimSkill { id: string; hardPrereqs: string[] }

export interface SimConfig {
  seed: number
  learners: number
  days: number
  scheduler: SchedulerKind
  skills: SimSkill[]      // in study order; prerequisites must come first
  startDate?: Date
  // 'crushed' reproduces the client-side latency bug fixed in Level 7: the
  // schedulers are told every answer took CRUSHED_LATENCY_MS, whatever it
  // really took. It changes only the evidence they receive, never the clock.
  latencySignal?: LatencySignal
  // A second BKT parameter set, traced alongside the live one (Level 16). It
  // never influences which skill is served or when, so both arms see exactly
  // the same attempts in the same order; only the parameters differ. Traced
  // inside the simulator rather than replayed afterwards because the live
  // engine decays p_know on an overdue load (reconcileBktSm2OnLoad), and a
  // replay that skipped that would be comparing parameters against decay.
  shadowBktParams?: (skillId: string) => { p_init: number; p_transit: number; p_slip: number; p_guess: number }
}

export type LatencySignal = 'measured' | 'crushed'

// What src/app/api/attempt/route.ts's MIN_LATENCY clamp yielded once the client
// sent ~0.
export const CRUSHED_LATENCY_MS = 100

export interface SimEvent {
  student_id: string
  skill_id: string
  correct: boolean
  timestamp: string
  is_review: boolean
  latency_ms: number
  true_recall: number      // ground-truth P(recall) just before the attempt
  bkt_p_correct: number    // BKT's predicted P(correct) just before the attempt
  // The same quantity under config.shadowBktParams, when that is set.
  bkt_shadow_p_correct?: number
  sm2_p_recall: number | null  // SM-2's implied P(recall); null on first exposure
  fsrs_p_recall: number | null // FSRS retrievability; null on first exposure
}

export interface SchedulerReport {
  scheduler: SchedulerKind
  learners: number
  days: number
  attempts: number
  reviewAttempts: number
  reviewsPerLearner: number
  skillsLearnedPerLearner: number
  endRetention: number         // mean true recall over learned skills at end of run
  forgottenFraction: number    // learned skills whose true recall is < 0.7 at end
  bkt: { logLoss: number; auc: number }
  recallPrediction: {          // on review attempts only (skill seen on an earlier day)
    sm2: { logLoss: number; auc: number }
    fsrs: { logLoss: number; auc: number }
  }
}

export interface SimResult { report: SchedulerReport; events: SimEvent[] }

interface SkillRecord {
  memory?: TrueSkillMemory
  bkt: LearnerSkillState
  // The same state under config.shadowBktParams, or null when unused. It is
  // never read by the selection or scheduling logic.
  bktShadow: LearnerSkillState | null
  sm2: ReviewSchedule
  fsrs: FsrsCardState | null
  fsrsDueMs: number
  introduced: boolean
  lastPracticeDay: number | null
}

const DAY_MS = 86_400_000

// SM-2 has no explicit memory model; the conventional reading is that an item
// is due when recall has decayed to ~90%, i.e. R = 0.9^(elapsed / interval).
function sm2ImpliedRecall(schedule: ReviewSchedule, now: Date): number | null {
  if (!schedule.last_reviewed_at) return null
  const elapsed = (now.getTime() - new Date(schedule.last_reviewed_at).getTime()) / DAY_MS
  return Math.pow(0.9, elapsed / Math.max(schedule.interval_days, 1e-6))
}

function dueAt(record: SkillRecord, scheduler: SchedulerKind): number {
  return scheduler === 'fsrs' ? record.fsrsDueMs : new Date(record.sm2.due_at).getTime()
}

export function simulate(config: SimConfig): SimResult {
  const start = (config.startDate ?? new Date('2026-01-05T00:00:00Z')).getTime()
  const events: SimEvent[] = []
  const endRecalls: number[] = []
  let learnedTotal = 0
  const skillById = new Map(config.skills.map(s => [s.id, s]))

  for (let l = 0; l < config.learners; l++) {
    // One stream per learner, so the same seed yields the same population
    // (and the same luck) under every scheduler being compared.
    const rng = createRng((config.seed * 1_000_003 + l) >>> 0)
    const studentId = `sim_${config.seed}_${l}`
    const params = sampleLearnerParams(rng)
    const skills = new Map<string, SkillRecord>()
    for (const skill of config.skills) {
      const shadowParams = config.shadowBktParams?.(skill.id)
      skills.set(skill.id, {
        bkt: initSkillState(studentId, skill.id),
        bktShadow: shadowParams
          ? { ...initSkillState(studentId, skill.id, shadowParams.p_init),
              p_transit: shadowParams.p_transit, p_slip: shadowParams.p_slip, p_guess: shadowParams.p_guess }
          : null,
        sm2: initSM2(studentId, skill.id, new Date(start)),
        fsrs: null,
        fsrsDueMs: Infinity,
        introduced: false,
        lastPracticeDay: null,
      })
    }

    for (let day = 0; day < config.days; day++) {
      if (rng.next() >= params.studyProbability) continue
      // Sessions start at a random time between 08:00 and 22:00.
      let clock = start + day * DAY_MS + (8 + rng.next() * 14) * 3_600_000

      const attempt = (skillId: string, isReview: boolean) => {
        const record = skills.get(skillId)!
        const now = new Date(clock)
        const nowDays = (clock - start) / DAY_MS
        const skill = skillById.get(skillId)!
        const prereqRecall = skill.hardPrereqs.reduce(
          (p, id) => p * Math.max(0.05, trueRecallProbability(skills.get(id)?.memory, nowDays)), 1)

        const bktPCorrect = record.bkt.p_know * (1 - record.bkt.p_slip) + (1 - record.bkt.p_know) * record.bkt.p_guess
        const shadowPCorrect = record.bktShadow
          ? record.bktShadow.p_know * (1 - record.bktShadow.p_slip) + (1 - record.bktShadow.p_know) * record.bktShadow.p_guess
          : undefined
        const seenBefore = record.lastPracticeDay !== null && record.lastPracticeDay < day
        const sm2Recall = seenBefore ? sm2ImpliedRecall(record.sm2, now) : null

        const outcome = practice(rng, params, record.memory, nowDays, prereqRecall)
        // The learner still really took outcome.latencyMs — the clock below is
        // unchanged. Only what the schedulers are told about it differs.
        const signalLatency = config.latencySignal === 'crushed' ? CRUSHED_LATENCY_MS : outcome.latencyMs

        const wasMastered = record.bkt.mastery_state === 'mastered'
        record.bkt = bktUpdate(record.bkt, outcome.correct, record.sm2.repetitions)
        if (record.bktShadow) record.bktShadow = bktUpdate(record.bktShadow, outcome.correct, record.sm2.repetitions)
        record.sm2 = reconcileBktSm2(record.bkt.p_know, wasMastered, record.sm2,
          bktToQuality(outcome.correct, signalLatency), now)
        const fsrs = computeFsrsSchedule(record.fsrs, fsrsRatingFromCorrectness(outcome.correct, signalLatency), now)
        const fsrsRecall = seenBefore && record.fsrs ? fsrs.retrievability : null
        record.fsrs = { stability: fsrs.stability, difficulty: fsrs.difficulty, last_review: now.toISOString() }
        record.fsrsDueMs = new Date(fsrs.due_at).getTime()
        record.memory = outcome.memory
        record.introduced = true
        record.lastPracticeDay = day

        events.push({
          student_id: studentId, skill_id: skillId, correct: outcome.correct, timestamp: now.toISOString(),
          is_review: isReview, latency_ms: outcome.latencyMs, true_recall: outcome.recallProbability,
          bkt_p_correct: bktPCorrect, bkt_shadow_p_correct: shadowPCorrect,
          sm2_p_recall: sm2Recall, fsrs_p_recall: fsrsRecall,
        })
        clock += outcome.latencyMs + 15_000
      }

      // 1. Reviews: up to MAX_REVIEW_ITEMS due skills, most overdue first. The
      //    live app asks for consent first; simulated learners always accept.
      const now = new Date(clock)
      for (const record of skills.values()) {
        if (!record.introduced) continue
        const reconciled = reconcileBktSm2OnLoad(record.bkt, record.sm2, now)
        record.bkt = reconciled.state
        if (record.bktShadow) record.bktShadow = reconcileBktSm2OnLoad(record.bktShadow, record.sm2, now).state
      }
      const due = config.skills
        .map(s => ({ id: s.id, due: dueAt(skills.get(s.id)!, config.scheduler) }))
        .filter(d => skills.get(d.id)!.introduced && d.due <= clock)
        .sort((a, b) => a.due - b.due)
        .slice(0, MAX_REVIEW_ITEMS)
      for (const d of due) attempt(d.id, true)

      // 2. New learning on the frontier skill: the first skill whose hard
      //    prerequisites BKT considers mastered (the same rule as
      //    computeUnblocked) and which isn't mastered itself.
      const frontier = config.skills.find(s =>
        skills.get(s.id)!.bkt.p_know < MASTERY_THRESHOLD &&
        s.hardPrereqs.every(p => (skills.get(p)?.bkt.p_know ?? 0) >= MASTERY_THRESHOLD))
      if (frontier) {
        for (let q = 0; q < MIN_GUIDED_ARC_QUESTIONS; q++) {
          if (q >= 2 && skills.get(frontier.id)!.bkt.p_know >= MASTERY_THRESHOLD) break
          attempt(frontier.id, false)
        }
      }
    }

    const endDays = config.days
    for (const record of skills.values()) {
      if (!record.memory?.learned) continue
      learnedTotal++
      endRecalls.push(trueRecallProbability(record.memory, endDays))
    }
  }

  const reviewEvents = events.filter(e => e.sm2_p_recall !== null && e.fsrs_p_recall !== null)
  const toPredictions = (pick: (e: SimEvent) => number): Prediction[] =>
    reviewEvents.map(e => ({ predicted: pick(e), actual: e.correct }))
  const bktPredictions = events.map(e => ({ predicted: e.bkt_p_correct, actual: e.correct }))
  const sm2Predictions = toPredictions(e => e.sm2_p_recall!)
  const fsrsPredictions = toPredictions(e => e.fsrs_p_recall!)

  return {
    events,
    report: {
      scheduler: config.scheduler,
      learners: config.learners,
      days: config.days,
      attempts: events.length,
      reviewAttempts: events.filter(e => e.is_review).length,
      reviewsPerLearner: events.filter(e => e.is_review).length / config.learners,
      skillsLearnedPerLearner: learnedTotal / config.learners,
      endRetention: mean(endRecalls),
      forgottenFraction: endRecalls.length ? endRecalls.filter(r => r < 0.7).length / endRecalls.length : NaN,
      bkt: { logLoss: logLoss(bktPredictions), auc: auc(bktPredictions) },
      recallPrediction: {
        sm2: { logLoss: logLoss(sm2Predictions), auc: auc(sm2Predictions) },
        fsrs: { logLoss: logLoss(fsrsPredictions), auc: auc(fsrsPredictions) },
      },
    },
  }
}

export type { Rng, LearnerParams }
