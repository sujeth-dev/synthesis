// DKT-12: compare DKT against live BKT on the same attempts, and the DKT-13
// cutover gate built on that comparison. Works on dkt_shadow_log rows (real
// learners) or simulator rows (synthetic) alike.
import { auc, logLoss } from '@/lib/sim/metrics'

export interface ShadowRow { dkt_p_correct: number; bkt_p_correct: number; correct: boolean }

export interface ModelScore { auc: number; logLoss: number }

export interface DktComparison {
  n: number
  dkt: ModelScore
  bkt: ModelScore
}

// Fewer attempts than this and the AUC difference is mostly noise.
export const MIN_ATTEMPTS_FOR_DECISION = 5000
// DKT must beat BKT by at least this much AUC to justify the switch's cost
// (opaque model, harder to explain, new failure modes).
export const MIN_AUC_GAIN = 0.02

export function compareDktVsBkt(rows: ShadowRow[]): DktComparison {
  const score = (pick: (r: ShadowRow) => number): ModelScore => {
    const predictions = rows.map(r => ({ predicted: pick(r), actual: r.correct }))
    return { auc: auc(predictions), logLoss: logLoss(predictions) }
  }
  return { n: rows.length, dkt: score(r => r.dkt_p_correct), bkt: score(r => r.bkt_p_correct) }
}

// ── Growth (Level 12) ───────────────────────────────────────────────────────
// AUC and log-loss are rank and calibration measures over a flat pool of
// predictions: a model can win both by learning only which skills are hard and
// which learners are strong, neither of which is learning. dkt-lab/
// FINDINGS-CURVES.md measured exactly that — on ASSISTments 2009 DKT beats BKT
// by +0.087 AUC while reproducing a cohort-fixed slope ratio of 0.560 against
// BKT's 0.822. Every mastery and scheduling decision downstream of this gate is
// a claim that a learner improved, so the gate has to see growth.
//
// The measurement mirrors dkt-lab/pipeline/curves.py's cohort_curve and
// curve_fidelity, so the lab's numbers and this gate's are comparable.

export interface OpportunityRow extends ShadowRow { learner_id: string; skill_id: string }
export interface IndexedOpportunityRow extends OpportunityRow { opportunity: number }

// The cohort: (learner, skill) pairs seen at least this many times, restricted
// to their first this-many attempts, so every point averages the same pairs.
export const MIN_COHORT_OPPORTUNITIES = 10
// A bucket thinner than this is skipped, not treated as the end of the curve —
// that truncation was one of the defects the lab diagnosed.
export const MIN_COHORT_BUCKET_ROWS = 30
// Below this many pairs the slope is noise, and the gate says so rather than
// passing growth it could not measure.
export const MIN_COHORT_PAIRS = 200
// BKT's own slope ratio spans 0.43 to 0.90 across the lab's three datasets, so
// an absolute floor would be arbitrary; the gate asks only that DKT not be
// materially worse than the model it would replace.
export const MAX_SLOPE_RATIO_LOSS = 0.05

export interface GrowthScore { slope: number; slopeRatio: number }

export interface GrowthComparison {
  pairs: number
  points: number
  actualSlope: number
  dkt: GrowthScore
  bkt: GrowthScore
}

/** 1-based n-th attempt of this learner on this skill, in the order given. */
export function withOpportunityIndex(rows: OpportunityRow[]): IndexedOpportunityRow[] {
  const seen = new Map<string, number>()
  return rows.map(row => {
    const key = `${row.learner_id}\u0000${row.skill_id}`
    const opportunity = (seen.get(key) ?? 0) + 1
    seen.set(key, opportunity)
    return { ...row, opportunity }
  })
}

function weightedSlope(x: number[], y: number[], w: number[]): number {
  if (x.length < 2) return NaN
  const total = w.reduce((a, b) => a + b, 0)
  if (total <= 0) return NaN
  const mean = (v: number[]) => v.reduce((a, b, i) => a + b * w[i], 0) / total
  const xm = mean(x), ym = mean(y)
  const variance = x.reduce((a, xi, i) => a + w[i] * (xi - xm) ** 2, 0) / total
  if (variance <= 0) return NaN
  const covariance = x.reduce((a, xi, i) => a + w[i] * (xi - xm) * (y[i] - ym), 0) / total
  return covariance / variance
}

/**
 * The cohort-fixed learning curve and each model's fidelity to its growth.
 * `slopeRatio` is the model's fitted slope over the observed one: 1.0
 * reproduces the observed growth, 0.0 is a flat line.
 */
