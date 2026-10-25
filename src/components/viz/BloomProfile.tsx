import type { BloomLevel } from '@/types'
import { Meter } from './Meter'

// Performance by kind of thinking (OLM-1), from the latest exam run. Shown as
// the chance on a medium item, the same number the exam debrief leads with, so
// the dashboard and the debrief never disagree about what a level means.

export interface BloomLevelSummary {
  level: BloomLevel
  /** 0-1, or null when the run never sampled the level. */
  chance: number | null
  correct: number
  n: number
}

const LABEL: Record<BloomLevel, string> = {
  remember: 'Remember', understand: 'Understand', apply: 'Apply',
  analyze: 'Analyze', evaluate: 'Evaluate', create: 'Create',
}

export function BloomProfile({ levels, testId }: { levels: BloomLevelSummary[]; testId?: string }) {
  return (
    <div className="space-y-2" data-testid={testId}>
      {levels.map(l => (
        <div key={l.level} className="grid grid-cols-[84px_1fr_40px] items-center gap-3">
          <span className="text-[12px] text-c-muted">{LABEL[l.level]}</span>
          {l.chance === null
            ? <span className="text-[11px] text-c-ghost">not sampled</span>
            : <Meter value={l.chance} title={`${LABEL[l.level]}: ${Math.round(l.chance * 100)}% on a medium item, ${l.correct} of ${l.n} right`} />}
          <span className="font-mono text-[11px] text-c-faint text-right">{l.n > 0 ? `${l.correct}/${l.n}` : ''}</span>
        </div>
      ))}
    </div>
  )
}
