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

const SHOTS = process.env.EXAM_SHOT_DIR
const ANSWERS = 30

// Real data, not seeded rows: every attempt below goes through /api/session and
// /api/attempt exactly as the learn page sends it, so BKT, SM-2, motivation,
// the behaviour discount and every shadow log run for real.
test('the dashboard and profile show the learner model, its evidence and how the learner works', async ({ page }) => {
  test.setTimeout(400_000)
  loadLocalEnvironment()
  const email = `e2e-olm-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`
  let learnerId: string | null = null
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  try {
    const registration = await page.request.post('/api/auth/register', { data: { email, password: 'e2e-password', display_name: 'Model E2E' } })
    expect(registration.ok(), await registration.text()).toBe(true)
    learnerId = (await registration.json()).user.id

    const diagnostic = await page.request.post('/api/diagnostic', {
      data: { results: [
        { question_id: 'dq_01', skill_id: 'p1_what_is_computer', answer: 'b', graph_placement_weight: { p1_what_is_computer: 1 } },
        { question_id: 'dq_02', skill_id: 'p1_binary_numbers', answer: 'a', graph_placement_weight: { p1_binary_numbers: 1 } },
      ] },
    })
    expect(diagnostic.ok(), await diagnostic.text()).toBe(true)

    let sessionId: string | null = null
    let seenSkills: string[] = []
    let seenQuestions: string[] = []
    const servedSkills: string[] = []
    let answered = 0
    let guard = 0
    while (answered < ANSWERS && guard < ANSWERS * 3) {
      guard += 1
      if (!sessionId) {
        const start = await page.request.post('/api/session', { data: { action: 'start' } })
        expect(start.ok(), await start.text()).toBe(true)
        sessionId = (await start.json()).session_id
        seenSkills = []
        seenQuestions = []
      }
      const next = await page.request.post('/api/session', {
        data: { action: 'next', session_id: sessionId, seen_skills: seenSkills, seen_question_ids: seenQuestions, mode: 'learn' },
      })
      expect(next.ok(), await next.text()).toBe(true)
      const body = await next.json()
      if (!body.task) {
        await page.request.post('/api/session', { data: { action: 'end', session_id: sessionId } })
        sessionId = null
        continue
      }
      const q = body.task.question
      // Mostly right, a wrong pair every fifth answer, and a spread of pace and
      // hesitation so the behaviour panel has something real to read.
      const right = answered % 5 < 3
      let clientAnswer: string
      if (q.format === 'mcq') clientAnswer = right ? q.correct_option_id : q.options.find((o: { id: string }) => o.id !== q.correct_option_id).id
      else if (q.format === 'fill' && q.correct_answer) clientAnswer = right ? q.correct_answer : 'not sure'
      else clientAnswer = 'I am not sure how to explain this yet'
      const latency = 4_000 + (answered % 4) * 6_000
      const attempt = await page.request.post('/api/attempt', {
        data: {
          question_id: q.id, skill_id: body.task.skill_id, session_id: sessionId,
          client_answer: clientAnswer, latency_ms: latency, hesitation_ms: Math.round(latency * 0.4),
          revision_count: answered % 3 === 0 ? 1 : 0,
          difficulty_tier: body.task.difficulty_tier, question_format: q.format,
        },
      })
      expect(attempt.ok(), await attempt.text()).toBe(true)
      seenSkills = [...seenSkills, body.task.skill_id]
      servedSkills.push(body.task.skill_id)
      seenQuestions = [...seenQuestions, q.id]
      answered += 1
    }
    if (sessionId) await page.request.post('/api/session', { data: { action: 'end', session_id: sessionId } })
    expect(answered).toBe(ANSWERS)

    // LIVE-1: with SELECTOR unset the score serves. Every decision with a real
    // choice is logged as applied, in order, and its pick is what was served.
    const { data: selections, error: selectionError } = await db.from('selection_shadow')
      .select('score_skill_id,applied,candidate_count').eq('learner_id', learnerId).order('created_at')
    expect(selectionError).toBeNull()
    expect((selections ?? []).length).toBeGreaterThan(0)
    for (const row of selections ?? []) {
      expect(row.applied).toBe(true)
      expect(row.candidate_count).toBeGreaterThanOrEqual(2)
      expect(servedSkills).toContain(row.score_skill_id)
    }

    // A short Practice exam with a hint, so the Bloom profile and hint reliance have data.
    const bank = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'questions', 'phase-evaluation', 'p1_evaluation.json'), 'utf8'))
    const byId = new Map(bank.map((q: { id: string }) => [q.id, q]))
    const start = await page.request.post('/api/exam', { data: { action: 'start', phase: 'phase_1_computer_basics', mode: 'practice' } })
    const run = await start.json()
    let item = run.item
    for (let i = 0; i < 6 && item; i += 1) {
      if (i === 2) await page.request.post('/api/exam', { data: { action: 'hint', run_id: run.run.id, question_id: item.question_id } })
      const q = byId.get(item.question_id) as { correct_option_id: string; options: { id: string }[] }
      const pick = i % 3 === 2 ? q.options.find(o => o.id !== q.correct_option_id)!.id : q.correct_option_id
      const res = await (await page.request.post('/api/exam', {
        data: { action: 'answer', run_id: run.run.id, question_id: item.question_id, selected_option_id: pick, latency_ms: 25_000 },
      })).json()
      item = res.item
    }
    const finish = await page.request.post('/api/exam', { data: { action: 'finish', run_id: run.run.id } })
    expect(finish.ok()).toBe(true)

    // ── Dashboard ───────────────────────────────────────────────────────────
    await page.goto('/dashboard')
    await expect(page.getByTestId('reason-line')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('reason-line')).toContainText('Starts with')
    await expect(page.getByTestId('next-up')).not.toContainText('advisory')
    await expect(page.getByTestId('review-forecast')).toBeVisible()
    await expect(page.getByTestId('dashboard-bloom')).toContainText('Latest exam')
    await expect(page.getByTestId('behaviour-insights')).toBeVisible()
    for (const card of ['insight-pace', 'insight-hesitation', 'insight-revisions', 'insight-mood', 'insight-discount', 'insight-hints']) {
      await expect(page.getByTestId(card)).toBeVisible()
    }
    await expect(page.getByTestId('insight-hints')).toContainText('%')
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'dashboard.png'), fullPage: true })

    // ── Profile ─────────────────────────────────────────────────────────────
    await page.goto('/profile')
    await expect(page.getByTestId('skill-profile')).toBeVisible({ timeout: 30_000 })
    // Accuracy and attempts cover practice only, every one of them.
    const { data: rows } = await db.from('attempt_events').select('question_id,correct').eq('learner_id', learnerId)
    const practice = (rows ?? []).filter(r => !r.question_id.includes('_eval_'))
    await expect(page.getByTestId('stat-attempts')).toContainText(String(practice.length))
    const accuracy = Math.round(practice.filter(r => r.correct).length / practice.length * 100)
    await expect(page.getByTestId('stat-accuracy')).toContainText(`${accuracy}%`)
    const { data: states } = await db.from('learner_skill_states').select('skill_id,total_attempts').eq('learner_id', learnerId).gt('total_attempts', 0)
    for (const s of (states ?? []).slice(0, 3)) {
      await expect(page.getByTestId(`skill-row-${s.skill_id}`)).toBeVisible()
      await expect(page.getByTestId(`belief-${s.skill_id}`)).toBeVisible()
      await expect(page.getByTestId(`evidence-${s.skill_id}`)).toBeVisible()
    }
    await expect(page.getByTestId('learning-curve')).toBeVisible()
    await expect(page.getByTestId('bloom-profile')).toBeVisible()
    await expect(page.getByTestId('activity')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'profile.png'), fullPage: true })
  } finally {
    if (learnerId) {
      const { error } = await db.from('learner_profiles').delete().eq('id', learnerId)
      if (error) throw new Error(`E2E cleanup failed: ${error.message}`)
    }
  }
})
