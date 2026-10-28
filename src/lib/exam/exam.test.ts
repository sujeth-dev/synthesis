import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import type { PhaseEvaluationQuestion } from '@/types'
import { expectedScore, ELO_START } from '@/lib/elo'
import { D, estimateAbility, pCorrect, ratingToLogit, thetaToRating } from './ability'
import {
  BLOOM_ORDER, MAX_ITEMS, MIN_ITEMS, SE_STOP, HINT_ABUSE_MS,
  checkpointTimeLimitSec, chooseNextItem, coldStartExamRating, examAbility, isHintAbuse,
  levelForPosition, paceFor, remainingMs, responseCredit, stopReason,
} from './policy'
import { buildDebrief } from './debrief'

function loadBank(file: string): PhaseEvaluationQuestion[] {
  const full = path.join(process.cwd(), 'content', 'questions', 'phase-evaluation', file)
  return JSON.parse(fs.readFileSync(full, 'utf-8'))
}

const ratingOf = (q: PhaseEvaluationQuestion) => coldStartExamRating(q.difficulty)

describe('ability scale (EXAM-1)', () => {
  it('agrees with Elo expected score for the same learner and item', () => {
    for (const theta of [-1.5, 0, 0.8, 2]) {
      for (const rating of [1000, 1200, 1450]) {
        expect(pCorrect(theta, rating)).toBeCloseTo(expectedScore(thetaToRating(theta), rating), 10)
      }
    }
  })

  it('round-trips between rating and logit', () => {
    expect(ratingToLogit(ELO_START)).toBe(0)
    expect(ratingToLogit(thetaToRating(1))).toBeCloseTo(D, 10)
  })
})

describe('EAP estimate (EXAM-1)', () => {
  it('is the prior with no answers', () => {
    const est = estimateAbility([])
    expect(est.theta).toBeCloseTo(0, 2)
    expect(est.se).toBeCloseTo(1, 1)
  })

  it('stays finite on an all-correct run, where maximum likelihood would diverge', () => {
    const est = estimateAbility(Array.from({ length: 12 }, () => ({ rating: ELO_START, credit: 1 })))
    expect(Number.isFinite(est.theta)).toBe(true)
    expect(est.theta).toBeGreaterThan(1)
    expect(est.theta).toBeLessThan(4)
  })

  it('moves up for right answers and down for wrong ones', () => {
    const right = estimateAbility([{ rating: ELO_START, credit: 1 }])
    const wrong = estimateAbility([{ rating: ELO_START, credit: 0 }])
    expect(right.theta).toBeGreaterThan(0)
    expect(wrong.theta).toBeLessThan(0)
    expect(right.theta).toBeCloseTo(-wrong.theta, 6)
  })

  it('narrows as evidence accumulates', () => {
    const few = estimateAbility(Array.from({ length: 4 }, (_, i) => ({ rating: ELO_START, credit: i % 2 })))
    const many = estimateAbility(Array.from({ length: 16 }, (_, i) => ({ rating: ELO_START, credit: i % 2 })))
    expect(many.se).toBeLessThan(few.se)
  })

  // What lets a learner change an earlier answer before submitting: the estimate
  // depends on the set of answers, never on the order they arrived in.
  it('does not depend on answer order', () => {
    const answers = [
      { rating: 1100, credit: 1 }, { rating: 1300, credit: 0 },
      { rating: 1200, credit: 0.75 }, { rating: 1400, credit: 1 },
    ]
    const forward = estimateAbility(answers)
    const reversed = estimateAbility([...answers].reverse())
    expect(forward.theta).toBeCloseTo(reversed.theta, 10)
    expect(forward.se).toBeCloseTo(reversed.se, 10)
  })
})

