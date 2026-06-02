import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

let _client: ReturnType<typeof createClient> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): any {
  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return _client
}

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
