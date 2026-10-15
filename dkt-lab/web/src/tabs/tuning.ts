import { h } from '../ui/dom'

// Filled in by Lab 6 (DKT tuning experiments); only rendered once dkt_tuning.json exists.
export function renderTuning(root: HTMLElement, _t: unknown): void {
  root.append(h('h2', 'DKT tuning'))
}
