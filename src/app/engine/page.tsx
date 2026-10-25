import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/db/auth'
import {
  getLearnerProfile, getRecentAttempts, getReviewSchedules,
  getExplanationGrades, getBehaviorQualityShadow,
  getFsrsShadowEntries, getDktShadowEntries, getBktParamShadow,
  getSelectionShadow,
} from '@/lib/db/queries'
import { fittedParamsProvenance, isPerSkillBktEnabled } from '@/lib/bkt/params'
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

// `terms` and `runners_up` are JSONB, so they arrive as `unknown`. Reading them
// defensively keeps a malformed or older row from taking the whole page down.
type ShadowTerm = { name: string; raw: number; weight: number; contribution: number }

function readTerms(value: unknown): ShadowTerm[] {
  if (!Array.isArray(value)) return []
  return value.filter((t): t is ShadowTerm =>
    typeof t === 'object' && t !== null && 'name' in t && 'contribution' in t)
}

function readRunnersUp(value: unknown): { skill_id: string; score: number }[] {
  if (!Array.isArray(value)) return []
  return value.filter((r): r is { skill_id: string; score: number } =>
    typeof r === 'object' && r !== null && 'skill_id' in r && 'score' in r)
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

  const [profile, attempts, schedules, grades, behaviorShadow, fsrsShadow, dktShadow, paramShadow, selectionShadow] = await Promise.all([
    getLearnerProfile(user.id),
    getRecentAttempts(user.id, SHADOW_ROWS),
    getReviewSchedules(user.id),
    getExplanationGrades(user.id, ATTEMPT_ROWS),
    getBehaviorQualityShadow(user.id, SHADOW_ROWS),
    getFsrsShadowEntries(user.id, SHADOW_ROWS),
    getDktShadowEntries(user.id, SHADOW_ROWS),
    getBktParamShadow(user.id, SHADOW_ROWS),
    getSelectionShadow(user.id, SHADOW_ROWS),
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

  // A row only means something when both selectors chose from a real pool; a
  // pinned arc offers one candidate, so `agreed` there says nothing.
  const decisions = selectionShadow.filter(
    row => row.rule_skill_id && row.score_skill_id && row.candidate_count >= 2)
  const agreedRows = decisions.filter(row => row.agreed).length
  const tiedRows = decisions.filter(row => !row.agreed && row.tied).length
  const disagreedRows = decisions.length - agreedRows - tiedRows
  // The most recent real difference of opinion is the one worth unpacking.
  const spotlight = decisions.find(row => !row.agreed && !row.tied) ?? decisions[0] ?? null
  const spotlightTerms = readTerms(spotlight?.terms)
  const spotlightRunnersUp = readRunnersUp(spotlight?.runners_up)

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
          title="BKT parameters"
          item="Item 3 — one global parameter set, or one per skill"
          note="The live engine uses a single parameter set for all 120 skills. Each row is the same attempt scored again under this skill's EM-fitted parameters; the learner's state follows the live column. Fitted parameters are never applied while they come from simulated learners, whatever BKT_PER_SKILL says."
        >
          <Table
            head={['Skill', 'Correct', 'p_know before', 'Live after', 'Fitted after', 'Fitted params?']}
            empty="No parameter shadow rows yet (needs migration 008)."
            rows={paramShadow.map(row => [
              row.skill_id, row.correct ? 'yes' : 'no', row.p_know_before.toFixed(4),
              row.live_p_know_after.toFixed(4), row.fitted_p_know_after.toFixed(4),
              row.has_fitted_params ? 'yes' : 'global set',
            ])}
          />
          <p className="mt-4 text-[12px] font-mono text-c-muted">
            Parameters fitted from {fittedParamsProvenance().source} ({fittedParamsProvenance().rows} rows,
            {' '}{fittedParamsProvenance().synthetic ? 'synthetic' : 'real learners'}); applied:
            {' '}{isPerSkillBktEnabled() ? 'yes' : 'no'}.
          </p>
          <p className="mt-1 text-[11px] text-c-ghost">
            Offline comparison on simulated learners: <code>npm run bkt:compare</code>.
          </p>
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
          <div className="mt-4">
            <Table
              head={['Condition', 'Pass', 'Measured against the bar']}
              empty="No DKT shadow rows yet."
              rows={dktShadow.length === 0 ? [] : [
                ['Sample size', decision.checks.sampleSize.pass ? 'yes' : 'NO',
                  `${decision.checks.sampleSize.n} attempts, needs ${decision.checks.sampleSize.required}`],
                ['Ranking', decision.checks.ranking.pass ? 'yes' : 'NO',
                  `AUC gain ${decision.checks.ranking.aucGain.toFixed(4)}, needs ${decision.checks.ranking.required}; log-loss ${decision.checks.ranking.logLossOk ? 'no worse' : 'worse'}`],
                ['Growth', decision.checks.growth.pass ? 'yes' : 'NO',
                  decision.checks.growth.measured
                    ? `slope ratio ${decision.checks.growth.dktSlopeRatio.toFixed(4)} vs BKT ${decision.checks.growth.bktSlopeRatio.toFixed(4)}, may lose at most ${decision.checks.growth.maxLoss}`
                    : 'not measurable on these rows'],
              ]}
            />
          </div>
          <p className="mt-1 text-[11px] text-c-ghost">
            A recommendation only. Switching an experimental system live needs human sign-off.
          </p>
        </Section>

        <Section
          title="Selection"
          item="Item 8 — the rule cascade vs the weighted score"
          note="Which skill to serve next. The rule cascade decides and is what you were actually given; the weighted score is computed beside it and logged, never applied. A row is only written when the cascade had at least two candidates — a pinned guided arc has exactly one by construction, so most tasks in a normal session write nothing here."
        >
          <Table
            head={['When', 'Branch', 'Candidates', 'Served (rules)', 'Score of it', 'Score would serve', 'Its score', 'Verdict']}
            empty="No selection shadow rows yet (needs migration 010, and a session with a real choice)."
            rows={decisions.slice(0, ATTEMPT_ROWS).map(row => [
              when(row.created_at), row.branch, row.candidate_count,
              row.rule_skill_id, row.rule_score_value === null ? '—' : row.rule_score_value.toFixed(4),
              row.score_skill_id, row.score_value === null ? '—' : row.score_value.toFixed(4),
              row.agreed ? 'same pick' : row.tied ? 'tie' : 'disagreed',
            ])}
          />
          {decisions.length > 0 && (
            <p className="mt-4 text-[12px] font-mono text-c-muted">
              {decisions.length} decisions with a real choice: {agreedRows} same pick, {tiedRows} tied,
              {' '}{disagreedRows} disagreed
              {decisions.length > tiedRows &&
                ` (${((agreedRows / (decisions.length - tiedRows)) * 100).toFixed(1)}% agreement excluding ties)`}.
            </p>
          )}
          {spotlight && (
            <div className="mt-6">
              <p className="text-[12px] text-c-faint mb-3 max-w-3xl">
                The most recent decision where the two differed, unpacked. The score reached its number
                by summing these five weighted terms — this is the &ldquo;what it almost picked instead&rdquo; view.
              </p>
              <Table
                head={['Term', 'Reading', 'Weight', 'Contribution']}
                empty="No term breakdown on this row."
                rows={spotlightTerms.map(t => [
                  t.name, `${(t.raw * 100).toFixed(0)}%`, t.weight.toFixed(2), t.contribution.toFixed(4),
                ])}
              />
              <div className="mt-6">
                <Table
                  head={['Runner-up the score ranked below its pick', 'Score']}
                  empty="No runners-up logged on this row."
                  rows={spotlightRunnersUp.map(r => [r.skill_id, r.score.toFixed(4)])}
                />
              </div>
              <p className="mt-4 text-[12px] text-c-muted max-w-3xl">
                <span className="font-mono text-c-ghost">rules: </span>{spotlight.rule_reason ?? '—'}
              </p>
              <p className="mt-1 text-[12px] text-c-muted max-w-3xl">
                <span className="font-mono text-c-ghost">score: </span>{spotlight.score_reason ?? '—'}
              </p>
            </div>
          )}
          <p className="mt-4 text-[11px] text-c-ghost">
            Broad comparison over simulated learners: <code>npm run selector:compare</code>, rendered on the
            lab site&rsquo;s Selection tab. Measured there, the score forgets less and carries less review debt
            than the cascade, and covers fewer new skills — a trade-off needing human sign-off, not a win.
          </p>
        </Section>
      </main>
    </div>
  )
}
