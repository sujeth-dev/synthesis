import { loadDktModel, predictNext, type DktInteraction, type DktModel, type DktWeightsFile } from './index'

// DKT shadow mode is opt-in per deployment: it needs migration 005 applied
// and a model file, and the bundled model is trained on simulated learners.
export function isDktShadowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DKT_SHADOW === '1'
}

// Longest history fed to the LSTM per attempt. Bounds per-request cost
// (each step is one 4H×H product); older evidence matters little to DKT.
export const DKT_HISTORY_LIMIT = 500

let modelPromise: Promise<DktModel> | null = null

export function getBundledDktModel(): Promise<DktModel> {
  modelPromise ??= import('./model/synaptic-dkt.json').then(m => loadDktModel(m.default as DktWeightsFile))
  return modelPromise
}

export interface DktShadowPrediction {
  dkt_p_correct: number
  history_length: number
  model_synthetic: boolean
}

// DKT's P(correct) on `skillId` given everything *before* this attempt —
// the same next-step quantity BKT's p_know × (1 − slip) + (1 − p_know) × guess
// estimates, so the two can be compared on real outcomes.
export function predictForAttempt(model: DktModel, history: DktInteraction[], skillId: string): DktShadowPrediction | null {
  if (!model.skillIndex.has(skillId)) return null
  const p = predictNext(model, history.slice(-DKT_HISTORY_LIMIT)).get(skillId)!
  return { dkt_p_correct: p, history_length: Math.min(history.length, DKT_HISTORY_LIMIT), model_synthetic: model.synthetic }
}
