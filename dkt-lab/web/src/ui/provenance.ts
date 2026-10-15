import { h } from './dom'
import type { DatasetEntry } from '../data'

// One-line provenance strip shown on every page that uses a dataset.
export function provenance(d: DatasetEntry): HTMLElement {
  const isUrl = /^https?:/.test(d.source_url)
  return h('div.prov', { role: 'note', 'aria-label': 'Dataset provenance' },
    h(`span.badge.${d.kind}`, d.kind_label),
    h('strong', d.name),
    h('span', 'Source: ', isUrl ? h('a', { href: d.source_url, target: '_blank', rel: 'noopener' }, hostOf(d.source_url)) : h('code', d.source_url)),
    d.downloaded_from ? h('span.muted', `Retrieved via: ${d.downloaded_from}`) : null,
    h('span.muted', `Licence: ${short(d.licence)}`),
  )
}

function hostOf(url: string): string {
  try { return new URL(url).host + new URL(url).pathname.replace(/\/$/, '').slice(0, 40) } catch { return url }
}

function short(s: string): string {
  const first = s.split('. ')[0]
  return first.length < s.length ? first + '.' : s
}
