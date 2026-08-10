import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  bktUpdate,
  deriveMasteryState,
  diagnosticScoreToKnow,
  getMasteryTier,
  initSkillState,
} from '@/lib/bkt'
import { classifyExplanation, reasoningQualityFromCategory } from '@/lib/feynman/classifier'

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

  it('drives the reasoning-quality modifier from the real Feynman Loop classifier instead of a neutral stub (P1-3)', () => {
    const gapText = "I'm not sure, maybe it's just the opposite of the other thing?"
    const meaningText = "Imagine Virat Kohli's run rate changes every over — sometimes 12 runs per over, sometimes 4. Integration adds all of those up to give you the total runs scored, going backwards from rate to total."

    const gapModifier = reasoningQualityFromCategory(classifyExplanation(gapText))
    const meaningModifier = reasoningQualityFromCategory(classifyExplanation(meaningText))
    expect(gapModifier).toBeLessThan(meaningModifier)

    const gapResult = bktUpdate(state, true, 0, { reasoningQuality: gapModifier })
    const meaningResult = bktUpdate(state, true, 0, { reasoningQuality: meaningModifier })

    // A "gap" classification measurably differs from "meaning-included" in the resulting posterior.
    expect(gapResult.p_know).toBeLessThan(meaningResult.p_know)
    expect(meaningResult.p_know).toBeCloseTo(bktUpdate(state, true).p_know, 8) // meaning-included matches the neutral baseline (modifier = 1)
  })
})

describe('BKT learner state', () => {
  it('initializes default, seeded, and blocked skill states', () => {
    const defaultState = initSkillState('learner-1', 'skill-1')
    const seededState = initSkillState('learner-1', 'skill-2', 0.4)
    const blockedState = initSkillState('learner-1', 'skill-3', 0.8, true)

    expect(defaultState).toMatchObject({
      learner_id: 'learner-1',
      skill_id: 'skill-1',
      p_know: 0.1,
      mastery_state: 'ready',
      total_attempts: 0,
    })
    expect(seededState.mastery_state).toBe('learning')
    expect(blockedState.mastery_state).toBe('blocked')
  })

  it('derives every mastery state at its governing boundary', () => {
    const readyState = initSkillState('learner-1', 'skill-1')
    const blockedState = { ...readyState, mastery_state: 'blocked' as const }

    expect(deriveMasteryState(0.99, blockedState, 10)).toBe('blocked')
    expect(deriveMasteryState(0.29, readyState)).toBe('ready')
    expect(deriveMasteryState(0.30, readyState)).toBe('learning')
    expect(deriveMasteryState(0.55, readyState)).toBe('fragile')
    expect(deriveMasteryState(0.65, readyState, 1)).toBe('mastered')
  })
})

describe('learner-facing mastery tiers', () => {
  it('maps the exact learning and mastery threshold boundaries', () => {
    expect(getMasteryTier(0.29)).toBe('Beginner')
    expect(getMasteryTier(0.30)).toBe('Intermediate')
    expect(getMasteryTier(0.64)).toBe('Intermediate')
    expect(getMasteryTier(0.65)).toBe('Mastered')
  })

  it('does not render raw mastery percentages in learner-facing components', () => {
    const roots = [
      'src/components',
      'src/app/dashboard',
      'src/app/graph',
      'src/app/learn',
    ].map(root => path.join(process.cwd(), root))

    function tsxFiles(directory: string): string[] {
      return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return tsxFiles(entryPath)
        return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : []
      })
    }

    const source = roots.flatMap(tsxFiles).map(file => fs.readFileSync(file, 'utf8')).join('\n')
    expect(source).not.toMatch(/Math\.round\([^\n]*(?:p_know|pKnow|p_start|pStart)[^\n]*100/)
    expect(source).not.toMatch(/%\s*(?:known|mastered)/i)
    expect(source).not.toMatch(/\{(?:pKnowPct|pStartPct)\}%/)
  })
})
