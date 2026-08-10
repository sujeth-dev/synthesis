'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SessionTask, Explanation, ExplanationDepth, SessionPhase, TaskReason, SessionMode, ReviewUrgency } from '@/types'
import { QuestionCard }     from '@/components/learning/QuestionCard'
import { FeedbackBanner }   from '@/components/learning/FeedbackBanner'
import { ExplanationPanel } from '@/components/learning/ExplanationPanel'
import { MotivationBanner } from '@/components/learning/MotivationBanner'
import { Spinner }          from '@/components/ui/Spinner'
import { Navbar }           from '@/components/layout/Navbar'
import { ProgressiveExplanation } from '@/components/learning/ProgressiveExplanation'
import { useAnalytics }     from '@/hooks/useAnalytics'
import { getMasteryTier, type MasteryTier } from '@/lib/bkt'

interface UnlockedTopic {
  id: string
  label: string
  p_know: number
  mastery_state: string
  deprecated?: boolean
  question_ids: string[]
}

// ─── Reason pill config ───────────────────────────────────────────────────────

const REASON_CONFIG: Record<TaskReason, { label: string; icon: string; color: string }> = {
  active_phase_new:          { label: 'Active phase',      icon: '⬡', color: 'var(--purple)' },
  active_phase_review:       { label: 'Phase review',      icon: '↻', color: 'var(--yellow)' },
  past_phase_review_urgent:  { label: 'Urgent review',     icon: '↻', color: '#f87171' },
  past_phase_review:         { label: 'Past phase review', icon: '↻', color: 'var(--yellow)' },
  confidence_boost:          { label: 'Confidence boost',  icon: '↑', color: 'var(--blue)' },
  varied_practice:           { label: 'Varied practice',   icon: '⇄', color: 'var(--green)' },
}

function isReviewReason(r: TaskReason): boolean {
  return r === 'active_phase_review' || r === 'past_phase_review' || r === 'past_phase_review_urgent'
}

function formatDueLabel(days_until_due: number, urgency?: ReviewUrgency): string {
  if (urgency === 'overdue') {
    const d = Math.max(1, Math.ceil(-days_until_due))
    return d === 1 ? 'Overdue by 1 day' : `Overdue by ${d} days`
  }
  if (urgency === 'due_today') return 'Due today'
  if (urgency === 'due_soon') {
    const d = Math.ceil(days_until_due)
    return d === 1 ? 'Due tomorrow' : `Due in ${d} days`
  }
  return 'Scheduled'
}

function ReasonPill({ reason, pKnow }: { reason: TaskReason; pKnow: number }) {
  const cfg = REASON_CONFIG[reason]
  if (!cfg) return null
  const masteryTier = getMasteryTier(pKnow)
  const showMastery = reason === 'active_phase_new' || reason === 'varied_practice'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono border"
      style={{ color: cfg.color, borderColor: cfg.color + '35', background: cfg.color + '12' }}
      title={`Why this? ${cfg.label}${showMastery ? ` (${masteryTier})` : ''}`}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}{showMastery ? ` · ${masteryTier}` : ''}</span>
    </span>
  )
}

// ─── Learning Mode Step Bar ───────────────────────────────────────────────────

type LearningMode = 'learn' | 'practice' | 'apply' | 'review'

interface ModeStep { id: LearningMode; label: string }

const MODE_STEPS: ModeStep[] = [
  { id: 'learn',    label: 'Learn'    },
  { id: 'practice', label: 'Practice' },
  { id: 'apply',    label: 'Apply'    },
  { id: 'review',   label: 'Review'   },
]

