import type { Question } from '@/types'

export interface SubmittedDiagnosticAnswer {
  question_id?: string
  skill_id?: string
  answer?: string | null
  graph_placement_weight?: Record<string, number>
}

export interface GradedDiagnosticAnswer {
  skill_id: string
  correct: boolean
  graph_placement_weight?: Record<string, number>
}

// The client cannot be trusted with this: /api/diagnostic/questions ships
// correct_option_id to the browser, so a client-sent `correct` would be
// learner-editable. Grading here mirrors /api/attempt's verification.
export function gradeDiagnosticAnswer(submitted: SubmittedDiagnosticAnswer, question: Question | undefined): boolean {
  if (!question) return false
  const answer = (submitted.answer ?? '').toString().trim()
  if (answer === '') return false
  if (question.format === 'mcq') return answer === question.correct_option_id
  return answer.toLowerCase() === (question.correct_answer ?? '').trim().toLowerCase()
}

export function gradeDiagnosticResults(
  submitted: SubmittedDiagnosticAnswer[],
  questions: Question[],
): GradedDiagnosticAnswer[] {
  const byId = new Map(questions.map(q => [q.id, q]))
  const graded: GradedDiagnosticAnswer[] = []
  for (const entry of submitted) {
    const question = entry.question_id ? byId.get(entry.question_id) : undefined
    const skill_id = entry.skill_id ?? question?.skill_id
    if (!skill_id) continue
    graded.push({
      skill_id,
      correct: gradeDiagnosticAnswer(entry, question),
      graph_placement_weight: entry.graph_placement_weight ?? question?.graph_placement_weight,
    })
  }
  return graded
}
