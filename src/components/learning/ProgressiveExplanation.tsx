'use client'

import { useEffect, useMemo, useState } from 'react'
import { mdToHtml } from '@/components/ui/mdToHtml'
import { splitExplanationSteps } from '@/lib/ui/explanation-steps'

export function ProgressiveExplanation({
  body,
  onComplete,
  completeLabel = 'Finish explanation →',
}: {
  body: string
  onComplete?: () => void
  completeLabel?: string
}) {
  const steps = useMemo(() => splitExplanationSteps(body), [body])
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => setCurrentIndex(0), [body])

  function advance() {
    if (currentIndex >= steps.length - 1) {
      onComplete?.()
      return
    }
    setCurrentIndex(index => index + 1)
  }

  if (steps.length === 0) return null

  const progress = ((currentIndex + 1) / steps.length) * 100

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-c-faint">
          Lesson slide {currentIndex + 1} of {steps.length}
        </p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-c-bg4" aria-hidden="true">
          <div className="h-full rounded-full bg-c-purple transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div
        key={`${currentIndex}-${steps[currentIndex].slice(0, 24)}`}
        className="min-h-[230px] rounded-2xl border border-[var(--border)] bg-c-bg3 px-6 py-6 animate-slide-up"
        aria-live="polite"
      >
        <div
          className="prose-synaptic font-reading text-[15px] leading-[1.85] text-c-muted"
          dangerouslySetInnerHTML={{ __html: mdToHtml(steps[currentIndex]) }}
        />
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-3">
        <button
          type="button"
          onClick={() => setCurrentIndex(index => Math.max(0, index - 1))}
          disabled={currentIndex === 0}
          className="rounded-xl border border-[var(--border)] px-5 py-3 text-[13px] text-c-muted transition-colors hover:text-c-text disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={advance}
          className="rounded-xl bg-c-purple px-5 py-3 text-[14px] font-medium text-white transition-all hover:bg-[var(--purple-hover)]"
        >
          {currentIndex === steps.length - 1 ? completeLabel : 'Next slide →'}
        </button>
      </div>
    </div>
  )
}
