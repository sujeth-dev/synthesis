'use strict'
const { Client } = require('pg')
const fs         = require('fs')
const path       = require('path')

// ── Load .env.local ─────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}

const DB_URL = process.env.SUPABASE_DB_URL

if (!DB_URL) {
  console.error('ERROR: SUPABASE_DB_URL not set in .env.local')
  console.error('Get it from Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI (direct connection, port 5432).')
  process.exit(1)
}

function sanitize(message) {
  return String(message ?? '').replace(/postgres(?:ql)?:\/\/\S+/gi, '<redacted>')
}

// Mirrors src/lib/fsrs/comparison.ts's computeShadowDivergence(), which is
// unit-tested in src/lib/fsrs/comparison.test.ts — this script has no TS
// build step, so the same small pure function is duplicated here rather than
// imported. Keep the two in sync if the formula ever changes.
const MIN_SAMPLE_FOR_SIGNAL = 30

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function pearsonCorrelation(xs, ys) {
  if (xs.length < 2) return null
  const mx = mean(xs)
  const my = mean(ys)
  let numerator = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    numerator += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  if (dx2 === 0 || dy2 === 0) return null
  return numerator / Math.sqrt(dx2 * dy2)
}

function computeShadowDivergence(entries) {
  if (entries.length === 0) {
    return {
      count: 0, mean_sm2_interval_days: 0, mean_fsrs_interval_days: 0,
      mean_absolute_delta_days: 0, mean_signed_delta_days: 0, interval_correlation: null,
    }
  }
  const sm2 = entries.map(e => e.sm2_interval_days)
  const fsrs = entries.map(e => e.fsrs_interval_days)
  const deltas = entries.map(e => e.fsrs_interval_days - e.sm2_interval_days)
  return {
    count: entries.length,
    mean_sm2_interval_days: mean(sm2),
    mean_fsrs_interval_days: mean(fsrs),
    mean_absolute_delta_days: mean(deltas.map(Math.abs)),
    mean_signed_delta_days: mean(deltas),
    interval_correlation: pearsonCorrelation(sm2, fsrs),
  }
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    const { rows } = await client.query(
      'select sm2_interval_days, fsrs_interval_days from fsrs_shadow_log order by created_at asc'
    )
    const result = computeShadowDivergence(rows)

    console.log('FSRS shadow-mode comparison (FSRS-4)')
    console.log('=====================================')
    console.log(`Sample size:                 ${result.count}`)
    console.log(`Mean SM-2 interval (days):   ${result.mean_sm2_interval_days.toFixed(2)}`)
    console.log(`Mean FSRS interval (days):   ${result.mean_fsrs_interval_days.toFixed(2)}`)
    console.log(`Mean signed delta (days):    ${result.mean_signed_delta_days.toFixed(2)} (positive = FSRS longer)`)
    console.log(`Mean absolute delta (days):  ${result.mean_absolute_delta_days.toFixed(2)}`)
    console.log(`Interval correlation (r):    ${result.interval_correlation === null ? 'n/a' : result.interval_correlation.toFixed(4)}`)

    if (result.count < MIN_SAMPLE_FOR_SIGNAL) {
      console.log(`\nSample size is below the ${MIN_SAMPLE_FOR_SIGNAL}-row minimum this script treats as`)
      console.log('meaningful — no cutover recommendation should be drawn from this run yet.')
    } else {
      console.log('\nSample size meets the minimum for a first read. This script only reports')
      console.log('statistics — a written recommendation still requires human review; see')
      console.log('research/fsrs-shadow-comparison.md.')
    }
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error('\nFSRS shadow comparison failed:', sanitize(err.message))
  process.exit(1)
})