describe('hint credit (EXAM-1)', () => {
  it('pays full credit unaided and less with each hint, never zero for a correct answer', () => {
    expect(responseCredit(true, 0)).toBe(1)
    expect(responseCredit(true, 1)).toBeLessThan(1)
    expect(responseCredit(true, 2)).toBeLessThan(responseCredit(true, 1))
    expect(responseCredit(true, 2)).toBeGreaterThan(0)
  })

  it('pays nothing for a wrong answer however many hints', () => {
    for (const level of [0, 1, 2]) expect(responseCredit(false, level)).toBe(0)
  })

  it('a hinted correct answer moves ability less than an unaided one', () => {
    const unaided = examAbility([{ question_id: 'q', bloom_level: 'apply', rating: ELO_START, correct: true, hint_level: 0 }])
    const hinted = examAbility([{ question_id: 'q', bloom_level: 'apply', rating: ELO_START, correct: true, hint_level: 2 }])
    expect(hinted.theta).toBeLessThan(unaided.theta)
  })

  it('flags a hint asked for before the stem could have been read', () => {
    expect(isHintAbuse(HINT_ABUSE_MS - 1)).toBe(true)
    expect(isHintAbuse(HINT_ABUSE_MS)).toBe(false)
  })
})

describe('item choice (EXAM-1)', () => {
  const bank = loadBank('p4_evaluation.json')

  it('cycles through the six Bloom levels in order', () => {
    expect(BLOOM_ORDER.map((_, i) => levelForPosition(i))).toEqual(BLOOM_ORDER)
    expect(levelForPosition(6)).toBe('remember')
  })

  it('serves the next position\'s level, nearest the current ability', () => {
    const first = chooseNextItem(bank, [], 0, ratingOf)!
    expect(first.bloom_level).toBe('remember')
    const atLevel = bank.filter(q => q.bloom_level === 'remember')
    const best = Math.min(...atLevel.map(q => Math.abs(pCorrect(0, ratingOf(q)) - 0.5)))
    expect(Math.abs(pCorrect(0, ratingOf(first)) - 0.5)).toBeCloseTo(best, 10)
  })

  it('reaches for a harder item when ability is high', () => {
    const remember = bank.filter(q => q.bloom_level === 'remember')
    if (new Set(remember.map(q => q.difficulty)).size < 2) return
    const low = chooseNextItem(bank, [], -2, ratingOf)!
    const high = chooseNextItem(bank, [], 2, ratingOf)!
    expect(ratingOf(high)).toBeGreaterThan(ratingOf(low))
  })

  it('never serves an item twice and returns null once the bank is empty', () => {
    const served: string[] = []
    for (let i = 0; i < bank.length; i += 1) {
      const next = chooseNextItem(bank, served, 0, ratingOf)!
      expect(served).not.toContain(next.id)
      served.push(next.id)
    }
    expect(chooseNextItem(bank, served, 0, ratingOf)).toBeNull()
  })
})

