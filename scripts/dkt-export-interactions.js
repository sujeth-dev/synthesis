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

const OUT_DIR = path.join(__dirname, '..', 'Research', 'dkt', 'data')
const OUT_PATH = path.join(OUT_DIR, 'synaptic_interactions.csv')

// 50,000-interaction figure from dkt-live-integration-scope.md's Blocker 1 —
// the same order of magnitude the ASSISTments benchmark itself needed.
const VOLUME_TARGET = 50000

function csvField(value) {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    const { rows } = await client.query(
      `select learner_id as student_id, skill_id, correct, attempted_at as timestamp
       from attempt_events
       order by learner_id, attempted_at asc`
    )

    fs.mkdirSync(OUT_DIR, { recursive: true })

    const lines = ['student_id,skill_id,correct,timestamp']
    for (const row of rows) {
      lines.push([
        csvField(row.student_id),
        csvField(row.skill_id),
        row.correct ? 1 : 0,
        csvField(row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp),
      ].join(','))
    }
    fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n')

    const studentCount = new Set(rows.map(r => r.student_id)).size
    const skillCount = new Set(rows.map(r => r.skill_id)).size
    const pct = (rows.length / VOLUME_TARGET * 100).toFixed(2)

    console.log('DKT-9 interaction export')
    console.log('=========================')
    console.log(`Rows written:       ${rows.length}`)
    console.log(`Unique students:    ${studentCount}`)
    console.log(`Unique skills:      ${skillCount}`)
    console.log(`Output:             ${OUT_PATH}`)
    console.log('')
    console.log(
      `${rows.length} / ${VOLUME_TARGET.toLocaleString('en-US')} interactions (${pct}%) — ` +
      (rows.length >= VOLUME_TARGET
        ? 'DKT-10 retraining volume threshold met.'
        : 'DKT-10 retraining is not yet justified by volume.')
    )
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error('\nDKT interaction export failed:', sanitize(err.message))
  process.exit(1)
})
