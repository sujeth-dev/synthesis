import type { Question } from '@/types'
import { isOrderComplete } from './order-answer'

// `explain` is submittable empty on purpose: a learner who cannot explain a
// concept is giving real evidence, and the grader classifies that as a gap.
export function canSubmitAnswer(question: Question, selected: string | null, fillAnswer: string): boolean {
  if (question.format === 'explain') return true
  if (question.format === 'mcq') return selected !== null
  if (question.format === 'order') return isOrderComplete(fillAnswer, question.options?.length ?? 0)
  return fillAnswer.trim() !== ''
}
