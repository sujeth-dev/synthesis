import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const MIN_PER_BLOOM_LEVEL = 2

const PHASE_EVAL_FILES: Record<string, string> = {
  phase_1_computer_basics: 'p1_evaluation.json',
  phase_1b_programming_basics: 'p1b_evaluation.json',
  phase_2_cs_data:         'p2_evaluation.json',
  phase_3_intro_ai:        'p3_evaluation.json',
  phase_4_machine_learning: 'p4_evaluation.json',
  phase_5_deep_learning:   'p5_evaluation.json',
  phase_6_modern_ai:       'p6_evaluation.json',
  phase_7_real_world:      'p7_evaluation.json',
  phase_8_mastery:         'p8_evaluation.json',
}

describe('phase evaluation content contract', () => {
  it('every authored phase evaluation set has at least the minimum questions per Bloom level, all valid mcq', () => {
    const nodes = JSON.parse(source('content/graph/nodes.json')) as Array<{ id: string; phase: string }>
    const skillsByPhase = new Map<string, Set<string>>()
    for (const node of nodes) {
      if (!skillsByPhase.has(node.phase)) skillsByPhase.set(node.phase, new Set())
      skillsByPhase.get(node.phase)!.add(node.id)
    }

    let authoredCount = 0
    for (const [phase, fileName] of Object.entries(PHASE_EVAL_FILES)) {
      const filePath = path.join(root, 'content/questions/phase-evaluation', fileName)
      if (!fs.existsSync(filePath)) continue
      authoredCount += 1

      const questions = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<{
        id: string; phase: string; skill_id: string; bloom_level: string
        format: string; stem: string; options: { id: string; text: string }[]; correct_option_id: string
      }>
      const validSkillIds = skillsByPhase.get(phase) ?? new Set()
      const ids = new Set<string>()
      const countByLevel = new Map(BLOOM_LEVELS.map(l => [l, 0]))

      for (const q of questions) {
        expect(ids.has(q.id), `duplicate id ${q.id} in ${fileName}`).toBe(false)
        ids.add(q.id)
        expect(q.phase, q.id).toBe(phase)
        expect(validSkillIds.has(q.skill_id), `${q.id} references unknown skill_id ${q.skill_id}`).toBe(true)
        expect(BLOOM_LEVELS, q.id).toContain(q.bloom_level)
        expect(q.format, q.id).toBe('mcq')
        expect(q.options.length, q.id).toBeGreaterThanOrEqual(2)
        expect(q.options.some(o => o.id === q.correct_option_id), q.id).toBe(true)
        countByLevel.set(q.bloom_level, (countByLevel.get(q.bloom_level) ?? 0) + 1)
      }

      for (const level of BLOOM_LEVELS) {
        expect(countByLevel.get(level), `${fileName} — ${level}`).toBeGreaterThanOrEqual(MIN_PER_BLOOM_LEVEL)
      }
    }
    expect(authoredCount).toBeGreaterThan(0)
  })
})

describe('phase evaluation feature contract', () => {
  it('records attempts through the existing insertAttempt()/BKT storage, skipping the adaptive-session update pipeline', () => {
    const attemptRoute = source('src/app/api/phase-evaluation/attempt/route.ts')
    expect(attemptRoute).toContain('insertAttempt(')
    expect(attemptRoute).toContain("session_id: null")
    expect(attemptRoute).toContain("difficulty_tier: 'same'")
    // Must not pull in the adaptive BKT/SM-2/motivation update pipeline — this is a
    // standalone macro-level self-check, not part of the guided session.
    expect(attemptRoute).not.toContain('bktUpdate')
    expect(attemptRoute).not.toContain('reconcileBktSm2')
    expect(attemptRoute).not.toContain('updateMotivationState')
  })

  it('verifies correctness server-side rather than trusting the client', () => {
    const attemptRoute = source('src/app/api/phase-evaluation/attempt/route.ts')
    expect(attemptRoute).toContain('question.correct_option_id')
    expect(attemptRoute).toContain('correct = selected_option_id === question.correct_option_id')
    // Cross-checks the submitted skill_id/phase against the actual question record,
    // not just trusting whatever the client claims.
    expect(attemptRoute).toContain('question.phase !== phase')
    expect(attemptRoute).toContain('question.skill_id !== skill_id')
  })

  it('requires authentication on both phase-evaluation routes', () => {
    const questionsRoute = source('src/app/api/phase-evaluation/route.ts')
    const attemptRoute = source('src/app/api/phase-evaluation/attempt/route.ts')
    expect(questionsRoute).toContain('getCurrentUser()')
    expect(questionsRoute).toContain("status: 401")
    expect(attemptRoute).toContain('getCurrentUser()')
    expect(attemptRoute).toContain("status: 401")
  })

  it('shows a per-Bloom-level results breakdown, not just a raw score', () => {
    const page = source('src/app/learn/evaluate/[phase]/page.tsx')
    expect(page).toContain('BLOOM_LEVELS')
    expect(page).toContain('byLevel')
    expect(page).toContain('BLOOM_LABELS[level]')
    expect(page).toContain('data-testid={`bloom-row-${level}`}')
    expect(page).toContain('data-testid={`bloom-score-${level}`}')
  })

  it('is framed as optional and non-gating on the results/intro copy', () => {
    const page = source('src/app/learn/evaluate/[phase]/page.tsx')
    expect(page.toLowerCase()).toContain('optional')
    expect(page.toLowerCase()).toContain("doesn't gate")
  })

  it('the dashboard only offers Evaluate once a phase evaluation set exists and the learner has some progress in that phase', () => {
    const dashboard = source('src/app/dashboard/page.tsx')
    expect(dashboard).toContain('PHASE_EVALUATION_FILES')
    expect(dashboard).toContain('PHASE_EVALUATION_FILES[phaseKey] && stats.mastered > 0')
    expect(dashboard).toContain('/learn/evaluate/${phaseKey}')
  })
})
