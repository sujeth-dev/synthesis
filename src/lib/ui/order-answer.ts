// An `order` answer is stored as the comma-joined option ids in the learner's
// chosen sequence, matching the shape authored as `correct_answer` in
// content/questions/by-skill (e.g. "a,b,c,d").

export function parseOrderAnswer(answer: string): string[] {
  return answer.split(',').map(id => id.trim()).filter(id => id !== '')
}

export function formatOrderAnswer(sequence: string[]): string {
  return sequence.join(',')
}

// Clicking an unplaced option appends it; clicking a placed one removes it, so a
// learner can correct a sequence without starting over.
export function toggleOrderOption(answer: string, optionId: string): string {
  const sequence = parseOrderAnswer(answer)
  const at = sequence.indexOf(optionId)
  return formatOrderAnswer(at === -1 ? [...sequence, optionId] : sequence.filter(id => id !== optionId))
}

export function orderPosition(answer: string, optionId: string): number | null {
  const at = parseOrderAnswer(answer).indexOf(optionId)
  return at === -1 ? null : at + 1
}

export function isOrderComplete(answer: string, optionCount: number): boolean {
  return optionCount > 0 && parseOrderAnswer(answer).length === optionCount
}

export function isOrderAnswerCorrect(answer: string, correctAnswer: string | undefined): boolean {
  const submitted = parseOrderAnswer(answer)
  const expected = parseOrderAnswer(correctAnswer ?? '')
  return expected.length > 0 && submitted.length === expected.length
    && submitted.every((id, i) => id === expected[i])
}
