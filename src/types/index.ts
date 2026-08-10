export type MasteryState = 'blocked' | 'ready' | 'learning' | 'fragile' | 'mastered'
export type DifficultyTier = 'prerequisite' | 'review' | 'same' | 'harder'
export type QuestionFormat = 'mcq' | 'fill' | 'explain' | 'code' | 'order'
export type MotivationStateValue = 'bored' | 'neutral' | 'frustrated' | 'winning'
export type ErrorType = 'careless' | 'conceptual' | 'partial' | null
export type ExplanationDepth = 'beginner' | 'mid' | 'advanced' | 'expert'

export type Phase =
  | 'phase_1_computer_basics'
  | 'phase_2_cs_data'
  | 'phase_3_intro_ai'
  | 'phase_4_machine_learning'
  | 'phase_5_deep_learning'
  | 'phase_6_modern_ai'
  | 'phase_7_real_world'
  | 'phase_8_mastery'

export interface SkillNode {
  id: string; label: string; phase: Phase; difficulty_base: number
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

export type SessionPhase = 'loading' | 'question' | 'revealing' | 'explanation' | 'build_task' | 'explain_back' | 'feynman' | 'summary'
