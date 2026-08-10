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

  it('reveals ordered blocks incrementally instead of inserting the full body at once', () => {
    const disclosure = source('src/components/learning/ProgressiveExplanation.tsx')
    expect(disclosure).toContain('steps.slice(0, visibleCount)')
    expect(disclosure).toContain('Building block {index + 1} of {steps.length}')
    expect(disclosure).toContain('Reveal the next idea')
    expect(disclosure).not.toContain('Read full explanation')
  })

  it('uses one question-first pinned flow for automatic and direct-skill entry', () => {
    const learnPage = source('src/app/learn/page.tsx')
    const directPage = source('src/app/learn/skill/[skill_id]/page.tsx')

    expect(directPage).toContain('redirect(`/learn?skill_id=')
    expect(learnPage).toContain("const requestedSkillId = searchParams.get('skill_id')")
    expect(learnPage).toContain('current_skill_id: modeOverride === \'learn\' ? skillOverride : undefined')
    expect(learnPage).not.toContain('setShowLearnFirst(true)')
    expect(learnPage).toContain('Explore why, one idea at a time')
    expect(learnPage).toContain('onClick={endVoluntarily}')
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
