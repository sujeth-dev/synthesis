'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { Debrief, BLOOM_LABEL } from '@/components/exam/Debrief'
import { paceFor, remainingMs, MIN_ITEMS, MAX_ITEMS, BLOOM_ORDER, type ExamMode } from '@/lib/exam/policy'
import type { Debrief as DebriefData } from '@/lib/exam/debrief'
import type { BloomLevel } from '@/types'

// The Exam Room (EXAM-3). The server picks every item and holds the clock; this
// page renders the run, keeps time per item, and lets a learner revisit, mark
// and change any answer until they submit. Rules live in src/lib/exam.

interface Item {
  question_id: string; skill_id: string; bloom_level: BloomLevel
  stem: string; options: { id: string; text: string }[]
  time_target_sec: number; position: number
  selected_option_id: string | null; marked: boolean
  hint_level: number; hints: string[]
}

interface LocalItem extends Item {
  /** The choice on screen, which may not be saved yet. */
  choice: string | null
  spentMs: number
}

interface Run { id: string; mode: ExamMode; status: string; started_at: string; deadline_at: string | null; stop_reason: string | null }

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

const PHASE_LABEL: Record<string, string> = {
  phase_1_computer_basics: 'Phase 1', phase_1b_programming_basics: 'Phase 1B', phase_2_cs_data: 'Phase 2',
  phase_3_intro_ai: 'Phase 3', phase_4_machine_learning: 'Phase 4', phase_5_deep_learning: 'Phase 5',
  phase_6_modern_ai: 'Phase 6', phase_7_real_world: 'Phase 7', phase_8_mastery: 'Phase 8',
}

const PACE_TEXT = { on_pace: 'On pace', slow: 'Taking a while', over: 'Well over the target' } as const

function local(item: Item): LocalItem {
  return { ...item, choice: item.selected_option_id, spentMs: 0 }
}

