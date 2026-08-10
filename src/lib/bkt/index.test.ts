import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import { bktUpdate, diagnosticScoreToKnow, getMasteryTier, initSkillState } from '@/lib/bkt'

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
