import { describe, expect, it } from 'vitest'
import { compareDktVsBkt, cutoverDecision, MIN_ATTEMPTS_FOR_DECISION, type ShadowRow } from './compare'

function rows(n: number, dktSharp: boolean): ShadowRow[] {
  return Array.from({ length: n }, (_, i) => {
    const correct = i % 2 === 0
    const sharp = correct ? 0.9 : 0.1
    const noisy = (i % 4 < 2) ? 0.6 : 0.4 // half right, half wrong ordering
    return { correct, dkt_p_correct: dktSharp ? sharp : noisy, bkt_p_correct: dktSharp ? noisy : sharp }
  })
}

describe('DKT-12 comparison and DKT-13 gate', () => {
  it('scores both models on the same rows', () => {
    const c = compareDktVsBkt(rows(100, true))
    expect(c.n).toBe(100)
    expect(c.dkt.auc).toBe(1)
    expect(c.bkt.auc).toBeLessThan(c.dkt.auc)
  })

  it('never recommends a switch on too little data', () => {
    expect(cutoverDecision(compareDktVsBkt(rows(100, true)))).toEqual({ recommend: false, reason: 'insufficient_data' })
  })

  it('recommends only when DKT is clearly better on enough data', () => {
    expect(cutoverDecision(compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, true))).recommend).toBe(true)
    expect(cutoverDecision(compareDktVsBkt(rows(MIN_ATTEMPTS_FOR_DECISION, false))))
      .toEqual({ recommend: false, reason: 'dkt_not_better' })
  })
})
