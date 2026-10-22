// BKT-14: per-skill BKT parameters, in shadow.
//
// The live engine runs one global parameter set for all 120 skills
// (BKT_DEFAULTS). Every BKT this repository's research reports is per-skill
// EM-fitted, and on the app's own simulated data that model scores AUC 0.7345
// against the live engine's 0.7168 -- above every DKT variant measured
// (Research/dkt/results/synaptic_dkt_results.md). So the strongest knowledge
// model here is a BKT the app does not run.
//
// Parameters are fitted offline by Research/dkt/fit_bkt_params.py and applied
// only under BKT_PER_SKILL=1, which is a live cutover needing human sign-off
// per DEVELOPMENT_LOOP.md:113. Until then both estimates are computed and
// logged and only the live one reaches the learner.
import fitted from './fitted-params.json'
import { BKT_DEFAULTS } from './index'

export interface BktSkillParams {
  p_init: number
  p_transit: number
  p_slip: number
  p_guess: number
}

export interface FittedParamsProvenance {
  source: string
  rows: number
  learners: number
  synthetic: boolean
  min_sequences: number
  fitted_at: string
}

interface FittedParamsFile {
  format: string
  fitted_from: FittedParamsProvenance
  skills: Record<string, BktSkillParams & { n_sequences: number }>
}

const file = fitted as FittedParamsFile

export const LIVE_PARAMS: BktSkillParams = {
  p_init: BKT_DEFAULTS.p_know,
  p_transit: BKT_DEFAULTS.p_transit,
  p_slip: BKT_DEFAULTS.p_slip,
  p_guess: BKT_DEFAULTS.p_guess,
}

export function fittedParamsProvenance(): FittedParamsProvenance {
  return file.fitted_from
}

/** The fitted parameters for a skill, or the global set when it has none. */
export function paramsFor(skillId: string): BktSkillParams {
  const skill = file.skills[skillId]
  if (!skill) return LIVE_PARAMS
  return { p_init: skill.p_init, p_transit: skill.p_transit, p_slip: skill.p_slip, p_guess: skill.p_guess }
}

export function hasFittedParams(skillId: string): boolean {
  return skillId in file.skills
}

/** The skills the fit covered. A skill absent here keeps the global set. */
export function fittedSkillIds(): string[] {
  return Object.keys(file.skills)
}

/**
 * Whether the fitted parameters may set live state.
 *
 * Two conditions, and the second is the point: a parameter set fitted on
 * simulator output describes `src/lib/sim/learner.ts`'s hand-written memory
 * model, not learners, so applying it live would be dressing a synthetic
 * assumption as a measurement. Such a file is logged for comparison and never
 * applied, whatever the flag says. Applying per-skill parameters needs a file
 * fitted from real attempt_events rows.
 */
export function isPerSkillBktEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BKT_PER_SKILL === '1' && !file.fitted_from.synthetic
}
