'use client'

import { useState } from 'react'
import { mdToHtml } from '@/components/ui/mdToHtml'

export function ProgressiveExplanation({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-c-purple/30 bg-c-purple/10 px-4 py-2 text-[12px] font-mono uppercase tracking-[0.12em] text-c-purple transition-colors hover:bg-c-purple/20"
      >
        {expanded ? 'Hide full explanation' : 'Read full explanation'}
        <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
      </button>

      {expanded && (
        <div
          className="prose-synaptic mt-5 font-reading text-[14px] leading-[1.8] text-c-muted"
          dangerouslySetInnerHTML={{ __html: mdToHtml(body) }}
        />
      )}
    </div>
  )
}
