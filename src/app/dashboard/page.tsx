import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/db/auth'
import {
  getLearnerProfile, getAllSkillStates, getReviewSchedules,
  getAttemptsBetween, getBehaviorQualityShadowBetween, getExamItemsBetween,
  getMotivationState, getLearnerAbility, getExamRuns,
} from '@/lib/db/queries'
import { behaviourInsights, bloomProfile, reviewForecast } from '@/lib/analytics/profile'
import { suggestNext } from '@/lib/session/suggest'
import { ELO_START } from '@/lib/elo'
import { BehaviourInsights } from '@/components/olm/BehaviourInsights'
import { NextUp } from '@/components/olm/NextUp'
import { DayBars } from '@/components/viz/DayBars'
import { StatCard } from '@/components/viz/StatCard'
import { BloomProfile } from '@/components/viz/BloomProfile'
import type { Debrief } from '@/lib/exam/debrief'
import type { Phase } from '@/types'
import { getAllNodes, getAllEdges } from '@/lib/graph'
import { Navbar } from '@/components/layout/Navbar'
import { PHASE_ORDER, findActivePhase, buildPhaseGroups, PHASE_EVALUATION_FILES } from '@/lib/phases'
import { deriveUrgency } from '@/lib/sm2/urgency'
import { getMasteryTier } from '@/lib/bkt'
import { MASTERY_COLOUR } from '@/lib/ui/mastery-colour'
import type { LearnerSkillState, SkillNode } from '@/types'

// ─── Display constants ────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  phase_1_computer_basics:  'Phase 1 — Computer Basics',
  phase_1b_programming_basics: 'Phase 1B — Programming Basics',
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
  phase_1b_programming_basics: 'Phase 1B',
  phase_2_cs_data:          'Phase 2',
  phase_3_intro_ai:         'Phase 3',
  phase_4_machine_learning: 'Phase 4',
  phase_5_deep_learning:    'Phase 5',
  phase_6_modern_ai:        'Phase 6',
  phase_7_real_world:       'Phase 7',
  phase_8_mastery:          'Phase 8',
}

const MASTERY_RING: Record<string, string> = {
  mastered: 'ring-2 ring-[#4f8a5b]/50',
  fragile:  'ring-2 ring-[#e8a84a]/50',
  learning: 'ring-2 ring-[#e8a84a]/50',
  ready:    'ring-1 ring-[#d96e34]/40',
  blocked:  'ring-1 ring-[#a8a49c]/30',
}

