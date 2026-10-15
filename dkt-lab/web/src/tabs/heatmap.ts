import { h } from '../ui/dom'
import { provenance } from '../ui/provenance'
import { loadHeatmap } from '../data'
import type { TabContext } from '../main'

// Colour ramp from the surface colour to the model colour, so BKT stays blue
// and DKT stays rust; value printed in the tooltip.
function cell(v: number, model: 'bkt' | 'dkt', practised: number, label: string): HTMLElement {
  return h('div.cell', {
    style: { background: `color-mix(in srgb, var(--${model}) ${Math.round(v * 100)}%, var(--surface-2))`, outline: practised ? '' : '1px dashed var(--line)', outlineOffset: '-1px' },
    title: `${label}: ${(v * 100).toFixed(1)}% (${practised ? `practised ${practised}×` : 'never practised'})`,
  })
}

export async function renderHeatmap(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) return
  const hm = await loadHeatmap(d.id)
  root.append(h('h1', 'Skill heatmap'), provenance(d),
    h('p.lede', `Predicted P(correct) on the next attempt for ${hm.students.length} held-out students (rows) on the ${hm.skills.length} most-practised skills (columns), after each student’s full sequence. Dashed cells: the student never practised that skill — BKT can only show its prior there, DKT infers from other skills.`),
    h('div.row.small', h('span.scale', 'P(correct) 0', h('span.bar', { style: { background: 'linear-gradient(90deg, var(--surface-2), var(--bkt))' } }), '1 BKT'),
      h('span.scale', '0', h('span.bar', { style: { background: 'linear-gradient(90deg, var(--surface-2), var(--dkt))' } }), '1 DKT')))

  const grid = (model: 'bkt' | 'dkt') => {
    const g = h('div.heat', { style: { gridTemplateColumns: `minmax(46px, 70px) repeat(${hm.skills.length}, minmax(8px, 1fr))` }, role: 'img', 'aria-label': `${model.toUpperCase()} predicted mastery heatmap` })
    for (const s of hm.students) {
      g.append(h('div.rowlab', { title: `student ${s.student_id}, ${s.length} answers` }, s.student_id.slice(-6)))
      s[model].forEach((v, i) => g.append(cell(v, model, s.practised[i], hm.skills[i].label)))
    }
    return g
  }
  root.append(h('div.grid.cols-2', { style: { marginTop: '12px' } },
    h('div.card.side.bkt', h('h3', 'BKT', h('span.small.muted', 'independent per skill')), grid('bkt')),
    h('div.card.side.dkt', h('h3', 'DKT', h('span.small.muted', 'whole history, all skills')), grid('dkt'))),
    h('div.card', { style: { marginTop: '16px' } }, h('h3', 'Columns'), h('ol.small', hm.skills.map(s => h('li', s.label)))))

  // Spread across students within each skill column, never-practised cells only.
  const sd = (xs: number[]) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) }
  const within = (model: 'bkt' | 'dkt') => {
    const per = hm.skills.map((_, i) => hm.students.filter(s => !s.practised[i]).map(s => s[model][i])).filter(xs => xs.length >= 2)
    return per.length ? per.reduce((a, xs) => a + sd(xs), 0) / per.length : 0
  }
  const nUn = hm.students.reduce((a, s) => a + s.practised.filter(p => !p).length, 0)
  if (nUn) {
    root.append(h('p.small.muted', `${nUn} of ${hm.students.length * hm.skills.length} cells are never-practised. Within a skill, the spread of those cells across students averages s.d. ${within('bkt').toFixed(3)} for BKT (always its prior, so 0) and ${within('dkt').toFixed(3)} for DKT (inferred from each student’s other answers).`))
  }
}
