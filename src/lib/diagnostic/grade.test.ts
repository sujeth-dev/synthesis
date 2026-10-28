import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { gradeDiagnosticResults } from './grade'
import { placeLearner } from '@/lib/graph'
import type { Question } from '@/types'

const questions: Question[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'content/questions/diagnostic/questions.json'), 'utf8'))

const submit = (answerFor: (q: Question) => string | null) =>
  questions.map(q => ({
    question_id: q.id,
    skill_id: q.skill_id,
    answer: answerFor(q),
    graph_placement_weight: q.graph_placement_weight,
  }))

const allCorrect = () => submit(q => q.correct_option_id ?? null)
const allWrong = () => submit(q => (q.options ?? []).find(o => o.id !== q.correct_option_id)?.id ?? null)

const blocking = (scores: Record<string, number>) =>
  Object.values(scores).filter(score => score < 0.40).length

describe('diagnostic grading', () => {
  it('grades each answer against the authored key rather than trusting the client', () => {
    const graded = gradeDiagnosticResults(allCorrect(), questions)
    expect(graded).toHaveLength(questions.length)
    expect(graded.every(g => g.correct)).toBe(true)
    expect(gradeDiagnosticResults(allWrong(), questions).every(g => !g.correct)).toBe(true)
  })

  it('scores an unknown question wrong instead of throwing', () => {
    const graded = gradeDiagnosticResults(
      [{ question_id: 'not_a_question', skill_id: 'p1_variables', answer: 'b' }], questions)
    expect(graded).toEqual([{ skill_id: 'p1_variables', correct: false, graph_placement_weight: undefined }])
  })

  it('scores a skipped answer wrong', () => {
    expect(gradeDiagnosticResults(submit(() => null), questions).every(g => !g.correct)).toBe(true)
    expect(gradeDiagnosticResults(submit(() => '  '), questions).every(g => !g.correct)).toBe(true)
  })

  it('ignores a row with no identifiable skill', () => {
    expect(gradeDiagnosticResults([{ answer: 'b' }], questions)).toEqual([])
  })
})

describe('placement on graded answers', () => {
  // Before grading existed, placeLearner read an absent `correct` on every row, so
  // EVERY learner got the all-wrong outcome below: every probed skill at the 0.05
  // floor, and therefore every prerequisite-gated skill blocked.
  it('leaves every probed skill at the floor when nothing is answered correctly', () => {
    const { skill_scores } = placeLearner(gradeDiagnosticResults(allWrong(), questions))
    const scores = Object.values(skill_scores)
    expect(scores.length).toBeGreaterThan(0)
    expect(scores.every(score => score === 0.05)).toBe(true)
    expect(blocking(skill_scores)).toBe(scores.length)
  })

  it('lifts a strong learner well above the floor and stops blocking what they know', () => {
    const strong = placeLearner(gradeDiagnosticResults(allCorrect(), questions))
    const weak = placeLearner(gradeDiagnosticResults(allWrong(), questions))
    expect(Math.min(...Object.values(strong.skill_scores))).toBeGreaterThan(0.05)
    expect(strong.skill_scores.p1_variables).toBeGreaterThanOrEqual(0.40)
    expect(blocking(strong.skill_scores)).toBeLessThan(blocking(weak.skill_scores))
  })

  it('separates a learner who knows the early skills only from one who knows none', () => {
    const early = new Set(['dq_01', 'dq_02', 'dq_03', 'dq_04', 'dq_05', 'dq_06'])
    const partial = placeLearner(gradeDiagnosticResults(
      submit(q => (early.has(q.id) ? q.correct_option_id ?? null : null)), questions))
    expect(partial.skill_scores.p1_variables).toBeGreaterThanOrEqual(0.40)
    expect(partial.skill_scores.p4_supervised_learning).toBe(0.05)
  })
})
