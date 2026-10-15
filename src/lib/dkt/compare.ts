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

export type CutoverDecision =
  | { recommend: false; reason: 'insufficient_data' | 'dkt_not_better' }
  | { recommend: true; reason: 'dkt_better' }

// DKT-13's gate. A `true` here is a recommendation for a human to review —
// it never switches anything by itself. Only real-learner data should ever
// back a live switch; synthetic results are for validating the pipeline.
export function cutoverDecision(c: DktComparison): CutoverDecision {
  if (c.n < MIN_ATTEMPTS_FOR_DECISION) return { recommend: false, reason: 'insufficient_data' }
  if (!(c.dkt.auc - c.bkt.auc >= MIN_AUC_GAIN && c.dkt.logLoss <= c.bkt.logLoss)) {
    return { recommend: false, reason: 'dkt_not_better' }
  }
  return { recommend: true, reason: 'dkt_better' }
}
