-- Explanation grades (Level 10): the learner's own words, and the grade the
-- engine actually consumed for them, for every free-text attempt.
--
-- A side table rather than columns on attempt_events, for three reasons.
-- (1) insertAttempt's unknown-column fallback (src/lib/db/queries.ts) is
--     all-or-nothing: it retries with the 001-only column set, dropping the 002
--     and 003 analytics columns with it. Every optional column added to
--     attempt_events widens that blast radius, so a deployment missing this
--     migration would silently lose existing analytics on every write. A side
--     table cannot do that, and insertAttempt is not touched at all.
-- (2) The readers want a narrow table scanned on grade-specific keys
--     (prompt_version, served_by, created_at) for grade audit and re-scoring,
--     not a wide scan of a table that is overwhelmingly non-explain rows.
-- (3) It is the established shape here — see 004_fsrs_shadow_log.sql and
--     005_dkt_shadow_log.sql.
CREATE TABLE IF NOT EXISTS explanation_grades (
  id                     TEXT PRIMARY KEY,
  learner_id             TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id               TEXT NOT NULL,
  attempt_id             TEXT NOT NULL REFERENCES attempt_events(id) ON DELETE CASCADE,
  explanation_text       TEXT NOT NULL,
  -- The Feynman loop grades the learner's second explanation; the first is kept
  -- beside it because the pair is the evidence of what the dialogue changed.
  prior_explanation_text TEXT,
  category               TEXT NOT NULL,
  -- 0 marks "ungraded by a model": the rule-based fallback answered, so a
  -- re-scoring harness can exclude these rows from model-vs-human comparisons.
  confidence             DOUBLE PRECISION NOT NULL,
  -- A pure function of category today, stored anyway: that mapping is
  -- versionable code, and the row has to record what BKT actually consumed.
  reasoning_quality      DOUBLE PRECISION NOT NULL,
  -- Stored although src/lib/nlp/logger.ts also captures it: that logger is an
  -- in-memory ring plus a best-effort append to a gitignored file that does not
  -- survive serverless, and a grade audit without the rationale is unauditable.
  rationale              TEXT,
  prompt_version         TEXT NOT NULL,
  served_by              TEXT NOT NULL,
  from_cache             BOOLEAN NOT NULL,
  grader_latency_ms      INT NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eg_learner_skill
  ON explanation_grades(learner_id, skill_id, created_at);

CREATE INDEX IF NOT EXISTS idx_eg_audit
  ON explanation_grades(prompt_version, served_by, created_at);
