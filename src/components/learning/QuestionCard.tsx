'use client'
import type { Question } from '@/types'

interface Props {
  question:     Question
  selected:     string | null
  fillAnswer:   string
  revealed:     boolean
  onSelect:     (id: string) => void
  onFillChange: (val: string) => void
}

export function QuestionCard({ question: q, selected, fillAnswer, revealed, onSelect, onFillChange }: Props) {
  // Split stem into prose + optional code block
  const lines     = (q.stem || q.prompt || '').split('\n')
  const codeStart = lines.findIndex(
    l => l.startsWith('    ') || l.trim().startsWith('def ') || l.trim().startsWith('for ')
      || l.trim().startsWith('import ') || l.trim().startsWith('class ')
  )
  const prose = codeStart > 0 ? lines.slice(0, codeStart).join('\n') : (q.stem || q.prompt || '')
  const code  = codeStart > 0 ? lines.slice(codeStart).join('\n') : null

  return (
    <div>
      {/* Question stem — bigger: 17px */}
      <p className="font-reading text-[18px] text-c-text leading-[1.7] mb-5">{prose}</p>

      {/* Inline code block — bigger: 13px, more padding */}
      {code && (
        <pre className="text-[13px] text-c-muted bg-c-bg4 border border-[var(--border)] rounded-xl p-5 mb-6 overflow-x-auto font-mono leading-[1.8]">
          {code}
        </pre>
      )}

      {/* MCQ options — bigger: 15px text, larger padding */}
      {q.format === 'mcq' && q.options && (
        <div className="space-y-3">
          {q.options.map(opt => {
            const isSel = selected === opt.id
            const isOk  = revealed && opt.id === q.correct_option_id
            const isBad = revealed && isSel && opt.id !== q.correct_option_id

            let cls = 'w-full text-left px-5 py-4 rounded-xl border transition-all text-[15px] flex items-start gap-4 '
            if (isOk)       cls += 'border-c-green/50 bg-c-green/[0.10] text-c-green'
            else if (isBad) cls += 'border-c-red/50   bg-c-red/[0.10]   text-c-red'
            else if (isSel) cls += 'border-c-purple/60 bg-c-purple/[0.10] text-c-purple'
            else            cls += 'border-[var(--border)] bg-c-bg2 text-c-muted hover:border-[var(--border-hi)] hover:text-c-text cursor-pointer'

            return (
              <button key={opt.id} className={cls} onClick={() => !revealed && onSelect(opt.id)} disabled={revealed}>
                {/* Letter badge — larger, bolder */}
                <span className="font-mono text-[13px] font-semibold mt-0.5 opacity-70 flex-shrink-0 w-5 text-center">
                  {opt.id.toUpperCase()}
                </span>
                <span className="leading-[1.5]">{opt.text}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Fill-in — bigger: 15px */}
      {q.format === 'fill' && (
        <div>
          <input
            type="text"
            value={fillAnswer}
            onChange={e => onFillChange(e.target.value)}
            disabled={revealed}
            placeholder="Type your answer…"
            className="w-full px-5 py-3.5 rounded-xl bg-c-bg2 border border-[var(--border)] text-c-text placeholder:text-c-ghost text-[15px] focus:border-c-purple/50 focus:outline-none focus:ring-2 focus:ring-c-purple/25 disabled:opacity-60 transition-colors"
          />
          {revealed && (
            <p className="mt-2.5 text-[13px] text-c-faint font-mono">
              Expected: <span className="text-c-yellow font-semibold">{q.correct_answer}</span>
            </p>
          )}
        </div>
      )}

      {/* Explain — bigger textarea */}
      {q.format === 'explain' && (
        <textarea
          value={fillAnswer}
          onChange={e => onFillChange(e.target.value)}
          disabled={revealed}
          placeholder="Explain in your own words…"
          rows={5}
          className="w-full px-5 py-3.5 rounded-xl bg-c-bg2 border border-[var(--border)] font-reading text-c-text placeholder:text-c-ghost text-[15px] focus:border-c-purple/50 focus:outline-none focus:ring-2 focus:ring-c-purple/25 resize-none disabled:opacity-60 transition-colors leading-[1.6]"
        />
      )}
    </div>
  )
}
