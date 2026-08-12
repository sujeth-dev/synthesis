'use strict'
const fs   = require('fs')
const path = require('path')
const CONTENT = path.join(__dirname, '..', 'content')
let errors = 0, warnings = 0
function err(msg)  { console.error(`  ✗ ${msg}`); errors++ }
function warn(msg) { console.warn(`  ⚠ ${msg}`); warnings++ }
function ok(msg)   { console.log(`  ✓ ${msg}`) }
function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch(e) { err(`Invalid JSON: ${p} — ${e.message}`); return null }
}
console.log('\n🔍 Synaptic Content Validator\n')
const nodesFile = path.join(CONTENT, 'graph/nodes.json')
const edgesFile = path.join(CONTENT, 'graph/edges.json')
if (!fs.existsSync(nodesFile) || !fs.existsSync(edgesFile)) {
  console.error('❌ Fatal: cannot load graph files'); process.exit(1)
}
const nodes = loadJSON(nodesFile)
const edges = loadJSON(edgesFile)
if (!nodes || !edges) { process.exit(1) }
const inDeg = new Map(nodes.map(n => [n.id, 0]))
for (const e of edges) {
  if (e.strength === 'hard') { inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1) }
}
const queue = nodes.filter(n => (inDeg.get(n.id) || 0) === 0)
let sorted = 0
while (queue.length > 0) {
  const n = queue.shift(); sorted++
  for (const e of edges.filter(e2 => e2.from === n.id && e2.strength === 'hard')) {
    const d = (inDeg.get(e.to) || 1) - 1; inDeg.set(e.to, d)
    if (d === 0) { const found = nodes.find(x => x.id === e.to); if (found) { queue.push(found) } }
  }
}
console.log('Nodes & Edges')
ok(`${nodes.length} nodes loaded`)
ok(`${edges.length} edges valid`)
for (const node of nodes) {
  if (typeof node.topic !== 'string' || node.topic.trim() === '') { err(`Node ${node.id} missing non-empty topic`) }
  if (!Number.isInteger(node.topic_order) || node.topic_order < 1) { err(`Node ${node.id} has invalid topic_order`) }
}
if (sorted !== nodes.length) {
  err('Cycle detected in prerequisite graph!')
} else {
  ok('No cycles detected')
}
console.log('\nQuestion Files')
let qChecked = 0, qMissing = 0
for (const node of nodes) {
  if (!node.question_ids || node.question_ids.length === 0) { continue }
  const qFile = path.join(CONTENT, 'questions/by-skill', `${node.id}.json`)
  if (!fs.existsSync(qFile)) { warn(`Missing question file: ${node.id}.json`); qMissing++; continue }
  const qs = loadJSON(qFile)
  if (!qs) { continue }
  const mcqs = qs.filter(q => q.format === 'mcq')
  if (mcqs.length < 5) { err(`${node.id} has ${mcqs.length} MCQs; needs at least 5`) }
  for (const q of qs) {
    if (q.skill_id !== node.id) { err(`${qFile}: question "${q.id}" has skill_id "${q.skill_id}"`) }
    if (q.format === 'mcq' || q.format === 'fill') {
      if (!Array.isArray(q.options) || q.options.length < 2) { err(`${qFile}: question "${q.id}" needs at least 2 options`) }
      else if (!q.options.some(o => o.id === q.correct_option_id)) { err(`${qFile}: question "${q.id}" correct_option_id doesn't match any option`) }
    }
    if (q.format === 'order' && (!Array.isArray(q.options) || !q.correct_answer)) {
      err(`${qFile}: order question "${q.id}" needs options and correct_answer`)
    }
  }
  const fileIds = new Set(qs.map(q => q.id))
  for (const qid of node.question_ids) {
    if (!fileIds.has(qid)) { warn(`Node ${node.id} declares "${qid}" not found in file`) }
  }
  qChecked++
}
ok(`${qChecked} question files validated`)
if (qMissing) { warn(`${qMissing} question files missing`) }
console.log('\nExplanation Files')
let expChecked = 0
for (const node of nodes) {
  const qFile = path.join(CONTENT, 'questions/by-skill', `${node.id}.json`)
  if (!fs.existsSync(qFile)) { continue }
  const expDir = path.join(CONTENT, 'explanations', node.id)
  if (!fs.existsSync(expDir)) { warn(`Active skill ${node.id} missing explanation directory`); continue }
  for (const depth of ['beginner', 'mid', 'advanced', 'expert']) {
    const f = path.join(expDir, `${depth}.json`)
    if (!fs.existsSync(f)) { warn(`Missing ${depth}.json for: ${node.id}`); continue }
    const exp = loadJSON(f)
    if (exp && !exp.body) { warn(`${node.id}/${depth}.json missing 'body'`) }
    if (exp && !exp.key_insight) { warn(`${node.id}/${depth}.json missing 'key_insight'`) }
  }
  expChecked++
}
ok(`${expChecked} explanation directories validated`)
console.log('\nDiagnostic Questions')
const diagFile = path.join(CONTENT, 'questions/diagnostic/questions.json')
if (fs.existsSync(diagFile)) {
  const diag = loadJSON(diagFile)
  if (diag) { ok(`${diag.length} diagnostic questions`) }
} else {
  warn('Missing diagnostic/questions.json')
}
console.log('\nPhase Evaluations')
const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const MIN_PER_BLOOM_LEVEL = 2
const skillsByPhase = new Map()
for (const node of nodes) {
  if (!skillsByPhase.has(node.phase)) { skillsByPhase.set(node.phase, new Set()) }
  skillsByPhase.get(node.phase).add(node.id)
}
// BLOOM-6 gate: when a Phases 4-8 content pass (P2-3) completes, add that phase here
// and to phaseFileNames below — its phase evaluation set must ship alongside the
// by-skill content, not be retrofitted later. See MASTER_PLAN.md's P2-3/BLOOM-6.
const authoredPhases = ['phase_1_computer_basics', 'phase_1b_programming_basics', 'phase_2_cs_data', 'phase_3_intro_ai', 'phase_4_machine_learning', 'phase_5_deep_learning']
const phaseFileNames = {
  phase_1_computer_basics: 'p1_evaluation.json',
  phase_1b_programming_basics: 'p1b_evaluation.json',
  phase_2_cs_data:         'p2_evaluation.json',
  phase_3_intro_ai:        'p3_evaluation.json',
  phase_4_machine_learning: 'p4_evaluation.json',
  phase_5_deep_learning:   'p5_evaluation.json',
}
let peChecked = 0
for (const phase of authoredPhases) {
  const peFile = path.join(CONTENT, 'questions/phase-evaluation', phaseFileNames[phase])
  if (!fs.existsSync(peFile)) { warn(`Missing phase evaluation: ${phaseFileNames[phase]}`); continue }
  const qs = loadJSON(peFile)
  if (!qs) { continue }
  const validSkillIds = skillsByPhase.get(phase) || new Set()
  const seenIds = new Set()
  const countByLevel = new Map(BLOOM_LEVELS.map(l => [l, 0]))
  for (const q of qs) {
    if (seenIds.has(q.id)) { err(`${phaseFileNames[phase]}: duplicate question id "${q.id}"`) }
    seenIds.add(q.id)
    if (q.phase !== phase) { err(`${phaseFileNames[phase]}: question "${q.id}" has phase "${q.phase}", expected "${phase}"`) }
    if (!validSkillIds.has(q.skill_id)) { err(`${phaseFileNames[phase]}: question "${q.id}" references unknown/out-of-phase skill_id "${q.skill_id}"`) }
    if (!BLOOM_LEVELS.includes(q.bloom_level)) { err(`${phaseFileNames[phase]}: question "${q.id}" has invalid bloom_level "${q.bloom_level}"`) }
    else { countByLevel.set(q.bloom_level, countByLevel.get(q.bloom_level) + 1) }
    if (q.format !== 'mcq') { err(`${phaseFileNames[phase]}: question "${q.id}" must be format "mcq"`) }
    if (!Array.isArray(q.options) || q.options.length < 2) { err(`${phaseFileNames[phase]}: question "${q.id}" needs at least 2 options`) }
    else if (!q.options.some(o => o.id === q.correct_option_id)) { err(`${phaseFileNames[phase]}: question "${q.id}" correct_option_id doesn't match any option`) }
  }
  for (const level of BLOOM_LEVELS) {
    const count = countByLevel.get(level)
    if (count < MIN_PER_BLOOM_LEVEL) { err(`${phaseFileNames[phase]}: only ${count} "${level}" question(s), needs at least ${MIN_PER_BLOOM_LEVEL}`) }
  }
  peChecked++
}
ok(`${peChecked} phase evaluation set(s) validated`)
console.log('\n' + '─'.repeat(50) + '\n')
if (errors === 0 && warnings === 0) {
  console.log('✅ All checks passed — 0 errors, 0 warnings\n')
} else {
  if (errors > 0) { console.error(`❌ ${errors} error(s) found`) }
  if (warnings > 0) { console.warn(`⚠  ${warnings} warning(s) found`) }
  console.log()
  if (errors > 0) { process.exit(1) }
}
