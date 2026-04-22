import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/db/auth'
import { getLearnerProfile, getAllSkillStates, getReviewSchedules } from '@/lib/db/queries'
import { getAllNodes, getAllEdges } from '@/lib/graph'
import { Navbar } from '@/components/layout/Navbar'
import { PHASE_ORDER, findActivePhase, buildPhaseGroups } from '@/lib/phases'
import { deriveUrgency } from '@/lib/sm2/urgency'
import type { LearnerSkillState, SkillNode } from '@/types'

// ─── Display constants ────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  phase_1_computer_basics:  'Phase 1 — Computer & Python Basics',
  phase_2_cs_data:          'Phase 2 — CS & Data Thinking',
  phase_3_intro_ai:         'Phase 3 — Intro to AI',
  phase_4_machine_learning: 'Phase 4 — Machine Learning',
  phase_5_deep_learning:    'Phase 5 — Deep Learning',
  phase_6_modern_ai:        'Phase 6 — Modern AI Systems',
  phase_7_real_world:       'Phase 7 — Real-World AI Products',
  phase_8_mastery:          'Phase 8 — Mastery & System Design',
}

const PHASE_SHORT: Record<string, string> = {
  phase_1_computer_basics:  'Phase 1',
  phase_2_cs_data:          'Phase 2',
  phase_3_intro_ai:         'Phase 3',
  phase_4_machine_learning: 'Phase 4',
  phase_5_deep_learning:    'Phase 5',
  phase_6_modern_ai:        'Phase 6',
  phase_7_real_world:       'Phase 7',
  phase_8_mastery:          'Phase 8',
}

const MASTERY_COLOUR: Record<string, string> = {
  mastered: '#34d399',
  fragile:  '#fbbf24',
  learning: '#7c6eff',
  ready:    '#5a8a9f',
  blocked:  '#3a3a52',
}

