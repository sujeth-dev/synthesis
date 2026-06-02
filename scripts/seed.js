'use strict'
const { createClient } = require('@supabase/supabase-js')
const bcrypt           = require('bcryptjs')
const fs               = require('fs')
const path             = require('path')

// ── Load .env.local ─────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── Helpers ─────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Question IDs (from content/graph/nodes.json) ────────────

const QUESTION_IDS = {
  p1_what_is_computer:  ['p1_comp_q1','p1_comp_q2','p1_comp_q3','p1_comp_q4','p1_comp_q5'],
  p1_input_output:      ['p1_io_q1','p1_io_q2','p1_io_q3','p1_io_q4','p1_io_q5'],
  p1_binary_numbers:    ['p1_bin_q1','p1_bin_q2','p1_bin_q3','p1_bin_q4','p1_bin_q5'],
  p1_memory_storage:    ['p1_mem_q1','p1_mem_q2','p1_mem_q3','p1_mem_q4','p1_mem_q5'],
  p1_cpu_processing:    ['p1_cpu_q1','p1_cpu_q2','p1_cpu_q3','p1_cpu_q4','p1_cpu_q5'],
  p1_how_code_works:    ['p1_code_q1','p1_code_q2','p1_code_q3','p1_code_q4','p1_code_q5'],
  p1_python_intro:      ['p1_py_q1','p1_py_q2','p1_py_q3','p1_py_q4','p1_py_q5'],
  p1_variables:         ['p1_var_q1','p1_var_q2','p1_var_q3','p1_var_q4','p1_var_q5'],
  p1_data_types:        ['p1_dt_q1','p1_dt_q2','p1_dt_q3','p1_dt_q4','p1_dt_q5'],
  p1_operators:         ['p1_op_q1','p1_op_q2','p1_op_q3','p1_op_q4','p1_op_q5'],
  p1_strings:           ['p1_str_q1','p1_str_q2','p1_str_q3','p1_str_q4','p1_str_q5'],
  p1_conditionals:      ['p1_cond_q1','p1_cond_q2','p1_cond_q3','p1_cond_q4','p1_cond_q5'],
  p1_loops:             ['p1_loop_q1','p1_loop_q2','p1_loop_q3','p1_loop_q4','p1_loop_q5'],
  p1_lists_intro:       ['p1_li_q1','p1_li_q2','p1_li_q3','p1_li_q4','p1_li_q5'],
  p1_functions:         ['p1_fn_q1','p1_fn_q2','p1_fn_q3','p1_fn_q4','p1_fn_q5'],
  p1_debugging:         ['p1_dbg_q1','p1_dbg_q2','p1_dbg_q3','p1_dbg_q4'],
  p1_scope:             ['p1_sc_q1','p1_sc_q2','p1_sc_q3','p1_sc_q4'],
  p1_modules_imports:   ['p1_mod_q1','p1_mod_q2','p1_mod_q3','p1_mod_q4','p1_mod_q5'],
  p2_lists_arrays:      ['p2_list_q1','p2_list_q2','p2_list_q3','p2_list_q4','p2_list_q5'],
  p2_dictionaries:      ['p2_dict_q1','p2_dict_q2','p2_dict_q3','p2_dict_q4','p2_dict_q5'],
  p2_algorithms_intro:  ['p2_alg_q1','p2_alg_q2','p2_alg_q3','p2_alg_q4','p2_alg_q5'],
  p2_big_o_basics:      ['p2_bigo_q1','p2_bigo_q2','p2_bigo_q3','p2_bigo_q4','p2_bigo_q5'],
  p2_numpy_basics:      ['p2_np_q1','p2_np_q2','p2_np_q3','p2_np_q4','p2_np_q5'],
  p2_math_vectors:      ['p2_vec_q1','p2_vec_q2','p2_vec_q3','p2_vec_q4','p2_vec_q5'],
  p2_math_matrices:     ['p2_mat_q1','p2_mat_q2','p2_mat_q3','p2_mat_q4','p2_mat_q5'],
  p2_probability_basics:['p2_prob_q1','p2_prob_q2','p2_prob_q3','p2_prob_q4','p2_prob_q5'],
  p2_problem_solving:   ['p2_ps_q1','p2_ps_q2','p2_ps_q3','p2_ps_q4','p2_ps_q5'],
  p2_recursion:         ['p2_rec_q1','p2_rec_q2','p2_rec_q3','p2_rec_q4','p2_rec_q5'],
  p2_sets_tuples:       ['p2_st_q1','p2_st_q2','p2_st_q3','p2_st_q4'],
  p2_statistics_basics: ['p2_stat_q1','p2_stat_q2','p2_stat_q3','p2_stat_q4','p2_stat_q5'],
  p2_sorting_searching: ['p2_ss_q1','p2_ss_q2','p2_ss_q3','p2_ss_q4','p2_ss_q5'],
  p2_linear_functions:  ['p2_lf_q1','p2_lf_q2','p2_lf_q3','p2_lf_q4','p2_lf_q5'],
  p2_data_exploration:  ['p2_de_q1','p2_de_q2','p2_de_q3','p2_de_q4','p2_de_q5'],
  p3_what_is_ai:            ['p3_ai_q1','p3_ai_q2','p3_ai_q3','p3_ai_q4','p3_ai_q5'],
  p3_ai_vs_ml_vs_dl:        ['p3_aml_q1','p3_aml_q2','p3_aml_q3','p3_aml_q4','p3_aml_q5'],
  p3_history_of_ai:         ['p3_hist_q1','p3_hist_q2','p3_hist_q3','p3_hist_q4'],
  p3_how_machines_learn:    ['p3_hml_q1','p3_hml_q2','p3_hml_q3','p3_hml_q4','p3_hml_q5'],
  p3_types_of_learning:     ['p3_tol_q1','p3_tol_q2','p3_tol_q3','p3_tol_q4','p3_tol_q5'],
  p3_training_vs_inference: ['p3_tvi_q1','p3_tvi_q2','p3_tvi_q3','p3_tvi_q4','p3_tvi_q5'],
  p3_data_and_labels:       ['p3_dal_q1','p3_dal_q2','p3_dal_q3','p3_dal_q4','p3_dal_q5'],
  p3_model_evaluation:      ['p3_me_q1','p3_me_q2','p3_me_q3','p3_me_q4','p3_me_q5'],
  p3_overfitting:           ['p3_ov_q1','p3_ov_q2','p3_ov_q3','p3_ov_q4','p3_ov_q5'],
  p3_feature_engineering:   ['p3_fe_q1','p3_fe_q2','p3_fe_q3','p3_fe_q4','p3_fe_q5'],
  p3_ai_applications:       ['p3_app_q1','p3_app_q2','p3_app_q3','p3_app_q4'],
  p3_ai_dev_cycle:          ['p3_adc_q1','p3_adc_q2','p3_adc_q3','p3_adc_q4','p3_adc_q5'],
}

