import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/db/auth'
import {
  getLearnerProfile, getRecentAttempts, getReviewSchedules,
  getExplanationGrades, getBehaviorQualityShadow,
  getFsrsShadowEntries, getDktShadowEntries,
} from '@/lib/db/queries'
import { Navbar } from '@/components/layout/Navbar'
import { activeScheduler } from '@/lib/fsrs/scheduler'
import { isAdaptiveQualityEnabled } from '@/lib/sm2/adaptive'
import { isDktShadowEnabled } from '@/lib/dkt/shadow'
import {
  compareDktVsBkt, compareGrowth, cutoverDecision,
  MIN_ATTEMPTS_FOR_DECISION, MIN_COHORT_PAIRS,
} from '@/lib/dkt/compare'

// Every number on this page is read from the database for the signed-in
// learner — nothing is scripted. (/demo is the opposite: a hardcoded
// walkthrough. The two do not share code.)

const ATTEMPT_ROWS = 25
const SHADOW_ROWS = 200
const RATING_LABEL = ['', 'Again', 'Hard', 'Good', 'Easy']

function ms(value: number | null): string {
  if (value === null) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`
}

function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—'
}

function Section({ title, item, note, children }: {
  title: string; item: string; note?: string; children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="font-serif italic text-[22px] text-c-text">{title}</h2>
        <span className="text-[11px] font-mono text-c-ghost uppercase tracking-wider">{item}</span>
      </div>
      {note && <p className="text-[12px] text-c-faint mb-3 max-w-3xl">{note}</p>}
      {children}
    </section>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-[12px] text-c-ghost font-mono">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] font-mono">
        <thead>
          <tr className="text-c-ghost text-left">
            {head.map(h => <th key={h} className="py-1.5 pr-4 font-normal whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="text-c-muted">
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--border)]">
              {row.map((cell, j) => <td key={j} className="py-1.5 pr-4 whitespace-nowrap">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function EnginePage() {
  const cookieStore = cookies()
  const token = cookieStore.get('synaptic_token')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const [profile, attempts, schedules, grades, behaviorShadow, fsrsShadow, dktShadow] = await Promise.all([
    getLearnerProfile(user.id),
    getRecentAttempts(user.id, SHADOW_ROWS),
    getReviewSchedules(user.id),
    getExplanationGrades(user.id, ATTEMPT_ROWS),
    getBehaviorQualityShadow(user.id, SHADOW_ROWS),
    getFsrsShadowEntries(user.id, SHADOW_ROWS),
    getDktShadowEntries(user.id, SHADOW_ROWS),
  ])

  const scheduler = activeScheduler()
  const shadowByAttempt = new Map(behaviorShadow.map(row => [row.attempt_id, row]))
  const fsrsBySkill = new Map(fsrsShadow.map(row => [row.skill_id, row]))
  const scheduleRows = [...schedules].sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, ATTEMPT_ROWS)

  // The gate's own verdict on this learner's rows — the same function the
  // offline comparison script calls, over however many rows exist so far.
  const comparison = compareDktVsBkt(dktShadow)
  const growth = compareGrowth([...dktShadow].reverse())
  const decision = cutoverDecision(comparison, growth)

  return (
    <div className="min-h-screen bg-c-bg">
      <Navbar />
      <main className="max-w-6xl mx-auto px-8 py-10">
        <h1 className="font-serif italic text-[32px] text-c-text">Engine</h1>
        <p className="text-[13px] text-c-faint mt-2 mb-10 max-w-3xl">
          Every signal the learning engine recorded for {profile?.display_name ?? user.email},
          read straight from the database. Live scheduler: <span className="font-mono">{scheduler.toUpperCase()}</span>.
          Behaviour-aware quality: <span className="font-mono">{isAdaptiveQualityEnabled() ? 'ON' : 'shadow only'}</span>.
          DKT shadow logging: <span className="font-mono">{isDktShadowEnabled() ? 'ON' : 'OFF'}</span>.
        </p>

        <Section
          title="Per-attempt signals"
          item="Items 3 and 6 — behaviour as BKT evidence"
          note="Response time is measured from when the question rendered; hesitation is time to first interaction, and revisions are settled answer changes. Before Level 7 the first was ~0 and the other two were always zero."
        >
          <Table
            head={['When', 'Skill', 'Format', 'Correct', 'Latency', 'Hesitation', 'Revisions', 'Motivation', 'Behaviour mod', 'p_know']}
            empty="No attempts recorded yet."
            rows={attempts.slice(0, ATTEMPT_ROWS).map(a => [
              when(a.attempted_at), a.skill_id, a.question_format, a.correct ? 'yes' : 'no',
              ms(a.latency_ms), ms(a.hesitation_ms), a.revision_count,
              a.motivation_state ?? '—',
              a.behavior_modifier === null ? '—' : a.behavior_modifier.toFixed(2),
              `${pct(a.p_know_before)} → ${pct(a.p_know_after)}`,
            ])}
          />
        </Section>

        <Section
          title="Reasoning"
          item="Items 1 and 2 — free text, graded"
          note="The learner's own words and the grade the engine consumed for them. A 'meaning-included' grade is the correct answer for an explain question, and the same grade sets the BKT reasoning-quality evidence. confidence 0 means no model produced the grade — the rule-based classifier answered."
        >
          <Table
            head={['When', 'Skill', 'Explanation', 'Grade', 'Confidence', 'Reasoning quality', 'Served by', 'Prompt']}
            empty="No graded explanations yet."
            rows={grades.map(g => [
              when(g.created_at), g.skill_id,
              <span key="t" className="whitespace-normal block max-w-md text-c-faint">{g.explanation_text}</span>,
              g.category, g.confidence.toFixed(2), g.reasoning_quality.toFixed(2),
              g.served_by, g.prompt_version,
            ])}
          />
        </Section>

        <Section
          title="Scheduling"
          item="Item 5 — SM-2, FSRS shadow, behaviour-aware shadow"
          note={`SM-2 sets the live interval unless SCHEDULER=fsrs. FSRS is computed on every attempt and logged either way; the behaviour-aware quality (Level 11) is logged beside the live one and applies only under ADAPTIVE_QUALITY=1.`}
        >
          <Table
            head={['Skill', 'Live interval', 'Ease', 'Reps', 'Due', 'FSRS shadow interval', 'FSRS stability']}
            empty="No review schedules yet."
            rows={scheduleRows.map(s => {
              const f = fsrsBySkill.get(s.skill_id)
              return [
                s.skill_id, `${s.interval_days}d`, s.ease_factor.toFixed(2), s.repetitions, when(s.due_at),
                f ? `${f.fsrs_interval_days}d` : '—', f ? f.fsrs_stability.toFixed(2) : '—',
              ]
            })}
          />
          <div className="mt-6">
            <Table
              head={['When', 'Skill', 'Live quality', 'Adaptive quality', 'Live rating', 'Adaptive rating', 'Live interval', 'Adaptive interval', 'Applied']}
              empty="No behaviour-quality shadow rows yet (needs migration 007)."
              rows={behaviorShadow.slice(0, ATTEMPT_ROWS).map(row => [
                when(row.created_at), row.skill_id, row.live_quality, row.adaptive_quality,
                RATING_LABEL[row.live_fsrs_rating] ?? row.live_fsrs_rating,
                RATING_LABEL[row.adaptive_fsrs_rating] ?? row.adaptive_fsrs_rating,
                `${row.live_interval_days}d`, `${row.adaptive_interval_days}d`,
                row.applied ? 'yes' : 'no',
              ])}
            />
          </div>
        </Section>

        <Section
          title="Model comparison"
          item="Item 4 — BKT vs DKT, and the cutover gate"
          note="DKT runs in shadow and never sets a learner's state. The gate below is the same function the offline comparison script calls: ranking, calibration, and — since Level 12 — whether the model reproduces the observed learning growth."
        >
          <Table
            head={['Model', 'AUC', 'Log-loss', 'Cohort slope', 'Slope ratio']}
            empty="No DKT shadow rows yet (needs migration 005 and DKT_SHADOW=1)."
            rows={dktShadow.length === 0 ? [] : [
              ['DKT (shadow)', comparison.dkt.auc.toFixed(4), comparison.dkt.logLoss.toFixed(4),
                growth.dkt.slope.toFixed(5), growth.dkt.slopeRatio.toFixed(4)],
              ['Live BKT', comparison.bkt.auc.toFixed(4), comparison.bkt.logLoss.toFixed(4),
                growth.bkt.slope.toFixed(5), growth.bkt.slopeRatio.toFixed(4)],
            ]}
          />
          <p className="mt-4 text-[12px] font-mono text-c-muted">
            {dktShadow.length} shadow rows (gate needs ≥ {MIN_ATTEMPTS_FOR_DECISION}); {growth.pairs} cohort
            pairs (needs ≥ {MIN_COHORT_PAIRS}).
          </p>
          <p className="mt-1 text-[12px] font-mono text-c-muted">
            Gate verdict: {decision.recommend
              ? 'DKT clears the bar — recommend a human review of switching.'
              : `do not switch (${decision.reason.replace(/_/g, ' ')}).`}
          </p>
          <p className="mt-1 text-[11px] text-c-ghost">
            A recommendation only. Switching an experimental system live needs human sign-off.
          </p>
        </Section>
      </main>
    </div>
  )
}
