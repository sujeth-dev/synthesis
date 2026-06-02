import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb, generateId } from '@/lib/db'

const JWT_SECRET    = process.env.JWT_SECRET || 'synaptic-local-dev-secret-change-in-production'
const JWT_EXPIRES_IN = '30d'

export interface AuthUser {
  id: string
  email: string
  display_name: string | null
}

// ── Register
export async function registerUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ user: AuthUser; token: string } | { error: string }> {
  const db = getDb()
  const normalizedEmail = email.toLowerCase().trim()

  const { data: existing } = await db
    .from('learner_profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (existing) return { error: 'Email already registered' }

  const hash = await bcrypt.hash(password, 10)
  const id   = generateId()
  const name = displayName || email.split('@')[0]

  await db.from('learner_profiles').insert({
    id,
    email: normalizedEmail,
    password_hash: hash,
    display_name:  name,
  })

  await db.from('motivation_states').insert({ learner_id: id })

  const token = signToken(id)
  await saveSession(id, token)

  return { user: { id, email: normalizedEmail, display_name: name }, token }
}

// ── Login
export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string } | { error: string }> {
  const { data: row } = await getDb()
    .from('learner_profiles')
    .select('id, email, display_name, password_hash')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (!row) return { error: 'Invalid email or password' }

  const valid = await bcrypt.compare(password, row.password_hash)
  if (!valid) return { error: 'Invalid email or password' }

  const token = signToken(row.id)
  await saveSession(row.id, token)

  return { user: { id: row.id, email: row.email, display_name: row.display_name }, token }
}

// ── Verify token (called from session.ts)
export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any
    const db = getDb()

    const { data: session } = await db
      .from('auth_sessions')
      .select('learner_id')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!session) return null

    const { data: user } = await db
      .from('learner_profiles')
      .select('id, email, display_name')
      .eq('id', payload.sub)
      .maybeSingle()

    if (!user) return null
    return { id: user.id, email: user.email, display_name: user.display_name }
  } catch {
    return null
  }
}

// ── Logout
export async function logoutUser(token: string) {
  await getDb().from('auth_sessions').delete().eq('token', token)
}

// ── Helpers
function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

async function saveSession(learnerId: string, token: string) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await getDb().from('auth_sessions').upsert(
    { token, learner_id: learnerId, expires_at: expiresAt },
    { onConflict: 'token' },
  )
}
