-- Per-skill BKT parameters, in shadow (Level 16): for every attempt, the
-- p_know the live global-parameter engine produced beside the one a per-skill
-- EM-fitted parameter set would have produced, with both parameter sets.
--
-- Why it exists: the live engine runs ONE parameter set for all 120 skills,
-- while per-skill EM-fitted BKT scores AUC 0.7345 on the app's own simulated
-- data against the live engine's 0.7168 -- above every DKT variant measured.
-- The strongest knowledge model in this repository is a BKT the app does not
-- run, and these rows are the evidence for whether to change that.
--
-- Observational by default. src/lib/bkt/params.ts applies the fitted set only
-- under BKT_PER_SKILL=1, and refuses outright when the parameter file was
-- fitted on simulator output -- those parameters describe the simulator's
-- hand-written memory model, not learners. Promotion is a live cutover needing
-- human sign-off (DEVELOPMENT_LOOP.md:113).
CREATE TABLE IF NOT EXISTS bkt_param_shadow (
  id                TEXT PRIMARY KEY,
  learner_id        TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id          TEXT NOT NULL,
  attempt_id        TEXT NOT NULL REFERENCES attempt_events(id) ON DELETE CASCADE,
  correct           BOOLEAN NOT NULL,
  p_know_before     REAL NOT NULL,
  -- The live engine's result: what the learner's state actually became.
  live_p_know_after REAL NOT NULL,
  live_p_transit    REAL NOT NULL,
  live_p_slip       REAL NOT NULL,
  live_p_guess      REAL NOT NULL,
  -- The same attempt under the fitted parameters for this skill. Equal to the
  -- live columns when the skill has no fitted parameters.
  fitted_p_know_after REAL NOT NULL,
  fitted_p_transit  REAL NOT NULL,
  fitted_p_slip     REAL NOT NULL,
  fitted_p_guess    REAL NOT NULL,
  has_fitted_params BOOLEAN NOT NULL,
  -- Whether the fitted parameters were the ones the learner's state took.
  applied           BOOLEAN NOT NULL,
  -- Carried per row so a later comparison can exclude rows logged against a
  -- parameter file fitted on simulated learners.
  params_synthetic  BOOLEAN NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bps_learner_skill
  ON bkt_param_shadow(learner_id, skill_id, created_at);
