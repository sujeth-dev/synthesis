// ExplanationCategory is owned by the classifier that produces it; this file
// re-uses it rather than restating the union.
import type { ExplanationCategory } from '@/lib/feynman/classifier'

export type MasteryState = 'blocked' | 'ready' | 'learning' | 'fragile' | 'mastered'
export type DifficultyTier = 'prerequisite' | 'review' | 'same' | 'harder'
export type QuestionFormat = 'mcq' | 'fill' | 'explain' | 'code' | 'order'
export type MotivationStateValue = 'bored' | 'neutral' | 'frustrated' | 'winning'
export type ErrorType = 'careless' | 'conceptual' | 'partial' | null
export type ExplanationDepth = 'beginner' | 'mid' | 'advanced' | 'expert'
// Bloom's Taxonomy cognitive level — independent of DifficultyTier (which is
// how hard, not what kind of thinking). See v2/doc/findings/06-content-classification-gaps.md.
export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'

export type Phase =
  | 'phase_1_computer_basics'
  | 'phase_1b_programming_basics'
  | 'phase_2_cs_data'
  | 'phase_3_intro_ai'
  | 'phase_4_machine_learning'
  | 'phase_5_deep_learning'
  | 'phase_6_modern_ai'
  | 'phase_7_real_world'
  | 'phase_8_mastery'

export interface SkillNode {
  id: string; label: string; phase: Phase; difficulty_base: number
  topic: string; topic_order: number
  question_ids: string[]
  explanation_ids: { beginner: string; mid: string; advanced: string; expert?: string }
  tags: string[]; deprecated?: boolean
  intuition: string; analogy: string; why_it_matters: string
}

export interface SkillEdge { from: string; to: string; strength: 'soft' | 'hard' }

export interface Question {
  id: string; skill_id: string; format: QuestionFormat; difficulty_tier: DifficultyTier
  stem?: string; options?: { id: string; text: string }[]; correct_option_id?: string
  prompt?: string; correct_answer?: string; task?: string; keywords?: string[]
  graph_placement_weight?: Record<string, number>; explanation_after?: string
}

// One question in a per-phase Phase Evaluation set (macro/Bloom's-level
// tracking, distinct from per-skill BKT tracking). Always MCQ, always tied
// to one skill_id so it flows through the existing insertAttempt()/BKT path
// unchanged. See MASTER_PLAN.md's BLOOM-2..6.
export interface PhaseEvaluationQuestion {
  id: string; phase: Phase; skill_id: string; bloom_level: BloomLevel
  format: 'mcq'; stem: string
  options: { id: string; text: string }[]; correct_option_id: string
  explanation_after: string
}

export interface BuildTask {
  title: string; context: string; steps: string[]
  expected_output: string; hint?: string; starter_code?: string
}

export interface VisualElement {
  type: 'mental_model' | 'diagram_ref' | 'walkthrough' | 'simulation_prompt'
  description: string; prompt?: string; tool_suggestion?: string
}

export interface Explanation {
  skill_id: string; depth: ExplanationDepth; title: string
  body: string; key_insight: string
  common_mistakes?: string[]; mini_exercise?: string
  real_world_usage?: string; explain_back_prompt?: string
  build_task?: BuildTask; visual_element?: VisualElement
}

export interface LearnerProfile {
  id: string; email: string; display_name: string | null
  created_at: string; diagnostic_done: boolean; entry_node: string | null
  streak_days: number; last_session_at: string | null; graph_version: string
}

export interface LearnerSkillState {
  learner_id: string; skill_id: string; p_know: number
  p_slip: number; p_guess: number; p_transit: number
  mastery_state: MasteryState; consecutive_correct: number; consecutive_wrong: number
  total_attempts: number; last_attempted_at: string | null
  first_seen_at: string; graph_stale: boolean
}

export interface ReviewSchedule {
  learner_id: string; skill_id: string; interval_days: number
  ease_factor: number; repetitions: number; due_at: string; last_reviewed_at: string | null
}

// One row per attempt, logging what FSRS would have scheduled alongside the
// live SM-2 decision — observational only, see MASTER_PLAN.md's FSRS-3.
export interface FsrsShadowLogEntry {
  id: string; learner_id: string; skill_id: string; attempt_id: string
  sm2_interval_days: number; fsrs_interval_days: number
  fsrs_stability: number; fsrs_difficulty: number; fsrs_due_at: string
  created_at: string
}

// One row per attempt, logging DKT's prediction alongside live BKT's —
// observational only, see MASTER_PLAN.md's DKT-11.
export interface DktShadowLogEntry {
  id: string; learner_id: string; skill_id: string; attempt_id: string
  dkt_p_correct: number; bkt_p_correct: number; correct: boolean
  history_length: number; model_synthetic: boolean
  created_at: string
}

// One row per attempt (Level 11): the live scheduling quality beside the
// behaviour-aware one, with the signals that produced both. Observational
// unless ADAPTIVE_QUALITY=1 — see src/lib/sm2/adaptive.ts.
export interface BehaviorQualityShadowEntry {
  id: string; learner_id: string; skill_id: string; attempt_id: string
  correct: boolean; latency_ms: number; hesitation_ms: number
  revision_count: number; guided_reflection: boolean
  live_quality: number; adaptive_quality: number
  live_fsrs_rating: number; adaptive_fsrs_rating: number
  live_interval_days: number; adaptive_interval_days: number
  applied: boolean
  created_at: string
}

