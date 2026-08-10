'use client'
import { useState } from 'react'
import {
  initFeynmanLoop,
  beginCharacterEntry,
  beginTeachingCanvas,
  submitFirstExplanation,
  advanceToBreakdown,
  advanceFromBreakdown,
  advanceFromGapCallout,
  submitSecondExplanation,
  advanceToSummary,
  loopResolved,
  gapSummary,
  type FeynmanLoopState,
  type RohanExpression,
} from '@/lib/feynman/loop'
import { rohanOpening, rohanFollowUp, rohanGapCallout, rohanResolution, ROHAN_BREAKDOWN_QUESTION } from '@/lib/feynman/dialogue'
import { explanationWordCount } from '@/lib/feynman/classifier'

const MIN_WORDS = 8

const EXPRESSION_STYLE: Record<RohanExpression, string> = {
  neutral:   'text-c-faint',
  curious:   'text-c-blue',
  confused:  'text-c-yellow',
  thinking:  'text-c-faint',
  aha:       'text-c-green',
  satisfied: 'text-c-green',
}

interface Props {
  skillLabel: string
  onComplete: (result: { resolved: boolean; firstExplanation: string; secondExplanation: string }) => void
  onSkip?: () => void
}

function RohanTag({ expression }: { expression: RohanExpression }) {
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.14em] mb-2 ${EXPRESSION_STYLE[expression]}`}>
      Rohan · {expression}
    </p>
  )
}

function RohanLine({ state, text }: { state: FeynmanLoopState; text: string }) {
  return (
    <div className="rounded-xl bg-c-bg3 border border-[var(--border)] px-5 py-4 mb-4 animate-slide-up">
      <RohanTag expression={state.rohanExpression} />
      <p className="text-[14px] text-c-text leading-[1.6] whitespace-pre-line">{text}</p>
    </div>
  )
}

function ContinueButton({ onClick, label = 'Continue →' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 rounded-xl bg-c-purple hover:bg-[var(--purple-hover)] text-white text-[13px] font-medium transition-all hover:scale-[1.01]"
    >
      {label}
    </button>
  )
}

function TeachingCanvas({
  hint, value, onChange, onSubmit,
}: {
  hint: string; value: string; onChange: (v: string) => void; onSubmit: () => void
}) {
  const words = explanationWordCount(value)
  const canSubmit = words >= MIN_WORDS
  return (
    <div className="animate-slide-up">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={6}
        placeholder={hint}
        className="w-full px-4 py-3.5 rounded-xl bg-c-bg3 border border-[var(--border)] text-c-text placeholder:text-c-ghost text-[13px] focus:border-c-blue/50 focus:outline-none resize-none transition-colors mb-2"
      />
      <p className="font-mono text-[10px] text-c-ghost mb-3">{words} / {MIN_WORDS} minimum</p>
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-3 rounded-xl bg-c-blue/15 border border-c-blue/30 text-c-blue text-[13px] font-medium hover:bg-c-blue/25 transition-all disabled:opacity-40"
      >
        Explain to Rohan →
      </button>
    </div>
  )
}

export function FeynmanLoop({ skillLabel, onComplete, onSkip }: Props) {
  const [state, setState] = useState<FeynmanLoopState>(() => initFeynmanLoop(skillLabel))
  const [draft1, setDraft1] = useState('')
  const [draft2, setDraft2] = useState('')

  return (
    <div className="rounded-2xl bg-c-bg2 border border-[var(--border)] overflow-hidden animate-slide-up">
      <div className="px-6 pt-6 pb-6">
        <p className="font-mono text-[10px] text-c-purple uppercase tracking-[0.16em] mb-3">Feynman Loop</p>

        {state.step === 'intro' && (
          <div className="animate-slide-up">
            <p className="text-[14px] text-c-text leading-[1.7] mb-5">
              Your score on <span className="italic">{skillLabel}</span> suggests it's not clicking yet.
              Instead of answering more questions, you're going to teach this concept to Rohan.
              Teaching forces you to find the gaps in your own understanding.
            </p>
            <ContinueButton label="Begin →" onClick={() => setState(beginCharacterEntry(state))} />
          </div>
        )}

        {state.step === 'character_entry' && (
          <div>
            <RohanLine state={state} text={rohanOpening(skillLabel)} />
            <ContinueButton onClick={() => setState(beginTeachingCanvas(state))} />
          </div>
        )}

        {state.step === 'canvas_1' && (
          <TeachingCanvas
            hint={`Explain ${skillLabel} to Rohan — use any words, any example, whatever helps him understand.`}
            value={draft1}
            onChange={setDraft1}
            onSubmit={() => setState(submitFirstExplanation(state, draft1))}
          />
        )}

        {state.step === 'follow_up' && state.firstCategory && (
          <div>
            <RohanLine state={state} text={rohanFollowUp(state.firstCategory, skillLabel)} />
            <ContinueButton onClick={() => setState(advanceToBreakdown(state))} />
          </div>
        )}

        {state.step === 'breakdown' && (
          <div>
            <RohanLine state={state} text={ROHAN_BREAKDOWN_QUESTION} />
            <ContinueButton onClick={() => setState(advanceFromBreakdown(state))} />
          </div>
        )}

        {state.step === 'gap_callout' && (
          <div>
            <div className="rounded-xl bg-c-yellow/[0.08] border border-c-yellow/25 px-5 py-4 mb-4 animate-slide-up">
              <p className="font-mono text-[10px] text-c-yellow uppercase tracking-[0.14em] mb-2">The gap</p>
              <p className="text-[13px] text-c-text leading-[1.6] whitespace-pre-line">{rohanGapCallout(skillLabel)}</p>
            </div>
            <ContinueButton label="Try again →" onClick={() => setState(advanceFromGapCallout(state))} />
          </div>
        )}

        {state.step === 'canvas_2' && (
          <TeachingCanvas
            hint="Give Rohan one concrete, real situation where this matters — not the steps, the situation."
            value={draft2}
            onChange={setDraft2}
            onSubmit={() => setState(submitSecondExplanation(state, draft2))}
          />
        )}

        {state.step === 'resolution' && (
          <div>
            <RohanLine state={state} text={rohanResolution(loopResolved(state))} />
            <ContinueButton onClick={() => setState(advanceToSummary(state))} />
          </div>
        )}

        {state.step === 'summary' && (
          <div className="animate-slide-up">
            <p className={`text-[14px] font-medium mb-3 ${loopResolved(state) ? 'text-c-green' : 'text-c-muted'}`}>
              {loopResolved(state) ? '✓ Feynman Loop complete — Rohan understood.' : 'Feynman Loop complete — the gap is still open.'}
            </p>
            <div className="rounded-xl bg-c-bg3 border border-[var(--border)] px-5 py-4 mb-5">
              <p className="font-mono text-[10px] text-c-faint uppercase tracking-[0.14em] mb-1.5">The gap you found</p>
              <p className="text-[13px] text-c-muted leading-[1.6]">{gapSummary(state)}</p>
            </div>
            <ContinueButton
              label="Finish →"
              onClick={() => onComplete({
                resolved: loopResolved(state),
                firstExplanation: state.firstExplanation ?? '',
                secondExplanation: state.secondExplanation ?? '',
              })}
            />
          </div>
        )}

        {onSkip && state.step !== 'summary' && (
          <button
            onClick={onSkip}
            className="w-full mt-2 py-2 text-c-ghost hover:text-c-faint text-[11px] font-mono transition-colors"
          >
            Skip this construct
          </button>
        )}
      </div>
    </div>
  )
}
