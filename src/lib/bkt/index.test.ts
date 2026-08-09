import { describe, expect, it } from 'vitest'

import { bktUpdate, diagnosticScoreToKnow, initSkillState } from '@/lib/bkt'

describe('test framework smoke test', () => {
  it('imports a library module through the TypeScript path alias', () => {
    expect(diagnosticScoreToKnow(0.5)).toBe(0.35)
  })
})

describe('combined-evidence BKT update', () => {
  const state = initSkillState('learner-1', 'skill-1')

  it('preserves the correctness-only posterior by default', () => {
    expect(bktUpdate(state, true).p_know).toBeCloseTo(0.4333333333, 8)
  })

  it('reduces the gain from correct evidence when reasoning quality is degraded', () => {
    const baseline = bktUpdate(state, true)
    const degraded = bktUpdate(state, true, 0, { reasoningQuality: 0.5 })

    expect(degraded.p_know).toBeLessThan(baseline.p_know)
  })

  it('reduces the gain from correct evidence when behavior confidence is degraded', () => {
    const baseline = bktUpdate(state, true)
    const degraded = bktUpdate(state, true, 0, { behavior: 0.5 })

    expect(degraded.p_know).toBeLessThan(baseline.p_know)
  })

  it('combines degraded reasoning and behavior evidence', () => {
    const reasoningOnly = bktUpdate(state, true, 0, { reasoningQuality: 0.5 })
    const behaviorOnly = bktUpdate(state, true, 0, { behavior: 0.5 })
    const combined = bktUpdate(state, true, 0, { reasoningQuality: 0.5, behavior: 0.5 })

    expect(combined.p_know).toBeLessThan(reasoningOnly.p_know)
    expect(combined.p_know).toBeLessThan(behaviorOnly.p_know)
  })
})
