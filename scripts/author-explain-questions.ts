/**
 * Authors one free-text `explain` question per skill, deterministically, from
 * content that already exists.
 *
 * The reasoning grader (src/lib/nlp, 0.962 accuracy / kappa 0.943 against human
 * labels) had almost nothing to grade: 0 of 843 authored practice questions used
 * the `explain` format, so the only free text it ever saw came from the Feynman
 * loop under a synthesised question id.
 *
 * The prompts are not invented here. Every skill already carries an
 * `explain_back_prompt` in its explanation files; this picks one per skill in
 * depth order and uses the beginner `key_insight` as the post-answer reveal. The
 * script is committed and re-runnable so the content stays reviewable as a diff
 * and regenerable, rather than hand-typed 120 times.
 *
 * Usage: npx tsx scripts/author-explain-questions.ts [--check]
 *   --check  report what would change and exit non-zero if anything would, for CI
 */
import fs from 'node:fs'
import path from 'node:path'

// Only the two shallowest depths are eligible as prompt sources. The advanced and
// expert explain_back_prompts are genuinely expert ("why does two's complement let
// one circuit do addition and subtraction", on a skill titled What is Binary?), and
// a `same`-tier practice question asked at that level would be graded a gap for
// almost every learner, wrongly pushing p_know down. The 17 skills with no
// beginner or mid prompt get a template built from the node's own fields instead,
// and are listed at the end of a run so a human can replace them.
const PROMPT_DEPTHS = ['beginner', 'mid'] as const
const REVEAL_DEPTHS = ['beginner', 'mid', 'advanced', 'expert'] as const
const TIER = 'same'
const root = path.resolve(__dirname, '..')
const check = process.argv.includes('--check')

interface Option { id: string; text: string }
interface Question {
  id: string; skill_id: string; format: string; difficulty_tier: string
  stem?: string; prompt?: string; options?: Option[]; correct_option_id?: string
  correct_answer?: string; explanation_after?: string
  graph_placement_weight?: Record<string, number>
}
interface Node { id: string; label: string; question_ids: string[]; deprecated?: boolean }

const nodesPath = path.join(root, 'content/graph/nodes.json')
const nodes: Node[] = JSON.parse(fs.readFileSync(nodesPath, 'utf8'))

function readExplanation(skillId: string, depth: string): Record<string, unknown> | null {
  const file = path.join(root, 'content/explanations', skillId, `${depth}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function pickPrompt(skillId: string, label: string): { prompt: string; depth: string } {
  for (const depth of PROMPT_DEPTHS) {
    const prompt = readExplanation(skillId, depth)?.explain_back_prompt
    if (typeof prompt === 'string' && prompt.trim() !== '') return { prompt: prompt.trim(), depth }
  }
  return {
    prompt: `In your own words, explain ${label} — what it is and why it matters. Use an example if it helps.`,
    depth: 'templated',
  }
}

function pickReveal(skillId: string): string {
  for (const depth of REVEAL_DEPTHS) {
    const insight = readExplanation(skillId, depth)?.key_insight
    if (typeof insight === 'string' && insight.trim() !== '') return insight.trim()
  }
  return ''
}

const changed: string[] = []
const skipped: string[] = []
const templated: string[] = []
const depthsUsed = new Map<string, number>()

for (const node of nodes) {
  if (node.deprecated) continue
  const questionsPath = path.join(root, 'content/questions/by-skill', `${node.id}.json`)
  if (!fs.existsSync(questionsPath)) { skipped.push(`${node.id} (no question file)`); continue }

  const picked = pickPrompt(node.id, node.label)
  depthsUsed.set(picked.depth, (depthsUsed.get(picked.depth) ?? 0) + 1)
  if (picked.depth === 'templated') templated.push(node.id)

  const questions: Question[] = JSON.parse(fs.readFileSync(questionsPath, 'utf8'))
  const id = `${node.id}_explain1`
  const authored: Question = {
    id,
    skill_id: node.id,
    format: 'explain',
    difficulty_tier: TIER,
    prompt: picked.prompt,
    explanation_after: pickReveal(node.id),
  }

  const at = questions.findIndex(q => q.id === id)
  const next = at >= 0
    ? questions.map((q, i) => (i === at ? authored : q))
    : [...questions, authored]

  const before = JSON.stringify(questions)
  const after = JSON.stringify(next)
  if (before !== after) {
    changed.push(`${node.id} (${picked.depth})`)
    if (!check) fs.writeFileSync(questionsPath, JSON.stringify(next, null, 2) + '\n')
  }
  if (!node.question_ids.includes(id)) {
    changed.push(`${node.id} question_ids`)
    if (!check) node.question_ids = [...node.question_ids, id]
  }
}

if (!check) fs.writeFileSync(nodesPath, JSON.stringify(nodes, null, 2) + '\n')

console.log(`${check ? 'would change' : 'wrote'}: ${changed.length} edit(s) across ${nodes.length} skills`)
for (const [depth, count] of [...PROMPT_DEPTHS, 'templated'].map(d => [d, depthsUsed.get(d) ?? 0] as const)) {
  console.log(`  prompt source ${depth}: ${count}`)
}
if (templated.length > 0) {
  console.log(`templated (no beginner or mid explain_back_prompt authored) — ${templated.length}:`)
  for (const s of templated) console.log(`  ${s}`)
}
if (skipped.length > 0) {
  console.log(`skipped ${skipped.length}:`)
  for (const s of skipped) console.log(`  ${s}`)
}
if (check && changed.length > 0) process.exit(1)