function generateAttempts(learnerId, sessionId, skillIds, startMs, accuracy, count) {
  const results = []
  let t = startMs
  for (let i = 0; i < count; i++) {
    const skillId = pick(skillIds)
    const qs = QUESTION_IDS[skillId]
    if (!qs || qs.length === 0) continue
    t += Math.floor(Math.random() * 40_000 + 15_000)
    const correct = Math.random() < accuracy
    results.push({
      id:              uuid(),
      learner_id:      learnerId,
      skill_id:        skillId,
      question_id:     pick(qs),
      session_id:      sessionId,
      correct,
      latency_ms:      Math.floor(Math.random() * 18_000 + 4_000),
      revision_count:  0,
      error_type:      correct ? null : 'wrong_answer',
      difficulty_tier: 'mid',
      question_format: 'mcq',
      attempted_at:    new Date(t).toISOString(),
    })
  }
  return results
}

async function seedUser(cfg) {
  const id   = uuid()
  const hash = await bcrypt.hash(cfg.password, 10)

  const { error: pe } = await db.from('learner_profiles').insert({
    id,
    email:           cfg.email,
    password_hash:   hash,
    display_name:    cfg.name,
    diagnostic_done: true,
    entry_node:      cfg.entryNode,
    streak_days:     cfg.streak,
    last_session_at: daysAgo(cfg.lastSessionDaysAgo),
    graph_version:   '1.0.0',
  })
  if (pe) throw new Error(`Profile insert (${cfg.email}): ${pe.message}`)

  await db.from('motivation_states').insert({ learner_id: id })

  // Only insert states for skills the user has actually encountered (non-blocked)
  const activeSkills = cfg.skills.filter(s => s.mastery !== 'blocked')

  if (activeSkills.length > 0) {
    const states = activeSkills.map(s => ({
      learner_id:          id,
      skill_id:            s.id,
      p_know:              s.p_know,
      p_slip:              0.08,
      p_guess:             0.18,
      p_transit:           0.12,
      mastery_state:       s.mastery,
      consecutive_correct: s.mastery === 'mastered' ? 3 : s.mastery === 'learning' ? 1 : 0,
      consecutive_wrong:   s.mastery === 'fragile'  ? 1 : 0,
      total_attempts:      s.attempts,
      last_attempted_at:   daysAgo(Math.floor(Math.random() * 4) + 1),
      first_seen_at:       daysAgo(cfg.daysActive),
      graph_stale:         false,
    }))
    const { error: se } = await db.from('learner_skill_states').insert(states)
    if (se) throw new Error(`Skill states (${cfg.email}): ${se.message}`)
  }

  // Review schedules for mastered / fragile skills
  const reviewable = activeSkills.filter(s => ['mastered', 'fragile'].includes(s.mastery))
  if (reviewable.length > 0) {
    const schedules = reviewable.map(s => ({
      learner_id:      id,
      skill_id:        s.id,
      interval_days:   s.mastery === 'mastered' ? 7 : 1,
      ease_factor:     s.mastery === 'mastered' ? 2.8 : 2.5,
      repetitions:     s.mastery === 'mastered' ? 4 : 1,
      due_at:          daysAgo(-(Math.floor(Math.random() * 8))),
      last_reviewed_at: daysAgo(Math.floor(Math.random() * 5) + 1),
    }))
    const { error: re } = await db.from('review_schedules').insert(schedules)
    if (re) throw new Error(`Review schedules (${cfg.email}): ${re.message}`)
  }

  // Sessions + attempts
  const skillIdsForAttempts = activeSkills
    .filter(s => QUESTION_IDS[s.id] && QUESTION_IDS[s.id].length > 0)
    .map(s => s.id)

  for (let i = 0; i < cfg.sessions; i++) {
    const sessionId = uuid()
    const daysBack  = cfg.sessions - i
    const startMs   = Date.now() - daysBack * 86_400_000 + Math.random() * 4 * 3_600_000
    const qCount    = Math.floor(Math.random() * 8) + 5
    const endMs     = startMs + qCount * 45_000

    const { error: sErr } = await db.from('sessions').insert({
      id:            sessionId,
      learner_id:    id,
      started_at:    new Date(startMs).toISOString(),
      ended_at:      new Date(endMs).toISOString(),
      tasks_count:   qCount,
      correct_count: Math.round(qCount * cfg.accuracy),
      abandoned:     false,
    })
    if (sErr) throw new Error(`Session insert (${cfg.email}): ${sErr.message}`)

    if (skillIdsForAttempts.length > 0) {
      const attempts = generateAttempts(id, sessionId, skillIdsForAttempts, startMs, cfg.accuracy, qCount)
      if (attempts.length > 0) {
        const { error: aErr } = await db.from('attempt_events').insert(attempts)
        if (aErr) throw new Error(`Attempts insert (${cfg.email}): ${aErr.message}`)
      }
    }
  }

  const active = activeSkills.length
  const mastered = activeSkills.filter(s => s.mastery === 'mastered').length
  console.log(`  ✓ ${cfg.name.padEnd(14)} ${cfg.email.padEnd(22)} — ${mastered} mastered / ${active} active, ${cfg.sessions} sessions`)
}