const MASTERY_RING: Record<string, string> = {
  mastered: 'ring-2 ring-[#34d399]/50',
  fragile:  'ring-2 ring-[#fbbf24]/50',
  learning: 'ring-2 ring-[#7c6eff]/50',
  ready:    'ring-1 ring-[#5a8a9f]/40',
  blocked:  'ring-1 ring-[#3a3a52]/30',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function phaseStats(nodes: SkillNode[], stateMap: Map<string, LearnerSkillState>) {
  const total      = nodes.length
  const mastered   = nodes.filter(n => stateMap.get(n.id)?.mastery_state === 'mastered').length
  const learning   = nodes.filter(n => ['learning','fragile'].includes(stateMap.get(n.id)?.mastery_state ?? '')).length
  const pct        = total > 0 ? Math.round((mastered / total) * 100) : 0
  const hasContent = nodes.some(n => n.question_ids.length > 0)
  return { total, mastered, learning, pct, hasContent }
}

function skillsLeft(nodes: SkillNode[], stateMap: Map<string, LearnerSkillState>): number {
  return nodes.filter(n =>
    n.question_ids.length > 0 &&
    stateMap.get(n.id)?.mastery_state !== 'mastered',
  ).length
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Dashboard({
  searchParams,
}: {
  searchParams?: { view?: string }
}) {
  const viewAll = searchParams?.view === 'all'

  const cookieStore = cookies()
  const token = cookieStore.get('synaptic_token')?.value
  if (!token) redirect('/login')
  const user = verifyToken(token)
  if (!user) redirect('/login')

  const profile = getLearnerProfile(user.id)
  if (!profile) redirect('/login')
  if (!profile.diagnostic_done) redirect('/learn/diagnostic')

  const allStates = getAllSkillStates(user.id)
  const schedules = getReviewSchedules(user.id)
  const allNodes  = getAllNodes()
  const allEdges  = getAllEdges()

  const stateMap     = new Map(allStates.map(s => [s.skill_id, s]))
  const now          = new Date()
  const threeDays    = new Date(now.getTime() + 3 * 86400000)

  // ── Classify reviews ────────────────────────────────────────────────────────
  const learnedSchedules = schedules.filter(s => s.repetitions > 0)

  const urgentSchedules = learnedSchedules
    .filter(s => new Date(s.due_at) <= now)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())

  const upcomingSchedules = learnedSchedules
    .filter(s => new Date(s.due_at) > now && new Date(s.due_at) <= threeDays)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())

  const urgentCount   = urgentSchedules.length
  const upcomingCount = upcomingSchedules.length

  // Top items for display
  const top5Urgent = urgentSchedules.slice(0, 5).map(s => {
    const node = allNodes.find(n => n.id === s.skill_id)
    const { label, urgency } = deriveUrgency(s.due_at, now)
    return { id: s.skill_id, nodeLabel: node?.label ?? s.skill_id, urgencyLabel: label, urgency }
  })

  const top4Upcoming = upcomingSchedules.slice(0, 4).map(s => {
    const node = allNodes.find(n => n.id === s.skill_id)
    const { label, days_until_due } = deriveUrgency(s.due_at, now)
    return { id: s.skill_id, nodeLabel: node?.label ?? s.skill_id, urgencyLabel: label, soonEnough: days_until_due <= 1 }
  })

  // ── All dues (full list, for ?view=all) ─────────────────────────────────────
  const allDuesItems = learnedSchedules.map(s => {
    const node = allNodes.find(n => n.id === s.skill_id)
    const { label, urgency } = deriveUrgency(s.due_at, now)
    return { id: s.skill_id, nodeLabel: node?.label ?? s.skill_id, urgencyLabel: label, urgency }
  }).sort((a, b) => {
    const order: Record<string, number> = { overdue: 0, due_today: 1, due_soon: 2, upcoming: 3 }
    return (order[a.urgency] ?? 4) - (order[b.urgency] ?? 4)
  })

  // ── Phase data ──────────────────────────────────────────────────────────────
  const totalMastered = allStates.filter(s => s.mastery_state === 'mastered').length
  const totalLearning = allStates.filter(s => ['learning','fragile'].includes(s.mastery_state)).length

  const phaseGroups    = buildPhaseGroups(allNodes)
  const activePhase    = findActivePhase(allNodes, stateMap)
  const activeNodes    = phaseGroups[activePhase] ?? []
  const activeStats    = phaseStats(activeNodes, stateMap)
  const activePhaseIds = new Set(activeNodes.map(n => n.id))
  const skillsRemaining = skillsLeft(activeNodes, stateMap)

  const activePhaseIdx = PHASE_ORDER.indexOf(activePhase as typeof PHASE_ORDER[number])
  const nextPhaseKey   = PHASE_ORDER[activePhaseIdx + 1]
  const nextPhaseLabel = nextPhaseKey ? PHASE_SHORT[nextPhaseKey] : null

  // ── Study CTA (always study-only, never review) ────────────────────────────
  const studyCtaText = skillsRemaining > 0
    ? `Continue ${PHASE_SHORT[activePhase]} →`
    : nextPhaseLabel ? `Start ${nextPhaseLabel} →` : 'All phases complete →'

  // ── Edge map for graph ──────────────────────────────────────────────────────
  const unlocksMap = new Map<string, string[]>()
  for (const edge of allEdges) {
    if (edge.strength === 'hard') {
      const arr = unlocksMap.get(edge.from) ?? []
      arr.push(edge.to)
      unlocksMap.set(edge.from, arr)
    }
  }

  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <div className="max-w-4xl mx-auto px-8 py-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8 animate-slide-up">
          <div>
            <h1 className="font-serif italic text-[32px] text-c-text leading-none mb-2">
              {profile.display_name ? `Hi, ${profile.display_name}` : 'Your Journey'}
            </h1>
            <p className="text-[14px] text-c-faint font-mono">
              {urgentCount > 0
                ? `${urgentCount} urgent${upcomingCount > 0 ? ` · ${upcomingCount} upcoming` : ''}`
                : upcomingCount > 0
                ? `${upcomingCount} review${upcomingCount !== 1 ? 's' : ''} coming up`
                : 'No reviews due'}{' '}
              · {profile.streak_days} day streak
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* All dues toggle */}
            {learnedSchedules.length > 0 && (
              <Link
                href={viewAll ? '/dashboard' : '/dashboard?view=all'}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-c-faint hover:text-c-muted text-[13px] font-mono transition-all"
              >
                {viewAll ? '← Back' : `All dues (${learnedSchedules.length})`}
              </Link>
            )}
            {/* Review slot — amber if urgent, muted badge if upcoming, hidden if neither */}
            {urgentCount > 0 ? (
              <Link
                href="/learn?mode=review"
                className="px-5 py-2.5 rounded-xl border border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10 text-[14px] font-medium transition-all"
              >
                Review {urgentCount} →
              </Link>
            ) : upcomingCount > 0 ? (
              <span className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-c-faint text-[13px] font-mono">
                {upcomingCount} due soon
              </span>
            ) : null}
            {/* Study slot — always study, never review */}
            <Link
              href="/learn"
              className="px-5 py-2.5 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[14px] font-medium transition-all hover:scale-[1.02] shadow-sm"
            >
              {studyCtaText}
            </Link>
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { val: totalMastered, lbl: 'Skills mastered',  col: '#34d399' },
            { val: totalLearning, lbl: 'Actively learning', col: '#7c6eff' },
            { val: urgentCount,   lbl: 'Urgent reviews',   col: urgentCount > 0 ? '#fbbf24' : 'var(--text-faint)' },
          ].map((s, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border border-[var(--border)] bg-c-bg2"
              style={{ borderLeft: `3px solid ${s.col}` }}
            >
              <p className="font-serif text-[36px] leading-none mb-2" style={{ color: s.col }}>
                {s.val}
              </p>
              <p className="text-[12px] text-c-muted uppercase tracking-[0.1em] font-mono">{s.lbl}</p>
            </div>
          ))}
        </div>

        {/* ── Active Phase Card (Primary Action) ──────────────────────────── */}
        <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 overflow-hidden mb-6 animate-slide-up">

          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-mono text-[12px] text-c-purple uppercase tracking-[0.16em]">
                Active phase
              </p>
              <span className="font-mono text-[12px] text-c-muted">
                {activeStats.mastered}/{activeStats.total} mastered
              </span>
            </div>
            <h2 className="text-[18px] font-semibold text-c-text mb-3">
              {PHASE_LABELS[activePhase]}
            </h2>

            <div className="h-2 rounded-full bg-c-bg3 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-c-purple transition-all duration-700"
                style={{ width: `${activeStats.pct}%` }}
              />
            </div>

            {skillsRemaining > 0 && nextPhaseLabel && (
              <p className="text-[12px] text-c-faint font-mono">
                {skillsRemaining} skill{skillsRemaining !== 1 ? 's' : ''} left to unlock{' '}
                <span className="text-c-muted">{nextPhaseLabel}</span>
              </p>
            )}
            {skillsRemaining === 0 && nextPhaseLabel && (
              <p className="text-[12px] text-c-green font-mono">
                Phase complete — {nextPhaseLabel} is unlocked! →
              </p>
            )}
          </div>

          {/* Skill path row */}
          <div className="relative px-4 pb-6">
            <div
              className="pointer-events-none absolute left-4 top-0 bottom-6 w-8 z-10"
              style={{ background: 'linear-gradient(to right, var(--bg2), transparent)' }}
            />
            <div
              className="pointer-events-none absolute right-4 top-0 bottom-6 w-8 z-10"
              style={{ background: 'linear-gradient(to left, var(--bg2), transparent)' }}
            />
            <div className="overflow-x-auto pb-2">
              <div className="flex items-start gap-0 min-w-max px-2">
                {activeNodes.map((node, idx) => {
                  const state    = stateMap.get(node.id)
                  const mastery  = state?.mastery_state ?? 'blocked'
                  const pKnow    = state?.p_know ?? 0
                  const pct      = Math.round(pKnow * 100)
                  const colour   = MASTERY_COLOUR[mastery] ?? '#3a3a52'
                  const ring     = MASTERY_RING[mastery] ?? ''
                  const isLast   = idx === activeNodes.length - 1
                  const isStudiable = ['ready','learning','fragile','mastered'].includes(mastery) && node.question_ids.length > 0

                  return (
                    <div key={node.id} className="flex items-center">
                      <div className="flex flex-col items-center w-[96px]">
                        <Link
                          href={isStudiable ? `/learn/skill/${node.id}` : '#'}
                          className={`relative w-16 h-16 rounded-full flex items-center justify-center mb-2.5 transition-all ${ring} ${
                            isStudiable ? 'hover:scale-110 cursor-pointer' : 'opacity-50 cursor-default'
                          }`}
                          style={{ background: colour + '22', border: `2.5px solid ${colour}` }}
                          title={isStudiable ? `Study: ${node.label}` : 'Prerequisites needed'}
                        >
                          {mastery === 'mastered' ? (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : (
                            <span className="font-mono text-[13px] font-bold" style={{ color: colour }}>
                              {pct}%
                            </span>
                          )}
                        </Link>
                        <p
                          className="text-[12px] text-center leading-tight font-mono px-1 max-w-[88px]"
                          style={{ color: mastery === 'blocked' ? 'var(--text-ghost)' : 'var(--text-muted)' }}
                        >
                          {node.label}
                        </p>
                      </div>
                      {!isLast && (
                        <div className="w-5 flex-shrink-0 mt-[-36px]" style={{ height: 2, background: 'var(--border-hi)' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-[var(--border)] bg-c-bg3 flex items-center justify-between">
            <p className="text-[13px] text-c-faint font-mono">
              Click any skill to dive in, or let the engine choose
            </p>
            <Link
              href="/learn"
              className="px-4 py-2 rounded-lg bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[13px] font-medium transition-all"
            >
              {studyCtaText}
            </Link>
          </div>
        </div>

        {/* ── Urgent Reviews ───────────────────────────────────────────────── */}
        {urgentCount > 0 && !viewAll && (
          <div className="rounded-2xl border border-[#fbbf24]/30 bg-c-bg2 overflow-hidden mb-4 animate-slide-up">
            <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold text-c-text">Urgent reviews</p>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#fbbf24]/15 text-[#fbbf24] border border-[#fbbf24]/25">
                  {urgentCount}
                </span>
              </div>
              <Link
                href="/learn?mode=review"
                className="text-[13px] font-mono text-[#fbbf24] hover:underline transition-colors"
              >
                Review all →
              </Link>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {top5Urgent.map(skill => (
                <div key={skill.id} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-[14px] text-c-text truncate mr-4">{skill.nodeLabel}</span>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`text-[12px] font-mono ${skill.urgency === 'overdue' ? 'text-[#f87171]' : 'text-[#fbbf24]'}`}>
                      {skill.urgencyLabel}
                    </span>
                    <Link
                      href={`/learn/skill/${skill.id}`}
                      className="px-3 py-1 rounded-lg text-[12px] font-mono text-[#fbbf24] bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 border border-[#fbbf24]/20 transition-all"
                    >
                      Study →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming Reviews ─────────────────────────────────────────────── */}
        {upcomingCount > 0 && !viewAll && (
          <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 overflow-hidden mb-6 animate-slide-up">
            <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold text-c-text">Coming up</p>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[var(--bg3)] text-c-muted border border-[var(--border)]">
                  {upcomingCount}
                </span>
              </div>
              <p className="text-[12px] font-mono text-c-ghost">Next 3 days</p>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {top4Upcoming.map(skill => (
                <div key={skill.id} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-[14px] text-c-muted truncate mr-4">{skill.nodeLabel}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[12px] font-mono text-c-faint">{skill.urgencyLabel}</span>
                    {skill.soonEnough && (
                      <Link
                        href={`/learn/skill/${skill.id}`}
                        className="px-3 py-1 rounded-lg text-[12px] font-mono text-[#fbbf24] bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 border border-[#fbbf24]/20 transition-all"
                      >
                        Review now →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All dues view ─────────────────────────────────────────────────── */}
        {viewAll && (
          <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 overflow-hidden mb-6 animate-slide-up">
            <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold text-c-text">All dues</p>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[var(--bg3)] text-c-muted border border-[var(--border)]">
                  {allDuesItems.length}
                </span>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {allDuesItems.map(skill => (
                <div key={skill.id} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-[14px] text-c-text truncate mr-4">{skill.nodeLabel}</span>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`text-[12px] font-mono ${skill.urgency === 'overdue' ? 'text-[#f87171]' : skill.urgency === 'due_today' ? 'text-[#fbbf24]' : 'text-c-faint'}`}>
                      {skill.urgencyLabel}
                    </span>
                    <Link
                      href={`/learn/skill/${skill.id}`}
                      className={`px-3 py-1 rounded-lg text-[12px] font-mono border transition-all ${
                        skill.urgency === 'overdue' || skill.urgency === 'due_today'
                          ? 'text-[#fbbf24] bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 border-[#fbbf24]/20'
                          : 'text-c-purple bg-c-purple/10 hover:bg-c-purple/20 border-c-purple/20'
                      }`}
                    >
                      Review →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Full Curriculum ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="font-mono text-[12px] text-c-faint uppercase tracking-[0.16em] mb-3 px-1">
            Full curriculum
          </p>
          {PHASE_ORDER.map(phaseKey => {
            const nodes    = phaseGroups[phaseKey] ?? []
            if (nodes.length === 0) return null
            const stats    = phaseStats(nodes, stateMap)
            const isActive = phaseKey === activePhase
            const isLocked = !stats.hasContent
            const isDone   = stats.hasContent && stats.mastered === stats.total

            const PhaseIcon = () => {
              if (isLocked) return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-c-ghost flex-shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )
              if (isDone) return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: '#34d399' }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )
              if (isActive) return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 text-c-purple">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              )
              return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-c-ghost">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
              )
            }

            return (
              <div
                key={phaseKey}
                className={`rounded-xl border overflow-hidden transition-all ${
                  isActive
                    ? 'border-c-purple/40 bg-c-bg2'
                    : isLocked
                    ? 'border-[var(--border)] opacity-40'
                    : 'border-[var(--border)] bg-c-bg4'
                }`}
              >
                <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PhaseIcon />
                    <p className={`text-[14px] font-medium truncate ${isActive ? 'text-c-text' : 'text-c-muted'}`}>
                      {PHASE_LABELS[phaseKey]}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {stats.hasContent && (
                      <div className="w-28 h-1.5 rounded-full bg-c-bg3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${stats.pct}%`, background: isDone ? '#34d399' : isActive ? '#7c6eff' : '#5a8a9f' }}
                        />
                      </div>
                    )}
                    <span className="font-mono text-[12px] text-c-ghost w-14 text-right">
                      {isLocked ? 'Soon' : `${stats.mastered}/${stats.total}`}
                    </span>
                    {isActive && (
                      <Link
                        href="/learn"
                        className="px-3 py-1.5 rounded-lg text-[12px] font-mono bg-c-purple/10 text-c-purple hover:bg-c-purple/20 transition-all border border-c-purple/20"
                      >
                        Study
                      </Link>
                    )}
                  </div>
                </div>

                {/* Expanded skill list for active phase */}
                {isActive && (
                  <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                    {nodes.map(node => {
                      const state    = stateMap.get(node.id)
                      const mastery  = state?.mastery_state ?? 'blocked'
                      const pKnow    = state?.p_know ?? 0
                      const colour   = MASTERY_COLOUR[mastery] ?? '#3a3a52'
                      const isStudiable = ['ready','learning','fragile','mastered'].includes(mastery) && node.question_ids.length > 0

                      return (
                        <div
                          key={node.id}
                          className="px-5 py-3 flex items-center justify-between bg-c-bg4 hover:bg-c-bg3 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour }} />
                            <span className="text-[14px] text-c-text truncate">{node.label}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                            <span className="font-mono text-[12px] capitalize" style={{ color: colour }}>
                              {mastery}
                            </span>
                            <span className="font-mono text-[12px] text-c-ghost">
                              {Math.round(pKnow * 100)}%
                            </span>
                            {isStudiable && (
                              <Link
                                href={`/learn/skill/${node.id}`}
                                className="px-3 py-1 rounded-lg text-[12px] font-mono text-c-purple bg-c-purple/10 hover:bg-c-purple/20 border border-c-purple/20 transition-all"
                              >
                                Study
                              </Link>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Graph shortcut ──────────────────────────────────────────────── */}
        <div className="mt-8 text-center animate-fade-in">
          <Link
            href="/graph"
            className="inline-flex items-center gap-2 text-[13px] font-mono text-c-faint hover:text-c-muted transition-colors underline underline-offset-4"
          >
            Explore skill graph →
          </Link>
        </div>

      </div>
    </div>
  )
}
