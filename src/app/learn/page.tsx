'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  SessionTask, Explanation, ExplanationDepth, SessionPhase, TaskReason, SessionMode,
  ReviewUrgency, GuidedArcProgress, GuidedArcStage,
} from '@/types'
import { QuestionCard }     from '@/components/learning/QuestionCard'
import { FeedbackBanner }   from '@/components/learning/FeedbackBanner'
import { MotivationBanner } from '@/components/learning/MotivationBanner'
import { Spinner }          from '@/components/ui/Spinner'
import { Navbar }           from '@/components/layout/Navbar'
import { FeynmanLoop }      from '@/components/learning/FeynmanLoop'
import { GuidedLesson }     from '@/components/learning/GuidedLesson'
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

// ─── Persistent skill-arc progress ───────────────────────────────────────────

const QUESTIONS_PER_STAGE = 2
const PRACTICE_STAGES: { id: GuidedArcStage; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'mastery', label: 'Mastery' },
]
const EMPTY_GUIDED_ARC: GuidedArcProgress = {
  stage: 'beginner',
  stage_attempt_count: 0,
  stage_correct_streak: 0,
  completed_stage_count: 0,
  core_complete: false,
  total_attempt_count: 0,
}

function stageLabel(stage: GuidedArcStage): string {
  return PRACTICE_STAGES.find(item => item.id === stage)?.label ?? 'Beginner'
}

