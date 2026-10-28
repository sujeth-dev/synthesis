import { describe, expect, it } from 'vitest'
import {
  LIVE_PARAMS, fittedParamsProvenance, fittedSkillIds, hasFittedParams, isPerSkillBktEnabled, paramsFor,
} from './params'
import { BKT_DEFAULTS } from './index'

describe('per-skill BKT parameters (Level 16)', () => {
  it('falls back to the live global set for a skill with no fitted parameters', () => {
    expect(hasFittedParams('not_a_skill')).toBe(false)
    expect(paramsFor('not_a_skill')).toEqual(LIVE_PARAMS)
    expect(LIVE_PARAMS).toEqual({
      p_init: BKT_DEFAULTS.p_know, p_transit: BKT_DEFAULTS.p_transit,
      p_slip: BKT_DEFAULTS.p_slip, p_guess: BKT_DEFAULTS.p_guess,
    })
  })

  it('returns per-skill values that are probabilities, and not merely the defaults', () => {
    const skills = fittedSkillIds()
    expect(skills.length).toBeGreaterThan(0)
    for (const skill of skills) {
      expect(hasFittedParams(skill)).toBe(true)
      for (const value of Object.values(paramsFor(skill))) {
        expect(value).toBeGreaterThan(0)
        expect(value).toBeLessThan(1)
      }
    }
    // If the fit reproduced the global set for every skill there would be
    // nothing to compare, so at least one skill must differ from it.
    expect(skills.some(skill => JSON.stringify(paramsFor(skill)) !== JSON.stringify(LIVE_PARAMS))).toBe(true)
  })

  it('is off unless the deployment opts in', () => {
    expect(isPerSkillBktEnabled({})).toBe(false)
    expect(isPerSkillBktEnabled({ BKT_PER_SKILL: '0' })).toBe(false)
  })

  it('refuses to apply parameters fitted on simulated learners, flag or no flag', () => {
    // The guard that matters: a parameter set fitted on simulator output
    // describes src/lib/sim/learner.ts's hand-written memory model, so applying
    // it live would dress an assumption as a measurement. Written against the
    // committed file's own provenance so it stays true when real-learner
    // parameters replace it.
    const synthetic = fittedParamsProvenance().synthetic
    expect(isPerSkillBktEnabled({ BKT_PER_SKILL: '1' })).toBe(!synthetic)
  })

  it('records where its parameters came from', () => {
    const provenance = fittedParamsProvenance()
    expect(provenance.source).toMatch(/\.csv$/)
    expect(provenance.rows).toBeGreaterThan(0)
    expect(provenance.learners).toBeGreaterThan(0)
    expect(provenance.min_sequences).toBeGreaterThan(0)
    expect(typeof provenance.synthetic).toBe('boolean')
  })
})
