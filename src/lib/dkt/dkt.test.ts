import { describe, expect, it } from 'vitest'
import { loadDktModel, predictNext, type DktInteraction, type DktWeightsFile } from './index'
import parity from './fixtures/parity.json'
import { DKT_HISTORY_LIMIT, isDktShadowEnabled, predictForAttempt } from './shadow'

const fixture = parity as { weights: DktWeightsFile; cases: { history: DktInteraction[]; expected: number[] }[] }

describe('DKT TypeScript inference', () => {
  const model = loadDktModel(fixture.weights)

  it('matches PyTorch output for every skill (parity fixture from export_weights.py --fixture)', () => {
    for (const { history, expected } of fixture.cases) {
      const predicted = predictNext(model, history)
      expected.forEach((p, i) => expect(predicted.get(model.skills[i])!).toBeCloseTo(p, 5))
    }
  })

  it('ignores interactions on skills the model does not know', () => {
    const known = fixture.cases[2].history
    const withUnknown = [...known, { skill_id: 'not_a_skill', correct: true }]
    expect(predictNext(model, withUnknown)).toEqual(predictNext(model, known))
  })

  it('rejects weights with the wrong shape', () => {
    expect(() => loadDktModel({ ...fixture.weights, hidden_size: fixture.weights.hidden_size + 1 })).toThrow(/expected/)
  })
})

describe('DKT shadow mode', () => {
  const model = loadDktModel(fixture.weights)

  it('is off unless DKT_SHADOW=1', () => {
    expect(isDktShadowEnabled({})).toBe(false)
    expect(isDktShadowEnabled({ DKT_SHADOW: '0' })).toBe(false)
    expect(isDktShadowEnabled({ DKT_SHADOW: '1' })).toBe(true)
  })

  it('predicts the attempted skill from prior history and caps history length', () => {
    const history = fixture.cases[3].history
    const skill = model.skills[0]
    const prediction = predictForAttempt(model, history, skill)!
    expect(prediction.dkt_p_correct).toBeCloseTo(predictNext(model, history).get(skill)!, 10)
    expect(prediction.history_length).toBe(history.length)

    const long = Array.from({ length: DKT_HISTORY_LIMIT + 50 }, (_, i) => history[i % history.length])
    expect(predictForAttempt(model, long, skill)!.history_length).toBe(DKT_HISTORY_LIMIT)
  })

  it('returns null for skills outside the model', () => {
    expect(predictForAttempt(model, [], 'not_a_skill')).toBeNull()
  })
})
