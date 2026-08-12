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

// One-off: generates the first real fsrs_shadow_log row against the live database so
// FSRS-4's comparison script (npm run fsrs:compare) has genuine data instead of none.
// Deliberately does NOT clean up afterward — the whole point is for this row (and the
// learner/attempt rows it depends on) to persist so the comparison script can read them.
// Not a permanent regression test on its own (no assertions on FSRS/SM-2 numeric behavior
// — route.test.ts already covers that against a mock); this is the real data source.
test('submitting one real attempt writes a real fsrs_shadow_log row against the live database', async ({ page }) => {
  loadLocalEnvironment()
  const email = `e2e-fsrs-shadow-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`

  const registration = await page.request.post('/api/auth/register', {
    data: { email, password: 'e2e-password', display_name: 'FSRS Shadow Live Cycle' },
  })
  expect(registration.ok(), await registration.text()).toBe(true)
  const registrationBody = await registration.json()
  const learnerId = registrationBody.user.id

  const diagnostic = await page.request.post('/api/diagnostic', { data: { results: [] } })
  expect(diagnostic.ok(), await diagnostic.text()).toBe(true)

  const attemptResponse = await page.request.post('/api/attempt', {
    data: {
      question_id: 'p1_bin_q1',
      skill_id: 'p1_binary_numbers',
      client_answer: 'b',
      correct: true,
      latency_ms: 2500,
      difficulty_tier: 'review',
      question_format: 'mcq',
    },
  })
  expect(attemptResponse.ok(), await attemptResponse.text()).toBe(true)
  const attemptBody = await attemptResponse.json()
  expect(attemptBody.correct).toBe(true)

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: shadowRows, error } = await db
    .from('fsrs_shadow_log')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('skill_id', 'p1_binary_numbers')
  expect(error).toBeNull()
  expect(shadowRows?.length).toBe(1)
  expect(shadowRows![0]).toMatchObject({ learner_id: learnerId, skill_id: 'p1_binary_numbers' })
  expect(Number.isFinite(shadowRows![0].fsrs_interval_days)).toBe(true)
  expect(Number.isFinite(shadowRows![0].sm2_interval_days)).toBe(true)
})
