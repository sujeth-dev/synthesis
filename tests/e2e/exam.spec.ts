import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

function loadLocalEnvironment() {
  const envPath = path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator)
    if (!process.env[key]) process.env[key] = line.slice(separator + 1)
  }
}

const PHASE = 'phase_2_cs_data'
const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const bank: Array<{ id: string; correct_option_id: string; options: { id: string }[] }> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'content', 'questions', 'phase-evaluation', 'p2_evaluation.json'), 'utf8'))
const byId = new Map(bank.map(q => [q.id, q]))
const SHOTS = process.env.EXAM_SHOT_DIR

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

async function register(page: Page, label: string): Promise<string> {
  const email = `e2e-exam-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`
  const res = await page.request.post('/api/auth/register', { data: { email, password: 'e2e-password', display_name: 'Exam E2E' } })
  expect(res.ok(), await res.text()).toBe(true)
  return (await res.json()).user.id
}

async function currentQuestionId(page: Page): Promise<string> {
  const el = page.locator('[data-testid^="exam-question-"]')
  await expect(el).toBeVisible()
  return (await el.getAttribute('data-testid'))!.replace('exam-question-', '')
}

async function cleanup(learnerId: string | null) {
  if (!learnerId) return
  const { error } = await db().from('learner_profiles').delete().eq('id', learnerId)
  if (error) throw new Error(`E2E cleanup failed: ${error.message}`)
}

test('a checkpoint runs adaptively, allows revisits, and debriefs by Bloom level without touching the learner model', async ({ page }) => {
  loadLocalEnvironment()
  let learnerId: string | null = null
  try {
    learnerId = await register(page, 'checkpoint')
    const [skillsBefore, schedulesBefore] = await Promise.all([
      db().from('learner_skill_states').select('skill_id,p_know').eq('learner_id', learnerId),
      db().from('review_schedules').select('skill_id,due_at').eq('learner_id', learnerId),
    ])

    await page.goto(`/learn/exam/${PHASE}`)
    await expect(page.getByRole('heading', { name: /Every level of thinking/ })).toBeVisible()
    await page.getByTestId('start-checkpoint').click()
    await expect(page.getByTestId('exam-timer')).toContainText('left')
    await expect(page.getByTestId('hint-button')).toHaveCount(0)

    // Right on even positions, wrong on odd; mark the first for review.
    let served = 0
    let previousId = ''
    while (!(await page.getByTestId('exam-review').isVisible())) {
      const id = await currentQuestionId(page)
      // Wait for the next item to replace the one just saved before answering it.
      if (id === previousId) continue
      previousId = id
      const q = byId.get(id)!
      const pick = served % 2 === 0 ? q.correct_option_id : q.options.find(o => o.id !== q.correct_option_id)!.id
      if (served === 0) await page.getByTestId('mark-button').click()
      await page.getByTestId(`exam-option-${pick}`).click()
      const saved = page.waitForResponse(r => r.url().endsWith('/api/exam') && r.request().method() === 'POST')
      await page.getByTestId('save-answer').click()
      expect((await saved).ok()).toBe(true)
      served += 1
      if (served === 1 && SHOTS) await page.screenshot({ path: path.join(SHOTS, 'exam-checkpoint.png'), fullPage: true })
      await expect(page.getByTestId('exam-review').or(page.locator('[data-testid^="exam-question-"]'))).toBeVisible()
    }
    expect(served).toBeGreaterThanOrEqual(12)
    expect(served).toBeLessThanOrEqual(24)
    await expect(page.getByTestId('nav-0')).toHaveAttribute('title', /marked/)
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'exam-review.png'), fullPage: true })

    // Revisit question 2 (answered wrong) and correct it before submitting.
    await page.getByTestId('nav-1').click()
    const second = byId.get(await currentQuestionId(page))!
    await page.getByTestId(`exam-option-${second.correct_option_id}`).click()
    await page.getByTestId('save-answer').click()
    await expect(page.getByTestId('exam-review')).toBeVisible()

    await page.getByTestId('submit-exam').click()
    await expect(page.getByTestId('exam-debrief')).toBeVisible({ timeout: 20_000 })
    for (const level of BLOOM_LEVELS) await expect(page.getByTestId(`level-${level}`)).toBeVisible()
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'exam-debrief.png'), fullPage: true })

    const { data: runs } = await db().from('exam_runs').select('*').eq('learner_id', learnerId)
    expect(runs).toHaveLength(1)
    expect(runs![0]).toMatchObject({ status: 'finished', mode: 'checkpoint', n_items: served })
    const { data: items } = await db().from('exam_item_events').select('*').eq('run_id', runs![0].id)
    expect(items).toHaveLength(served)
    expect(items!.find(i => i.position === 0)!.marked).toBe(true)
    expect(items!.find(i => i.position === 1)!.correct).toBe(true)
    const expectedCorrect = Math.ceil(served / 2) + 1
    expect(items!.filter(i => i.correct).length).toBe(expectedCorrect)
    await expect(page.getByRole('heading', { name: new RegExp(`^${expectedCorrect} of ${served} right`) })).toBeVisible()

    const { data: attempts } = await db().from('attempt_events').select('session_id').eq('learner_id', learnerId)
    expect(attempts).toHaveLength(served)
    for (const a of attempts!) expect(a.session_id).toBeNull()

    // Measurement-only: the learner model is exactly as it was.
    const [skillsAfter, schedulesAfter] = await Promise.all([
      db().from('learner_skill_states').select('skill_id,p_know').eq('learner_id', learnerId),
      db().from('review_schedules').select('skill_id,due_at').eq('learner_id', learnerId),
    ])
    expect(skillsAfter.data).toEqual(skillsBefore.data)
    expect(schedulesAfter.data).toEqual(schedulesBefore.data)
  } finally {
    await cleanup(learnerId)
  }
})

test('practice gives a nudge then how to proceed, records hint use, and debriefs it', async ({ page }) => {
  loadLocalEnvironment()
  let learnerId: string | null = null
  try {
    learnerId = await register(page, 'practice')
    await page.goto(`/learn/exam/${PHASE}`)
    await page.getByTestId('start-practice').click()
    await expect(page.getByTestId('exam-timer')).toContainText('answered so far')

    const q = byId.get(await currentQuestionId(page))!
    await page.getByTestId('hint-button').click()
    await expect(page.getByTestId('hint-1')).toBeVisible()
    await page.getByTestId('hint-button').click()
    await expect(page.getByTestId('hint-2')).toBeVisible()
    await expect(page.getByTestId('hint-button')).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'exam-practice-hints.png'), fullPage: true })

    await page.getByTestId(`exam-option-${q.correct_option_id}`).click()
    await page.getByTestId('save-answer').click()
    await currentQuestionId(page)
    await page.getByTestId('review-button').click()
    await page.getByTestId('submit-exam').click()
    await expect(page.getByTestId('exam-debrief')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/items with a hint \(1 took both\)/)).toBeVisible()
    // Both hints were asked for within seconds of each other.
    await expect(page.getByTestId('rapid-hints')).toBeVisible()

    const { data: items } = await db().from('exam_item_events').select('hint_level,hint_abuse,question_id').eq('learner_id', learnerId)
    const first = items!.find(i => i.question_id === q.id)!
    expect(first.hint_level).toBe(2)
    expect(first.hint_abuse).toBe(true)
  } finally {
    await cleanup(learnerId)
  }
})