function ModeBar({
  activeMode,
  hasApply,
  hasReview,
}: {
  activeMode: LearningMode
  hasApply:   boolean
  hasReview:  boolean
}) {
  const visible = MODE_STEPS.filter(s => {
    if (s.id === 'apply'  && !hasApply)  return false
    if (s.id === 'review' && !hasReview) return false
    return true
  })
  const activeIdx = visible.findIndex(s => s.id === activeMode)

  return (
    <div className="flex items-center gap-2.5 mb-6">
      {visible.map((step, idx) => {
        const isPast   = idx < activeIdx
        const isActive = idx === activeIdx
        return (
          <div key={step.id} className="flex items-center gap-2.5">
            {idx > 0 && (
              <div className={`h-px w-8 ${isPast ? 'bg-c-purple' : 'bg-[var(--border-hi)]'}`} />
            )}
            <div className="flex items-center gap-2">
              {/* Larger circle: w-5 h-5 */}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ${
                  isPast
                    ? 'bg-c-purple text-white'
                    : isActive
                    ? 'bg-c-purple/20 border-2 border-c-purple text-c-purple'
                    : 'bg-c-bg3 border border-[var(--border)] text-c-ghost'
                }`}
              >
                {isPast ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              {/* Bigger label: 12px */}
              <span
                className={`text-[12px] font-mono font-medium ${
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

// ─── Pre-question Learn Panel ─────────────────────────────────────────────────

interface LearnPanelProps {
  task:        SessionTask
  explanation: Explanation | null
  depth?:      ExplanationDepth
  onReady:     () => void
}

const DEPTH_COLORS: Record<ExplanationDepth, string> = {
  beginner: 'var(--green)',
  mid:      'var(--yellow)',
  advanced: 'var(--orange, #f97316)',
  expert:   'var(--purple)',
}

function LearnPanel({ task, explanation, depth, onReady }: LearnPanelProps) {
  return (
    <div className="animate-slide-up">
      {explanation ? (
        <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] border-t-4 border-t-c-purple overflow-hidden mb-5">
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[12px] text-c-purple uppercase tracking-[0.16em]">New concept</p>
              {depth && (
                <span
                  className="text-[11px] font-mono font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded"
                  style={{ color: DEPTH_COLORS[depth], background: DEPTH_COLORS[depth] + '18' }}
                >
                  {depth}
                </span>
              )}
            </div>
            <h3 className="text-[18px] font-semibold text-c-text mb-3">{explanation.title}</h3>

            {explanation.key_insight && (
              <div className="mb-5 px-4 py-3.5 rounded-xl bg-c-purple/[0.10] border border-c-purple/25">
                <p className="text-[13px] text-c-purple italic leading-[1.6]">"{explanation.key_insight}"</p>
              </div>
            )}

            <ProgressiveExplanation body={explanation.body} />

            {explanation.mini_exercise && (
              <div className="mt-5 p-4 rounded-xl bg-c-bg3 border border-[var(--border)]">
                <p className="text-[11px] font-mono text-c-faint uppercase tracking-[0.14em] mb-2">Quick check</p>
                <p className="text-[13px] text-c-muted leading-[1.6]">{explanation.mini_exercise}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] px-6 py-6 mb-5">
          <p className="font-mono text-[12px] text-c-purple uppercase tracking-[0.14em] mb-2">New concept</p>
          <h3 className="text-[18px] font-semibold text-c-text mb-2">{task.skill_label}</h3>
          <p className="text-[14px] text-c-muted italic leading-[1.6]">{task.skill_intuition}</p>
          {task.skill_analogy && (
            <p className="text-[13px] text-c-faint mt-3 leading-[1.55]">Analogy: {task.skill_analogy}</p>
          )}
        </div>
      )}

      <button
        onClick={onReady}
        className="w-full py-4 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all hover:scale-[1.01]"
      >
        I understand — Practice now →
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LearnPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const requestedSessionMode = (searchParams.get('mode') ?? 'learn') as SessionMode
  const { track } = useAnalytics()

  const [sessionMode,       setSessionMode]       = useState<SessionMode>(requestedSessionMode)
  const [sessionId,         setSessionId]         = useState<string | null>(null)
  const [task,              setTask]              = useState<SessionTask | null>(null)
  const [phase,             setPhase]             = useState<SessionPhase>('loading')
  const [selected,          setSelected]          = useState<string | null>(null)
  const [fillAnswer,        setFillAnswer]        = useState('')
  const [feedback,          setFeedback]          = useState<{ correct: boolean; explanation_after?: string } | null>(null)
  const [explanation,       setExplanation]       = useState<Explanation | null>(null)
  const [explanationDepth,  setExplanationDepth]  = useState<ExplanationDepth>('beginner')
  const [preExplanation,    setPreExplanation]    = useState<Explanation | null>(null)
  const [preDepth,          setPreDepth]          = useState<ExplanationDepth>('beginner')
  const [motivation,        setMotivation]        = useState<string>('neutral')
  const [seenSkills,        setSeenSkills]        = useState<string[]>([])
  const [seenQuestions,     setSeenQuestions]     = useState<string[]>([])
  const [sessionStats,      setSessionStats]      = useState({ correct: 0, total: 0 })
  const [showLearnFirst,    setShowLearnFirst]    = useState(false)
  const [reviewOffer,       setReviewOffer]       = useState(0)
  const [additionalReviews, setAdditionalReviews] = useState(0)
  const [taskLimit,         setTaskLimit]         = useState(10)
  const [consentPrompt,     setConsentPrompt]     = useState<'start' | 'continue' | null>(null)
  const [arcSkillId,        setArcSkillId]        = useState<string | null>(null)
  const [topicChoiceTier,   setTopicChoiceTier]   = useState<MasteryTier | null>(null)
  const [topicPicker,       setTopicPicker]       = useState<UnlockedTopic[] | null>(null)
  const [switchBridge,      setSwitchBridge]      = useState<string | null>(null)

  function currentMode(): LearningMode {
    if (showLearnFirst && phase === 'question') return 'learn'
    if (phase === 'question' || phase === 'revealing') return 'practice'
    if (phase === 'build_task') return 'apply'
    if (phase === 'explain_back') return 'review'
    return 'practice'
  }

  const hasApply   = !!explanation?.build_task
  const hasReview  = !!explanation?.explain_back_prompt

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === 'question' && !showLearnFirst && task?.question.format === 'mcq') {
        const idx = ['1','2','3','4'].indexOf(e.key)
        if (idx >= 0) { const opt = task.question.options?.[idx]; if (opt) setSelected(opt.id) }
      }
      if (['revealing','explanation'].includes(phase) && e.key === 'Enter') nextQuestion()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, task, showLearnFirst])

  const loadNext = useCallback(async (
    sid: string,
    modeOverride = sessionMode,
    limitOverride = taskLimit,
    skillOverride = arcSkillId,
    bridgeOverride: string | null = null,
  ) => {
    setPhase('loading')
    setSwitchBridge(bridgeOverride)
    setShowLearnFirst(false)
    setPreExplanation(null)
    const r = await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'next', session_id: sid, mode: modeOverride, task_limit: limitOverride,
        seen_skills: seenSkills, seen_question_ids: seenQuestions,
        current_skill_id: modeOverride === 'learn' ? skillOverride : undefined,
      }),
    })
    const d = await r.json()
    if (d.consent_required) {
      setConsentPrompt('continue')
      return
    }
    if (d.done || !d.task) {
      setPhase('summary'); track({ name: 'session_end' }); return
    }

    const newTask: SessionTask = d.task
    if (modeOverride === 'learn') setArcSkillId(skillOverride ?? newTask.skill_id)
    setTask(newTask)
    setSelected(null); setFillAnswer(''); setFeedback(null); setExplanation(null)

    const isNewOrWeak = newTask.p_know < 0.35
    if (isNewOrWeak) {
      try {
        const er = await fetch(`/api/explanation?skill_id=${newTask.skill_id}`)
        const ed = await er.json()
        if (ed.explanation) {
          setPreExplanation(ed.explanation)
          setPreDepth(ed.depth ?? 'beginner')
          setShowLearnFirst(true)
          setPhase('question')
          return
        }
      } catch { /* proceed to question */ }
    }

    setPhase('question')
  }, [arcSkillId, seenSkills, seenQuestions, sessionMode, taskLimit, track])

  // Start session
  useEffect(() => {
    async function start() {
      const r = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const d = await r.json()
      if (d.session_id) {
        const offer = d.review_offer_count ?? 0
        setSessionId(d.session_id)
        setReviewOffer(offer)
        setAdditionalReviews(d.additional_review_count ?? 0)
        track({ name: 'session_start' })
        if (offer > 0) setConsentPrompt('start')
        else if (requestedSessionMode === 'review') setPhase('summary')
        else loadNext(d.session_id, 'learn', 10)
      }
    }
    start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    if (!task || !sessionId) return
    const answer = task.question.format === 'mcq' ? selected : fillAnswer
    if (!answer && task.question.format !== 'explain') return

    const start = Date.now()
    const r = await fetch('/api/attempt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_id: task.question.id, skill_id: task.skill_id, session_id: sessionId,
        latency_ms: Date.now() - start, client_answer: answer,
        difficulty_tier: task.difficulty_tier, question_format: task.question.format,
      }),
    })
    const d = await r.json()
    setFeedback({ correct: d.correct, explanation_after: task.question.explanation_after })
    setMotivation(d.motivation ?? 'neutral')
    setTopicChoiceTier(
      sessionMode === 'learn' && d.topic_choice_available ? d.mastery_tier as MasteryTier : null
    )
    setSessionStats(s => ({ correct: s.correct + (d.correct ? 1 : 0), total: s.total + 1 }))
    setSeenSkills(s => [...s, task.skill_id])
    setSeenQuestions(s => [...s, task.question.id])
    track({ name: 'attempt_submit', props: { correct: d.correct, skill_id: task.skill_id } })

    setPhase('revealing')

    if (d.correct) {
      try {
        const er = await fetch(`/api/explanation?skill_id=${task.skill_id}&attempt_id=${d.attempt_id}`)
        const ed = await er.json()
        if (ed.explanation) { setExplanation(ed.explanation); setExplanationDepth(ed.depth ?? 'beginner') }
      } catch { /* explanation not required */ }
    }
  }

  async function nextQuestion() {
    if (topicChoiceTier) return
    if (sessionId) loadNext(sessionId)
  }

  function continueCurrentTopic() {
    if (!sessionId) return
    setTopicChoiceTier(null)
    setTopicPicker(null)
    loadNext(sessionId, 'learn', taskLimit, arcSkillId)
  }

  async function openTopicPicker() {
    const response = await fetch('/api/graph')
    const data = await response.json()
    const unlocked = (data.nodes ?? []).filter((node: UnlockedTopic) =>
      !node.deprecated && node.mastery_state !== 'blocked' && node.question_ids.length > 0
    )
    setTopicPicker(unlocked)
  }

  function selectTopic(topic: UnlockedTopic) {
    if (!sessionId || !task) return
    if (topic.id === task.skill_id) {
      continueCurrentTopic()
      return
    }
    const currentTier = topicChoiceTier ?? getMasteryTier(task.p_know)
    const bridge = `${currentTier} foundation in ${task.skill_label}. You chose ${topic.label}, currently ${getMasteryTier(topic.p_know)}.`
    setTopicChoiceTier(null)
    setTopicPicker(null)
    setArcSkillId(topic.id)
    loadNext(sessionId, 'learn', taskLimit, topic.id, bridge)
  }

  function beginReviews() {
    if (!sessionId) return
    const limit = Math.max(1, reviewOffer)
    setSessionMode('review')
    setTaskLimit(limit)
    setConsentPrompt(null)
    loadNext(sessionId, 'review', limit)
  }

  function beginCurrentTopics() {
    if (!sessionId) return
    setSessionMode('learn')
    setTaskLimit(10)
    setConsentPrompt(null)
    loadNext(sessionId, 'learn', 10)
  }

  function continueOneReview() {
    if (!sessionId) return
    const limit = Math.min(reviewOffer + additionalReviews, taskLimit + 1)
    if (limit === taskLimit) { setPhase('summary'); setConsentPrompt(null); return }
    setTaskLimit(limit)
    setConsentPrompt(null)
    loadNext(sessionId, 'review', limit)
  }

  async function endVoluntarily() {
    if (sessionId) {
      await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', session_id: sessionId }),
      })
    }
    setConsentPrompt(null)
    router.push('/dashboard')
  }

  const isRevealed = ['revealing','explanation','build_task','explain_back'].includes(phase)

  if (consentPrompt) {
    const continuing = consentPrompt === 'continue'
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-lg mx-auto px-8 py-24 text-center animate-slide-up">
          <p className="font-mono text-[12px] text-c-faint uppercase tracking-[0.14em] mb-4">
            Your choice
          </p>
          <h1 className="font-serif italic text-[34px] text-c-text mb-4">
            {continuing ? 'Continue reviewing?' : `${reviewOffer} reviews are ready`}
          </h1>
          <p className="text-[15px] text-c-muted leading-[1.7] mb-9">
            {continuing
              ? additionalReviews > 0 && taskLimit < reviewOffer + additionalReviews
                ? 'Your review batch is complete. Choose one final review, switch to current topics, or stop here.'
                : 'Your review allocation is complete. Continue with current topics or stop here.'
              : `Review up to ${reviewOffer} ${reviewOffer === 1 ? 'item' : 'items'} first, start with current topics, or end the session. Nothing runs until you choose.`}
          </p>
          <div className="flex flex-col gap-3">
            {(!continuing || (additionalReviews > 0 && taskLimit < reviewOffer + additionalReviews)) && (
              <button
                onClick={continuing ? continueOneReview : beginReviews}
                className="w-full py-4 rounded-xl border border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10 text-[15px] font-medium transition-all"
              >
                {continuing ? 'Do one final review →' : `Review ${reviewOffer} ${reviewOffer === 1 ? 'item' : 'items'} →`}
              </button>
            )}
            <button
              onClick={beginCurrentTopics}
              className="w-full py-4 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all"
            >
              Start current topics →
            </button>
            <button
              onClick={endVoluntarily}
              className="w-full py-3 text-c-faint hover:text-c-muted text-[13px] transition-colors"
            >
              End session
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Summary screen ─────────────────────────────────────────────────────────
  if (topicPicker) {
    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-8 py-16 animate-slide-up">
          <p className="font-mono text-[12px] text-c-faint uppercase tracking-[0.14em] mb-4">Your choice</p>
          <h1 className="font-serif italic text-[34px] text-c-text mb-3">Choose any unlocked topic</h1>
          <p className="text-[15px] text-c-muted leading-[1.7] mb-8">
            Pick where you want to go next. Your current topic will still be here when you return.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {topicPicker.map(topic => (
              <button
                key={topic.id}
                onClick={() => selectTopic(topic)}
                className="text-left p-4 rounded-xl bg-c-bg2 border border-[var(--border)] hover:border-c-purple/50 transition-colors"
              >
                <span className="block text-[15px] text-c-text mb-1">{topic.label}</span>
                <span className="font-mono text-[12px] text-c-faint">
                  {getMasteryTier(topic.p_know)}{topic.id === task?.skill_id ? ' · current topic' : ''}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setTopicPicker(null)}
            className="mt-6 text-[13px] text-c-faint hover:text-c-muted transition-colors"
          >
            ← Back to the stay-or-switch choice
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'summary') {
    const accuracy = sessionStats.total > 0
      ? Math.round(sessionStats.correct / sessionStats.total * 100) : 0
    const earlyExit = sessionStats.total < 3
    const isReviewMode = sessionMode === 'review'

    function restartSession() {
      setSessionStats({ correct: 0, total: 0 })
      setSeenSkills([]); setSeenQuestions([])
      setArcSkillId(null); setTopicChoiceTier(null); setSwitchBridge(null)
      fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      }).then(r => r.json()).then(d => {
        if (!d.session_id) return
        const offer = d.review_offer_count ?? 0
        setSessionId(d.session_id)
        setReviewOffer(offer)
        setAdditionalReviews(d.additional_review_count ?? 0)
        setPhase('loading')
        if (offer > 0) setConsentPrompt('start')
        else if (sessionMode === 'review') setPhase('summary')
        else loadNext(d.session_id, 'learn', 10, null)
      })
    }

    return (
      <div className="min-h-screen bg-c-bg">
        <Navbar />
        <div className="max-w-lg mx-auto px-8 py-24 text-center animate-slide-up">
          <p className="font-mono text-[12px] text-c-faint uppercase tracking-[0.14em] mb-5">
            {earlyExit
              ? 'Session ended early'
              : isReviewMode
              ? 'All reviews cleared ✓'
              : 'Session complete'}
          </p>
          {earlyExit ? (
            <p className="text-[15px] text-[#fbbf24] mb-10 px-4 leading-[1.6]">
              No more questions available right now — the engine exhausted its current pool.
              Complete more skills or come back after reviews reset.
            </p>
          ) : (
            <>
              <h1 className="font-serif italic text-[52px] text-c-text mb-2 leading-none">{accuracy}%</h1>
              <p className="text-[16px] text-c-muted mb-10">
                {sessionStats.correct} of {sessionStats.total} correct
              </p>
            </>
          )}
          <div className="flex gap-3 justify-center flex-wrap">
            {!isReviewMode && (
              <button
                onClick={restartSession}
                className="px-7 py-3.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all"
              >
                Keep studying →
              </button>
            )}
            {isReviewMode && !earlyExit && (
              <button
                onClick={restartSession}
                className="px-7 py-3.5 rounded-xl border border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10 text-[15px] font-medium transition-all"
              >
                Keep reviewing →
              </button>
            )}
            {isReviewMode && (
              <button
                onClick={() => router.push('/learn')}
                className="px-7 py-3.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all"
              >
                Study new content →
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="px-7 py-3.5 rounded-xl border border-[var(--border)] text-c-muted hover:text-c-text text-[15px] transition-all"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'loading' || !task) return (
    <div className="min-h-screen bg-c-bg"><Navbar /><Spinner label="Preparing your next question…" /></div>
  )

  // ── Active question screen ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      {/* Widened to max-w-3xl for more breathing room */}
      <div className="max-w-3xl mx-auto px-8 py-10">

        {switchBridge && (
          <div className="mb-6 px-5 py-4 rounded-xl border border-c-purple/25 bg-c-purple/[0.07] animate-slide-up">
            <p className="font-mono text-[11px] text-c-purple uppercase tracking-[0.12em] mb-1">Topic bridge</p>
            <p className="text-[14px] text-c-muted leading-relaxed">{switchBridge}</p>
          </div>
        )}

        {/* ── Skill context bar ──────────────────────────────────────────── */}
        <div className="mb-6 animate-slide-up">
          {sessionMode === 'review' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-mono border mb-3"
              style={{ color: '#fbbf24', borderColor: '#fbbf2435', background: '#fbbf2412' }}>
              ↻ Review session
            </span>
          )}
          <div className="flex items-center flex-wrap gap-2.5 mb-2">
            <span className="font-mono text-[13px] text-c-muted font-medium uppercase tracking-[0.10em]">
              {task.skill_label}
            </span>
            <span className="text-c-ghost text-[12px]">·</span>
            <span className="font-mono text-[12px] text-c-faint uppercase tracking-[0.08em]">
              {task.difficulty_tier}
            </span>
            {task.reason && (
              <ReasonPill reason={task.reason} pKnow={task.p_know} />
            )}
          </div>

          {/* Phase context line */}
          {task.phase_context && (
            <p className="text-[12px] font-mono text-c-faint mb-1">
              {task.phase_context === 'active_phase' ? 'Current focus' : 'Past phase — retention review'}
            </p>
          )}

          {/* Review timing */}
          {isReviewReason(task.reason) && task.days_until_due !== undefined && (
            <p className={`text-[12px] font-mono mb-1.5 ${task.review_urgency === 'overdue' ? 'text-[#f87171]/90' : 'text-[#fbbf24]/80'}`}>
              {formatDueLabel(task.days_until_due, task.review_urgency)}
              {task.review_repetition !== undefined && ` · Rep #${task.review_repetition}`}
            </p>
          )}

          {/* Learning context */}
          {(task.reason === 'active_phase_new' || task.reason === 'varied_practice') && (
            <p className="text-[12px] font-mono text-c-faint mb-1.5">
              {getMasteryTier(task.p_know)} · weakest in queue
            </p>
          )}

          {motivation !== 'neutral' && <MotivationBanner state={motivation} />}

          {!showLearnFirst && (
            <ModeBar
              activeMode={currentMode()}
              hasApply={hasApply}
              hasReview={hasReview}
            />
          )}

          {/* Skill intuition line — bigger */}
          <p className="text-[13px] text-c-faint italic leading-relaxed">{task.skill_intuition}</p>
        </div>

        {/* ── LEARN PANEL (pre-question) ──────────────────────────────── */}
        {showLearnFirst && phase === 'question' && (
          <>
            <ModeBar activeMode="learn" hasApply={false} hasReview={false} />
            <LearnPanel
              task={task}
              explanation={preExplanation}
              depth={preDepth}
              onReady={() => setShowLearnFirst(false)}
            />
          </>
        )}

        {/* ── PRACTICE: Question card ─────────────────────────────────── */}
        {!showLearnFirst && (
          <>
            <div className="p-7 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-5 animate-slide-up">
              <QuestionCard
                question={task.question}
                selected={selected}
                fillAnswer={fillAnswer}
                revealed={isRevealed}
                onSelect={setSelected}
                onFillChange={setFillAnswer}
              />
            </div>

            {/* Feedback banner */}
            {feedback && isRevealed && (
              <div className="mb-5">
                <FeedbackBanner correct={feedback.correct} explanation_after={feedback.explanation_after} />
              </div>
            )}

            {/* Explanation panel */}
            {(phase === 'explanation' || phase === 'build_task' || phase === 'explain_back') && explanation && (
              <div className="mb-5 animate-slide-up">
                <ExplanationPanel
                  explanation={explanation}
                  depth={explanationDepth}
                  onExplainBack={(text) => {
                    fetch('/api/attempt', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        question_id: `${task.question.id}_explain_back`, skill_id: task.skill_id,
                        session_id: sessionId, latency_ms: 5000, client_answer: text,
                        correct: true, difficulty_tier: 'same', question_format: 'explain',
                      }),
                    })
                    track({ name: 'explanation_viewed', props: { skill_id: task.skill_id, depth: 'explain_back' } })
                    setPhase('explain_back')
                  }}
                  onBuildTaskDone={() => {
                    track({ name: 'explanation_viewed', props: { skill_id: task.skill_id, depth: 'build_task' } })
                    setPhase('build_task')
                  }}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="animate-slide-up">
              {phase === 'question' && (
                <button
                  onClick={submit}
                  disabled={!selected && !fillAnswer.trim() && task.question.format !== 'explain'}
                  className="w-full py-4 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all hover:scale-[1.01] disabled:opacity-40"
                >
                  Submit
                </button>
              )}
              {isRevealed && (
                <div className="space-y-2.5">
                  {feedback?.correct && phase === 'revealing' && explanation && (
                    <button
                      onClick={() => setPhase('explanation')}
                      className="w-full py-3.5 rounded-xl border border-c-purple/30 bg-c-purple/[0.06] text-c-purple text-[14px] hover:bg-c-purple/10 transition-all"
                    >
                      {hasApply
                        ? 'See explanation + build task →'
                        : hasReview
                        ? 'See explanation + explain back →'
                        : 'See explanation →'}
                    </button>
                  )}
                  {topicChoiceTier && sessionMode === 'learn' ? (
                    <div className="rounded-xl border border-c-purple/25 bg-c-purple/[0.06] p-4">
                      <p className="text-[15px] text-c-text mb-1">
                        You’re now {topicChoiceTier} in {task.skill_label}.
                      </p>
                      <p className="text-[13px] text-c-muted leading-relaxed mb-4">
                        Staying is the better path toward Mastered, or you can choose any unlocked topic.
                      </p>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <button
                          onClick={continueCurrentTopic}
                          className="w-full py-3.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all"
                        >
                          Continue toward Mastered →
                        </button>
                        <button
                          onClick={openTopicPicker}
                          className="w-full py-3.5 rounded-xl bg-c-bg3 border border-[var(--border)] text-c-muted hover:text-c-text text-[14px] transition-all"
                        >
                          Choose another topic →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={nextQuestion}
                      className="w-full py-4 rounded-xl bg-c-bg3 border border-[var(--border)] text-c-muted hover:text-c-text text-[15px] transition-all"
                    >
                      Next question →
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Session counter */}
        {!showLearnFirst && (
          <p className="text-center text-[12px] text-c-ghost mt-5 font-mono">
            {sessionStats.correct}/{sessionStats.total} correct this session
            {' · '}
            <button
              className="underline underline-offset-2 hover:text-c-faint transition-colors"
              onClick={() => router.push('/dashboard')}
            >
              end session
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-c-bg" />}>
      <LearnPageInner />
    </Suspense>
  )
}
