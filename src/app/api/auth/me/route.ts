import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { getLearnerProfile } from '@/lib/db/queries'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ user: null })
    const profile = await getLearnerProfile(user.id)
    return NextResponse.json({ user: profile })
  } catch (err: any) {
    console.error('[me]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
