import { h, clear } from './ui/dom'
import { initTheme } from './ui/theme'
import { destroyCharts } from './ui/charts'
import { renderDatasets } from './tabs/datasets'
import { renderOverview } from './tabs/overview'
import { renderModels } from './tabs/models'
import { renderCurves } from './tabs/curves'
import { renderHeatmap } from './tabs/heatmap'
import { renderExplainer } from './tabs/explainer'
import { renderScheduling } from './tabs/scheduling'
import { renderReport } from './tabs/report'
import { renderMethod } from './tabs/method'
import { loadIndex, type DatasetEntry, type LabIndex } from './data'

export interface TabContext {
  index: LabIndex
  dataset: DatasetEntry | undefined
  setDataset: (id: string) => void
}

interface TabDef {
  id: string
  label: string
  render: (root: HTMLElement, ctx: TabContext) => void | Promise<void>
  usesDataset: boolean
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', render: renderOverview, usesDataset: true },
  { id: 'datasets', label: 'Datasets', render: renderDatasets, usesDataset: false },
  { id: 'models', label: 'Model comparison', render: renderModels, usesDataset: true },
  { id: 'curves', label: 'Learning curves', render: renderCurves, usesDataset: true },
  { id: 'heatmap', label: 'Skill heatmap', render: renderHeatmap, usesDataset: true },
  { id: 'explainer', label: 'How BKT & DKT work', render: renderExplainer, usesDataset: true },
  { id: 'scheduling', label: 'Scheduling', render: renderScheduling, usesDataset: false },
  { id: 'report', label: 'Report outputs', render: renderReport, usesDataset: true },
  { id: 'method', label: 'Method & limitations', render: renderMethod, usesDataset: false },
]

const main = document.getElementById('main')!
const nav = document.getElementById('tabs')!
const picker = document.getElementById('ds-picker') as HTMLSelectElement
initTheme(document.getElementById('theme-toggle')!)

let index: LabIndex = { generated_at: null, datasets: [] }
let datasetId: string | undefined

function readHash(): { tab: string; ds?: string } {
  const [tab, ds] = location.hash.replace(/^#\/?/, '').split('/')
  return { tab: TABS.some(t => t.id === tab) ? tab : 'overview', ds: ds || undefined }
}

function go(tab: string, ds = datasetId): void {
  const next = `#/${tab}${ds ? '/' + ds : ''}`
  if (location.hash !== next) location.hash = next
  else render()
}

function renderNav(active: string): void {
  clear(nav)
  TABS.forEach((t, i) => {
    nav.append(h('button.tab', {
      role: 'tab', type: 'button', 'aria-selected': String(t.id === active), id: `tab-${t.id}`,
      onclick: () => go(t.id),
    }, h('span.num', String(i + 1)), t.label))
  })
}

async function render(): Promise<void> {
  const { tab, ds } = readHash()
  if (ds && index.datasets.some(d => d.id === ds)) datasetId = ds
  datasetId ??= index.datasets[0]?.id
  picker.value = datasetId ?? ''
  const def = TABS.find(t => t.id === tab)!
  ;(document.getElementById('ds-picker-wrap') as HTMLElement).style.visibility = def.usesDataset && index.datasets.length ? 'visible' : 'hidden'
  renderNav(tab)
  destroyCharts()
  clear(main)
  main.setAttribute('aria-labelledby', `tab-${tab}`)
  try {
    await def.render(main, {
      index,
      dataset: index.datasets.find(d => d.id === datasetId),
      setDataset: id => go(tab, id),
    })
  } catch (err) {
    main.append(h('div.empty', `Could not load this section: ${(err as Error).message}`))
  }
}

picker.addEventListener('change', () => go(readHash().tab, picker.value))
window.addEventListener('hashchange', () => void render())

loadIndex()
  .then(i => { index = i })
  .catch(() => { /* empty lab: still render the shell */ })
  .finally(() => {
    clear(picker)
    for (const d of index.datasets) picker.append(h('option', { value: d.id }, `${d.name} · ${d.kind_label}`))
    void render()
  })
