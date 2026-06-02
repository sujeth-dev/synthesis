import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/db/auth'
import type { AuthUser } from '@/lib/db/auth'

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('synaptic_token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function getCurrentUserAndToken(): Promise<{ user: AuthUser; token: string } | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('synaptic_token')?.value
  if (!token) return null
  const user = await verifyToken(token)
  if (!user) return null
  return { user, token }
}
