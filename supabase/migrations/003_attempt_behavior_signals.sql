ALTER TABLE attempt_events
  ADD COLUMN IF NOT EXISTS motivation_state TEXT,
  ADD COLUMN IF NOT EXISTS consecutive_errors INT,
  ADD COLUMN IF NOT EXISTS slow_response_streak INT,
  ADD COLUMN IF NOT EXISTS behavior_modifier DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS hesitation_ms INT;

CREATE INDEX IF NOT EXISTS idx_ae_session_behavior
  ON attempt_events(learner_id, session_id, attempted_at);
