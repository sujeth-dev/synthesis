-- FSRS shadow-mode log (FSRS-3): records what FSRS would have scheduled
-- alongside every SM-2 review, without SM-2/review_schedules being read
-- from or written to any differently. Purely observational.
CREATE TABLE IF NOT EXISTS fsrs_shadow_log (
  id                  TEXT PRIMARY KEY,
  learner_id          TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id            TEXT NOT NULL,
  attempt_id          TEXT NOT NULL REFERENCES attempt_events(id) ON DELETE CASCADE,
  sm2_interval_days   INT NOT NULL,
  fsrs_interval_days  INT NOT NULL,
  fsrs_stability      DOUBLE PRECISION NOT NULL,
  fsrs_difficulty     DOUBLE PRECISION NOT NULL,
  fsrs_due_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fsl_learner_skill
  ON fsrs_shadow_log(learner_id, skill_id, created_at);
