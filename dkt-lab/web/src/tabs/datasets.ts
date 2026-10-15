import { h } from '../ui/dom'
import { chart, palette } from '../ui/charts'
import { int, pct } from '../ui/format'
import { provenance } from '../ui/provenance'
import { loadStats } from '../data'
import type { TabContext } from '../main'

export async function renderDatasets(root: HTMLElement, ctx: TabContext): Promise<void> {
  root.append(
    h('h1', 'Datasets'),
    h('p.lede', 'Every dataset is converted to one schema — student_id, skill_id, correct, order — and split 70/15/15 by student with a fixed seed, so no student appears in more than one split. Real and synthetic data are labelled everywhere they appear.'),
  )
  const all = await Promise.all(ctx.index.datasets.map(d => loadStats(d.id)))

  const table = h('table',
    h('thead', h('tr', ['Dataset', 'Type', 'Students', 'Skills', 'Interactions', '% correct', 'Median length', 'p90 length', 'Train / val / test students']
      .map((t, i) => h(i >= 2 && i <= 7 ? 'th.num' : 'th', t)))),
    h('tbody', all.map(({ provenance: p, stats: s }) => h('tr',
      h('td', h('strong', p.name)),
      h('td', h(`span.badge.${p.kind}`, p.kind_label)),
      h('td.num', int(s.students)), h('td.num', int(s.skills)), h('td.num', int(s.interactions)),
      h('td.num', pct(s.pct_correct)), h('td.num', String(s.sequence_length.median)), h('td.num', String(Math.round(s.sequence_length.p90))),
      h('td.mono.small', `${int(s.split.train.students)} / ${int(s.split.val.students)} / ${int(s.split.test.students)}`),
    ))),
  )
  root.append(h('div.card', h('div.table-wrap', table)))

  for (const { provenance: p, stats: s } of all) {
    const canvas = h('canvas', { role: 'img', 'aria-label': `Sequence-length distribution for ${p.name}` }) as HTMLCanvasElement
    const edges = s.sequence_length.hist.edges
    const labels = s.sequence_length.hist.counts.map((_, i) => edges[i + 1] - 1 > edges[i] ? `${edges[i]}–${edges[i + 1] - 1}` : `${edges[i]}`)
    root.append(
      h('h2', { id: `ds-${p.id}` }, p.name),
      provenance(p),
      h('div.grid.cols-2',
        h('div.card',
          h('h3', 'Sequence length per student'),
          h('p.small.muted', `min ${s.sequence_length.min} · p25 ${s.sequence_length.p25} · median ${s.sequence_length.median} · p75 ${s.sequence_length.p75} · max ${int(s.sequence_length.max)} · mean ${s.sequence_length.mean.toFixed(1)} (log-spaced bins)`),
          h('div.chart.short', canvas)),
        h('div.card',
          h('h3', 'Most practised skills'),
          h('div.table-wrap', h('table',
            h('thead', h('tr', h('th', 'Skill'), h('th.num', 'Attempts'), h('th.num', '% correct'))),
            h('tbody', s.top_skills.slice(0, 8).map(k => h('tr', h('td', k.label), h('td.num', int(k.count)), h('td.num', pct(k.pct_correct)))))))),
      ),
      h('div.card', { style: { marginTop: '16px' } },
        h('h3', 'Provenance'),
        h('dl.small', 
          h('dt.muted', 'Licence'), h('dd', p.licence),
          h('dt.muted', 'Citation'), h('dd', p.citation),
          p.download_url ? [h('dt.muted', 'Download URL used'), h('dd', h('code', p.download_url))] : null,
          h('dt.muted', 'Conversion notes'), h('dd', h('ul', p.notes.map(n => h('li', n)))),
          h('dt.muted', 'Time features'), h('dd', p.has_timestamps ? 'Available (real or simulated timestamps).' : 'Not available: no timestamps in this data.'),
          h('dt.muted', 'Skill trimming'), h('dd', p.skill_trimming ? `Kept the ${p.skill_trimming.skills_after} most frequent of ${p.skill_trimming.skills_before} skills.` : `None (${s.skills} skills ≤ 300).`),
        )),
    )
    chart(canvas, () => {
      const c = palette()
      return {
        type: 'bar',
        data: { labels, datasets: [{ data: s.sequence_length.hist.counts, backgroundColor: c.ink3, borderRadius: 2 }] },
        options: { scales: { x: { title: { display: true, text: 'interactions per student' }, grid: { display: false } }, y: { title: { display: true, text: 'students' } } } },
      }
    })
  }

  if (ctx.index.skipped?.length) {
    root.append(h('h2', 'Datasets considered and skipped'),
      h('div.card', h('ul', ctx.index.skipped.map(s => h('li', h('strong', s.name), ' — ', s.reason, s.url ? [' ', h('code.small', s.url)] : null)))))
  }
}
