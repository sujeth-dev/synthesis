import { describe, expect, it } from 'vitest'

import { diagnosticScoreToKnow } from '@/lib/bkt'

describe('test framework smoke test', () => {
  it('imports a library module through the TypeScript path alias', () => {
    expect(diagnosticScoreToKnow(0.5)).toBe(0.35)
  })
})
