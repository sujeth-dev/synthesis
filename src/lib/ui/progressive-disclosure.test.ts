import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { splitExplanationSteps } from '@/lib/ui/explanation-steps'

const root = process.cwd()

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

describe('guided explanation contract', () => {
  it('splits prose, headings, and fenced examples into ordered building blocks', () => {
    const steps = splitExplanationSteps([
      '## First idea',
      '',
      'Start with this relationship.',
      '',
      '```python',
      'value = 1',
      '',
      'print(value)',
      '```',
      '',
      'Now connect it to the next idea.',
    ].join('\n'))

    expect(steps).toEqual([
      '## First idea\n\nStart with this relationship.',
      '```python\nvalue = 1\n\nprint(value)\n```',
      'Now connect it to the next idea.',
    ])
  })

  it('renders one lesson slide at a time instead of accumulating the full body', () => {
    const disclosure = source('src/components/learning/ProgressiveExplanation.tsx')
    expect(disclosure).toContain('mdToHtml(steps[currentIndex])')
    expect(disclosure).toContain('Lesson slide {currentIndex + 1} of {steps.length}')
    expect(disclosure).toContain('Next slide →')
    expect(disclosure).not.toContain('steps.slice(0, visibleCount)')
    expect(disclosure).not.toContain('Read full explanation')
  })

  it('uses one lesson-first pinned flow for automatic and direct-skill entry', () => {
    const learnPage = source('src/app/learn/page.tsx')
    const directPage = source('src/app/learn/skill/[skill_id]/page.tsx')
    const guidedLesson = source('src/components/learning/GuidedLesson.tsx')

    expect(directPage).toContain('redirect(`/learn?skill_id=')
    expect(learnPage).toContain("const requestedSkillId = searchParams.get('skill_id')")
    expect(learnPage).toContain('current_skill_id: modeOverride === \'learn\' ? skillOverride : undefined')
    expect(learnPage).not.toContain('setShowLearnFirst(true)')
    expect(learnPage).toContain("setPhase('lesson')")
    expect(learnPage).toContain('<GuidedLesson')
    expect(guidedLesson).toContain('Finish lesson and start Beginner practice')
    expect(learnPage).not.toContain('Explore why, one idea at a time')
    expect(learnPage).toContain('let learningSessionId = sessionId')
    expect(learnPage).toContain('sessionStats.total > 0 ? { skills: [], questions: [] } : undefined')
    expect(learnPage).toContain('onClick={endVoluntarily}')
  })

  it('shows persistent Beginner, Intermediate, and Mastery checkpoints with two-question minima', () => {
    const learnPage = source('src/app/learn/page.tsx')
    const engine = source('src/lib/session/engine.ts')
    expect(learnPage).toContain("{ id: 'beginner', label: 'Beginner' }")
    expect(learnPage).toContain("{ id: 'intermediate', label: 'Intermediate' }")
    expect(learnPage).toContain("{ id: 'mastery', label: 'Mastery' }")
    expect(learnPage).toContain('question ${progress.stage_attempt_count + 1} · ${progress.stage_correct_streak}/${QUESTIONS_PER_STAGE} ready')
    expect(engine).toContain('MIN_QUESTIONS_PER_GUIDED_STAGE = 2')
    expect(engine).toContain('core_complete: coreComplete')
  })

  it('retains the optional Feynman Loop inside the shared guided flow', () => {
    const learnPage = source('src/app/learn/page.tsx')
    const attemptRoute = source('src/app/api/attempt/route.ts')
    expect(learnPage).toContain('<FeynmanLoop')
    expect(learnPage).toContain('Teach it with the Feynman Loop')
    expect(learnPage).toContain('completeFeynmanLoop')
    expect(attemptRoute).toContain('isGuidedReflection')
    expect(attemptRoute).toContain("question_id.endsWith('_feynman_loop')")
  })
})
