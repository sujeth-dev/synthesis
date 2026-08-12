'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { FeedbackBanner } from '@/components/learning/FeedbackBanner'
import type { PhaseEvaluationQuestion, BloomLevel } from '@/types'

const BLOOM_LEVELS: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const BLOOM_LABELS: Record<BloomLevel, string> = {
  remember: 'Remember', understand: 'Understand', apply: 'Apply',
  analyze: 'Analyze', evaluate: 'Evaluate', create: 'Create',
}
const PHASE_LABELS: Record<string, string> = {
  phase_1_computer_basics: 'Phase 1', phase_1b_programming_basics: 'Phase 1B', phase_2_cs_data: 'Phase 2', phase_3_intro_ai: 'Phase 3',
}

interface EvalResult { question_id: string; skill_id: string; bloom_level: BloomLevel; correct: boolean }

export default function PhaseEvaluationPage() {
  const router = useRouter()
  const params = useParams()
  const phase = params.phase as string

  const [questions, setQuestions] = useState<PhaseEvaluationQuestion[]>([])
  const [loading,   setLoading]   = useState(true)
  const [started,   setStarted]   = useState(false)
  const [idx,       setIdx]       = useState(0)
  const [selected,  setSelected]  = useState<string | null>(null)
  const [revealed,  setRevealed]  = useState(false)
  const [correct,   setCorrect]   = useState(false)
  const [explanation, setExplanation] = useState('')
  const [results,   setResults]   = useState<EvalResult[]>([])
  const [questionStart, setQuestionStart] = useState(() => Date.now())

  useEffect(() => {
    fetch(`/api/phase-evaluation?phase=${phase}`)
      .then(r => r.json())
      .then(d => { setQuestions(d.questions ?? []); setLoading(false) })
  }, [phase])

  async function submit() {
    const q = questions[idx]
    if (!selected) return
    const res = await fetch('/api/phase-evaluation/attempt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase, question_id: q.id, skill_id: q.skill_id,
        selected_option_id: selected, latency_ms: Date.now() - questionStart,
      }),
    })
    const body = await res.json()
    setCorrect(body.correct)
    setExplanation(body.explanation_after ?? '')
    setResults(r => [...r, { question_id: q.id, skill_id: q.skill_id, bloom_level: q.bloom_level, correct: body.correct }])
    setRevealed(true)
  }

  function next() {
    setSelected(null); setRevealed(false); setExplanation('')
    setQuestionStart(Date.now())
    setIdx(i => i + 1)
  }

  if (loading) return <Spinner label="Loading phase evaluation…" />

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-c-bg flex items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <p className="text-[14px] text-c-muted mb-6">This phase evaluation isn't available yet.</p>
          <button onClick={() => router.push('/dashboard')}
            className="px-6 py-2.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[13px] font-medium transition-all">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Intro screen ─────────────────────────────────────────────────────────
  if (!started) return (
    <div className="min-h-screen bg-c-bg flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center animate-slide-up">
        <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.14em] mb-4">
          {PHASE_LABELS[phase] ?? phase} Evaluation
        </p>
        <h1 className="font-serif italic text-[32px] text-c-text mb-4">
          A quick check across every level of thinking
        </h1>
        <p className="text-[14px] text-c-muted mb-8 leading-[1.7]">
          {questions.length} questions spanning Remember, Understand, Apply, Analyze, Evaluate, and Create —
          not just recall. This is optional and doesn't gate your progress; it's a self-check on how deeply
          you've engaged with this phase's main concepts.
        </p>
        <button
          onClick={() => setStarted(true)}
          className="px-8 py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.02]"
        >
          Begin →
        </button>
      </div>
    </div>
  )

  // ── Results screen ────────────────────────────────────────────────────────
  if (idx >= questions.length) {
    const byLevel = BLOOM_LEVELS.map(level => {
      const levelResults = results.filter(r => r.bloom_level === level)
      const correctCount = levelResults.filter(r => r.correct).length
      return { level, correct: correctCount, total: levelResults.length }
    })
    const totalCorrect = results.filter(r => r.correct).length

    return (
      <div className="min-h-screen bg-c-bg flex items-center justify-center p-8">
        <div className="max-w-lg w-full animate-slide-up">
          <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.14em] mb-4 text-center">
            {PHASE_LABELS[phase] ?? phase} Evaluation complete
          </p>
          <h1 className="font-serif italic text-[28px] text-c-text mb-2 text-center">
            {totalCorrect} of {results.length} correct
          </h1>
          <p className="text-[13px] text-c-muted mb-8 text-center">
            Breakdown by kind of thinking, not just overall score
          </p>
          <div className="space-y-2.5 mb-8">
            {byLevel.map(({ level, correct: c, total }) => (
              <div key={level} data-testid={`bloom-row-${level}`} className="flex items-center justify-between px-5 py-3.5 rounded-xl bg-c-bg2 border border-[var(--border)]">
                <span className="text-[13px] text-c-text">{BLOOM_LABELS[level]}</span>
                <span data-testid={`bloom-score-${level}`} className={`font-mono text-[13px] ${c === total ? 'text-c-green' : 'text-c-muted'}`}>
                  {c}/{total}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01]"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Question screen ───────────────────────────────────────────────────────
  const q = questions[idx]
  const progress = (idx / questions.length) * 100

  return (
    <div className="min-h-screen bg-c-bg flex items-center justify-center p-8">
      <div className="max-w-xl w-full animate-slide-up">

        <div className="flex items-center justify-between mb-6">
          <span className="font-mono text-[11px] text-c-faint">
            {idx + 1} of {questions.length} · {BLOOM_LABELS[q.bloom_level]}
          </span>
          <div className="flex-1 mx-4 h-1 bg-c-bg3 rounded-full overflow-hidden">
            <div
              className="h-full bg-c-purple rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4">
          <p data-testid={`question-${q.id}`} className="text-[15px] text-c-text leading-[1.65] mb-5 whitespace-pre-wrap">{q.stem}</p>
          <div className="space-y-2.5">
            {q.options.map(opt => {
              const isSel = selected === opt.id
              const isRight = revealed && opt.id === q.correct_option_id
              const isWrongSel = revealed && isSel && opt.id !== q.correct_option_id
              return (
                <button
                  key={opt.id}
                  data-testid={`option-${opt.id}`}
                  onClick={() => !revealed && setSelected(opt.id)}
                  disabled={revealed}
                  className={`w-full text-left px-5 py-3.5 rounded-xl border transition-all text-[13px] ${
                    isRight
                      ? 'border-c-green/50 bg-c-green/10 text-c-green'
                      : isWrongSel
                        ? 'border-c-red/50 bg-c-red/10 text-c-red'
                        : isSel
                          ? 'border-c-purple/50 bg-c-purple/10 text-c-purple'
                          : 'border-[var(--border)] bg-c-bg3 text-c-muted hover:border-[var(--border-hi)] hover:text-c-text'
                  }`}
                >
                  <span className="font-mono text-[11px] mr-3 opacity-60">{opt.id.toUpperCase()}</span>
                  {opt.text}
                </button>
              )
            })}
          </div>
        </div>

        {revealed && <div className="mb-4"><FeedbackBanner correct={correct} explanation_after={explanation} /></div>}

        {revealed ? (
          <button
            onClick={next}
            className="w-full py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01]"
          >
            {idx + 1 < questions.length ? 'Next →' : 'See results →'}
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!selected}
            className="w-full py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01] disabled:opacity-40"
          >
            Submit
          </button>
        )}

      </div>
    </div>
  )
}
