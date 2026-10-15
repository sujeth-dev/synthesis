import { h } from '../ui/dom'
import { int, f3 } from '../ui/format'
import { provenance } from '../ui/provenance'
import { verdict } from '../ui/verdict'
import { loadMetrics, loadStats } from '../data'
import type { TabContext } from '../main'

export async function renderOverview(root: HTMLElement, ctx: TabContext): Promise<void> {
  const d = ctx.dataset
  if (!d) { root.append(h('div.empty', 'No datasets exported yet.')); return }
  const [{ stats: s }, m] = await Promise.all([loadStats(d.id), loadMetrics(d.id)])
  root.append(
    h('h1', 'Does a deep model beat the classic one?'),
    h('p.lede', 'Bayesian Knowledge Tracing keeps one small, interpretable model per skill. Deep Knowledge Tracing feeds a learner’s whole history through an LSTM and predicts every skill at once. Both are trained on the same students and scored on the same held-out answers.'),
    h('label.row.small', { style: { marginBottom: '12px' } }, h('span.muted', 'Dataset'),
      h('select', { onchange: (e: Event) => ctx.setDataset((e.target as HTMLSelectElement).value) },
        ctx.index.datasets.map(x => h('option', { value: x.id, selected: x.id === d.id }, `${x.name} · ${x.kind_label}`)))),
    provenance(d),
    h('div.grid.tiles',
      tile('Students', int(s.students)), tile('Skills', int(s.skills)), tile('Interactions', int(s.interactions)),
      tile('BKT AUC', f3(m.bkt.auc), 'bkt'), tile('DKT AUC', f3(m.dkt.auc), 'dkt')),
    h('p.verdict', verdict(m)),
    h('p.small.muted', `Scored on ${int(m.bkt.n)} held-out answers from ${int(m.test_students)} test students. Protocol: ${m.protocol}.`),
    h('h2', 'Where to go next'),
    h('div.grid.cols-3',
      link('Model comparison', 'All four metrics, ROC curves, per-skill AUC and the cross-dataset table.', 'models'),
      link('How BKT & DKT work', 'Step through a real held-out student and watch both models update live, in your browser.', 'explainer'),
      link('Method & limitations', 'What these numbers can and cannot tell you.', 'method')),
  )

  function link(title: string, text: string, tab: string) {
    return h('a.card', { href: `#/${tab}/${d!.id}`, style: { textDecoration: 'none', color: 'inherit' } }, h('h3', title, h('span.muted', '→')), h('p.small.muted', { style: { margin: 0 } }, text))
  }
}

function tile(label: string, value: string, cls = ''): HTMLElement {
  return h(`div.card.tile${cls ? '.' + cls : ''}`, h('div.label', label), h('div.value', value))
}
