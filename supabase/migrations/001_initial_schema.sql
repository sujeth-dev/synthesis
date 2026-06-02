-- Synaptic — Supabase Schema (Custom JWT Auth)
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → paste → Run

CREATE TABLE IF NOT EXISTS learner_profiles (
  id               TEXT PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  display_name     TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  diagnostic_done  BOOLEAN DEFAULT false,
  entry_node       TEXT,
  streak_days      INT DEFAULT 0,
  last_session_at  TIMESTAMPTZ,
  graph_version    TEXT DEFAULT '1.0.0'
);

-- Auth sessions for custom JWT tokens
CREATE TABLE IF NOT EXISTS auth_sessions (
  token        TEXT PRIMARY KEY,
  learner_id   TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learner_skill_states (
  learner_id          TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id            TEXT NOT NULL,
  p_know              FLOAT DEFAULT 0.1,
  p_slip              FLOAT DEFAULT 0.1,
  p_guess             FLOAT DEFAULT 0.2,
  p_transit           FLOAT DEFAULT 0.15,
  mastery_state       TEXT DEFAULT 'blocked',
  consecutive_correct INT DEFAULT 0,
  consecutive_wrong   INT DEFAULT 0,
  total_attempts      INT DEFAULT 0,
  last_attempted_at   TIMESTAMPTZ,
  first_seen_at       TIMESTAMPTZ DEFAULT now(),
  graph_stale         BOOLEAN DEFAULT false,
  PRIMARY KEY (learner_id, skill_id)
);

CREATE TABLE IF NOT EXISTS review_schedules (
  learner_id       TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id         TEXT NOT NULL,
  interval_days    INT DEFAULT 1,
  ease_factor      FLOAT DEFAULT 2.5,
  repetitions      INT DEFAULT 0,
  due_at           TIMESTAMPTZ DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (learner_id, skill_id)
);

CREATE TABLE IF NOT EXISTS attempt_events (
  id               TEXT PRIMARY KEY,
  learner_id       TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id         TEXT NOT NULL,
  question_id      TEXT NOT NULL,
  session_id       TEXT,
  correct          BOOLEAN NOT NULL,
  latency_ms       INT,
  revision_count   INT DEFAULT 0,
  error_type       TEXT,
  difficulty_tier  TEXT,
  question_format  TEXT,
  attempted_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  learner_id    TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  tasks_count   INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  abandoned     BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS motivation_states (
  learner_id                  TEXT PRIMARY KEY REFERENCES learner_profiles(id) ON DELETE CASCADE,
  state                       TEXT DEFAULT 'neutral',
  consecutive_errors          INT DEFAULT 0,
  slow_response_streak        INT DEFAULT 0,
  intervention_cooldown_until TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS implementation_intentions (
  learner_id   TEXT PRIMARY KEY REFERENCES learner_profiles(id) ON DELETE CASCADE,
  study_time   TEXT,
  duration_min INT DEFAULT 25,
  days_of_week TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lss_mastery ON learner_skill_states(learner_id, mastery_state);
CREATE INDEX IF NOT EXISTS idx_lss_pknow   ON learner_skill_states(learner_id, p_know);
CREATE INDEX IF NOT EXISTS idx_rs_due      ON review_schedules(learner_id, due_at);
CREATE INDEX IF NOT EXISTS idx_ae_learner  ON attempt_events(learner_id, attempted_at);
CREATE INDEX IF NOT EXISTS idx_as_token    ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_as_expires  ON auth_sessions(expires_at);
