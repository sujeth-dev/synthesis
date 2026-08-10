'use client'

/**
 * /learn/skill/[skill_id]
 *
 * Direct skill-entry learning page.
 * Full Learn → Practice → Apply → Review four-mode progression for a single skill.
 *
 * Mode state machine:
 *   init
 *     ↓ (p_know < 0.35 OR total_attempts === 0)  → 'learn'
 *     ↓ (already familiar)                        → 'practice'
 *   learn      (read explanation)
 *     → 'practice'
 *   practice   (answer a question)
 *     → 'result'
 *   result     (see if correct)
 *     → 'apply'   (if explanation.build_task exists)
 *     → 'review'  (if explanation.explain_back_prompt exists, no build_task)
 *     → 'done'
 *   apply      (build task)
 *     → 'review'  (if explain_back_prompt exists)
 *     → 'done'
 *   review     (explain it back)
 *     → 'done'
 *   done       (summary + CTA)
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Explanation, Question } from '@/types'
import { QuestionCard }     from '@/components/learning/QuestionCard'
import { FeedbackBanner }   from '@/components/learning/FeedbackBanner'
import { FeynmanLoop }      from '@/components/learning/FeynmanLoop'
import { Spinner }          from '@/components/ui/Spinner'
import { Navbar }           from '@/components/layout/Navbar'
import { mdToHtml }         from '@/components/ui/mdToHtml'
import { useAnalytics }     from '@/hooks/useAnalytics'
import { getMasteryTier }   from '@/lib/bkt'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowMode = 'init' | 'learn' | 'practice' | 'result' | 'apply' | 'review' | 'feynman' | 'done'

interface SkillData {
  blocked:     boolean
  prereqs?:    { id: string; label: string }[]
  node?: {
    id: string; label: string; phase: string
    intuition: string; analogy: string; why_it_matters: string
    question_ids: string[]
  }
  state?: {
    p_know: number; mastery_state: string
    total_attempts: number; consecutive_correct: number
  }
  explanation?: Explanation
  question?:    Question
  depth?:       string
  schedule?: {
    due_at: string; repetitions: number; interval_days: number
  } | null
}

// ─── Mode Step Bar ────────────────────────────────────────────────────────────

const STEPS: { id: FlowMode; label: string }[] = [
  { id: 'learn',    label: 'Learn'    },
  { id: 'practice', label: 'Practice' },
  { id: 'apply',    label: 'Apply'    },
  { id: 'review',   label: 'Review'   },
]

function StepBar({ mode, hasApply, hasReview }: { mode: FlowMode; hasApply: boolean; hasReview: boolean }) {
  const visible = STEPS.filter(s => {
    if (s.id === 'apply'  && !hasApply)  return false
    if (s.id === 'review' && !hasReview) return false
    return true
  })
  const activeIdx = visible.findIndex(s => s.id === mode)

  return (
    <div className="flex items-center gap-2 mb-6">
      {visible.map((step, idx) => {
        const isPast    = idx < activeIdx
        const isActive  = idx === activeIdx
        return (
          <div key={step.id} className="flex items-center gap-2">
            {idx > 0 && (
              <div className={`h-px w-6 transition-all ${isPast ? 'bg-c-purple' : 'bg-[var(--border)]'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono transition-all ${
                  isPast
                    ? 'bg-c-purple text-white'
                    : isActive
                    ? 'bg-c-purple/20 border-2 border-c-purple text-c-purple'
                    : 'bg-c-bg3 border border-[var(--border)] text-c-ghost'
                }`}
              >
                {isPast ? '✓' : idx + 1}
              </div>
              <span
                className={`text-[11px] font-mono transition-colors ${
                  isActive ? 'text-c-purple' : isPast ? 'text-c-muted' : 'text-c-ghost'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkillLearnPage() {
  const params   = useParams<{ skill_id: string }>()
  const router   = useRouter()
  const { track } = useAnalytics()
  const skill_id = params.skill_id

  const [data,        setData]        = useState<SkillData | null>(null)
  const [mode,        setMode]        = useState<FlowMode>('init')
  const [sessionId,   setSessionId]   = useState<string | null>(null)
  const [selected,    setSelected]    = useState<string | null>(null)
  const [fillAnswer,  setFillAnswer]  = useState('')
  const [feedback,    setFeedback]    = useState<{ correct: boolean; explanation_after?: string } | null>(null)
  const [explainText, setExplainText] = useState('')
  const [buildDone,   setBuildDone]   = useState(false)
  const [explainDone, setExplainDone] = useState(false)
  const [feynmanDone, setFeynmanDone] = useState<boolean | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Derived
  const explanation = data?.explanation ?? null
  const question    = data?.question    ?? null
  const hasApply    = !!explanation?.build_task
  const hasReview   = !!explanation?.explain_back_prompt

  // ── Load skill data + start a session ─────────────────────────────────────
  useEffect(() => {
    if (!skill_id) return
    let cancelled = false

    async function load() {
      try {
        const [skillRes, sessionRes] = await Promise.all([
          fetch(`/api/skill?skill_id=${skill_id}`),
          fetch('/api/session', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          }),
        ])
        const skillData: SkillData = await skillRes.json()
        const sessionData = await sessionRes.json()
        if (cancelled) return
        if (!skillRes.ok) { setError(skillData.blocked ? 'blocked' : (skillData as any).error ?? 'Failed to load skill'); return }

        setData(skillData)
        if (sessionData.session_id) setSessionId(sessionData.session_id)

        // Decide starting mode
        if (skillData.blocked) { setMode('done'); return }
        const pKnow   = skillData.state?.p_know ?? 0
        const attempts = skillData.state?.total_attempts ?? 0
        const startLearn = pKnow < 0.35 || attempts === 0
        setMode(startLearn ? 'learn' : 'practice')

        track({ name: 'skill_study_start', props: { skill_id, mode: startLearn ? 'learn' : 'practice' } })
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Unknown error')
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill_id])

  // ── Submit answer ─────────────────────────────────────────────────────────
  async function submitAnswer() {
    if (!question || !sessionId) return
    const answer = question.format === 'mcq' ? selected : fillAnswer
    if (!answer && question.format !== 'explain') return
    setSubmitting(true)
    const start = Date.now()
    try {
      const r = await fetch('/api/attempt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id, skill_id, session_id: sessionId,
          latency_ms: Date.now() - start, client_answer: answer,
          difficulty_tier: question.difficulty_tier,
          question_format: question.format,
        }),
      })
      const d = await r.json()
      setFeedback({ correct: d.correct, explanation_after: question.explanation_after })
      track({ name: 'attempt_submit', props: { correct: d.correct, skill_id, source: 'direct' } })
      setMode('result')
    } catch { /* silently continue */ }
    finally { setSubmitting(false) }
  }

  // ── Submit explain-back ───────────────────────────────────────────────────
  async function submitExplainBack() {
    if (!explainText.trim() || !sessionId) return
    try {
      await fetch('/api/attempt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: `${skill_id}_explain_back`, skill_id, session_id: sessionId,
          latency_ms: 5000, client_answer: explainText, correct: true,
          difficulty_tier: 'same', question_format: 'explain',
        }),
      })
      track({ name: 'explain_back_submit', props: { skill_id } })
      setExplainDone(true)
    } catch { /* silently continue */ }
  }

  // ── Submit Feynman Loop result ────────────────────────────────────────────
  async function submitFeynmanLoop(result: { resolved: boolean; firstExplanation: string; secondExplanation: string }) {
    if (!sessionId) return
    try {
      await fetch('/api/attempt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: `${skill_id}_feynman_loop`, skill_id, session_id: sessionId,
          latency_ms: 5000, client_answer: `${result.firstExplanation}\n---\n${result.secondExplanation}`,
          correct: result.resolved, difficulty_tier: 'same', question_format: 'explain',
        }),
      })
      track({ name: 'feynman_loop_complete', props: { skill_id, resolved: result.resolved } })
    } catch { /* silently continue */ }
    finally {
      setFeynmanDone(result.resolved)
      setMode('done')
    }
  }

  // ── Navigate between modes ────────────────────────────────────────────────
  function advanceFromResult() {
    if (hasApply)   { setMode('apply');   return }
    if (hasReview)  { setMode('review');  return }
    setMode('done')
  }

  function advanceFromApply() {
    if (hasReview)  { setMode('review');  return }
    setMode('done')
  }

  // ── End session + redirect ────────────────────────────────────────────────
  async function finish(dest: 'dashboard' | 'next' | 'repeat') {
    if (sessionId) {
      await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', session_id: sessionId }),
      })
    }
    if (dest === 'dashboard') router.push('/dashboard')
    else if (dest === 'next')   router.push('/learn')
    else { // repeat — reload the page
      setMode('init'); setSelected(null); setFillAnswer(''); setFeedback(null)
      setExplainText(''); setBuildDone(false); setExplainDone(false); setFeynmanDone(null)
      setData(null)
      router.refresh()
      // Re-trigger load
      const r = await fetch(`/api/skill?skill_id=${skill_id}`)
      const d = await r.json()
      setData(d)
      const pKnow = d.state?.p_know ?? 0
      setMode(pKnow < 0.35 ? 'learn' : 'practice')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Renders
  // ─────────────────────────────────────────────────────────────────────────

  if (error === 'blocked' && data?.prereqs) {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-xl mx-auto px-8 py-16 text-center animate-slide-up">
          <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.14em] mb-3">Skill locked</p>
          <h1 className="font-serif italic text-[28px] text-c-text mb-3">{data?.node?.label ?? skill_id}</h1>
          <p className="text-[13px] text-c-muted mb-6">
            Complete these prerequisite skills first:
          </p>
          <div className="flex flex-col gap-2 mb-8">
            {data.prereqs.map(p => (
              <a
                key={p.id}
                href={`/learn/skill/${p.id}`}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-c-bg2 text-c-text text-[13px] hover:bg-c-bg3 transition-colors"
              >
                {p.label} →
              </a>
            ))}
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-[12px] font-mono text-c-faint hover:text-c-muted underline underline-offset-2 transition-colors">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-xl mx-auto px-8 py-16 text-center animate-slide-up">
          <p className="text-c-red text-[14px] mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="text-[12px] font-mono text-c-faint hover:text-c-muted underline transition-colors">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'init' || !data || !data.node) {
    return <div className="min-h-screen bg-c-bg"><Navbar /><Spinner label="Loading skill…" /></div>
  }

  const { node, state, schedule } = data
  const pKnow     = state?.p_know ?? 0
  const mastery   = state?.mastery_state ?? 'ready'
  const masteryTier = getMasteryTier(pKnow)

  // SM-2 display data
  const scheduleNow       = new Date()
  const scheduleDue       = schedule ? new Date(schedule.due_at) : null
  const scheduleIsOverdue = scheduleDue ? scheduleDue <= scheduleNow : false
  const scheduleDaysOverdue = scheduleDue && scheduleIsOverdue
    ? Math.floor((scheduleNow.getTime() - scheduleDue.getTime()) / 86400000)
    : 0
  const scheduleDaysUntil = scheduleDue && !scheduleIsOverdue
    ? Math.ceil((scheduleDue.getTime() - scheduleNow.getTime()) / 86400000)
    : 0

  // ── Shared header ───────────────────────────────────────────────────────────
  const Header = (
    <div className="mb-6 animate-slide-up">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => router.push('/dashboard')}
          className="font-mono text-[10px] text-c-ghost hover:text-c-faint transition-colors uppercase tracking-[0.12em]"
        >
          ← Dashboard
        </button>
        <span className="text-c-ghost text-[10px]">/</span>
        <span className="font-mono text-[10px] text-c-faint uppercase tracking-[0.12em]">{node.label}</span>
      </div>
      <div className="flex items-start justify-between gap-4 mt-3">
        <div>
          <h1 className="text-[22px] font-semibold text-c-text leading-tight">{node.label}</h1>
          <p className="text-[12px] text-c-faint italic mt-1 leading-relaxed">{node.intuition}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[11px]" style={{ color: mastery === 'mastered' ? '#34d399' : ['fragile', 'learning'].includes(mastery) ? '#7c6eff' : 'var(--text-faint)' }}>
            {masteryTier}
          </p>
          {schedule && schedule.repetitions > 0 && (
            <p className="font-mono text-[10px] mt-0.5" style={{ color: scheduleIsOverdue ? '#fbbf24' : 'var(--text-ghost)' }}>
              {scheduleIsOverdue
                ? `Review overdue ${scheduleDaysOverdue}d`
                : scheduleDaysUntil <= 1
                ? 'Review due soon'
                : `Next review in ${scheduleDaysUntil}d`}
            </p>
          )}
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // LEARN MODE — read explanation first
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'learn') {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-10">
          {Header}
          <StepBar mode="learn" hasApply={hasApply} hasReview={hasReview} />

          {explanation ? (
            <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] overflow-hidden mb-4 animate-slide-up">
              <div className="px-6 pt-6 pb-4">
                <p className="font-mono text-[10px] text-c-purple uppercase tracking-[0.16em] mb-1">Explanation</p>
                <h2 className="text-[17px] font-semibold text-c-text mb-3">{explanation.title}</h2>

                {explanation.key_insight && (
                  <div className="mb-4 px-4 py-3 rounded-lg bg-c-purple/[0.08] border border-c-purple/20">
                    <p className="text-[12px] text-c-purple italic">"{explanation.key_insight}"</p>
                  </div>
                )}

                <div
                  className="prose-synaptic text-[13px] text-c-muted leading-[1.75]"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(explanation.body) }}
                />

                {explanation.common_mistakes && explanation.common_mistakes.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-[var(--border)]">
                    <p className="text-[10px] font-mono text-c-faint uppercase tracking-[0.14em] mb-3">Common mistakes</p>
                    <ul className="space-y-2">
                      {explanation.common_mistakes.map((m, i) => (
                        <li key={i} className="flex gap-2 text-[12px] text-c-muted">
                          <span className="text-c-red mt-0.5">·</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {explanation.mini_exercise && (
                  <div className="mt-4 p-4 rounded-xl bg-c-bg3 border border-[var(--border)]">
                    <p className="text-[10px] font-mono text-c-faint uppercase tracking-[0.14em] mb-2">Quick check</p>
                    <p className="text-[12px] text-c-muted leading-[1.6]">{explanation.mini_exercise}</p>
                  </div>
                )}
              </div>

              {/* Why it matters */}
              {node.why_it_matters && (
                <div className="px-6 py-4 border-t border-[var(--border)] bg-c-bg3">
                  <p className="text-[10px] font-mono text-c-yellow uppercase tracking-[0.14em] mb-1">Why it matters</p>
                  <p className="text-[12px] text-c-muted leading-[1.6]">{node.why_it_matters}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] px-6 py-8 mb-4 text-center animate-slide-up">
              <p className="text-[13px] text-c-muted">No explanation available yet for this skill.</p>
              <p className="text-[11px] text-c-faint mt-2 font-mono italic">Analogy: {node.analogy}</p>
            </div>
          )}

          {/* Proceed button */}
          {question ? (
            <button
              onClick={() => setMode('practice')}
              className="w-full py-3.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01] animate-slide-up"
            >
              I understand — Practice now →
            </button>
          ) : (
            <div className="space-y-2 animate-slide-up">
              <p className="text-center text-[12px] text-c-faint font-mono mb-3">No questions available for this skill yet.</p>
              {hasApply && (
                <button onClick={() => setMode('apply')} className="w-full py-3 rounded-xl bg-c-yellow/10 border border-c-yellow/20 text-c-yellow text-[13px] hover:bg-c-yellow/20 transition-all">
                  Try the build task →
                </button>
              )}
              {hasReview && !hasApply && (
                <button onClick={() => setMode('review')} className="w-full py-3 rounded-xl bg-c-blue/10 border border-c-blue/20 text-c-blue text-[13px] hover:bg-c-blue/20 transition-all">
                  Explain it back →
                </button>
              )}
              {!hasApply && !hasReview && (
                <button onClick={() => finish('dashboard')} className="w-full py-3 rounded-xl border border-[var(--border)] text-c-muted text-[13px] hover:text-c-text transition-all">
                  Back to dashboard
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRACTICE MODE — answer a question
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'practice') {
    const canSubmit = question?.format === 'mcq' ? !!selected : question?.format === 'explain' ? true : !!fillAnswer.trim()
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-10">
          {Header}
          <StepBar mode="practice" hasApply={hasApply} hasReview={hasReview} />

          {question ? (
            <>
              <div className="p-6 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4 animate-slide-up">
                <QuestionCard
                  question={question}
                  selected={selected}
                  fillAnswer={fillAnswer}
                  revealed={false}
                  onSelect={setSelected}
                  onFillChange={setFillAnswer}
                />
              </div>

              <button
                onClick={submitAnswer}
                disabled={!canSubmit || submitting}
                className="w-full py-3.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01] disabled:opacity-40 animate-slide-up"
              >
                {submitting ? 'Checking…' : 'Submit answer →'}
              </button>
            </>
          ) : (
            <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] px-6 py-10 text-center animate-slide-up">
              <p className="text-[13px] text-c-muted mb-4">No practice questions available for this skill yet.</p>
              <button
                onClick={advanceFromResult}
                className="px-5 py-2.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[13px] transition-all"
              >
                Continue →
              </button>
            </div>
          )}

          {/* Skip to learn if they went straight to practice */}
          {explanation && (
            <button
              onClick={() => setMode('learn')}
              className="w-full mt-2 py-2.5 rounded-xl text-c-ghost hover:text-c-faint text-[12px] font-mono transition-colors animate-slide-up"
            >
              ← Re-read explanation
            </button>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULT MODE — feedback after answering
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'result' && question) {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-10">
          {Header}
          <StepBar mode="practice" hasApply={hasApply} hasReview={hasReview} />

          {/* Question shown (revealed) */}
          <div className="p-6 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4 animate-slide-up">
            <QuestionCard
              question={question}
              selected={selected}
              fillAnswer={fillAnswer}
              revealed={true}
              onSelect={() => {}}
              onFillChange={() => {}}
            />
          </div>

          {feedback && (
            <div className="mb-4 animate-slide-up">
              <FeedbackBanner correct={feedback.correct} explanation_after={feedback.explanation_after} />
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 animate-slide-up">
            {/* Primary: done with topic */}
            <button
              onClick={() => setMode('done')}
              className="w-full py-3.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01]"
            >
              Done with this topic →
            </button>
            {/* Optional: apply / review deepening */}
            {(hasApply || hasReview) && (
              <button
                onClick={advanceFromResult}
                className="w-full py-3 rounded-xl border border-c-purple/30 bg-c-purple/[0.06] text-c-purple text-[13px] hover:bg-c-purple/10 transition-all"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-c-purple/60 mr-2">optional</span>
                {hasApply ? 'Try the build task →' : 'Explain it back →'}
              </button>
            )}
            {/* Optional: Feynman Loop — teach it to Rohan when this concept isn't clicking */}
            {hasReview && (
              <button
                onClick={() => setMode('feynman')}
                className="w-full py-3 rounded-xl border border-c-blue/30 bg-c-blue/[0.06] text-c-blue text-[13px] hover:bg-c-blue/10 transition-all"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-c-blue/60 mr-2">optional</span>
                Try the Feynman Loop →
              </button>
            )}
            <button
              onClick={() => finish('next')}
              className="w-full py-2.5 rounded-xl border border-[var(--border)] text-c-muted hover:text-c-text text-[13px] transition-all"
            >
              Next skill →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // APPLY MODE — build task
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'apply' && explanation?.build_task) {
    const bt = explanation.build_task
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-10">
          {Header}
          <StepBar mode="apply" hasApply={hasApply} hasReview={hasReview} />

          <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] overflow-hidden mb-4 animate-slide-up">
            <div className="px-6 pt-6 pb-0">
              <p className="font-mono text-[10px] text-c-yellow uppercase tracking-[0.16em] mb-2">Build task</p>
              <h2 className="text-[17px] font-semibold text-c-text mb-1">{bt.title}</h2>
              {bt.context && (
                <p className="text-[12px] text-c-muted mb-4 leading-[1.6]">{bt.context}</p>
              )}
              <ol className="space-y-2 mb-4">
                {bt.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-[13px] text-c-muted">
                    <span className="font-mono text-[11px] text-c-faint mt-0.5 w-5 flex-shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {bt.expected_output && (
                <div className="p-3 rounded-lg bg-c-bg3 border border-[var(--border)] mb-3">
                  <p className="text-[10px] font-mono text-c-faint mb-1">Expected output</p>
                  <p className="text-[12px] text-c-muted">{bt.expected_output}</p>
                </div>
              )}
              {bt.hint && !buildDone && (
                <p className="text-[12px] text-c-yellow mb-3">Hint: {bt.hint}</p>
              )}
              {bt.starter_code && (
                <pre className="text-[11px] bg-c-bg4 rounded-lg p-3 text-c-muted font-mono mb-4 overflow-x-auto">
                  {bt.starter_code}
                </pre>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setBuildDone(true)}
                disabled={buildDone}
                className="px-4 py-2 rounded-lg bg-c-yellow/10 border border-c-yellow/20 text-c-yellow text-[12px] hover:bg-c-yellow/20 transition-all disabled:opacity-60"
              >
                {buildDone ? '✓ Marked complete' : 'Mark as done'}
              </button>
            </div>
          </div>

          <div className="space-y-2 animate-slide-up">
            <button
              onClick={advanceFromApply}
              className={`w-full py-3.5 rounded-xl text-[14px] font-medium transition-all hover:scale-[1.01] ${
                buildDone
                  ? 'bg-c-purple hover:bg-[var(--purple-hover)] text-white'
                  : 'bg-c-bg3 border border-[var(--border)] text-c-muted hover:text-c-text'
              }`}
            >
              {hasReview ? 'Explain it back →' : 'Finish →'}
            </button>
            <button
              onClick={() => finish('dashboard')}
              className="w-full py-2.5 text-c-ghost hover:text-c-faint text-[12px] font-mono transition-colors"
            >
              Save & exit
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REVIEW MODE — explain it back
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'review' && explanation?.explain_back_prompt) {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-10">
          {Header}
          <StepBar mode="review" hasApply={hasApply} hasReview={hasReview} />

          <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] overflow-hidden mb-4 animate-slide-up">
            <div className="px-6 pt-6 pb-5">
              <p className="font-mono text-[10px] text-c-blue uppercase tracking-[0.16em] mb-2">Explain it back</p>
              <p className="text-[14px] text-c-text mb-5 leading-[1.6]">{explanation.explain_back_prompt}</p>

              <textarea
                value={explainText}
                onChange={e => setExplainText(e.target.value)}
                rows={6}
                placeholder="Write your explanation here — use your own words, not the ones above…"
                className="w-full px-4 py-3 rounded-xl bg-c-bg3 border border-[var(--border)] text-c-text placeholder:text-c-ghost text-[13px] focus:border-c-blue/50 focus:outline-none resize-none transition-colors"
                disabled={explainDone}
              />

              {explainDone && (
                <div className="mt-3 px-4 py-3 rounded-lg bg-c-green/[0.08] border border-c-green/20">
                  <p className="text-[12px] text-c-green">
                    ✓ Explanation submitted — great work reinforcing this concept.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 animate-slide-up">
            {!explainDone ? (
              <button
                onClick={submitExplainBack}
                disabled={!explainText.trim()}
                className="w-full py-3.5 rounded-xl bg-c-blue/20 border border-c-blue/30 text-c-blue hover:bg-c-blue/30 text-[14px] font-medium transition-all disabled:opacity-40"
              >
                Submit explanation →
              </button>
            ) : null}
            <button
              onClick={() => setMode('done')}
              className={`w-full py-3.5 rounded-xl text-[14px] font-medium transition-all hover:scale-[1.01] ${
                explainDone
                  ? 'bg-c-purple hover:bg-[var(--purple-hover)] text-white'
                  : 'border border-[var(--border)] text-c-muted hover:text-c-text'
              }`}
            >
              {explainDone ? 'Finish →' : 'Skip & finish →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEYNMAN MODE — teach it to Rohan
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'feynman') {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-10">
          {Header}
          <FeynmanLoop
            skillLabel={node.label}
            onComplete={submitFeynmanLoop}
            onSkip={() => setMode('done')}
          />
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DONE MODE — completion summary
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <div className="max-w-lg mx-auto px-8 py-20 text-center animate-slide-up">
        <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.14em] mb-4">
          Skill session complete
        </p>
        <h1 className="font-serif italic text-[36px] text-c-text mb-2">{node.label}</h1>
        <p className="text-[13px] text-c-muted mb-8">
          {feedback?.correct
            ? 'You answered correctly and completed all learning modes.'
            : 'You worked through this skill. Keep practising to strengthen it.'}
        </p>

        {/* Mode badges */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {[
            { label: 'Explanation read', done: true,        color: '#7c6eff' },
            { label: 'Question answered', done: !!feedback, color: '#5a8a9f' },
            { label: 'Build task',        done: buildDone,  color: '#fbbf24', skip: !hasApply },
            { label: 'Explained back',    done: explainDone, color: '#38bdf8', skip: !hasReview },
            { label: 'Feynman Loop',      done: !!feynmanDone, color: '#38bdf8', skip: feynmanDone === null },
          ].filter(b => !b.skip).map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono border"
              style={{ color: b.done ? b.color : 'var(--text-ghost)', borderColor: b.done ? b.color + '40' : 'var(--border)', background: b.done ? b.color + '15' : 'transparent' }}
            >
              {b.done ? '✓' : '○'} {b.label}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => finish('next')}
            className="px-6 py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.01]"
          >
            Next skill (auto-session) →
          </button>
          <button
            onClick={() => router.push(`/learn/skill/${skill_id}`)}
            className="px-6 py-3 rounded-xl border border-[var(--border)] text-c-muted hover:text-c-text text-[13px] transition-all"
          >
            Study this skill again ↻
          </button>
          <button
            onClick={() => finish('dashboard')}
            className="px-6 py-2.5 text-c-ghost hover:text-c-faint text-[12px] font-mono transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
