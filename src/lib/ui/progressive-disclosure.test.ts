import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

describe('explanation progressive disclosure contract', () => {
  it('keeps every full explanation body behind the shared explicit disclosure action', () => {
    const consumers = [
      'src/components/learning/ExplanationPanel.tsx',
      'src/app/learn/page.tsx',
      'src/app/learn/skill/[skill_id]/page.tsx',
    ].map(source)

    for (const consumer of consumers) {
      expect(consumer).toContain('<ProgressiveExplanation body=')
      expect(consumer).not.toMatch(/mdToHtml\((?:e|explanation)\.body\)/)
    }

    const disclosure = source('src/components/learning/ProgressiveExplanation.tsx')
    expect(disclosure).toContain('aria-expanded={expanded}')
    expect(disclosure).toContain('{expanded && (')
    expect(disclosure).toContain('Read full explanation')
  })
})
