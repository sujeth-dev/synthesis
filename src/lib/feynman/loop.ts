import { classifyExplanation, type ExplanationCategory } from './classifier'

export type FeynmanStep =
  | 'intro'
  | 'character_entry'
  | 'canvas_1'
  | 'follow_up'
  | 'breakdown'
  | 'gap_callout'
  | 'canvas_2'
  | 'resolution'
  | 'summary'

export type RohanExpression = 'neutral' | 'curious' | 'confused' | 'thinking' | 'aha' | 'satisfied'

export interface FeynmanLoopState {
  step: FeynmanStep
  skillLabel: string
  firstExplanation: string | null
  firstCategory: ExplanationCategory | null
  secondExplanation: string | null
  secondCategory: ExplanationCategory | null
  rohanExpression: RohanExpression
}

export function initFeynmanLoop(skillLabel: string): FeynmanLoopState {
  return {
    step: 'intro',
    skillLabel,
    firstExplanation: null,
    firstCategory: null,
    secondExplanation: null,
    secondCategory: null,
    rohanExpression: 'neutral',
  }
}

export function beginCharacterEntry(state: FeynmanLoopState): FeynmanLoopState {
  return { ...state, step: 'character_entry', rohanExpression: 'neutral' }
}

export function beginTeachingCanvas(state: FeynmanLoopState): FeynmanLoopState {
  return { ...state, step: 'canvas_1' }
}

export function submitFirstExplanation(state: FeynmanLoopState, text: string): FeynmanLoopState {
  const category = classifyExplanation(text)
  return {
    ...state,
    step: 'follow_up',
    firstExplanation: text,
    firstCategory: category,
    rohanExpression: category === 'meaning-included' ? 'curious' : 'confused',
  }
}

export function advanceToBreakdown(state: FeynmanLoopState): FeynmanLoopState {
  return { ...state, step: 'breakdown', rohanExpression: 'confused' }
}

/**
 * The hard "why go backwards" follow-up is always asked (13-content-structure.md
 * §4.1 step 5). A method-only or gap first pass always needs a rebuild round.
 * A meaning-included first pass hasn't answered *this* question yet either
 * (it only explained what the concept is, not why it's useful) — so it also
 * rebuilds, matching the transcript where canvas_2 runs regardless of category1.
 */
export function advanceFromBreakdown(state: FeynmanLoopState): FeynmanLoopState {
  if (state.firstCategory !== 'meaning-included') {
    return { ...state, step: 'gap_callout', rohanExpression: 'confused' }
  }
  return { ...state, step: 'canvas_2', rohanExpression: 'thinking' }
}

export function advanceFromGapCallout(state: FeynmanLoopState): FeynmanLoopState {
  return { ...state, step: 'canvas_2', rohanExpression: 'thinking' }
}

export function submitSecondExplanation(state: FeynmanLoopState, text: string): FeynmanLoopState {
  const category = classifyExplanation(text)
  return {
    ...state,
    step: 'resolution',
    secondExplanation: text,
    secondCategory: category,
    rohanExpression: category === 'meaning-included' ? 'aha' : 'thinking',
  }
}

export function advanceToSummary(state: FeynmanLoopState): FeynmanLoopState {
  return {
    ...state,
    step: 'summary',
    rohanExpression: state.secondCategory === 'meaning-included' ? 'satisfied' : state.rohanExpression,
  }
}

export function loopResolved(state: FeynmanLoopState): boolean {
  return state.secondCategory === 'meaning-included'
}

export function gapSummary(state: FeynmanLoopState): string {
  if (state.firstCategory === 'meaning-included' && state.secondCategory === 'meaning-included') {
    return 'No significant gap — the first explanation already connected the concept to a real situation.'
  }
  if (state.firstCategory !== 'meaning-included' && state.secondCategory === 'meaning-included') {
    return 'The first explanation focused on the method (how to do it). The rebuild connected it to a real situation and closed the gap.'
  }
  return 'The explanation described a procedure but never connected it to why it matters or when you\'d use it.'
}
