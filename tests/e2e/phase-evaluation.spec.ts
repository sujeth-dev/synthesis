import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

function loadLocalEnvironment() {
  const envPath = path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator)
    if (!process.env[key]) process.env[key] = line.slice(separator + 1)
  }
}

const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

test('the phase evaluation records real attempts and shows an accurate per-Bloom-level breakdown', async ({ page }) => {
  loadLocalEnvironment()
  const email = `e2e-phase-eval-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`
  let learnerId: string | null = null

  try {
    const registration = await page.request.post('/api/auth/register', {
      data: { email, password: 'e2e-password', display_name: 'Phase Eval E2E' },
    })
    expect(registration.ok(), await registration.text()).toBe(true)
    const registrationBody = await registration.json()
    learnerId = registrationBody.user.id

    const questionsResponse = await page.request.get('/api/phase-evaluation?phase=phase_1_computer_basics')
    expect(questionsResponse.ok()).toBe(true)
    const { questions } = await questionsResponse.json() as {
      questions: Array<{ id: string; skill_id: string; bloom_level: string; options: { id: string }[]; correct_option_id: string }>
    }
    expect(questions.length).toBe(18)

    // Answer every 2nd question within each 3-question Bloom-level group incorrectly,
    // giving a predictable, non-trivial 2/3-per-level result to verify the breakdown against.
    const shouldBeCorrect = questions.map((_, i) => i % 3 !== 1)

    await page.goto('/learn/evaluate/phase_1_computer_basics')
    await expect(page.getByRole('heading', { name: /A quick check across every level of thinking/ })).toBeVisible()
    await page.getByRole('button', { name: 'Begin →' }).click()

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i]
      await expect(page.getByTestId(`question-${q.id}`)).toBeVisible()

      const selectedOptionId = shouldBeCorrect[i]
        ? q.correct_option_id
        : q.options.find(o => o.id !== q.correct_option_id)!.id

      const attemptResponsePromise = page.waitForResponse(response =>
        response.url().endsWith('/api/phase-evaluation/attempt') && response.request().method() === 'POST'
      )
      await page.getByTestId(`option-${selectedOptionId}`).click()
      await page.getByRole('button', { name: 'Submit' }).click()
      const attemptResponse = await attemptResponsePromise
      const attemptBody = await attemptResponse.json()
      expect(attemptResponse.ok(), JSON.stringify(attemptBody)).toBe(true)
      expect(attemptBody.correct, `question ${i} (${q.id})`).toBe(shouldBeCorrect[i])

      await expect(page.getByText(shouldBeCorrect[i] ? 'Correct!' : 'Not quite')).toBeVisible()
      const isLast = i + 1 === questions.length
      await page.getByRole('button', { name: isLast ? 'See results →' : 'Next →' }).click()
    }

    await expect(page.getByText('12 of 18 correct')).toBeVisible()
    for (const level of BLOOM_LEVELS) {
      await expect(page.getByTestId(`bloom-score-${level}`)).toHaveText('2/3')
    }

    // Persistence check: every attempt actually landed in attempt_events, correctly
    // scoped as a standalone macro-evaluation (no session, neutral difficulty tier).
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: attempts, error } = await db
      .from('attempt_events')
      .select('question_id,correct,session_id,difficulty_tier,question_format')
      .eq('learner_id', learnerId)
    expect(error, error?.message).toBeNull()
    expect(attempts?.length).toBe(18)
    for (const attempt of attempts ?? []) {
      expect(attempt.session_id).toBeNull()
      expect(attempt.difficulty_tier).toBe('same')
      expect(attempt.question_format).toBe('mcq')
    }
    expect(attempts?.filter(a => a.correct).length).toBe(12)
  } finally {
    if (learnerId) {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      const { error } = await db.from('learner_profiles').delete().eq('id', learnerId)
      if (error) throw new Error(`E2E cleanup failed: ${error.message}`)
    }
  }
})
