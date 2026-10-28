import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/db/auth'
import {
  getLearnerProfile, getAllSkillStates, getRecentSessions, getAttemptsBetween, getExamRuns,
} from '@/lib/db/queries'
import { getAllNodes } from '@/lib/graph'
import { Navbar } from '@/components/layout/Navbar'
import { Meter } from '@/components/viz/Meter'
import { Sparkline } from '@/components/viz/Sparkline'
import { StatCard } from '@/components/viz/StatCard'
import { DayBars } from '@/components/viz/DayBars'
import { LearningCurve } from '@/components/viz/LearningCurve'
import { BloomProfile } from '@/components/viz/BloomProfile'
import { MASTERY_COLOUR } from '@/lib/ui/mastery-colour'
import {
  activityByDay, bloomProfile, isEvaluationAttempt, learningCurve, skillEvidence, type Agreement, type SkillEvidence,
} from '@/lib/analytics/profile'
import type { Debrief } from '@/lib/exam/debrief'
import type { MasteryState } from '@/types'

// The skill profile (OLM-3): an open learner model. For every skill the
// learner has met it shows what the system believes, how much it has actually
// seen, and whether recent answers bear the belief out — beside each other, so
// a confident-looking meter on two attempts reads as what it is.

// Only what is worth saying: a row whose answers agree with the bar says nothing.
const AGREEMENT_TEXT: Record<Agreement, { text: string; tone: string } | null> = {
  agrees:        null,
  belief_ahead:  { text: 'recent answers weaker',   tone: 'text-c-yellow' },
  belief_behind: { text: 'doing better than shown', tone: 'text-c-green' },
  thin:          { text: 'too few answers yet',     tone: 'text-c-ghost' },
}

// The state, not getMasteryTier(p_know): a skill at p_know >= 0.65 reads
// "Mastered" by tier but stays `fragile` until it survives a first review, and
// the profile's job is to show what the model actually holds.
const STATE_LABEL: Record<MasteryState, string> = {
  mastered: 'Mastered', fragile: 'Needs review', learning: 'Learning',
  ready: 'Ready', blocked: 'Locked',
}

const PHASE_SHORT: Record<string, string> = {
  phase_1_computer_basics: 'Phase 1', phase_1b_programming_basics: 'Phase 1B', phase_2_cs_data: 'Phase 2',
  phase_3_intro_ai: 'Phase 3', phase_4_machine_learning: 'Phase 4', phase_5_deep_learning: 'Phase 5',
  phase_6_modern_ai: 'Phase 6', phase_7_real_world: 'Phase 7', phase_8_mastery: 'Phase 8',
}

function Section({ title, note, children, testId }: { title: string; note?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="p-5 rounded-xl border border-[var(--border)] bg-c-bg2 mb-5" data-testid={testId}>
      <p className="font-mono text-[10px] text-c-faint uppercase tracking-[0.14em] mb-1">{title}</p>
      {note && <p className="text-[11px] text-c-ghost mb-4">{note}</p>}
      {children}
    </section>
  )
}

