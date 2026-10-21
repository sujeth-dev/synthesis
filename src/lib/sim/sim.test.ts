import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { practice, sampleLearnerParams, trueRecallProbability, type TrueSkillMemory } from './learner'
import { auc, logLoss } from './metrics'
import { CRUSHED_LATENCY_MS, simulate, type SimSkill } from './run'
import { curriculumSkills } from './skills'
import { bktToQuality } from '@/lib/sm2'

const CHAIN: SimSkill[] = [
  { id: 'a', hardPrereqs: [] },
  { id: 'b', hardPrereqs: ['a'] },
  { id: 'c', hardPrereqs: ['b'] },
]

describe('rng', () => {
  it('is reproducible from its seed', () => {
    const a = createRng(42), b = createRng(42)
    expect(Array.from({ length: 5 }, a.next)).toEqual(Array.from({ length: 5 }, b.next))
  })
})

describe('true learner memory', () => {
  it('recalls at exactly 90% after one stability period and decays with time', () => {
    const memory: TrueSkillMemory = { learned: true, stability: 4, lastPracticedAt: 0 }
    expect(trueRecallProbability(memory, 4)).toBeCloseTo(0.9, 10)
    expect(trueRecallProbability(memory, 10)).toBeLessThan(trueRecallProbability(memory, 5))
    expect(trueRecallProbability(undefined, 3)).toBe(0)
  })

  it('learns far less often when prerequisites are not really known', () => {
    const params = { ...sampleLearnerParams(createRng(1), 'average'), learnRate: 0.5 }
    const learnRate = (prereqRecall: number) => {
      const rng = createRng(7)
      let learned = 0
      for (let i = 0; i < 4000; i++) if (practice(rng, params, undefined, 0, prereqRecall).memory.learned) learned++
      return learned / 4000
    }
    expect(learnRate(1)).toBeGreaterThan(0.45)
    expect(learnRate(0.1)).toBeLessThan(0.08)
  })

  it('gains more stability from effortful (spaced) recall than massed recall', () => {
    const params = { ...sampleLearnerParams(createRng(1), 'average'), slip: 0 }
    const base: TrueSkillMemory = { learned: true, stability: 5, lastPracticedAt: 0 }
    // Seeds chosen only so both attempts are recalled; gains are deterministic given recall.
    const massed = practice(createRng(3), params, base, 0.1, 1)
    const spaced = practice(createRng(3), params, base, 2, 1)
    expect(massed.recalled && spaced.recalled).toBe(true)
    expect(spaced.memory.stability).toBeGreaterThan(massed.memory.stability)
  })
})

describe('metrics', () => {
  it('computes AUC and log-loss on known cases', () => {
    expect(auc([{ predicted: 0.9, actual: true }, { predicted: 0.1, actual: false }])).toBe(1)
    expect(auc([{ predicted: 0.5, actual: true }, { predicted: 0.5, actual: false }])).toBe(0.5)
    expect(logLoss([{ predicted: 0.5, actual: true }])).toBeCloseTo(Math.log(2), 10)
  })
})

describe('simulate', () => {
  it('is deterministic for a seed and respects prerequisites', () => {
    const run = () => simulate({ seed: 11, learners: 20, days: 30, scheduler: 'sm2', skills: CHAIN })
    const first = run(), second = run()
    expect(first.events).toEqual(second.events)

    for (const student of new Set(first.events.map(e => e.student_id))) {
      const order = first.events.filter(e => e.student_id === student).map(e => e.skill_id)
      if (order.includes('b')) expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
      if (order.includes('c')) expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'))
    }
  })

  it('produces reviews and a usable report under both schedulers', () => {
    for (const scheduler of ['sm2', 'fsrs'] as const) {
      const { report } = simulate({ seed: 5, learners: 30, days: 45, scheduler, skills: CHAIN })
      expect(report.reviewAttempts).toBeGreaterThan(0)
      expect(report.endRetention).toBeGreaterThan(0)
      expect(report.bkt.auc).toBeGreaterThan(0.5)
      expect(report.recallPrediction.fsrs.auc).toBeGreaterThan(0.5)
    }
  })

  it('runs on the real 120-skill curriculum graph', () => {
    const skills = curriculumSkills()
    expect(skills.length).toBe(120)
    const { events } = simulate({ seed: 3, learners: 3, days: 20, scheduler: 'fsrs', skills })
    expect(events.length).toBeGreaterThan(0)
  })
})

// Level 8: what the client-side latency bug cost. 'crushed' tells the schedulers
// every answer took CRUSHED_LATENCY_MS, which is what /api/attempt's clamp
// produced once the client started sending ~0.
describe('the latency signal the schedulers receive', () => {
  const arms = (scheduler: 'sm2' | 'fsrs') => ({
    measured: simulate({ seed: 7, learners: 40, days: 45, scheduler, skills: CHAIN }),
    crushed: simulate({ seed: 7, learners: 40, days: 45, scheduler, skills: CHAIN, latencySignal: 'crushed' }),
  })

  it('collapses every correct answer into the top quality tier', () => {
    const { measured } = arms('sm2')
    const measuredTiers = new Set(measured.events.filter(e => e.correct)
      .map(e => bktToQuality(true, e.latency_ms)))
    expect(measuredTiers.size).toBeGreaterThan(1)
    expect(bktToQuality(true, CRUSHED_LATENCY_MS)).toBe(5)
  })

  it('leaves the real response time untouched — only the evidence changes', () => {
    const { measured, crushed } = arms('sm2')
    for (const run of [measured, crushed]) {
      expect(run.events.some(e => e.latency_ms > 8_000)).toBe(true)
      expect(run.events.every(e => e.latency_ms > CRUSHED_LATENCY_MS)).toBe(true)
    }
  })

  it('schedules fewer reviews and ends on weaker memory under both schedulers', () => {
    for (const scheduler of ['sm2', 'fsrs'] as const) {
      const { measured, crushed } = arms(scheduler)
      expect(crushed.report.reviewsPerLearner, scheduler)
        .toBeLessThan(measured.report.reviewsPerLearner)
      expect(crushed.report.endRetention, scheduler)
        .toBeLessThan(measured.report.endRetention)
    }
  })
})
