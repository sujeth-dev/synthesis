import { describe, expect, it } from 'vitest'
import {
  initFeynmanLoop,
  beginCharacterEntry,
  beginTeachingCanvas,
  submitFirstExplanation,
  advanceToBreakdown,
  advanceFromBreakdown,
  advanceFromGapCallout,
  submitSecondExplanation,
  advanceToSummary,
  loopResolved,
  gapSummary,
} from './loop'

// Acceptance script: reproduces the branch outcomes specified in the
// Feynman Loop transcript (Research/lab/13-content-structure.md §4.1 — Integration Basics).

describe('Feynman Loop — Integration Basics acceptance script', () => {
  it('routes a method-only first pass through the gap callout, then resolves once the rebuild connects meaning', () => {
    let state = initFeynmanLoop('Integration Basics')
    expect(state.step).toBe('intro')

    state = beginCharacterEntry(state)
    expect(state.step).toBe('character_entry')

    state = beginTeachingCanvas(state)
    expect(state.step).toBe('canvas_1')

    // First attempt — method described, no meaning (Rohan: "I get that you add 1
    // to the power and divide. But what is that actually doing?")
    state = submitFirstExplanation(
      state,
      'To integrate x to the power n, you add 1 to the power and then divide by the new power. First you apply that rule, then simplify.'
    )
    expect(state.step).toBe('follow_up')
    expect(state.firstCategory).toBe('method-only')
    expect(state.rohanExpression).toBe('confused')

    state = advanceToBreakdown(state)
    expect(state.step).toBe('breakdown')

    // Method-only first pass always routes through the gap callout.
    state = advanceFromBreakdown(state)
    expect(state.step).toBe('gap_callout')

    state = advanceFromGapCallout(state)
    expect(state.step).toBe('canvas_2')

    // Rebuild — the cricket run-rate example from the transcript's "Good explanation example".
    state = submitSecondExplanation(
      state,
      "Imagine Virat Kohli's run rate changes every over — sometimes 12 runs per over, sometimes 4. Differentiation would tell you the rate at any specific over. Integration adds all of those up to give you the total runs scored. You're going backwards from rate to total."
    )
    expect(state.step).toBe('resolution')
    expect(state.secondCategory).toBe('meaning-included')
    expect(state.rohanExpression).toBe('aha')

    state = advanceToSummary(state)
    expect(state.step).toBe('summary')
    expect(state.rohanExpression).toBe('satisfied')
    expect(loopResolved(state)).toBe(true)
    expect(gapSummary(state)).toContain('focused on the method')
  })

  it('still runs a rebuild round after a meaning-included first pass, since the hard follow-up is unanswered either way', () => {
    let state = initFeynmanLoop('Integration Basics')
    state = beginCharacterEntry(state)
    state = beginTeachingCanvas(state)

    // First attempt already connects to a real referent ("area under the curve"),
    // matching the transcript's "curious" branch — Rohan still pushes for a concrete example.
    state = submitFirstExplanation(
      state,
      'Integration is finding the area under the curve of a function using the standard formula.'
    )
    expect(state.firstCategory).toBe('meaning-included')
    expect(state.rohanExpression).toBe('curious')

    state = advanceToBreakdown(state)
    state = advanceFromBreakdown(state)
    // No gap callout needed — goes straight to the rebuild round.
    expect(state.step).toBe('canvas_2')

    // A weak/hedged rebuild leaves the loop unresolved.
    state = submitSecondExplanation(state, "I'm not sure, maybe it's just the reverse of the other thing?")
    expect(state.secondCategory).toBe('gap')

    state = advanceToSummary(state)
    expect(loopResolved(state)).toBe(false)
    expect(gapSummary(state)).toContain('never connected it to why it matters')
  })
})
