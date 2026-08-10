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

test('the guided journey persists, adapts, and completes without repeating or switching topics', async ({ page }) => {
  loadLocalEnvironment()
  const email = `e2e-guided-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`
  let learnerId: string | null = null

  try {
    const registration = await page.request.post('/api/auth/register', {
      data: { email, password: 'e2e-password', display_name: 'Guided E2E' },
    })
    expect(registration.ok(), await registration.text()).toBe(true)
    const registrationBody = await registration.json()
    learnerId = registrationBody.user.id

    const diagnostic = await page.request.post('/api/diagnostic', {
      data: {
        results: [
          {
            skill_id: 'p1_what_is_computer',
            correct: true,
            graph_placement_weight: { p1_what_is_computer: 1 },
          },
          {
            skill_id: 'p1_binary_numbers',
            correct: false,
            graph_placement_weight: { p1_binary_numbers: 1 },
          },
        ],
      },
    })
    expect(diagnostic.ok(), await diagnostic.text()).toBe(true)

    const nextTaskResponse = page.waitForResponse(response => {
      if (!response.url().endsWith('/api/session') || response.request().method() !== 'POST') return false
      try {
        return response.request().postDataJSON()?.action === 'next'
      } catch {
        return false
      }
    })
    await page.goto('/learn?skill_id=p1_binary_numbers')
    const taskResponse = await nextTaskResponse
    const taskBody = await taskResponse.json()
    expect(taskResponse.ok(), JSON.stringify(taskBody)).toBe(true)
    expect(taskBody.task, JSON.stringify(taskBody)).toBeTruthy()
    await expect(page.getByText('Guided lesson')).toBeVisible({ timeout: 30_000 })

    while (await page.getByRole('button', { name: 'Next slide →' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Next slide →' }).click()
    }
    await page.getByRole('button', { name: /Finish lesson and start Beginner practice/ }).click()

    let currentTask = taskBody.task
    const answerSequence = [true, true, true, false, true, true, true, true, true, true]
    const expectedArc = [
      { stage: 'beginner', count: 1, complete: false },
      { stage: 'intermediate', count: 0, complete: false },
      { stage: 'intermediate', count: 1, complete: false },
      { stage: 'beginner', count: 0, complete: false },
      { stage: 'beginner', count: 1, complete: false },
      { stage: 'intermediate', count: 0, complete: false },
      { stage: 'intermediate', count: 1, complete: false },
      { stage: 'mastery', count: 0, complete: false },
      { stage: 'mastery', count: 1, complete: false },
      { stage: 'mastery', count: 2, complete: true },
    ] as const
    const stageLabel = { beginner: 'Beginner', intermediate: 'Intermediate', mastery: 'Mastery' }

    for (let index = 0; index < answerSequence.length; index += 1) {
      const shouldBeCorrect = answerSequence[index]
      const correctOptionId = currentTask.question.correct_option_id as string
      const options = currentTask.question.options as Array<{ id: string }>
      const selectedOptionId = shouldBeCorrect
        ? correctOptionId
        : options.find(option => option.id !== correctOptionId)!.id
      const currentQuestionId = currentTask.question.id as string

      await expect(page.getByTestId(`question-${currentQuestionId}`)).toBeVisible()
      await page.getByTestId(`option-${selectedOptionId}`).click()
      const attemptResponsePromise = page.waitForResponse(response =>
        response.url().endsWith('/api/attempt') && response.request().method() === 'POST'
      )
      await page.getByRole('button', { name: 'Submit' }).click()
      const attemptResponse = await attemptResponsePromise
      const attemptBody = await attemptResponse.json()
      const expected = expectedArc[index]

      expect(attemptResponse.ok(), JSON.stringify(attemptBody)).toBe(true)
      expect(attemptBody.correct, JSON.stringify(attemptBody)).toBe(shouldBeCorrect)
      expect(attemptBody.guided_arc).toMatchObject({
        stage: expected.stage,
        stage_attempt_count: expected.count,
        core_complete: expected.complete,
        total_attempt_count: index + 1,
      })
      await expect(page.getByText(shouldBeCorrect ? 'Correct!' : 'Not quite')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText(new RegExp(`Knowledge: .* · ${index + 1} questions answered in this topic journey`))).toBeVisible()

      if (expected.complete) break

      const nextLabel = stageLabel[expected.stage]
      const nextQuestionNumber = expected.count + 1
      const nextTaskResponsePromise = page.waitForResponse(response => {
        if (!response.url().endsWith('/api/session') || response.request().method() !== 'POST') return false
        try {
          return response.request().postDataJSON()?.action === 'next'
        } catch {
          return false
        }
      })
      await page.getByRole('button', {
        name: `Continue ${nextLabel} · question ${nextQuestionNumber} →`,
      }).click()
      const nextResponse = await nextTaskResponsePromise
      const nextBody = await nextResponse.json()
      expect(nextResponse.ok(), JSON.stringify(nextBody)).toBe(true)
      expect(nextBody.task.skill_id).toBe('p1_binary_numbers')
      expect(nextBody.task.question.id).not.toBe(currentQuestionId)
      currentTask = nextBody.task
      await expect(page.getByText('Guided lesson')).toHaveCount(0)
    }

    await expect(page.getByText('Core journey complete · 10 questions answered')).toBeVisible()
    await expect(page.getByText('2/2 ready')).toHaveCount(3)
    await expect(page.getByRole('button', { name: /Teach it with the Feynman Loop/ })).toBeVisible()
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
