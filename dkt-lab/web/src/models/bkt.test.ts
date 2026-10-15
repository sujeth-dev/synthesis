import { describe, expect, it } from 'vitest'
import { bktStep, pCorrect, predictSequence, type BktParams } from './bkt'
import { auc } from './metrics'

const p: BktParams = { p_init: 0.3, p_transit: 0.1, p_slip: 0.1, p_guess: 0.25 }

describe('BKT update', () => {
  it('correct answer: Bayes posterior then learning transition', () => {
    const s = bktStep(0.3, true, p)
    // P(correct) = .3*.9 + .7*.25 = .445; posterior = .27/.445
    expect(s.pCorrect).toBeCloseTo(0.445, 12)
    expect(s.evidence).toBeCloseTo(0.445, 12)
    expect(s.posterior).toBeCloseTo(0.27 / 0.445, 12)
    expect(s.next).toBeCloseTo(s.posterior + (1 - s.posterior) * 0.1, 12)
  })

  it('wrong answer lowers the posterior below the prior', () => {
    const s = bktStep(0.6, false, p)
    expect(s.posterior).toBeCloseTo((0.6 * 0.1) / (0.6 * 0.1 + 0.4 * 0.75), 12)
    expect(s.posterior).toBeLessThan(0.6)
  })

  it('without forgetting, belief never drops after the transition from a posterior', () => {
    const s = bktStep(0.9, true, p)
    expect(s.next).toBeGreaterThanOrEqual(s.posterior)
  })

  it('forgetting moves mass back to unmastered', () => {
    const s = bktStep(0.9, true, { ...p, p_forget: 0.2 })
    expect(s.next).toBeCloseTo(s.posterior * 0.8 + (1 - s.posterior) * 0.1, 12)
  })

  it('forward-only predictions use only earlier answers', () => {
    const preds = predictSequence([true, true, false], p)
    expect(preds[0]).toBeCloseTo(pCorrect(0.3, p), 12)
    const b1 = bktStep(0.3, true, p).next
    expect(preds[1]).toBeCloseTo(pCorrect(b1, p), 12)
    expect(predictSequence([true, true, true], p).slice(0, 2)).toEqual(predictSequence([true, true, false], p).slice(0, 2))
  })
})

describe('running AUC', () => {
  it('perfect, inverted, ties', () => {
    expect(auc([{ p: 0.9, y: true }, { p: 0.1, y: false }])).toBe(1)
    expect(auc([{ p: 0.1, y: true }, { p: 0.9, y: false }])).toBe(0)
    expect(auc([{ p: 0.5, y: true }, { p: 0.5, y: false }])).toBe(0.5)
    expect(auc([{ p: 0.5, y: true }])).toBeNull()
  })
})
