import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formatOrderAnswer, isOrderAnswerCorrect, isOrderComplete,
  orderPosition, parseOrderAnswer, toggleOrderOption,
} from './order-answer'
import { canSubmitAnswer } from './answer-readiness'
import type { Question } from '@/types'

const orderQuestion = (overrides: Partial<Question> = {}): Question => ({
  id: 'q1', skill_id: 's1', format: 'order', difficulty_tier: 'same',
  options: [{ id: 'a', text: 'first' }, { id: 'b', text: 'second' }, { id: 'c', text: 'third' }],
  correct_answer: 'a,b,c',
  ...overrides,
})

describe('order answers', () => {
  it('builds a sequence in tap order', () => {
    let answer = ''
    answer = toggleOrderOption(answer, 'c')
    answer = toggleOrderOption(answer, 'a')
    answer = toggleOrderOption(answer, 'b')
    expect(answer).toBe('c,a,b')
    expect(parseOrderAnswer(answer)).toEqual(['c', 'a', 'b'])
  })

  it('removes an option when it is tapped again, so a sequence can be corrected', () => {
    expect(toggleOrderOption('c,a,b', 'a')).toBe('c,b')
    expect(orderPosition('c,b', 'b')).toBe(2)
    expect(orderPosition('c,b', 'a')).toBeNull()
  })

  it('tolerates whitespace and empty segments', () => {
    expect(parseOrderAnswer(' a , , b ')).toEqual(['a', 'b'])
    expect(parseOrderAnswer('')).toEqual([])
    expect(formatOrderAnswer([])).toBe('')
  })

  it('is complete only once every option is placed', () => {
    expect(isOrderComplete('a,b', 3)).toBe(false)
    expect(isOrderComplete('a,b,c', 3)).toBe(true)
    expect(isOrderComplete('', 0)).toBe(false)
  })

  it('accepts the authored sequence and rejects any other permutation', () => {
    expect(isOrderAnswerCorrect('a,b,c', 'a,b,c')).toBe(true)
    expect(isOrderAnswerCorrect('a,c,b', 'a,b,c')).toBe(false)
    expect(isOrderAnswerCorrect('a,b', 'a,b,c')).toBe(false)
    expect(isOrderAnswerCorrect('a,b,c', undefined)).toBe(false)
    expect(isOrderAnswerCorrect('', '')).toBe(false)
  })
})

describe('submit readiness', () => {
  it('holds an order question until the whole sequence is placed', () => {
    const q = orderQuestion()
    expect(canSubmitAnswer(q, null, 'a,b')).toBe(false)
    expect(canSubmitAnswer(q, null, 'a,b,c')).toBe(true)
  })

  it('keeps the existing rule for the other formats', () => {
    const mcq = orderQuestion({ format: 'mcq' })
    expect(canSubmitAnswer(mcq, null, '')).toBe(false)
    expect(canSubmitAnswer(mcq, 'b', '')).toBe(true)
    const fill = orderQuestion({ format: 'fill' })
    expect(canSubmitAnswer(fill, null, '   ')).toBe(false)
    expect(canSubmitAnswer(fill, null, 'answer')).toBe(true)
    expect(canSubmitAnswer(orderQuestion({ format: 'explain' }), null, '')).toBe(true)
  })
})

describe('authored order content', () => {
  const dir = path.join(process.cwd(), 'content/questions/by-skill')
  const authored = fs.readdirSync(dir)
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Question[])
    .filter(q => q.format === 'order')

  it('is answerable: every authored sequence is a full permutation of that question options', () => {
    expect(authored.length).toBeGreaterThan(0)
    for (const q of authored) {
      const expected = parseOrderAnswer(q.correct_answer ?? '')
      const optionIds = (q.options ?? []).map(o => o.id)
      expect(expected.length, q.id).toBe(optionIds.length)
      expect([...expected].sort(), q.id).toEqual([...optionIds].sort())
      expect(isOrderAnswerCorrect(formatOrderAnswer(expected), q.correct_answer), q.id).toBe(true)
    }
  })
})
