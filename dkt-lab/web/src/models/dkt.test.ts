import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initialDktState, loadDktModel, predictNext, stepDkt, type DktWeightsFile } from './dkt'

// Fixture written by `python dkt-lab/pipeline/export.py --fixture`: a small
// random PyTorch DKT, some histories, and PyTorch's P(correct) for every skill.
interface Fixture {
  weights: DktWeightsFile
  cases: { history: { skill: string; correct: boolean }[]; expected: number[] }[]
}
const fixture: Fixture = JSON.parse(readFileSync(new URL('./fixtures/parity.json', import.meta.url), 'utf8'))

describe('in-browser DKT matches PyTorch', () => {
  const model = loadDktModel(fixture.weights)

  it('has every case', () => {
    expect(fixture.cases.map(c => c.history.length)).toEqual([0, 1, 5, 40])
  })

  for (const [i, c] of fixture.cases.entries()) {
    it(`case ${i}: ${c.history.length} interactions, every skill within 1e-5`, () => {
      const got = predictNext(model, c.history)
      const values = model.skills.map(s => got.get(s)!)
      expect(values).toHaveLength(c.expected.length)
      values.forEach((v, k) => expect(Math.abs(v - c.expected[k])).toBeLessThan(1e-5))
    })
  }

  it('ignores unknown skills', () => {
    const s0 = initialDktState(model)
    expect(stepDkt(model, s0, { skill: 'no-such-skill', correct: true })).toBe(s0)
  })

  it('rejects weights of the wrong shape', () => {
    expect(() => loadDktModel({ ...fixture.weights, hidden_size: fixture.weights.hidden_size + 1 })).toThrow(/expected/)
  })
})