function ArcProgress({
  phase,
  lessonComplete,
  progress,
}: {
  phase: SessionPhase
  lessonComplete: boolean
  progress: GuidedArcProgress
}) {
  const currentStageIndex = PRACTICE_STAGES.findIndex(item => item.id === progress.stage)
  const status = phase === 'lesson'
    ? 'Learn the idea one slide at a time'
    : phase === 'feynman'
      ? 'Optional reflection'
      : progress.core_complete
        ? `Core journey complete · ${progress.total_attempt_count} questions answered`
        : `${stageLabel(progress.stage)} · question ${progress.stage_attempt_count + 1} · ${progress.stage_correct_streak}/${QUESTIONS_PER_STAGE} ready`

  return (
    <div className="mb-7 rounded-2xl border border-[var(--border)] bg-c-bg2 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-c-purple">{status}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-c-ghost">One skill · one journey</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label="Skill journey progress">
        <div className={`rounded-lg border px-2 py-2 text-center font-mono text-[10px] ${
          lessonComplete
            ? 'border-c-green/35 bg-c-green/[0.10] text-c-green'
            : phase === 'lesson'
              ? 'border-c-purple/50 bg-c-purple/[0.10] text-c-purple'
              : 'border-[var(--border)] bg-c-bg3 text-c-ghost'
        }`}>
          {lessonComplete ? '✓ ' : ''}Lesson
        </div>
        {PRACTICE_STAGES.map((item, index) => {
          const complete = progress.core_complete || index < progress.completed_stage_count
          const active = !progress.core_complete && index === currentStageIndex && phase !== 'lesson'
          const count = complete ? QUESTIONS_PER_STAGE : active ? progress.stage_correct_streak : 0
          return (
            <div
              key={item.id}
              className={`rounded-lg border px-2 py-2 text-center font-mono text-[10px] transition-colors ${
                complete
                  ? 'border-c-green/35 bg-c-green/[0.10] text-c-green'
                  : active
                    ? 'border-c-purple/50 bg-c-purple/[0.10] text-c-purple'
                    : 'border-[var(--border)] bg-c-bg3 text-c-ghost'
              }`}
            >
              <span className="block">{complete ? '✓ ' : ''}{item.label}</span>
              <span className="mt-0.5 block text-[9px] opacity-70">{count}/{QUESTIONS_PER_STAGE} ready</span>
            </div>
          )
        })}
        <div className={`rounded-lg border px-2 py-2 text-center font-mono text-[10px] ${
          phase === 'feynman'
            ? 'border-c-blue/40 bg-c-blue/[0.08] text-c-blue'
            : 'border-[var(--border)] bg-c-bg3 text-c-ghost'
        }`}>
          Reflect
          <span className="mt-0.5 block text-[9px] opacity-70">optional</span>
        </div>
      </div>
      {phase !== 'lesson' && !progress.core_complete && (
        <p className="mt-3 text-[11px] leading-relaxed text-c-faint">
          Each stage has at least two questions. Two correct in a row move forward; two misses step down for support.
        </p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LearnPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const requestedSessionMode = (searchParams.get('mode') ?? 'learn') as SessionMode
  const requestedSkillId = searchParams.get('skill_id')
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
  const [lessonComplete,    setLessonComplete]    = useState(false)
  const [motivation,        setMotivation]        = useState<string>('neutral')
  const [seenSkills,        setSeenSkills]        = useState<string[]>([])
  const [seenQuestions,     setSeenQuestions]     = useState<string[]>([])
  const [sessionStats,      setSessionStats]      = useState({ correct: 0, total: 0 })
  const [reviewOffer,       setReviewOffer]       = useState(0)
  const [additionalReviews, setAdditionalReviews] = useState(0)
  const [taskLimit,         setTaskLimit]         = useState(10)
  const [consentPrompt,     setConsentPrompt]     = useState<'start' | 'continue' | null>(null)
  const [arcSkillId,        setArcSkillId]        = useState<string | null>(requestedSkillId)
  const [arcAttemptCount,   setArcAttemptCount]   = useState(0)
  const [guidedArc,         setGuidedArc]         = useState<GuidedArcProgress>(EMPTY_GUIDED_ARC)
  const [topicChoiceTier,   setTopicChoiceTier]   = useState<MasteryTier | null>(null)
  const [topicPicker,       setTopicPicker]       = useState<UnlockedTopic[] | null>(null)
  const [switchBridge,      setSwitchBridge]      = useState<string | null>(null)

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === 'question' && task?.question.format === 'mcq') {
        const idx = ['1','2','3','4'].indexOf(e.key)
        if (idx >= 0) { const opt = task.question.options?.[idx]; if (opt) setSelected(opt.id) }
      }
      if (phase === 'revealing' && e.key === 'Enter') nextQuestion()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, task])

  const loadNext = useCallback(async (
    sid: string,
    modeOverride = sessionMode,
    limitOverride = taskLimit,
    skillOverride = arcSkillId,
    bridgeOverride: string | null = null,
    lessonOverride?: boolean,
    historyOverride?: { skills: string[]; questions: string[] },
  ) => {
    setPhase('loading')
    setSwitchBridge(bridgeOverride)
    const r = await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'next', session_id: sid, mode: modeOverride, task_limit: limitOverride,
        seen_skills: historyOverride?.skills ?? seenSkills,
        seen_question_ids: historyOverride?.questions ?? seenQuestions,
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
    if (d.guided_arc) {
      setGuidedArc(d.guided_arc)
      setArcAttemptCount(d.guided_arc.total_attempt_count)
    }
    setTask(newTask)
    setSelected(null); setFillAnswer(''); setFeedback(null)

    const shouldShowLesson = modeOverride === 'learn' && (
      lessonOverride ?? (!lessonComplete && arcAttemptCount === 0)
    )
    if (shouldShowLesson) {
      setExplanation(null)
      try {
        const response = await fetch(`/api/explanation?skill_id=${newTask.skill_id}`)
        const data = await response.json()
        if (data.explanation) {
          setExplanation(data.explanation)
          setExplanationDepth(data.depth ?? 'beginner')
          setPhase('lesson')
          return
        }
      } catch { /* continue to practice when lesson content is unavailable */ }
      setLessonComplete(true)
    }
    setPhase('question')
  }, [arcAttemptCount, arcSkillId, lessonComplete, seenSkills, seenQuestions, sessionMode, taskLimit, track])

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
        if (requestedSkillId) loadNext(d.session_id, 'learn', 10, requestedSkillId)
        else if (offer > 0) setConsentPrompt('start')
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
    setArcAttemptCount(d.arc_attempt_count ?? 0)
    if (d.guided_arc) setGuidedArc(d.guided_arc)
    setSessionStats(s => ({ correct: s.correct + (d.correct ? 1 : 0), total: s.total + 1 }))
    setSeenSkills(s => [...s, task.skill_id])
    setSeenQuestions(s => [...s, task.question.id])
    track({ name: 'attempt_submit', props: { correct: d.correct, skill_id: task.skill_id } })

    setPhase('revealing')
  }

  async function nextQuestion() {
    if (topicChoiceTier) return
    if (sessionId) loadNext(sessionId)
  }

  async function completeFeynmanLoop(result: { resolved: boolean; firstExplanation: string; secondExplanation: string }) {
    if (!sessionId || !task) return
    await fetch('/api/attempt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_id: `${task.skill_id}_feynman_loop`, skill_id: task.skill_id,
        session_id: sessionId, latency_ms: 5000,
        client_answer: `${result.firstExplanation}\n---\n${result.secondExplanation}`,
        correct: result.resolved, difficulty_tier: task.difficulty_tier, question_format: 'explain',
      }),
    })
    track({ name: 'feynman_loop_complete', props: { skill_id: task.skill_id, resolved: result.resolved } })
    setPhase('revealing')
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
    setArcAttemptCount(0)
    setGuidedArc(EMPTY_GUIDED_ARC)
    setLessonComplete(false)
    setExplanation(null)
    loadNext(sessionId, 'learn', taskLimit, topic.id, bridge, true)
  }

  function beginReviews() {
    if (!sessionId) return
    const limit = Math.max(1, reviewOffer)
    setSessionMode('review')
    setTaskLimit(limit)
    setConsentPrompt(null)
    loadNext(sessionId, 'review', limit)
  }

  async function beginCurrentTopics() {
    if (!sessionId) return
    let learningSessionId = sessionId
    if (sessionStats.total > 0) {
      await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', session_id: sessionId }),
      })
      const response = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const data = await response.json()
      if (!data.session_id) return
      learningSessionId = data.session_id
      setSessionId(data.session_id)
      setReviewOffer(data.review_offer_count ?? 0)
      setAdditionalReviews(data.additional_review_count ?? 0)
      setSessionStats({ correct: 0, total: 0 })
      setSeenSkills([])
      setSeenQuestions([])
      track({ name: 'session_start' })
    }
    setSessionMode('learn')
    setTaskLimit(10)
    setArcSkillId(null)
    setArcAttemptCount(0)
    setGuidedArc(EMPTY_GUIDED_ARC)
    setLessonComplete(false)
    setExplanation(null)
    setConsentPrompt(null)
    loadNext(
      learningSessionId,
      'learn',
      10,
      null,
      null,
      true,
      sessionStats.total > 0 ? { skills: [], questions: [] } : undefined,
    )
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

  const isRevealed = phase === 'revealing'

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
      setArcAttemptCount(0)
      setGuidedArc(EMPTY_GUIDED_ARC)
      setLessonComplete(false)
      setExplanation(null)
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
        else loadNext(d.session_id, 'learn', 10, null, null, true)
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

  if (phase === 'lesson' && explanation) return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <div className="max-w-3xl mx-auto px-8 py-10">
        <ArcProgress phase={phase} lessonComplete={lessonComplete} progress={guidedArc} />
        <GuidedLesson
          task={task}
          explanation={explanation}
          depth={explanationDepth}
          onComplete={() => {
            setLessonComplete(true)
            track({ name: 'explanation_viewed', props: { skill_id: task.skill_id, depth: explanationDepth } })
            setPhase('question')
          }}
        />
        <button
          onClick={endVoluntarily}
          className="w-full mt-4 py-2 text-c-ghost hover:text-c-faint text-[11px] font-mono transition-colors"
        >
          End session
        </button>
      </div>
    </div>
  )

  if (phase === 'feynman') return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <div className="max-w-2xl mx-auto px-8 py-10">
        <ArcProgress phase={phase} lessonComplete={lessonComplete} progress={guidedArc} />
        <FeynmanLoop
          skillLabel={task.skill_label}
          onComplete={completeFeynmanLoop}
          onSkip={() => setPhase('revealing')}
        />
        <button
          onClick={endVoluntarily}
          className="w-full mt-4 py-2 text-c-ghost hover:text-c-faint text-[11px] font-mono transition-colors"
        >
          End session
        </button>
      </div>
    </div>
  )

  // ── Active question screen ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      {/* Widened to max-w-3xl for more breathing room */}
      <div className="max-w-3xl mx-auto px-8 py-10">

        {sessionMode === 'learn' && (
          <ArcProgress phase={phase} lessonComplete={lessonComplete} progress={guidedArc} />
        )}

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
              {sessionMode === 'learn' ? `${stageLabel(guidedArc.stage)} practice` : task.difficulty_tier}
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
              Knowledge: {getMasteryTier(task.p_know)} · {guidedArc.total_attempt_count} questions answered in this topic journey
            </p>
          )}

          {motivation !== 'neutral' && <MotivationBanner state={motivation} />}

          {/* Skill intuition line — bigger */}
          <p className="text-[13px] text-c-faint italic leading-relaxed">{task.skill_intuition}</p>
        </div>

        {/* ── PRACTICE: Question card ─────────────────────────────────── */}
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
                  {sessionMode === 'learn' && guidedArc.core_complete && (
                    <button
                      onClick={() => setPhase('feynman')}
                      className="w-full py-3 rounded-xl border border-c-blue/30 bg-c-blue/[0.06] text-c-blue text-[13px] hover:bg-c-blue/10 transition-all"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-c-blue/60 mr-2">optional</span>
                      Teach it with the Feynman Loop →
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
                      className="w-full py-4 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all"
                    >
                      {sessionMode === 'review'
                        ? 'Next review →'
                        : guidedArc.core_complete
                          ? `Keep strengthening ${task.skill_label} →`
                          : `Continue ${stageLabel(guidedArc.stage)} · question ${guidedArc.stage_attempt_count + 1} →`}
                    </button>
                  )}
                </div>
              )}
            </div>
        </>

        {/* Session counter */}
        <p className="text-center text-[12px] text-c-ghost mt-5 font-mono">
          {sessionStats.correct}/{sessionStats.total} correct this session
          {' · '}
          <button
            className="underline underline-offset-2 hover:text-c-faint transition-colors"
            onClick={endVoluntarily}
          >
            end session
          </button>
        </p>
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