// The behaviour panel's window: long enough for a weekly pace trend, short
// enough that how you worked in spring does not describe you now.
const BEHAVIOUR_WINDOW_DAYS = 90

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
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const profile = await getLearnerProfile(user.id)
  if (!profile) redirect('/login')
  if (!profile.diagnostic_done) redirect('/learn/diagnostic')

  const now          = new Date()
  const windowStart  = new Date(now.getTime() - BEHAVIOUR_WINDOW_DAYS * 86400000)
  const windowEnd    = new Date(now.getTime() + 60_000)
  const [allStates, schedules, windowAttempts, qualityShadow, examItems, motivation, examRuns] = await Promise.all([
    getAllSkillStates(user.id),
    getReviewSchedules(user.id),
    getAttemptsBetween(user.id, windowStart, windowEnd),
    getBehaviorQualityShadowBetween(user.id, windowStart, windowEnd),
    getExamItemsBetween(user.id, windowStart, windowEnd),
    getMotivationState(user.id),
    getExamRuns(user.id, 10),
  ])
  const allNodes  = getAllNodes()
  const allEdges  = getAllEdges()
  const insights  = behaviourInsights(windowAttempts, qualityShadow, examItems, now)

  const stateMap     = new Map(allStates.map(s => [s.skill_id, s]))

  // ── Hero: next session and why, review forecast, Bloom (OLM-5, LIVE-1)
  const heroPhase = findActivePhase(allNodes, stateMap)
  const ability = await getLearnerAbility(user.id, heroPhase as Phase)
  const suggestion = motivation
    ? suggestNext({
        skillStates: allStates, schedules, motivation,
        learnerRating: ability?.rating ?? ELO_START,
        now,
      })
    : null
  const forecast = reviewForecast(schedules.filter(s => s.repetitions > 0).map(s => s.due_at), now, 14)
  const latestExam = examRuns.find(r => r.status === 'finished' && r.debrief)
  const nodeLabel = (id: string) => allNodes.find(n => n.id === id)?.label ?? id
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

  // ── Hero actions: start the session, and clear urgent reviews if any ───────
  const heroActions = (
    <>
      <Link
        href="/learn"
        className="px-6 py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[15px] font-medium transition-all hover:scale-[1.02] shadow-sm"
      >
        {studyCtaText}
      </Link>
      {urgentCount > 0 && (
        <Link
          href="/learn?mode=review"
          className="px-5 py-3 rounded-xl border border-c-yellow/40 text-c-yellow hover:bg-c-yellow/10 text-[14px] font-medium transition-all"
        >
          Review {urgentCount} due now →
        </Link>
      )}
      {PHASE_EVALUATION_FILES[activePhase as Phase] && activeStats.mastered > 0 && (
        <Link
          href={`/learn/exam/${activePhase}`}
          className="px-4 py-3 rounded-xl text-c-muted hover:text-c-text text-[14px] transition-all"
        >
          Take the {PHASE_SHORT[activePhase]} exam
        </Link>
      )}
    </>
  )
  const heroContext = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>{PHASE_LABELS[activePhase]}</span>
      <span className="inline-block w-24 h-1.5 rounded-full bg-c-bg3 overflow-hidden align-middle">
        <span className="block h-full rounded-full bg-c-purple" style={{ width: `${activeStats.pct}%` }} />
      </span>
      <span>{activeStats.mastered}/{activeStats.total} mastered</span>
      {skillsRemaining > 0 && nextPhaseLabel && <span>· {skillsRemaining} to unlock {nextPhaseLabel}</span>}
    </div>
  )

  const subtitle = [
    urgentCount > 0 ? `${urgentCount} review${urgentCount !== 1 ? 's' : ''} due now` : 'Nothing overdue',
    upcomingCount > 0 ? `${upcomingCount} in the next 3 days` : null,
    `${profile.streak_days} day streak`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6 animate-slide-up">
          <h1 className="font-serif italic text-[30px] sm:text-[34px] text-c-text leading-none mb-2">
            {profile.display_name ? `Hi, ${profile.display_name}` : 'Your Journey'}
          </h1>
          <p className="text-[13px] text-c-faint font-mono">{subtitle}</p>
        </div>

        {viewAll ? (
          /* ── All dues view ─────────────────────────────────────────────── */
          <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 overflow-hidden mb-8 animate-slide-up">
            <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold text-c-text">Everything scheduled</p>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[var(--bg3)] text-c-muted border border-[var(--border)]">
                  {allDuesItems.length}
                </span>
              </div>
              <Link href="/dashboard" className="text-[13px] font-mono text-c-faint hover:text-c-text">← Back</Link>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {allDuesItems.map(skill => (
                <div key={skill.id} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-[14px] text-c-text truncate mr-4">{skill.nodeLabel}</span>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className={`text-[12px] font-mono ${skill.urgency === 'overdue' ? 'text-c-red' : skill.urgency === 'due_today' ? 'text-c-yellow' : 'text-c-faint'}`}>
                      {skill.urgencyLabel}
                    </span>
                    <Link
                      href={`/learn/skill/${skill.id}`}
                      className={`px-3 py-1 rounded-lg text-[12px] font-mono border transition-all ${
                        skill.urgency === 'overdue' || skill.urgency === 'due_today'
                          ? 'text-c-yellow bg-c-yellow/10 hover:bg-c-yellow/20 border-c-yellow/20'
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
        ) : (
          <>
            {/* ── Hero: the next session, why, and the button (OLM-5, LIVE-1) */}
            <div className="mb-4 animate-slide-up">
              {suggestion ? (
                <NextUp suggestion={suggestion} label={nodeLabel} context={heroContext} actions={heroActions} />
              ) : (
                <div className="rounded-2xl border border-[var(--border)] border-t-4 border-t-c-purple bg-c-bg2 p-7">
                  <p className="font-mono text-[11px] text-c-purple uppercase tracking-[0.16em] mb-3">Your next session</p>
                  <h2 className="font-serif italic text-[30px] leading-[1.1] text-c-text mb-4">{PHASE_LABELS[activePhase]}</h2>
                  <div className="text-[12px] font-mono text-c-faint">{heroContext}</div>
                  <div className="mt-6 flex flex-wrap items-center gap-2">{heroActions}</div>
                </div>
              )}
            </div>

            {/* ── Stats row ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard value={totalMastered} label="Skills mastered" accent="var(--green)" />
              <StatCard value={totalLearning} label="Actively learning" accent="var(--yellow)" />
              <StatCard value={urgentCount} label="Due now" accent={urgentCount > 0 ? 'var(--red)' : undefined} />
              <StatCard value={upcomingCount} label="Due in 3 days" accent={upcomingCount > 0 ? 'var(--blue)' : undefined} />
            </div>

            <div className="grid lg:grid-cols-[3fr_2fr] gap-4 mb-8 items-start">
              <div className="flex flex-col gap-4 min-w-0">
                {/* ── Active phase path ─────────────────────────────────────── */}
                <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 overflow-hidden">
                  <div className="px-6 pt-5 pb-3 flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-c-faint uppercase tracking-[0.16em] mb-1">Active phase</p>
                      <h2 className="text-[16px] font-semibold text-c-text truncate">{PHASE_LABELS[activePhase]}</h2>
                    </div>
                    <span className="font-mono text-[12px] text-c-muted flex-shrink-0">
                      {activeStats.mastered}/{activeStats.total} mastered
                    </span>
                  </div>

                  {/* Skill path row */}
                  <div className="relative px-4 pb-4">
                    <div
                      className="pointer-events-none absolute left-4 top-0 bottom-4 w-8 z-10"
                      style={{ background: 'linear-gradient(to right, var(--bg2), transparent)' }}
                    />
                    <div
                      className="pointer-events-none absolute right-4 top-0 bottom-4 w-8 z-10"
                      style={{ background: 'linear-gradient(to left, var(--bg2), transparent)' }}
                    />
                    <div className="overflow-x-auto pb-2">
                      <div className="flex items-start gap-0 min-w-max px-2">
                        {activeNodes.map((node, idx) => {
                          const state    = stateMap.get(node.id)
                          const mastery  = state?.mastery_state ?? 'blocked'
                          const pKnow    = state?.p_know ?? 0
                          const masteryTier = mastery === 'blocked' ? 'Locked' : getMasteryTier(pKnow)
                          const colour   = MASTERY_COLOUR[mastery] ?? '#a8a49c'
                          const ring     = MASTERY_RING[mastery] ?? ''
                          const isLast   = idx === activeNodes.length - 1
                          const isStudiable = ['ready','learning','fragile','mastered'].includes(mastery) && node.question_ids.length > 0
                          const isNext   = suggestion?.served?.skill_id === node.id

                          return (
                            <div key={node.id} className="flex items-center">
                              <div className="flex flex-col items-center w-[88px]">
                                <Link
                                  href={isStudiable ? `/learn/skill/${node.id}` : '#'}
                                  className={`relative w-14 h-14 rounded-full flex items-center justify-center mb-2 transition-all ${isNext ? 'ring-4 ring-c-purple/60' : ring} ${
                                    isStudiable ? 'hover:scale-110 cursor-pointer' : 'opacity-50 cursor-default'
                                  }`}
                                  style={{ background: colour + '22', border: `2.5px solid ${colour}` }}
                                  title={isStudiable ? `Study: ${node.label}` : 'Finish earlier skills first'}
                                >
                                  {mastery === 'mastered' ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  ) : (
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: colour }} />
                                  )}
                                </Link>
                                <p
                                  className="text-[11px] text-center leading-tight font-mono px-1 max-w-[84px]"
                                  style={{ color: mastery === 'blocked' ? 'var(--text-ghost)' : 'var(--text-muted)' }}
                                >
                                  {node.label}
                                </p>
                                <p className="text-[10px] font-mono mt-1" style={{ color: isNext ? 'var(--purple)' : colour }}>
                                  {isNext ? 'Next up' : masteryTier}
                                </p>
                              </div>
                              {!isLast && (
                                <div className="w-4 flex-shrink-0 mt-[-34px]" style={{ height: 2, background: 'var(--border-hi)' }} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Bloom profile from the latest exam ────────────────────── */}
                <div className="p-6 rounded-2xl border border-[var(--border)] bg-c-bg2" data-testid="dashboard-bloom">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p className="text-[14px] text-c-text font-semibold">By question type</p>
                    {latestExam && <Link href={`/learn/exam/${latestExam.phase}`} className="text-[12px] font-mono text-c-faint hover:text-c-text flex-shrink-0">Retake →</Link>}
                  </div>
                  {latestExam ? (
                    <>
                      <p className="text-[12px] text-c-faint mb-4">
                        Latest exam · {PHASE_SHORT[latestExam.phase] ?? latestExam.phase} · chance of a right answer
                      </p>
                      <BloomProfile levels={bloomProfile(latestExam.debrief as Debrief)} />
                    </>
                  ) : (
                    <p className="text-[12px] text-c-faint">
                      Take a phase exam to see how you do at each level, from recall to creating something new.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Reviews: forecast, then what is due ────────────────────── */}
              <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 overflow-hidden" data-testid="review-forecast">
                <div className="px-6 pt-5 pb-4">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p className="text-[14px] text-c-text font-semibold">Reviews</p>
                    {learnedSchedules.length > 0 && (
                      <Link href="/dashboard?view=all" className="text-[12px] font-mono text-c-faint hover:text-c-text">
                        All {learnedSchedules.length} scheduled →
                      </Link>
                    )}
                  </div>
                  <p className="text-[12px] text-c-faint mb-4">Next 14 days</p>
                  <DayBars days={forecast} unit="reviews" height={48} showCounts />
                </div>

                {(urgentCount > 0 || upcomingCount > 0) ? (
                  <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                    {top5Urgent.map(skill => (
                      <Link key={skill.id} href={`/learn/skill/${skill.id}`}
                        className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-c-bg3 transition-colors">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: skill.urgency === 'overdue' ? 'var(--red)' : 'var(--yellow)' }} />
                          <span className="text-[14px] text-c-text truncate">{skill.nodeLabel}</span>
                        </span>
                        <span className={`text-[12px] font-mono flex-shrink-0 ${skill.urgency === 'overdue' ? 'text-c-red' : 'text-c-yellow'}`}>
                          {skill.urgencyLabel}
                        </span>
                      </Link>
                    ))}
                    {top4Upcoming.map(skill => (
                      <Link key={skill.id} href={`/learn/skill/${skill.id}`}
                        className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-c-bg3 transition-colors">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-c-bg3 border border-[var(--border-hi)]" />
                          <span className="text-[14px] text-c-muted truncate">{skill.nodeLabel}</span>
                        </span>
                        <span className="text-[12px] font-mono text-c-faint flex-shrink-0">{skill.urgencyLabel}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="px-6 py-4 border-t border-[var(--border)] text-[12px] text-c-faint">Nothing due in the next three days.</p>
                )}

                {urgentCount > 0 && (
                  <div className="px-6 py-3 border-t border-[var(--border)] bg-c-bg4/60">
                    <Link href="/learn?mode=review" className="text-[13px] font-mono text-c-yellow hover:underline">
                      Review all {urgentCount} due now →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── Behavioural insights (OLM-4) ─────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--border)] bg-c-bg2 p-6 mb-8">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <div>
                  <p className="text-[14px] font-semibold text-c-text">How you work</p>
                  <p className="text-[12px] text-c-faint">Last {BEHAVIOUR_WINDOW_DAYS} days</p>
                </div>
                <Link href="/profile" className="text-[12px] font-mono text-c-faint hover:text-c-text flex-shrink-0">See your skills →</Link>
              </div>
              <BehaviourInsights insights={insights} />
            </div>
          </>
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: MASTERY_COLOUR.mastered }}>
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
                <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1 basis-[180px]">
                    <PhaseIcon />
                    <p className={`text-[14px] font-medium truncate ${isActive ? 'text-c-text' : 'text-c-muted'}`}>
                      {PHASE_LABELS[phaseKey]}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    {stats.hasContent && (
                      <div className="hidden sm:block w-28 h-1.5 rounded-full bg-c-bg3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${stats.pct}%`, background: isDone ? MASTERY_COLOUR.mastered : isActive ? '#e8a84a' : '#d96e34' }}
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
                    {/* Optional self-check across every Bloom level, once some progress exists in this phase */}
                    {PHASE_EVALUATION_FILES[phaseKey] && stats.mastered > 0 && (
                      <Link
                        href={`/learn/evaluate/${phaseKey}`}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-mono bg-c-bg3 text-c-muted hover:text-c-text hover:bg-c-bg2 transition-all border border-[var(--border)]"
                      >
                        Evaluate
                      </Link>
                    )}
                    {PHASE_EVALUATION_FILES[phaseKey] && stats.mastered > 0 && (
                      <Link
                        href={`/learn/exam/${phaseKey}`}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-mono bg-c-bg3 text-c-muted hover:text-c-text hover:bg-c-bg2 transition-all border border-[var(--border)]"
                      >
                        Exam
                      </Link>
                    )}
                  </div>
                </div>

                {/* Expanded skill list for active phase */}
                {isActive && (
                  <details className="border-t border-[var(--border)] group">
                  <summary className="px-5 py-2.5 cursor-pointer list-none text-[12px] font-mono text-c-faint hover:text-c-text bg-c-bg4">
                    <span className="group-open:hidden">Show all {nodes.length} skills ↓</span><span className="hidden group-open:inline">Hide skills ↑</span>
                  </summary>
                  <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                    {nodes.map(node => {
                      const state    = stateMap.get(node.id)
                      const mastery  = state?.mastery_state ?? 'blocked'
                      const pKnow    = state?.p_know ?? 0
                      const masteryTier = mastery === 'blocked' ? 'Locked' : getMasteryTier(pKnow)
                      const colour   = MASTERY_COLOUR[mastery] ?? '#a8a49c'
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
                            <span className="font-mono text-[12px]" style={{ color: colour }}>
                              {masteryTier}
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
                  </details>
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
