'use client'

import type { Explanation, ExplanationDepth, SessionTask } from '@/types'
import { ProgressiveExplanation } from '@/components/learning/ProgressiveExplanation'

export function GuidedLesson({
  task,
  explanation,
  depth,
  onComplete,
}: {
  task: SessionTask
  explanation: Explanation
  depth: ExplanationDepth
  onComplete: () => void
}) {
  const lessonBody = explanation.key_insight
    ? `## Core idea\n\n${explanation.key_insight}\n\n${explanation.body}`
    : explanation.body

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--border)] border-t-4 border-t-c-purple bg-c-bg2 shadow-[0_24px_70px_rgba(19,45,38,0.08)]">
      <header className="border-b border-[var(--border)] px-7 py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-c-purple">Guided lesson</p>
          <span className="rounded-full border border-c-purple/20 bg-c-purple/[0.07] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-c-purple">
            {depth}
          </span>
        </div>
        <h1 className="font-serif text-[30px] italic leading-tight text-c-text">{explanation.title || task.skill_label}</h1>
        <p className="mt-3 max-w-2xl font-reading text-[14px] leading-[1.7] text-c-faint">{task.skill_intuition}</p>
      </header>

      <div className="px-7 py-6">
        <ProgressiveExplanation
          body={lessonBody}
          onComplete={onComplete}
          completeLabel="Finish lesson and start Beginner practice →"
        />
      </div>
    </section>
  )
}
