-- Elo ratings for questions and learners (SCORE-1).
--
-- Why it exists: until now nothing in this repository knew how hard any
-- individual question is. `difficulty_tier` is an author's label and
-- `difficulty_base` is an author's estimate of the whole concept -- neither is
-- measured, and neither can answer "which question gives this learner a 75%
-- chance of being right", which is what the multi-metric scorer's
-- difficulty-match term and the exam's item choice both need.
--
-- Elo calibrates persons and items from the same stream of answers with no
-- separate calibration run (Klinkenberg, Straatemeier & van der Maas 2011,
-- Computers & Education 57:1813-1824, who sample items at a ~.75 success rate).
--
-- Observational for now: src/lib/elo is read by the shadow scorer only, and
-- nothing here changes what a learner is served. Written fail-open from
-- /api/attempt like the five existing shadow logs, so a missing migration
-- costs the rating and never the attempt.

-- Global, deliberately not per learner: a question's difficulty is a property of
-- the question, and pooling every learner's answers is what makes it converge.
CREATE TABLE IF NOT EXISTS question_ratings (
  question_id TEXT PRIMARY KEY,
  skill_id    TEXT NOT NULL,
  phase       TEXT NOT NULL,
  rating      DOUBLE PRECISION NOT NULL,
  -- Drives the K factor: a question answered many times stops moving.
  plays       INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Ordered by rating so "the item nearest this ability in this phase" is an
-- index scan rather than a sort over the whole bank.
CREATE INDEX IF NOT EXISTS idx_qr_phase_rating
  ON question_ratings(phase, rating);

-- Per phase, not one global number: ability in Phase 1 computer basics says
-- little about ability in Phase 6 transformers, and the nine phases are the
-- coarsest split that keeps the estimate meaningful.
CREATE TABLE IF NOT EXISTS learner_ability (
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  phase      TEXT NOT NULL,
  rating     DOUBLE PRECISION NOT NULL,
  plays      INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (learner_id, phase)
);
