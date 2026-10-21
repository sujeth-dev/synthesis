import { NextResponse } from 'next/server'
export async function GET() {
  try {
    const questions = require('../../../../../content/questions/diagnostic/questions.json')
    return NextResponse.json({ questions })
  } catch {
    return NextResponse.json({ questions: [] })
  }
}