describe('stopping rule (EXAM-1)', () => {
  const precise = { theta: 0, se: SE_STOP - 0.01, n: MIN_ITEMS }

  it('never stops on precision before the minimum length', () => {
    expect(stopReason({ ...precise, n: MIN_ITEMS - 1 }, 10, false)).toBeNull()
  })

  it('stops on precision once both the minimum and the SE are met', () => {
    expect(stopReason(precise, 10, false)).toBe('precision')
    expect(stopReason({ ...precise, se: SE_STOP }, 10, false)).toBeNull()
  })

  it('stops at the cap whatever the SE', () => {
    expect(stopReason({ theta: 0, se: 0.9, n: MAX_ITEMS }, 10, false)).toBe('max_length')
  })

  it('stops when time is up, ahead of every other reason', () => {
    expect(stopReason({ theta: 0, se: 1, n: 1 }, 10, true)).toBe('time')
  })

  // The claim the module header makes: on this scale the precision rule is
  // reachable inside the cap. A learner answering every item at its expected
  // rate is the information an honest run actually delivers.
  it('a run on a real bank stops inside the cap', () => {
    for (const file of ['p1_evaluation.json', 'p4_evaluation.json', 'p8_evaluation.json']) {
      const bank = loadBank(file)
      const served: string[] = []
      const answers: { rating: number; credit: number }[] = []
      let stop = null
      while (stop === null) {
        const est = estimateAbility(answers)
        stop = stopReason(est, bank.length - served.length, false)
        if (stop) break
        const q = chooseNextItem(bank, served, est.theta, ratingOf)!
        served.push(q.id)
        answers.push({ rating: ratingOf(q), credit: pCorrect(0.3, ratingOf(q)) })
      }
      expect(served.length).toBeGreaterThanOrEqual(MIN_ITEMS)
      expect(served.length).toBeLessThanOrEqual(MAX_ITEMS)
      // Every level touched at least twice, which the rotation guarantees.
      for (const level of BLOOM_ORDER) {
        expect(served.filter(id => bank.find(q => q.id === id)!.bloom_level === level).length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('time (EXAM-1)', () => {
  it('sizes a checkpoint to the longest run at the bank\'s average pace, in whole minutes', () => {
    const bank = loadBank('p2_evaluation.json')
    const limit = checkpointTimeLimitSec(bank)
    const mean = bank.reduce((s, q) => s + q.time_target_sec, 0) / bank.length
    expect(limit % 60).toBe(0)
    expect(limit).toBeGreaterThanOrEqual(MAX_ITEMS * mean)
  })

  it('counts down to zero and no further, and has no deadline in practice', () => {
    expect(remainingMs(10_000, 4_000)).toBe(6_000)
    expect(remainingMs(10_000, 12_000)).toBe(0)
    expect(remainingMs(null, 12_000)).toBeNull()
  })

  it('reads pace against the item\'s own target', () => {
    expect(paceFor(30_000, 30)).toBe('on_pace')
    expect(paceFor(40_000, 30)).toBe('slow')
    expect(paceFor(46_000, 30)).toBe('over')
  })
})

describe('debrief (EXAM-4)', () => {
  const bank = loadBank('p3_evaluation.json')
  const wrongOption = (q: PhaseEvaluationQuestion) => q.options.find(o => o.id !== q.correct_option_id)!

  const picks = BLOOM_ORDER.flatMap(level => bank.filter(q => q.bloom_level === level).slice(0, 2))
  // Right on remember/understand, wrong on everything above: the profile the
  // debrief exists to show.
  const items = picks.map(q => {
    const low = q.bloom_level === 'remember' || q.bloom_level === 'understand'
    return {
      question: q, rating: ratingOf(q),
      selected_option_id: low ? q.correct_option_id : wrongOption(q).id,
      latency_ms: q.time_target_sec * 1000, hint_level: 0, hint_abuse: false,
    }
  })
  const debrief = buildDebrief(items, 'precision')

  it('reports ability by level, high where answers were right and low where wrong', () => {
    const remember = debrief.levels.find(l => l.level === 'remember')!
    const analyze = debrief.levels.find(l => l.level === 'analyze')!
    expect(remember.correct).toBe(2)
    expect(analyze.correct).toBe(0)
    expect(remember.theta!).toBeGreaterThan(analyze.theta!)
  })

  it('names every misconception hit, with the explanation', () => {
    expect(debrief.misconceptions).toHaveLength(8)
    for (const hit of debrief.misconceptions) {
      expect(hit.misconception.length).toBeGreaterThan(0)
      expect(hit.explanation.length).toBeGreaterThan(0)
    }
  })

  it('lists the skills to revisit, worst first', () => {
    const missed = debrief.revisit.reduce((s, r) => s + r.missed, 0)
    expect(missed).toBe(8)
    for (let i = 1; i < debrief.revisit.length; i += 1) {
      expect(debrief.revisit[i - 1].missed).toBeGreaterThanOrEqual(debrief.revisit[i].missed)
    }
  })

  it('treats an unanswered item as wrong but without a misconception', () => {
    const q = bank[0]
    const d = buildDebrief([{ question: q, rating: ratingOf(q), selected_option_id: null, latency_ms: null, hint_level: 0, hint_abuse: false }], 'time')
    expect(d.correct).toBe(0)
    expect(d.items[0].answered).toBe(false)
    expect(d.misconceptions).toHaveLength(0)
  })

  it('counts hint reliance and rapid requests', () => {
    const q = bank[0]
    const base = { question: q, rating: ratingOf(q), selected_option_id: q.correct_option_id, latency_ms: 1000 }
    const d = buildDebrief([
      { ...base, hint_level: 1, hint_abuse: false },
      { ...base, hint_level: 2, hint_abuse: true },
      { ...base, hint_level: 0, hint_abuse: false },
    ], 'precision')
    expect(d.hints).toEqual({ items_with_hint: 2, second_hints: 1, rapid_requests: 1 })
  })
})
