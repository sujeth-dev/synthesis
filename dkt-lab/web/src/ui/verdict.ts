import type { Metrics } from '../data'
import { f3, signed } from './format'

// One-line verdict, chosen from the numbers (thresholds stated in the text).
export function verdict(m: Metrics): string {
  const d = m.dkt.auc - m.bkt.auc
  const ll = m.dkt.log_loss - m.bkt.log_loss
  if (Math.abs(d) < 0.005) return `A tie: DKT and BKT reach the same AUC (${f3(m.dkt.auc)} vs ${f3(m.bkt.auc)}, difference ${signed(d)}).`
  const winner = d > 0 ? 'DKT' : 'BKT'
  const llNote = (d > 0) === (ll < 0) ? `and has the lower log-loss (${signed(ll)} for DKT)` : `but the log-loss points the other way (${signed(ll)} for DKT)`
  return `${winner} predicts the next answer better on held-out students: AUC ${f3(Math.max(m.dkt.auc, m.bkt.auc))} vs ${f3(Math.min(m.dkt.auc, m.bkt.auc))} (${signed(d)} for DKT), ${llNote}.`
}
