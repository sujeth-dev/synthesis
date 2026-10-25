-- The Exam Room: one row per run, one row per item served in it (EXAM-2).
--
-- Why it exists: the phase evaluation (/learn/evaluate) is a fixed 36-item walk
-- with no clock, no hints and nothing kept beyond attempt_events. An adaptive
-- exam needs to remember what it served, in what order, at what difficulty, and
-- how the learner got there -- time, hints asked, items marked for review --
-- because the debrief is built from exactly that, by Bloom level.
--
-- Measurement-only by decision: nothing in these tables, and nothing the exam
-- route writes, moves p_know, a review schedule or the motivation state. Final
-- answers also land in attempt_events (session_id null), the precedent
-- /api/phase-evaluation/attempt set, so the record of what a learner answered
-- stays in one place.
CREATE TABLE IF NOT EXISTS exam_runs (
  id           TEXT PRIMARY KEY,
  learner_id   TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  phase        TEXT NOT NULL,
  -- practice: hints on, untimed. checkpoint: no hints, one overall limit.
  mode         TEXT NOT NULL CHECK (mode IN ('practice', 'checkpoint')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  started_at   TIMESTAMPTZ NOT NULL,
  -- Null in practice. A server-side deadline, so a paused tab cannot buy time.
  deadline_at  TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  -- Set when the adaptive rule decides the run has enough; null when the
  -- learner submitted before it did.
  stop_reason  TEXT,
  theta        DOUBLE PRECISION,
  se           DOUBLE PRECISION,
  n_items      INT,
  -- The whole debrief as shown, so a revisited result page reads what the
  -- learner saw rather than recomputing it under a later rule.
  debrief      JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_er_learner_created
  ON exam_runs(learner_id, created_at);

CREATE TABLE IF NOT EXISTS exam_item_events (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL REFERENCES exam_runs(id) ON DELETE CASCADE,
  learner_id         TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  question_id        TEXT NOT NULL,
  skill_id           TEXT NOT NULL,
  bloom_level        TEXT NOT NULL,
  -- 0-based order of service; the adaptive rule reads the latest.
  position           INT NOT NULL,
  -- Item difficulty on the Elo scale at the moment it was served.
  rating             DOUBLE PRECISION NOT NULL,
  time_target_sec    INT NOT NULL,
  served_at          TIMESTAMPTZ NOT NULL,
  -- The final answer: overwritten when a learner revisits an item before
  -- submitting, which the order-independent ability estimate allows.
  selected_option_id TEXT,
  correct            BOOLEAN,
  latency_ms         INT,
  answered_at        TIMESTAMPTZ,
  -- 0, 1 or 2. Always 0 in checkpoint mode.
  hint_level         INT NOT NULL DEFAULT 0,
  last_hint_at       TIMESTAMPTZ,
  -- A hint asked for before the stem could have been read (src/lib/exam/policy.ts).
  hint_abuse         BOOLEAN NOT NULL DEFAULT false,
  marked             BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_eie_run_position
  ON exam_item_events(run_id, position);

-- The behavioural-insights panel reads hint reliance per learner over time.
CREATE INDEX IF NOT EXISTS idx_eie_learner_created
  ON exam_item_events(learner_id, created_at);
