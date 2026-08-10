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

// Never let a connection string leak into stdout/stderr.
function sanitize(message) {
  return String(message ?? '').replace(/postgres(?:ql)?:\/\/\S+/gi, '<redacted>')
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations')

// Splits a .sql file into individual statements on top-level semicolons,
// skipping full-line comments. Good enough for this repo's migrations,
// which contain no string literals with embedded semicolons.
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

const EXPECTED_COLUMNS = [
  'p_know_before', 'p_know_after',
  'motivation_state', 'consecutive_errors', 'slow_response_streak',
  'behavior_modifier', 'hesitation_ms',
]
const EXPECTED_INDEX = 'idx_ae_session_behavior'

async function main() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.error(`No .sql files found in ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      const statements = splitStatements(sql)
      console.log(`Applying ${file}...`)
      try {
        await client.query('BEGIN')
        for (const stmt of statements) {
          await client.query(stmt)
        }
        await client.query('COMMIT')
        console.log(`  ✓ ${file} applied`)
      } catch (e) {
        await client.query('ROLLBACK')
        console.error(`  ✗ ${file} failed: ${sanitize(e.message)}`)
        process.exit(1)
      }
    }

    console.log('\nVerifying attempt_events schema...')
    const colResult = await client.query(
      `select column_name from information_schema.columns where table_name = 'attempt_events'`
    )
    const presentColumns = new Set(colResult.rows.map(r => r.column_name))
    let allPresent = true
    for (const col of EXPECTED_COLUMNS) {
      const present = presentColumns.has(col)
      console.log(`  ${present ? '✓' : '✗'} column ${col}`)
      if (!present) allPresent = false
    }

    const idxResult = await client.query(
      `select indexname from pg_indexes where tablename = 'attempt_events'`
    )
    const presentIndexes = new Set(idxResult.rows.map(r => r.indexname))
    const indexPresent = presentIndexes.has(EXPECTED_INDEX)
    console.log(`  ${indexPresent ? '✓' : '✗'} index ${EXPECTED_INDEX}`)
    if (!indexPresent) allPresent = false

    if (!allPresent) {
      console.error('\nOne or more expected columns/indexes are missing after applying migrations.')
      process.exit(1)
    }
    console.log('\nAll migrations applied and verified.')
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error('\nMigration run failed:', sanitize(err.message))
  process.exit(1)
})
