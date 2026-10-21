-- Behaviour-aware scheduling quality, in shadow (Level 11): for every attempt,
-- the quality and FSRS rating the live schedulers used beside the ones a
-- behaviour-aware rule would have used, with the signals that produced them.
--
-- Observational by default. src/lib/sm2/adaptive.ts applies the adaptive tier
-- only under ADAPTIVE_QUALITY=1, and promoting it is a live cutover needing
-- human sign-off (DEVELOPMENT_LOOP.md:113) with these rows as the evidence.
-- Hesitation and revision counts have no analogue in the simulator's
-- ground-truth learner model, so no offline run can justify the promotion.
CREATE TABLE IF NOT EXISTS behavior_quality_shadow (
  id                     TEXT PRIMARY KEY,
  learner_id             TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill_id               TEXT NOT NULL,
  attempt_id             TEXT NOT NULL REFERENCES attempt_events(id) ON DELETE CASCADE,
  correct                BOOLEAN NOT NULL,
  latency_ms             INT NOT NULL,
  hesitation_ms          INT NOT NULL,
  revision_count         INT NOT NULL,
  guided_reflection      BOOLEAN NOT NULL,
  live_quality           INT NOT NULL,
  adaptive_quality       INT NOT NULL,
  live_fsrs_rating       INT NOT NULL,
  adaptive_fsrs_rating   INT NOT NULL,
  -- The SM-2 interval each quality would have produced from the same schedule,
  -- so the log shows the scheduling consequence and not only the tier.
  live_interval_days     INT NOT NULL,
  adaptive_interval_days INT NOT NULL,
  applied                BOOLEAN NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bqs_learner_skill
  ON behavior_quality_shadow(learner_id, skill_id, created_at);
