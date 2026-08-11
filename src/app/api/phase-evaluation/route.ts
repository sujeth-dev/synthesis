import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/db/session'
import { PHASE_EVALUATION_FILES, type PhaseKey } from '@/lib/phases'
import type { PhaseEvaluationQuestion } from '@/types'

const PHASE_EVAL_DIR = path.join(process.cwd(), 'content', 'questions', 'phase-evaluation')

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const phase = req.nextUrl.searchParams.get('phase') as PhaseKey | null
  const fileName = phase ? PHASE_EVALUATION_FILES[phase] : undefined
  if (!phase || !fileName) return NextResponse.json({ error: 'Unknown or unauthored phase' }, { status: 400 })

  let questions: PhaseEvaluationQuestion[] = []
  try {
    const raw = fs.readFileSync(path.join(PHASE_EVAL_DIR, fileName), 'utf-8')
    const parsed = JSON.parse(raw)
    questions = Array.isArray(parsed) ? parsed : []
  } catch {
    return NextResponse.json({ error: 'Phase evaluation not found' }, { status: 404 })
  }

  return NextResponse.json({ questions })
}