// ── User data ───────────────────────────────────────────────

const P1 = [
  'p1_what_is_computer','p1_input_output','p1_binary_numbers','p1_memory_storage',
  'p1_cpu_processing','p1_how_code_works','p1_python_intro','p1_variables',
  'p1_data_types','p1_operators','p1_strings','p1_conditionals',
  'p1_loops','p1_lists_intro','p1_functions','p1_debugging','p1_scope','p1_modules_imports',
]
const P2 = [
  'p2_lists_arrays','p2_dictionaries','p2_algorithms_intro','p2_big_o_basics',
  'p2_numpy_basics','p2_math_vectors','p2_math_matrices','p2_probability_basics',
  'p2_problem_solving','p2_recursion','p2_sets_tuples','p2_statistics_basics',
  'p2_sorting_searching','p2_linear_functions','p2_data_exploration',
]
const P3 = [
  'p3_what_is_ai','p3_ai_vs_ml_vs_dl','p3_history_of_ai','p3_how_machines_learn',
  'p3_types_of_learning','p3_training_vs_inference','p3_data_and_labels',
  'p3_model_evaluation','p3_overfitting','p3_feature_engineering',
  'p3_ai_applications','p3_ai_dev_cycle',
]

const USERS = [
  // ── Alex Chen — Beginner ────────────────────────────────
  {
    email: 'alex@demo.com',
    password: 'demo1234',
    name: 'Alex Chen',
    streak: 3,
    lastSessionDaysAgo: 1,
    daysActive: 10,
    entryNode: 'p1_what_is_computer',
    accuracy: 0.72,
    sessions: 6,
    skills: [
      { id: 'p1_what_is_computer', p_know: 0.94, mastery: 'mastered', attempts: 18 },
      { id: 'p1_input_output',     p_know: 0.92, mastery: 'mastered', attempts: 15 },
      { id: 'p1_binary_numbers',   p_know: 0.91, mastery: 'mastered', attempts: 20 },
      { id: 'p1_memory_storage',   p_know: 0.90, mastery: 'mastered', attempts: 16 },
      { id: 'p1_cpu_processing',   p_know: 0.62, mastery: 'learning', attempts: 8  },
      { id: 'p1_how_code_works',   p_know: 0.55, mastery: 'learning', attempts: 6  },
      { id: 'p1_python_intro',     p_know: 0.48, mastery: 'learning', attempts: 5  },
      { id: 'p1_variables',        p_know: 0.35, mastery: 'fragile',  attempts: 4  },
      ...P1.slice(8).map(id => ({ id, p_know: 0.1, mastery: 'blocked', attempts: 0 })),
    ],
  },

  // ── Sam Rivera — Intermediate ───────────────────────────
  {
    email: 'sam@demo.com',
    password: 'demo1234',
    name: 'Sam Rivera',
    streak: 8,
    lastSessionDaysAgo: 0,
    daysActive: 22,
    entryNode: 'p1_what_is_computer',
    accuracy: 0.80,
    sessions: 14,
    skills: [
      { id: 'p1_what_is_computer', p_know: 0.97, mastery: 'mastered', attempts: 22 },
      { id: 'p1_input_output',     p_know: 0.95, mastery: 'mastered', attempts: 20 },
      { id: 'p1_binary_numbers',   p_know: 0.94, mastery: 'mastered', attempts: 25 },
      { id: 'p1_memory_storage',   p_know: 0.93, mastery: 'mastered', attempts: 18 },
      { id: 'p1_cpu_processing',   p_know: 0.92, mastery: 'mastered', attempts: 20 },
      { id: 'p1_how_code_works',   p_know: 0.91, mastery: 'mastered', attempts: 18 },
      { id: 'p1_python_intro',     p_know: 0.93, mastery: 'mastered', attempts: 22 },
      { id: 'p1_variables',        p_know: 0.95, mastery: 'mastered', attempts: 20 },
      { id: 'p1_data_types',       p_know: 0.92, mastery: 'mastered', attempts: 18 },
      { id: 'p1_operators',        p_know: 0.90, mastery: 'mastered', attempts: 16 },
      { id: 'p1_strings',          p_know: 0.91, mastery: 'mastered', attempts: 17 },
      { id: 'p1_conditionals',     p_know: 0.88, mastery: 'mastered', attempts: 19 },
      { id: 'p1_loops',            p_know: 0.90, mastery: 'mastered', attempts: 20 },
      { id: 'p1_lists_intro',      p_know: 0.87, mastery: 'mastered', attempts: 16 },
      { id: 'p1_functions',        p_know: 0.85, mastery: 'mastered', attempts: 18 },
      { id: 'p1_debugging',        p_know: 0.82, mastery: 'mastered', attempts: 14 },
      { id: 'p1_scope',            p_know: 0.78, mastery: 'fragile',  attempts: 12 },
      { id: 'p1_modules_imports',  p_know: 0.80, mastery: 'mastered', attempts: 13 },
      { id: 'p2_lists_arrays',     p_know: 0.72, mastery: 'learning', attempts: 10 },
      { id: 'p2_dictionaries',     p_know: 0.68, mastery: 'learning', attempts: 9  },
      { id: 'p2_algorithms_intro', p_know: 0.65, mastery: 'learning', attempts: 8  },
      { id: 'p2_problem_solving',  p_know: 0.62, mastery: 'learning', attempts: 7  },
      { id: 'p2_big_o_basics',     p_know: 0.45, mastery: 'fragile',  attempts: 6  },
      { id: 'p2_numpy_basics',     p_know: 0.38, mastery: 'fragile',  attempts: 5  },
      ...P2.slice(6).map(id => ({ id, p_know: 0.1, mastery: 'blocked', attempts: 0 })),
    ],
  },

  // ── Jordan Park — Advanced ──────────────────────────────
  {
    email: 'jordan@demo.com',
    password: 'demo1234',
    name: 'Jordan Park',
    streak: 15,
    lastSessionDaysAgo: 0,
    daysActive: 35,
    entryNode: 'p1_what_is_computer',
    accuracy: 0.88,
    sessions: 22,
    skills: [
      // Phase 1 — all mastered
      { id: 'p1_what_is_computer', p_know: 0.97, mastery: 'mastered', attempts: 28 },
      { id: 'p1_input_output',     p_know: 0.96, mastery: 'mastered', attempts: 25 },
      { id: 'p1_binary_numbers',   p_know: 0.95, mastery: 'mastered', attempts: 30 },
      { id: 'p1_memory_storage',   p_know: 0.94, mastery: 'mastered', attempts: 24 },
      { id: 'p1_cpu_processing',   p_know: 0.95, mastery: 'mastered', attempts: 26 },
      { id: 'p1_how_code_works',   p_know: 0.93, mastery: 'mastered', attempts: 22 },
      { id: 'p1_python_intro',     p_know: 0.96, mastery: 'mastered', attempts: 28 },
      { id: 'p1_variables',        p_know: 0.97, mastery: 'mastered', attempts: 26 },
      { id: 'p1_data_types',       p_know: 0.95, mastery: 'mastered', attempts: 24 },
      { id: 'p1_operators',        p_know: 0.93, mastery: 'mastered', attempts: 22 },
      { id: 'p1_strings',          p_know: 0.94, mastery: 'mastered', attempts: 23 },
      { id: 'p1_conditionals',     p_know: 0.92, mastery: 'mastered', attempts: 24 },
      { id: 'p1_loops',            p_know: 0.93, mastery: 'mastered', attempts: 25 },
      { id: 'p1_lists_intro',      p_know: 0.91, mastery: 'mastered', attempts: 20 },
      { id: 'p1_functions',        p_know: 0.92, mastery: 'mastered', attempts: 23 },
      { id: 'p1_debugging',        p_know: 0.90, mastery: 'mastered', attempts: 18 },
      { id: 'p1_scope',            p_know: 0.88, mastery: 'mastered', attempts: 16 },
      { id: 'p1_modules_imports',  p_know: 0.90, mastery: 'mastered', attempts: 18 },
      // Phase 2 — all mastered or fragile
      { id: 'p2_lists_arrays',       p_know: 0.95, mastery: 'mastered', attempts: 20 },
      { id: 'p2_dictionaries',       p_know: 0.93, mastery: 'mastered', attempts: 18 },
      { id: 'p2_algorithms_intro',   p_know: 0.92, mastery: 'mastered', attempts: 17 },
      { id: 'p2_big_o_basics',       p_know: 0.90, mastery: 'mastered', attempts: 16 },
      { id: 'p2_numpy_basics',       p_know: 0.91, mastery: 'mastered', attempts: 17 },
      { id: 'p2_math_vectors',       p_know: 0.89, mastery: 'mastered', attempts: 16 },
      { id: 'p2_math_matrices',      p_know: 0.87, mastery: 'mastered', attempts: 15 },
      { id: 'p2_probability_basics', p_know: 0.88, mastery: 'mastered', attempts: 16 },
      { id: 'p2_problem_solving',    p_know: 0.91, mastery: 'mastered', attempts: 17 },
      { id: 'p2_recursion',          p_know: 0.84, mastery: 'mastered', attempts: 14 },
      { id: 'p2_sets_tuples',        p_know: 0.86, mastery: 'mastered', attempts: 15 },
      { id: 'p2_statistics_basics',  p_know: 0.83, mastery: 'mastered', attempts: 14 },
      { id: 'p2_sorting_searching',  p_know: 0.85, mastery: 'mastered', attempts: 15 },
      { id: 'p2_linear_functions',   p_know: 0.80, mastery: 'mastered', attempts: 13 },
      { id: 'p2_data_exploration',   p_know: 0.78, mastery: 'fragile',  attempts: 11 },
      // Phase 3 — first 4 mastered, next 3 learning, rest blocked
      { id: 'p3_what_is_ai',            p_know: 0.90, mastery: 'mastered', attempts: 12 },
      { id: 'p3_ai_vs_ml_vs_dl',        p_know: 0.88, mastery: 'mastered', attempts: 11 },
      { id: 'p3_history_of_ai',         p_know: 0.85, mastery: 'mastered', attempts: 10 },
      { id: 'p3_how_machines_learn',    p_know: 0.83, mastery: 'mastered', attempts: 9  },
      { id: 'p3_types_of_learning',     p_know: 0.72, mastery: 'learning', attempts: 8  },
      { id: 'p3_training_vs_inference', p_know: 0.65, mastery: 'learning', attempts: 7  },
      { id: 'p3_data_and_labels',       p_know: 0.58, mastery: 'learning', attempts: 6  },
      ...P3.slice(7).map(id => ({ id, p_know: 0.1, mastery: 'blocked', attempts: 0 })),
    ],
  },
]

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Synaptic demo users...\n')

  const demoEmails = USERS.map(u => u.email)
  for (const email of demoEmails) {
    const { data } = await db.from('learner_profiles').select('id').eq('email', email).maybeSingle()
    if (data) {
      await db.from('learner_profiles').delete().eq('id', data.id)
      console.log(`  Removed existing: ${email}`)
    }
  }
  console.log()

  for (const u of USERS) {
    await seedUser(u)
  }

  console.log('\nDone! Login with:')
  console.log('  alex@demo.com    / demo1234  — Beginner   (4 mastered, Phase 1 in progress)')
  console.log('  sam@demo.com     / demo1234  — Intermediate (Phase 1 done, Phase 2 in progress)')
  console.log('  jordan@demo.com  / demo1234  — Advanced   (Phase 1+2 done, Phase 3 in progress)')
}

main().catch(err => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
