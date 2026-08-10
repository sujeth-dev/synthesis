'use client'

import { useEffect, useMemo, useState } from 'react'
import { mdToHtml } from '@/components/ui/mdToHtml'
import { splitExplanationSteps } from '@/lib/ui/explanation-steps'

export function ProgressiveExplanation({
  body,
  onComplete,
}: {
  body: string
  onComplete?: () => void
}) {
  const steps = useMemo(() => splitExplanationSteps(body), [body])
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => setVisibleCount(0), [body])

  function revealNext() {
    const nextCount = Math.min(steps.length, visibleCount + 1)
    setVisibleCount(nextCount)
    if (nextCount === steps.length) onComplete?.()
  }

  const complete = steps.length > 0 && visibleCount === steps.length

  return (
    <div className="space-y-4">
      {visibleCount > 0 && (
        <div className="space-y-4" aria-live="polite">
          {steps.slice(0, visibleCount).map((step, index) => (
            <div
              key={`${index}-${step.slice(0, 24)}`}
              className="rounded-xl border border-[var(--border)] bg-c-bg3 px-5 py-4 animate-slide-up"
            >
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-c-faint">
                Building block {index + 1} of {steps.length}
              </p>
              <div
                className="prose-synaptic font-reading text-[14px] leading-[1.8] text-c-muted"
                dangerouslySetInnerHTML={{ __html: mdToHtml(step) }}
              />
            </div>
          ))}
        </div>
      )}

      {!complete && steps.length > 0 && (
        <button
          type="button"
          onClick={revealNext}
          className="inline-flex items-center gap-2 rounded-lg border border-c-purple/30 bg-c-purple/10 px-4 py-2 text-[12px] font-mono uppercase tracking-[0.12em] text-c-purple transition-colors hover:bg-c-purple/20"
        >
          {visibleCount === 0 ? 'Start with the first idea' : 'Reveal the next idea'}
          <span aria-hidden="true">→</span>
        </button>
      )}

      {complete && (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-c-green">
          ✓ Explanation complete
        </p>
      )}
    </div>
  )
}
