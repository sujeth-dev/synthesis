import { describe, expect, it } from 'vitest'
import { classifyExplanation } from './classifier'

describe('classifyExplanation', () => {
  it('classifies a procedure-only explanation as method-only', () => {
    const text = 'To integrate x to the power n, you add 1 to the power and then divide by the new power. First you apply that rule, then simplify.'
    expect(classifyExplanation(text)).toBe('method-only')
  })

  it('classifies an explanation that connects the concept to a real situation as meaning-included', () => {
    const text = "Imagine Virat Kohli's run rate changes every over — sometimes 12 runs per over, sometimes 4. Differentiation would tell you the rate at any specific over. Integration adds all of those up to give you the total runs scored. You're going backwards from rate to total."
    expect(classifyExplanation(text)).toBe('meaning-included')
  })

  it('classifies a short, hedged non-answer as a gap', () => {
    expect(classifyExplanation("I'm not sure, maybe it just reverses the other thing somehow?")).toBe('gap')
  })

  it('classifies an explanation below the minimum length as a gap even without hedging language', () => {
    expect(classifyExplanation('It reverses differentiation.')).toBe('gap')
  })

  it('treats a bare procedural description that merely mentions "area under" as meaning-included (ambiguous/edge case)', () => {
    const text = 'Integration is finding the area under the curve of a function using the standard formula.'
    expect(classifyExplanation(text)).toBe('meaning-included')
  })
})
