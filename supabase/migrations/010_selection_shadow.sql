-- The task the rule cascade chose, beside the one the multi-metric score would
-- have chosen, for the same pool on the same inputs (SCORE-3).
--
-- Why it exists: src/lib/session/engine.ts selects lexicographically -- first
-- non-empty tier, then one tiebreak key -- so it can never trade one signal
-- against another. src/lib/session/score.ts can, but a selector is not a thing
-- to swap on an argument: this table is the evidence for whether it actually
-- chooses better, gathered while the cascade keeps deciding.
--
-- Observational by construction. `applied` is false on every row until LIVE-1,
-- which is a live cutover needing human sign-off (DEVELOPMENT_LOOP.md:113).
-- Written fail-open from /api/session, so a missing migration costs the
-- comparison row and never the learner's next task.
CREATE TABLE IF NOT EXISTS selection_shadow (
  id             TEXT PRIMARY KEY,
  learner_id     TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  session_id     TEXT,
  -- Which arm of the cascade fired: review_mode, pinned_arc, confidence_boost,
  -- tiers or none. The first thing worth knowing when a pick looks wrong.
  branch         TEXT NOT NULL,

  -- What the live cascade chose, and what it served.
  rule_skill_id  TEXT,
  rule_reason    TEXT,
  rule_tier      TEXT,

  -- What the score would have chosen on the same pool.
  score_skill_id TEXT,
  score_value    DOUBLE PRECISION,
  -- The sentence the score produced for its pick: Engine 6's non-optional
  -- `reason` (Research/lab/02-engines.md:334), stored so a disagreement can be
  -- read rather than only counted.
  score_reason   TEXT,

  -- What the score made of the cascade's pick. Without this a disagreement is
  -- unreadable: on a pool of fresh skills every candidate scores identically,
  -- so `agreed` goes false purely because two tie-breaks differ. Comparing the
  -- two values says whether the score actually preferred something else.
  rule_score_value DOUBLE PRECISION,
  -- True when those two values are within SCORE_TIE_EPSILON, i.e. the score
  -- expressed no preference and any agreement statistic should exclude the row.
  tied           BOOLEAN NOT NULL DEFAULT false,

  -- Denormalised so the headline comparison is a scan, not a self-join.
  agreed         BOOLEAN NOT NULL,
  -- True when the score took a runner-up on purpose, so exploration picks can
  -- be excluded from any agreement statistic.
  explored       BOOLEAN NOT NULL,
  candidate_count INT NOT NULL,

  -- Six weighted terms, and up to five runners-up with their scores. JSONB
  -- rather than ~40 columns: the shape is a breakdown for display and offline
  -- analysis, never a filter, and the term list will change as the score is
  -- refitted.
  terms          JSONB,
  runners_up     JSONB,

  applied        BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Idempotent, for a database that already has the table from this migration's
-- first form. Both columns are in the CREATE above for a fresh install.
ALTER TABLE selection_shadow ADD COLUMN IF NOT EXISTS rule_score_value DOUBLE PRECISION;
ALTER TABLE selection_shadow ADD COLUMN IF NOT EXISTS tied BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ss_learner_created
  ON selection_shadow(learner_id, created_at);

-- Agreement rate over a window is the one query SCORE-4 runs most.
CREATE INDEX IF NOT EXISTS idx_ss_agreement
  ON selection_shadow(agreed, explored, tied, created_at);