/** Time spent against the item's target as a ring; past the target it stays full. */
function PaceRing({ fraction }: { fraction: number }) {
  const r = 7, c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="-rotate-90">
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--bg3)" strokeWidth="2.5" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
    </svg>
  )
}

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ExamRoomPage() {
  const router = useRouter()
  const params = useParams()
  const search = useSearchParams()
  const phase = params.phase as string
  const phaseLabel = PHASE_LABEL[phase] ?? phase

  const [view, setView] = useState<'intro' | 'running' | 'review' | 'debrief' | 'loading'>(search.get('run') ? 'loading' : 'intro')
  const [run, setRun] = useState<Run | null>(null)
  const [items, setItems] = useState<LocalItem[]>([])
  const [cur, setCur] = useState(0)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [skillLabels, setSkillLabels] = useState<Record<string, string>>({})
  const viewStart = useRef(Date.now())

  // A run in the URL means a reload or a link to a result: resume or debrief it.
  useEffect(() => {
    const runId = search.get('run')
    if (!runId) return
    fetch(`/api/exam?run_id=${runId}`).then(r => r.json()).then(d => {
      if (!d.run) { setView('intro'); return }
      setRun(d.run)
      if (d.debrief) { setDebrief(d.debrief); setSkillLabels(d.skill_labels ?? {}); setView('debrief'); return }
      const loaded: LocalItem[] = (d.items as Item[]).map(local)
      setItems(loaded)
      const stopped = d.run.stop_reason !== null
      setDone(stopped)
      setCur(Math.max(0, loaded.length - 1))
      viewStart.current = Date.now()
      setView(stopped ? 'review' : 'running')
    })
  }, [search])

  useEffect(() => {
    if (view !== 'running' && view !== 'review') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [view])

  const finish = useCallback(async (runId: string) => {
    setBusy(true)
    const res = await fetch('/api/exam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finish', run_id: runId }),
    })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) { setError(body.error ?? 'Could not submit'); return }
    setDebrief(body.debrief)
    setSkillLabels(body.skill_labels ?? {})
    setView('debrief')
    router.replace(`/learn/exam/${phase}?run=${runId}`)
  }, [phase, router])

  const remaining = run ? remainingMs(run.deadline_at ? Date.parse(run.deadline_at) : null, now) : null

  // The server refuses answers past the deadline; the page submits what exists.
  useEffect(() => {
    if (run && remaining === 0 && (view === 'running' || view === 'review') && !busy) void finish(run.id)
  }, [remaining, run, view, busy, finish])

  async function start(mode: ExamMode) {
    setBusy(true); setError('')
    const res = await fetch('/api/exam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', phase, mode }),
    })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) { setError(body.error ?? 'Could not start'); return }
    setRun(body.run)
    setItems([local(body.item)])
    setCur(0)
    setDone(false)
    viewStart.current = Date.now()
    setNow(Date.now())
    setView('running')
    router.replace(`/learn/exam/${phase}?run=${body.run.id}`)
  }

  /** Banks the time spent on the item on screen, so leaving and returning adds up. */
  function bankTime(list: LocalItem[], index: number): LocalItem[] {
    const spent = Date.now() - viewStart.current
    viewStart.current = Date.now()
    return list.map((it, i) => i === index ? { ...it, spentMs: it.spentMs + spent } : it)
  }

  function goTo(index: number) {
    setItems(list => bankTime(list, cur))
    setCur(index)
    setView('running')
  }

  function choose(optionId: string) {
    setItems(list => list.map((it, i) => i === cur ? { ...it, choice: optionId } : it))
  }

  async function save() {
    if (!run) return
    const banked = bankTime(items, cur)
    const item = banked[cur]
    if (!item.choice) return
    setItems(banked)
    setBusy(true); setError('')
    const res = await fetch('/api/exam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'answer', run_id: run.id, question_id: item.question_id,
        selected_option_id: item.choice, latency_ms: item.spentMs, marked: item.marked,
      }),
    })
    const body = await res.json()
    setBusy(false)
    if (body.time_up) { void finish(run.id); return }
    if (!res.ok) { setError(body.error ?? 'Could not save'); return }
    const saved = banked.map((it, i) => i === cur ? { ...it, selected_option_id: it.choice } : it)
    if (body.item) {
      setItems([...saved, local(body.item)])
      setCur(saved.length)
      viewStart.current = Date.now()
      return
    }
    setItems(saved)
    if (body.done) { setDone(true); setView('review'); return }
    // A revisited item was saved: back to the newest, or the review if stopped.
    if (done) setView('review')
    else { setCur(saved.length - 1); viewStart.current = Date.now() }
  }

  async function toggleMark() {
    if (!run) return
    const item = items[cur]
    setItems(list => list.map((it, i) => i === cur ? { ...it, marked: !it.marked } : it))
    await fetch('/api/exam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark', run_id: run.id, question_id: item.question_id, marked: !item.marked }),
    })
  }

  async function hint() {
    if (!run) return
    const item = items[cur]
    const res = await fetch('/api/exam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'hint', run_id: run.id, question_id: item.question_id }),
    })
    const body = await res.json()
    if (!res.ok) return
    setItems(list => list.map((it, i) => i === cur ? { ...it, hint_level: body.hint_level, hints: body.hints } : it))
  }

  // Keys answer the question on screen: a letter (or 1–6) chooses, Enter saves.
  // Re-bound every render so it always sees the current item and busy state.
  useEffect(() => {
    if (view !== 'running') return
    const item = items[cur]
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const idx = LETTERS.indexOf(k) >= 0 ? LETTERS.indexOf(k) : /^[1-6]$/.test(k) ? Number(k) - 1 : -1
      if (idx >= 0 && idx < item.options.length && !busy) { e.preventDefault(); choose(item.options[idx].id); return }
      if (e.key === 'Enter' && item.choice && !busy && (cur === items.length - 1 || item.choice !== item.selected_option_id)) {
        e.preventDefault(); void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (view === 'loading') return <Spinner label="Loading exam…" />

  if (view === 'debrief' && debrief && run) {
    return (
      <div className="min-h-screen bg-c-bg px-4 py-8 sm:p-8">
        <Debrief debrief={debrief} skillLabels={skillLabels} phaseLabel={phaseLabel} mode={run.mode} phase={phase} />
      </div>
    )
  }

  if (view === 'intro') return (
    <div className="min-h-screen bg-c-bg flex items-center justify-center px-4 py-10 sm:p-8">
      <div className="max-w-2xl w-full animate-slide-up">
        <p className="font-mono text-[11px] text-c-purple uppercase tracking-[0.16em] mb-4 text-center">{phaseLabel} · Exam Room</p>
        <h1 className="font-serif italic text-[32px] sm:text-[38px] leading-[1.1] text-c-text mb-3 text-center">Every level of thinking, adaptively</h1>
        <p className="text-[14px] text-c-muted mb-6 leading-[1.7] text-center">
          Questions adjust to you and rotate through Remember, Understand, Apply, Analyze, Evaluate and Create.
          You can revisit, change and mark any answer before you submit.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            [`${MIN_ITEMS}–${MAX_ITEMS}`, 'questions — stops once it is sure'],
            ['6', 'levels of thinking'],
            ['0', 'effect on your mastery or reviews'],
          ].map(([v, l]) => (
            <div key={l} className="p-3 rounded-xl bg-c-bg2 border border-[var(--border)] text-center">
              <p className="font-serif text-[24px] text-c-text leading-none mb-1">{v}</p>
              <p className="text-[11px] text-c-faint leading-snug">{l}</p>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <button onClick={() => start('practice')} disabled={busy} data-testid="start-practice"
            className="group text-left p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] hover:border-c-blue/60 transition-all disabled:opacity-50">
            <p className="font-mono text-[10px] text-c-blue uppercase tracking-[0.14em] mb-2">Learn as you go</p>
            <p className="text-[17px] text-c-text font-medium mb-3">Practice</p>
            <ul className="text-[12px] text-c-muted leading-[1.7] space-y-0.5 mb-4">
              <li>· Untimed</li>
              <li>· Two hints a question: a nudge, then how to proceed</li>
              <li>· A hinted answer earns less credit</li>
            </ul>
            <span className="text-[13px] text-c-blue group-hover:underline">Start practice →</span>
          </button>
          <button onClick={() => start('checkpoint')} disabled={busy} data-testid="start-checkpoint"
            className="group text-left p-5 rounded-2xl bg-c-bg2 border border-[var(--border)] border-t-4 border-t-c-purple hover:border-c-purple/60 transition-all disabled:opacity-50">
            <p className="font-mono text-[10px] text-c-purple uppercase tracking-[0.14em] mb-2">The real thing</p>
            <p className="text-[17px] text-c-text font-medium mb-3">Checkpoint</p>
            <ul className="text-[12px] text-c-muted leading-[1.7] space-y-0.5 mb-4">
              <li>· One overall time limit</li>
              <li>· No hints</li>
              <li>· A target pace per question, never a cut-off</li>
            </ul>
            <span className="text-[13px] text-c-purple group-hover:underline">Start checkpoint →</span>
          </button>
        </div>
        {error && <p className="text-[12px] text-c-red text-center mb-4">{error}</p>}
        <button onClick={() => router.push('/dashboard')} className="block mx-auto text-[12px] text-c-faint hover:text-c-text">← Back to dashboard</button>
      </div>
    </div>
  )

  const item = items[cur]
  const elapsed = item ? item.spentMs + (now - viewStart.current) : 0
  const pace = item ? paceFor(elapsed, item.time_target_sec) : 'on_pace'
  const lowTime = remaining !== null && remaining < 60_000
  const checkpoint = run?.mode === 'checkpoint'
  const totalMs = run?.deadline_at ? Date.parse(run.deadline_at) - Date.parse(run.started_at) : null
  const timeLeft = remaining !== null && totalMs ? Math.max(0, Math.min(1, remaining / totalMs)) : null
  const answeredCount = items.filter(it => it.selected_option_id !== null).length

  const topBar = (
    <div className="sticky top-0 z-10 bg-c-bg/95 backdrop-blur border-b border-[var(--border)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-md border ${
            checkpoint ? 'border-c-purple/40 text-c-purple' : 'border-c-blue/40 text-c-blue'}`}>
            {checkpoint ? 'Checkpoint' : 'Practice'}
          </span>
          <span className="font-mono text-[11px] text-c-faint truncate hidden sm:inline">
            {phaseLabel} · {answeredCount} answered · stops between {MIN_ITEMS} and {MAX_ITEMS}
          </span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span data-testid="exam-timer" className={`font-mono text-[16px] tabular-nums ${lowTime ? 'text-c-red animate-pulse' : 'text-c-text'}`}>
            {remaining !== null ? `${clock(remaining)} left` : `${answeredCount} answered so far`}
          </span>
          <button onClick={() => { if (window.confirm('Leave the exam? Answers you saved stay recorded, but this run will not be debriefed.')) router.push('/dashboard') }}
            className="text-[12px] text-c-faint hover:text-c-text">Leave</button>
        </div>
      </div>
      {timeLeft !== null && (
        <div className="h-[3px] bg-c-bg3" aria-hidden>
          <div className={`h-full transition-[width] duration-1000 ease-linear ${lowTime ? 'bg-c-red' : timeLeft < 0.25 ? 'bg-c-yellow' : 'bg-c-purple'}`}
            style={{ width: `${timeLeft * 100}%` }} />
        </div>
      )}
      {/* Every slot the run could use. Items are chosen one at a time, so slots
          past the newest are placeholders; the marker shows where the exam may
          stop. Once it has stopped, only the questions it served remain. */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-1" aria-label="Question navigator">
        {Array.from({ length: done ? items.length : Math.max(MAX_ITEMS, items.length) }, (_, i) => {
          const it = items[i]
          const stopMarker = !done && i === MIN_ITEMS && (
            <span key="stop" className="flex items-center gap-1 mx-1 font-mono text-[9px] text-c-faint" title={`The exam may stop after ${MIN_ITEMS} questions, once it is sure of your result`}>
              <span className="w-px h-6 bg-[var(--border-hi)]" />may stop
            </span>
          )
          if (!it) return (
            <span key={`slot-${i}`} className="contents">
              {stopMarker}
              <span className="w-7 h-7 rounded-md border border-dashed border-[var(--border)] font-mono text-[10px] text-c-ghost/60 flex items-center justify-center" aria-hidden>
                {i + 1}
              </span>
            </span>
          )
          const answered = it.selected_option_id !== null
          return (
            <span key={it.question_id} className="contents">
              {stopMarker}
              <button data-testid={`nav-${i}`} onClick={() => goTo(i)}
                title={`${i + 1}: ${BLOOM_LABEL[it.bloom_level]}${answered ? ', answered' : ''}${it.marked ? ', marked' : ''}`}
                className={`relative w-7 h-7 rounded-md font-mono text-[11px] border transition-all ${
                  i === cur && view === 'running' ? 'border-c-purple text-white bg-c-purple'
                    : answered ? 'border-c-blue/40 text-c-text bg-c-blue/20' : 'border-[var(--border-hi)] text-c-muted'}`}>
                {i + 1}
                {it.marked && <span className="absolute -top-1.5 -right-1 text-[9px] text-c-yellow">⚑</span>}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )

  if (view === 'review') {
    const unanswered = items.filter(it => it.selected_option_id === null).length
    const marked = items.filter(it => it.marked).length
    return (
      <div className="min-h-screen bg-c-bg">
        {topBar}
        <div className="max-w-2xl mx-auto p-8 animate-slide-up" data-testid="exam-review">
          <h1 className="font-serif italic text-[28px] text-c-text mb-2">
            {done ? 'The exam has enough to go on' : 'Review before you submit'}
          </h1>
          <p className="text-[13px] text-c-muted mb-6">
            {items.length} questions served · {unanswered} unanswered · {marked} marked for review.
            Select any question to look again or change your answer.
          </p>
          <div className="space-y-2 mb-8">
            {items.map((it, i) => (
              <button key={it.question_id} onClick={() => goTo(i)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-c-bg2 border border-[var(--border)] hover:border-[var(--border-hi)] text-left">
                <span className="text-[13px] text-c-text truncate">
                  <span className="font-mono text-c-ghost mr-3">{i + 1}</span>{it.stem.split('\n')[0]}
                </span>
                <span className="font-mono text-[11px] text-c-faint flex-shrink-0">
                  {it.marked ? '⚑ ' : ''}{it.selected_option_id ? 'answered' : 'unanswered'}
                </span>
              </button>
            ))}
          </div>
          {error && <p className="text-[12px] text-c-red mb-3">{error}</p>}
          <div className="flex gap-3">
            {!done && (
              <button onClick={() => goTo(items.length - 1)} className="flex-1 py-3 rounded-xl border border-[var(--border)] text-c-muted text-[14px] hover:text-c-text">
                Keep going
              </button>
            )}
            <button onClick={() => run && finish(run.id)} disabled={busy} data-testid="submit-exam"
              className="flex-1 py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium disabled:opacity-50">
              Submit exam
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!item) return <Spinner label="Loading question…" />
  const isLatest = cur === items.length - 1
  const changed = item.choice !== item.selected_option_id

  return (
    <div className="min-h-screen bg-c-bg">
      {topBar}
      <div className="max-w-2xl mx-auto px-4 py-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-serif italic text-[22px] text-c-text leading-none">Q{cur + 1}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded-md bg-c-bg3 text-c-muted">
              {BLOOM_LABEL[item.bloom_level]} · level {BLOOM_ORDER.indexOf(item.bloom_level) + 1} of 6
            </span>
          </div>
          <span data-testid="pace" className={`flex items-center gap-2 font-mono text-[11px] ${pace === 'on_pace' ? 'text-c-faint' : pace === 'slow' ? 'text-c-yellow' : 'text-c-red'}`}>
            <PaceRing fraction={elapsed / (item.time_target_sec * 1000)} />
            {PACE_TEXT[pace]} · target {item.time_target_sec}s
          </span>
        </div>

        <div className="p-5 sm:p-7 rounded-2xl bg-c-bg2 border border-[var(--border)] mb-4">
          <p data-testid={`exam-question-${item.question_id}`} className="text-[16px] text-c-text leading-[1.7] mb-6 whitespace-pre-wrap">{item.stem}</p>
          <div className="space-y-2.5">
            {item.options.map((opt, i) => {
              const chosen = item.choice === opt.id
              return (
                <button key={opt.id} data-testid={`exam-option-${opt.id}`} onClick={() => choose(opt.id)} disabled={busy}
                  className={`w-full flex items-start gap-4 text-left px-4 py-3.5 rounded-xl border transition-all text-[14px] leading-[1.55] ${
                    chosen ? 'border-c-purple/60 bg-c-purple/10 text-c-text'
                      : 'border-[var(--border)] bg-c-bg3 text-c-muted hover:border-[var(--border-hi)] hover:text-c-text'}`}>
                  <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[12px] border ${
                    chosen ? 'bg-c-purple border-c-purple text-white' : 'border-[var(--border-hi)] text-c-faint'}`}>
                    {(LETTERS[i] ?? opt.id).toUpperCase()}
                  </span>
                  <span className="pt-0.5">{opt.text}</span>
                </button>
              )
            })}
          </div>
          <p className="hidden sm:block font-mono text-[10px] text-c-ghost mt-4">
            Keys: {LETTERS.slice(0, item.options.length).join(' ').toUpperCase()} to choose · Enter to save
          </p>
        </div>

        {run?.mode === 'practice' && (
          <div className="mb-4">
            {item.hints.map((h, i) => (
              <p key={i} data-testid={`hint-${i + 1}`} className="text-[13px] text-c-muted mb-2 pl-4 border-l-2 border-c-blue/50">
                <span className="font-mono text-[10px] text-c-faint uppercase mr-2">{i === 0 ? 'Nudge' : 'How to proceed'}</span>{h}
              </p>
            ))}
            {item.hint_level < 2 && (
              <button onClick={hint} data-testid="hint-button" className="text-[12px] font-mono text-c-blue hover:underline">
                {item.hint_level === 0 ? 'Need a nudge?' : 'Still stuck? How to proceed'}
              </button>
            )}
          </div>
        )}

        {error && <p className="text-[12px] text-c-red mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={toggleMark} data-testid="mark-button"
            className={`px-4 py-3 rounded-xl border text-[13px] ${item.marked ? 'border-c-yellow/50 text-c-yellow' : 'border-[var(--border)] text-c-muted hover:text-c-text'}`}>
            ⚑ {item.marked ? 'Marked' : 'Mark for review'}
          </button>
          <button onClick={save} disabled={!item.choice || busy || (!isLatest && !changed)} data-testid="save-answer"
            className="flex-1 py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium disabled:opacity-40">
            {isLatest && !done ? 'Save and continue →' : 'Save change'}
          </button>
        </div>
        <div className="flex justify-between mt-4">
          {!isLatest || done
            ? <button onClick={() => done ? setView('review') : goTo(items.length - 1)} className="text-[12px] text-c-faint hover:text-c-text">
                ← {done ? 'Back to review' : 'Back to the current question'}
              </button>
            : <span />}
          <button onClick={() => { setItems(list => bankTime(list, cur)); setView('review') }} data-testid="review-button"
            className="text-[12px] text-c-faint hover:text-c-text">Review and submit →</button>
        </div>
      </div>
    </div>
  )
}