// One row per served task (SCORE-3): what the rule cascade chose beside what
// the multi-metric score would have chosen, for the same pool. `applied` stays
// false until LIVE-1. See src/lib/session/shadow.ts.
export interface SelectionShadowEntry {
  id: string; learner_id: string; session_id: string | null
  branch: string
  rule_skill_id: string | null; rule_reason: string | null; rule_tier: string | null
  score_skill_id: string | null; score_value: number | null; score_reason: string | null
  /** What the score made of the cascade's own pick — the readable half of a disagreement. */
  rule_score_value: number | null
  tied: boolean
  agreed: boolean; explored: boolean; candidate_count: number
  terms: unknown; runners_up: unknown
  applied: boolean
  created_at: string
}

// One row per question (SCORE-1): the difficulty every learner's answers imply,
// which no authored field measures. Global on purpose — pooling the answers is
// what makes it converge. See src/lib/elo.
export interface QuestionRating {
  question_id: string; skill_id: string; phase: Phase
  rating: number; plays: number
  updated_at: string
}

// One row per learner per phase (SCORE-1): ability on the same scale as the
// question ratings, so expected success is a subtraction.
export interface LearnerAbility {
  learner_id: string; phase: Phase
  rating: number; plays: number
  updated_at: string
}

// One row per attempt (Level 16): the p_know the live global-parameter BKT
// produced beside the one a per-skill fitted parameter set would have, with
// both parameter sets, so the two can be compared on real outcomes.
export interface BktParamShadowEntry {
  id: string; learner_id: string; skill_id: string; attempt_id: string
  correct: boolean; p_know_before: number
  live_p_know_after: number; live_p_transit: number; live_p_slip: number; live_p_guess: number
  fitted_p_know_after: number; fitted_p_transit: number; fitted_p_slip: number; fitted_p_guess: number
  has_fitted_params: boolean; applied: boolean; params_synthetic: boolean
  created_at: string
}

// One row per free-text attempt (Level 10): the learner's explanation and the
// grade the engine consumed for it, with the provenance a grade audit needs.
export interface ExplanationGrade {
  id: string; learner_id: string; skill_id: string; attempt_id: string
  explanation_text: string; prior_explanation_text: string | null
  category: ExplanationCategory; confidence: number; reasoning_quality: number
  rationale: string | null; prompt_version: string; served_by: string
  from_cache: boolean; grader_latency_ms: number
  created_at: string
}

export interface AttemptEvent {
  id: string; learner_id: string; skill_id: string; question_id: string
  session_id: string | null; correct: boolean; latency_ms: number
  revision_count: number; error_type: ErrorType; difficulty_tier: DifficultyTier
  question_format: QuestionFormat; attempted_at: string
  p_know_before: number | null; p_know_after: number | null
  motivation_state: MotivationStateValue | null; consecutive_errors: number | null
  slow_response_streak: number | null; behavior_modifier: number | null
  hesitation_ms: number | null
}

export interface Session {
  id: string; learner_id: string; started_at: string; ended_at: string | null
  tasks_count: number; correct_count: number; abandoned: boolean
}

export interface MotivationState {
  learner_id: string; state: MotivationStateValue
  consecutive_errors: number; slow_response_streak: number
  intervention_cooldown_until: string | null; updated_at: string
}

export type ReviewUrgency = 'overdue' | 'due_today' | 'due_soon' | 'upcoming'

export type TaskReason =
  | 'active_phase_new'          // new/weak skill in the active phase
  | 'active_phase_review'       // SM-2 review for an active-phase skill
  | 'past_phase_review_urgent'  // ≥2 days overdue from a completed phase
  | 'past_phase_review'         // non-urgent review from a completed phase
  | 'confidence_boost'          // frustrated → easy win
  | 'varied_practice'           // fallback interleaving

export type SessionMode = 'learn' | 'review'

export type GuidedArcStage = 'beginner' | 'intermediate' | 'mastery'

export interface GuidedArcProgress {
  stage: GuidedArcStage
  stage_attempt_count: number
  stage_correct_streak: number
  completed_stage_count: number
  core_complete: boolean
  total_attempt_count: number
}

export interface SessionTask {
  skill_id: string; skill_label: string; skill_intuition: string; skill_analogy: string
  question: Question; difficulty_tier: DifficultyTier; source: 'review' | 'learning' | 'diagnostic'
  reason: TaskReason
  p_know: number                // current mastery probability used for selection and tier display
  phase_context?: 'active_phase' | 'past_phase'
  review_urgency?: ReviewUrgency
  days_until_due?: number       // negative = overdue, positive = future
  review_repetition?: number    // SM-2 rep count for display
}

export interface SessionSummary {
  session_id: string; tasks_completed: number; correct_count: number
  accuracy: number; skills_practiced: string[]; streak_days: number
}

export type SessionPhase = 'loading' | 'lesson' | 'question' | 'revealing' | 'explanation' | 'build_task' | 'explain_back' | 'feynman' | 'summary'
