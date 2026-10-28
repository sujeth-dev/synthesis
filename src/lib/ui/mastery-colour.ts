import type { MasteryState } from '@/types'

// The one mastery palette (OLM-1). Previously restated in dashboard/page.tsx,
// GraphView.tsx and graph/page.tsx's legend; the values happened to agree, but
// three copies is how they stop agreeing. Hex rather than CSS variables because
// callers append an alpha suffix (`colour + '22'`).
export const MASTERY_COLOUR: Record<MasteryState, string> = {
  mastered: '#4f8a5b',   // was #2f5d3a: 2.2:1 on the dark card; now 4.1:1 dark, 3.8:1 light
  fragile:  '#e8a84a',
  learning: '#e8a84a',
  ready:    '#d96e34',
  blocked:  '#a8a49c',
}

export const MASTERY_LEGEND = [
  { color: MASTERY_COLOUR.mastered, label: 'Mastered' },
  { color: MASTERY_COLOUR.learning, label: 'Intermediate' },
  { color: MASTERY_COLOUR.ready,    label: 'Beginner' },
  { color: MASTERY_COLOUR.blocked,  label: 'Locked' },
]
