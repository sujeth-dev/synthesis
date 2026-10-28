import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The page itself is a React server component, and this repo has no jsdom or
// Testing Library (adding them for one page would be scope creep), so what is
// asserted here is the page's contract: it is a server component that reads
// every number from the database, and it never becomes a second /demo.
const source = fs.readFileSync(path.join(process.cwd(), 'src/app/engine/page.tsx'), 'utf8')
const demoSource = fs.readFileSync(path.join(process.cwd(), 'src/app/demo/page.tsx'), 'utf8')

describe('/engine contract (Level 13)', () => {
  it('is a server component following the dashboard pattern, not a client fetch', () => {
    expect(source).not.toContain("'use client'")
    expect(source).toContain("cookieStore.get('synaptic_token')")
    expect(source).toContain('await verifyToken(token)')
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('useState')
  })

  it('reads every section from the database', () => {
    for (const reader of [
      'getRecentAttempts', 'getReviewSchedules', 'getExplanationGrades',
      'getBehaviorQualityShadow', 'getFsrsShadowEntries', 'getDktShadowEntries',
    ]) {
      expect(source, reader).toContain(reader)
    }
  })

  it('shows each signal the levels made real, labelled by the feature item it closes', () => {
    for (const column of ['latency_ms', 'hesitation_ms', 'revision_count', 'behavior_modifier',
                          'explanation_text', 'reasoning_quality', 'adaptive_quality']) {
      expect(source, column).toContain(column)
    }
    for (const item of ['Items 3 and 6', 'Items 1 and 2', 'Item 5', 'Item 4']) {
      expect(source, item).toContain(item)
    }
  })

  it('states the live scheduler and the cutover verdict rather than asserting a switch', () => {
    expect(source).toContain('activeScheduler()')
    expect(source).toContain('isAdaptiveQualityEnabled()')
    expect(source).toContain('cutoverDecision(comparison, growth)')
    expect(source).toContain('needs human sign-off')
  })

  it('shares nothing with the scripted /demo walkthrough', () => {
    expect(source).not.toContain('app/demo')
    expect(source).not.toContain('href="/demo')
    // /demo is a hardcoded walkthrough; neither page imports or links the other.
    expect(demoSource).not.toContain('/engine')
  })
})