export function compareGrowth(rows: OpportunityRow[]): GrowthComparison {
  const indexed = withOpportunityIndex(rows)
  const maxByPair = new Map<string, number>()
  for (const row of indexed) {
    const key = `${row.learner_id}\u0000${row.skill_id}`
    maxByPair.set(key, Math.max(maxByPair.get(key) ?? 0, row.opportunity))
  }
  const pairKeys = new Set<string>()
  const cohort: IndexedOpportunityRow[] = []
  for (const row of indexed) {
    const key = `${row.learner_id}\u0000${row.skill_id}`
    if ((maxByPair.get(key) ?? 0) < MIN_COHORT_OPPORTUNITIES) continue
    if (row.opportunity > MIN_COHORT_OPPORTUNITIES) continue
    pairKeys.add(key)
    cohort.push(row)
  }

  const x: number[] = [], w: number[] = []
  const actual: number[] = [], dkt: number[] = [], bkt: number[] = []
  for (let opportunity = 1; opportunity <= MIN_COHORT_OPPORTUNITIES; opportunity++) {
    const bucket = cohort.filter(row => row.opportunity === opportunity)
    if (bucket.length < MIN_COHORT_BUCKET_ROWS) continue
    const mean = (pick: (row: IndexedOpportunityRow) => number) =>
      bucket.reduce((a, row) => a + pick(row), 0) / bucket.length
    x.push(opportunity)
    w.push(bucket.length)
    actual.push(mean(row => (row.correct ? 1 : 0)))
    dkt.push(mean(row => row.dkt_p_correct))
    bkt.push(mean(row => row.bkt_p_correct))
  }

  const actualSlope = weightedSlope(x, actual, w)
  const score = (y: number[]): GrowthScore => {
    const slope = weightedSlope(x, y, w)
    return { slope, slopeRatio: Number.isFinite(actualSlope) && actualSlope !== 0 ? slope / actualSlope : NaN }
  }
  return { pairs: pairKeys.size, points: x.length, actualSlope, dkt: score(dkt), bkt: score(bkt) }
}

// Every condition's state, not only the one that decided. A gate that stops at
// the first failure hides the rest: on the simulator the verdict reads
// `dkt_not_better` and never mentions that growth fails too, so a reader who
// closed the AUC gap would be surprised by a gap they were never shown. That is
// the same single-scalar mistake FINDINGS-CURVES.md diagnosed, one level up.
export interface CutoverChecks {
  sampleSize: { pass: boolean; n: number; required: number }
  ranking: { pass: boolean; aucGain: number; required: number; logLossOk: boolean }
  growth: { pass: boolean; measured: boolean; dktSlopeRatio: number; bktSlopeRatio: number; maxLoss: number }
}

export type CutoverRefusal = 'insufficient_data' | 'dkt_not_better' | 'growth_unmeasured' | 'dkt_worse_growth'

export type CutoverDecision =
  | { recommend: false; reason: CutoverRefusal; checks: CutoverChecks }
  | { recommend: true; reason: 'dkt_better'; checks: CutoverChecks }

// DKT-13's gate. A `true` here is a recommendation for a human to review —
// it never switches anything by itself. Only real-learner data should ever
// back a live switch; synthetic results are for validating the pipeline.
//
// `growth` is required, not optional: an optional argument would let the gate
// silently degrade to the AUC-only test that FINDINGS-CURVES.md showed would
// approve a regression, and TS strict makes the compiler, not a reviewer, find
// any caller that still tries.
export function cutoverDecision(c: DktComparison, growth: GrowthComparison): CutoverDecision {
  const aucGain = c.dkt.auc - c.bkt.auc
  const logLossOk = c.dkt.logLoss <= c.bkt.logLoss
  const measured = growth.pairs >= MIN_COHORT_PAIRS && growth.points >= 2 &&
    Number.isFinite(growth.dkt.slopeRatio) && Number.isFinite(growth.bkt.slopeRatio)
  const checks: CutoverChecks = {
    sampleSize: { pass: c.n >= MIN_ATTEMPTS_FOR_DECISION, n: c.n, required: MIN_ATTEMPTS_FOR_DECISION },
    ranking: { pass: aucGain >= MIN_AUC_GAIN && logLossOk, aucGain, required: MIN_AUC_GAIN, logLossOk },
    growth: {
      pass: measured && growth.dkt.slopeRatio >= growth.bkt.slopeRatio - MAX_SLOPE_RATIO_LOSS,
      measured, dktSlopeRatio: growth.dkt.slopeRatio, bktSlopeRatio: growth.bkt.slopeRatio,
      maxLoss: MAX_SLOPE_RATIO_LOSS,
    },
  }

  // The refusal precedence is unchanged, so every caller reading `reason` sees
  // what it saw before; `checks` is what makes the conditions it did not reach
  // visible. Growth is still named after ranking because the case the lab warns
  // about is precisely "AUC cleared, growth did not".
  if (!checks.sampleSize.pass) return { recommend: false, reason: 'insufficient_data', checks }
  if (!checks.ranking.pass) return { recommend: false, reason: 'dkt_not_better', checks }
  if (!checks.growth.measured) return { recommend: false, reason: 'growth_unmeasured', checks }
  if (!checks.growth.pass) return { recommend: false, reason: 'dkt_worse_growth', checks }
  return { recommend: true, reason: 'dkt_better', checks }
}