export default async function ProfilePage() {
  const cookieStore = cookies()
  const token = cookieStore.get('synaptic_token')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const profile = await getLearnerProfile(user.id)
  if (!profile) redirect('/login')

  const now = new Date()
  const since = new Date(profile.created_at)
  const [skillStates, sessions, attempts, examRuns] = await Promise.all([
    getAllSkillStates(user.id),
    getRecentSessions(user.id, 10),
    getAttemptsBetween(user.id, since, new Date(now.getTime() + 60_000)),
    getExamRuns(user.id, 30).catch(() => []),
  ])
  const nodes = new Map(getAllNodes().map(n => [n.id, n]))
  const label = (id: string) => nodes.get(id)?.label ?? id

  const practice = attempts.filter(a => !isEvaluationAttempt(a.question_id))
  const mastered = skillStates.filter(s => s.mastery_state === 'mastered').length
  const learning = skillStates.filter(s => ['learning', 'fragile'].includes(s.mastery_state)).length
  const accuracy = practice.length > 0 ? Math.round(practice.filter(a => a.correct).length / practice.length * 100) : null
  const sinceLabel = since.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const all = skillEvidence(skillStates, attempts)
  const evidence = all
    .filter(e => e.attempts > 0)
    .sort((a, b) => (b.last_attempted_at ?? '').localeCompare(a.last_attempted_at ?? '') || b.p_know - a.p_know)
  // Open but never practised: no evidence to show, so one line, not a row each.
  const untouched = all.filter(e => e.attempts === 0 && e.mastery_state !== 'blocked')

  const curve = learningCurve(attempts)
  const activity = activityByDay(practice, now, 30)

  const latestByPhase = new Map<string, { phase: string; debrief: Debrief; at: string; mode: string }>()
  for (const run of examRuns) {
    if (run.status !== 'finished' || !run.debrief || latestByPhase.has(run.phase)) continue
    latestByPhase.set(run.phase, { phase: run.phase, debrief: run.debrief as Debrief, at: run.finished_at ?? run.created_at, mode: run.mode })
  }

  const completedSessions = sessions.filter(s => s.ended_at)

  // Group so what needs attention comes first. Every row stays visible: the
  // grouping orders the evidence, it never hides any.
  const groups: { key: string; title: string; rows: SkillEvidence[] }[] = [
    { key: 'attention', title: 'Needs attention', rows: [] },
    { key: 'learning', title: 'Still learning', rows: [] },
    { key: 'solid', title: 'Solid', rows: [] },
  ]
  for (const e of evidence) {
    const g = attentionReason(e) || e.mastery_state === 'fragile' ? 0 : e.mastery_state === 'mastered' ? 2 : 1
    groups[g].rows.push(e)
  }
  const attentionCount = groups[0].rows.length

  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10">

        <div className="flex items-start gap-5 mb-6 animate-slide-up">
          <div className="w-14 h-14 rounded-2xl bg-c-bg3 border border-[var(--border-hi)] flex items-center justify-center flex-shrink-0">
            <span className="font-serif text-2xl text-c-purple">{(profile.display_name ?? 'L')[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-serif italic text-[30px] text-c-text leading-none mb-2">{profile.display_name ?? 'Learner'}</h1>
            <p className="text-[12px] text-c-faint font-mono truncate">
              {profile.email} · <span className="text-c-yellow">{profile.streak_days} day streak</span>
            </p>
            <p className="text-[13px] text-c-muted mt-2">
              {evidence.length === 0
                ? 'Nothing practised yet.'
                : attentionCount > 0
                  ? <>{evidence.length} skills practised · <span className="text-c-yellow">{attentionCount} need{attentionCount === 1 ? 's' : ''} attention</span></>
                  : <>{evidence.length} skills practised · nothing needs attention</>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard value={mastered} label="Mastered" accent={MASTERY_COLOUR.mastered} testId="stat-mastered" />
          <StatCard value={learning} label="Learning" accent={MASTERY_COLOUR.learning} />
          <StatCard value={practice.length} label="Attempts" note={`since ${sinceLabel}`} testId="stat-attempts" />
          <StatCard value={accuracy === null ? '—' : `${accuracy}%`} label="Accuracy" testId="stat-accuracy" />
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          <Section title="Your skills"
            note="Top bar: how well you know it. Bottom bar: how many answers."
            testId="skill-profile">
            {evidence.length === 0 && <p className="text-[12px] text-c-ghost">Nothing yet — start a session and this fills in.</p>}
            {groups.filter(g => g.rows.length > 0).map(g => (
              <div key={g.key} className="mb-5 last:mb-0" data-testid={`group-${g.key}`}>
                <div className="flex items-baseline gap-2 pb-2 border-b border-[var(--border)]">
                  <p className={`text-[14px] font-semibold ${g.key === 'attention' ? 'text-c-yellow' : 'text-c-text'}`}>{g.title}</p>
                  <span className="font-mono text-[11px] text-c-faint">{g.rows.length}</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {g.rows.map(e => <SkillRow key={e.skill_id} e={e} label={label(e.skill_id)} />)}
                </div>
              </div>
            ))}
            {untouched.length > 0 && (
              <p className="text-[11px] text-c-faint pt-3 border-t border-[var(--border)]" data-testid="untouched-skills">
                Not started yet ({untouched.length}):{' '}
                {untouched.map((e, i) => (
                  <span key={e.skill_id}>
                    {i > 0 && ', '}
                    <Link href={`/learn/skill/${e.skill_id}`} className="text-c-muted hover:underline">{label(e.skill_id)}</Link>
                  </span>
                ))}.
              </p>
            )}
          </Section>

          <div className="lg:sticky lg:top-6 flex flex-col">
            <Section title="Are you improving?"
              note="How often you miss on try 1, 2, 3… Down = improving."
              testId="learning-curve">
              <LearningCurve points={curve} />
            </Section>

            {latestByPhase.size > 0 && (
              <Section title="By question type" note="Latest exam in each phase." testId="bloom-profile">
                <div className="space-y-5">
                  {[...latestByPhase.values()].map(r => (
                    <div key={r.phase}>
                      <p className="text-[12px] text-c-muted mb-2">
                        {PHASE_SHORT[r.phase] ?? r.phase} · {r.mode} · {new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      <BloomProfile levels={bloomProfile(r.debrief)} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Last 30 days" testId="activity">
              <DayBars days={activity} unit="answers" height={48} />
            </Section>
            <Section title="Recent sessions">
              {completedSessions.slice(0, 5).map(s => {
                const acc = s.tasks_count > 0 ? Math.round(s.correct_count / s.tasks_count * 100) : 0
                return (
                  <div key={s.id} className="flex items-center justify-between mb-3 last:mb-0">
                    <div>
                      <p className="text-[12px] text-c-muted">{new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      <p className="font-mono text-[10px] text-c-faint">{s.tasks_count} questions</p>
                    </div>
                    <span className="font-mono text-[12px] text-c-muted">{acc}%</span>
                  </div>
                )
              })}
              {completedSessions.length === 0 && <p className="text-[12px] text-c-ghost">No sessions yet</p>}
            </Section>
          </div>
        </div>

      </div>
    </div>
  )
}

/** Why a skill belongs in "Needs attention", or null. Belief ahead first, as it is the sharpest. */
function attentionReason(e: SkillEvidence): string | null {
  if (e.agreement === 'belief_ahead') return `Only ${e.recent.filter(Boolean).length} of last ${e.recent.length} right`
  if (e.p_know >= 0.7 && e.attempts < 3) return `Only ${e.attempts} answer${e.attempts === 1 ? '' : 's'} so far`
  return null
}

function SkillRow({ e, label }: { e: SkillEvidence; label: string }) {
  const agree = AGREEMENT_TEXT[e.agreement]
  const reason = attentionReason(e)
  const colour = MASTERY_COLOUR[e.mastery_state]
  // Fragile belief is drawn striped: the number is high, but it is not yet earned.
  const fill = e.mastery_state === 'fragile'
    ? `repeating-linear-gradient(135deg, ${colour}cc 0 4px, ${colour}40 4px 8px)`
    : colour
  return (
    <div className="py-3" data-testid={`skill-row-${e.skill_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
        <Link href={`/learn/skill/${e.skill_id}`} className="text-[14px] text-c-text hover:underline truncate">{label}</Link>
        <span className="flex items-center gap-2 flex-shrink-0">
          {reason && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-c-yellow/15 text-c-yellow border border-c-yellow/30">{reason}</span>
          )}
          <span className="font-mono text-[11px]" style={{ color: colour }}>{STATE_LABEL[e.mastery_state]}</span>
        </span>
      </div>
      <div className="grid grid-cols-[56px_1fr_40px] sm:grid-cols-[56px_1fr_40px_104px] items-center gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-mono text-c-faint">known</span>
        <Meter value={e.p_know} colour={fill} title={`Belief ${Math.round(e.p_know * 100)}%`} testId={`belief-${e.skill_id}`} />
        <span className="font-mono text-[11px] text-c-muted text-right">{Math.round(e.p_know * 100)}%</span>
        <div className="hidden sm:block row-span-2">
          <Sparkline values={e.trajectory} title={`Belief after each of ${e.trajectory.length} attempts`} />
        </div>
        <span className="text-[10px] font-mono text-c-faint">answers</span>
        <Meter value={e.evidence_strength} title={`${e.attempts} attempts seen`} testId={`evidence-${e.skill_id}`} />
        <span className="font-mono text-[11px] text-c-muted text-right">{e.attempts}</span>
      </div>
      <p className="text-[11px] text-c-faint mt-1.5">
        {e.correct}/{e.attempts} right
        {e.recent.length > 0 && <> · last {e.recent.length}: <span className="font-mono tracking-wider">{e.recent.map(r => r ? '●' : '○').join('')}</span></>}
        {!reason && agree && <>{' · '}<span className={agree.tone}>{agree.text}</span></>}
        {e.sources.discounted > 0 && (
          <span className="text-c-ghost"> · <span className="underline decoration-dotted cursor-help"
            title="Counts less after 2 misses in a row, or if slower than 15s.">
            {e.sources.discounted} counted less</span>
          </span>
        )}
      </p>
    </div>
  )
}
