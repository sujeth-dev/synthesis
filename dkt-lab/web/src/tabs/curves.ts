import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { int } from '../ui/format'
import { provenance } from '../ui/provenance'
import { loadCurves } from '../data'
import { canvas } from './models'
import type { TabContext } from '../main'

export async function renderCurves(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) return
  const cv = await loadCurves(d.id)
  const c1 = canvas('Learning curve: actual vs BKT vs DKT by practice opportunity')
  const c2 = canvas('Number of answers at each opportunity')
  root.append(h('h1', 'Learning curves'), provenance(d),
    h('p.lede', 'Average P(correct) on a student’s n-th attempt at a skill, for held-out students: the observed rate, and the mean prediction of each model made before seeing that answer. A model that tracks learning well follows the black line.'),
    h('div.card', h('div.legend', h('span.key.actual', 'Actual'), h('span.key.bkt', 'BKT predicted'), h('span.key.dkt', 'DKT predicted')), h('div.chart.tall', c1)),
    h('div.card', { style: { marginTop: '16px' } }, h('h3', 'Answers per opportunity'), h('p.small.muted', `Opportunities with fewer than ${cv.min_rows} answers are not plotted. Later points average fewer, more persistent students (selection effect).`), h('div.chart.short', c2)),
    h('div.card', { style: { marginTop: '16px' } }, h('div.table-wrap', h('table',
      h('thead', h('tr', ['Opportunity', 'Answers', 'Actual', 'BKT', 'DKT'].map((t, i) => h(i ? 'th.num' : 'th', t)))),
      h('tbody', cv.points.map(p => h('tr', h('td', String(p.opportunity)), h('td.num', int(p.n)), h('td.num', p.actual.toFixed(3)), h('td.num.bkt-c', p.bkt.toFixed(3)), h('td.num.dkt-c', p.dkt.toFixed(3))))))))
  )
  chart(c1, () => {
    const c = palette()
    const ds = (label: string, data: number[], color: string, dash: number[] = []) => ({ label, data, borderColor: color, backgroundColor: color, borderDash: dash, pointRadius: 2.5, borderWidth: 2 })
    return {
      type: 'line',
      data: { labels: cv.points.map(p => p.opportunity), datasets: [ds('Actual', cv.points.map(p => p.actual), c.actual), ds('BKT', cv.points.map(p => p.bkt), c.bkt, [6, 3]), ds('DKT', cv.points.map(p => p.dkt), c.dkt, [2, 2])] },
      options: { scales: { x: { title: { display: true, text: 'practice opportunity on the skill' } }, y: { title: { display: true, text: 'P(correct)' } } } },
    }
  })
  chart(c2, () => ({
    type: 'bar',
    data: { labels: cv.points.map(p => p.opportunity), datasets: [{ data: cv.points.map(p => p.n), backgroundColor: palette().ink3, borderRadius: 2 }] },
    options: { scales: { x: { grid: { display: false }, title: { display: true, text: 'opportunity' } }, y: { title: { display: true, text: 'answers' } } } },
  }))
}
