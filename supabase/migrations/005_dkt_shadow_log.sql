-- DKT shadow-mode log (DKT-11): records DKT's predicted P(correct) for a
-- learner's next attempt alongside the live BKT estimate and the actual
-- outcome. Never read by the learning engine — BKT stays live. The rows are
-- the evidence DKT-12 needs (DKT vs BKT against real outcomes).
CREATE TABLE IF NOT EXISTS dkt_shadow_log (
  id                  TEXT PRIMARY KEY,
  learner_id          TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id            TEXT NOT NULL,
  attempt_id          TEXT NOT NULL REFERENCES attempt_events(id) ON DELETE CASCADE,
  dkt_p_correct       DOUBLE PRECISION NOT NULL,
  bkt_p_correct       DOUBLE PRECISION NOT NULL,
  correct             BOOLEAN NOT NULL,
  history_length      INT NOT NULL,
  model_synthetic     BOOLEAN NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsl_learner_skill
  ON dkt_shadow_log(learner_id, skill_id, created_at);
