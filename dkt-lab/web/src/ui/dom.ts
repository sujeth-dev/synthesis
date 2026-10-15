// Tiny DOM helper: h('div.card', {onclick}, children). No framework.
type Child = Node | string | number | null | undefined | false
type Attrs = Record<string, unknown>

export function h(tag: string, attrs?: Attrs | Child | Child[], ...children: (Child | Child[])[]): HTMLElement {
  const [name, ...classes] = tag.split('.')
  const el = document.createElement(name || 'div')
  if (classes.length) el.className = classes.join(' ')
  if (attrs !== undefined && (typeof attrs !== 'object' || attrs === null || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs as Child)
  } else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
      else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ')
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'html') el.innerHTML = String(v)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
  }
  append(el, children)
  return el
}

function append(el: HTMLElement, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c)
    else if (c === null || c === undefined || c === false) continue
    else el.append(c instanceof Node ? c : String(c))
  }
}

export function clear(el: HTMLElement): HTMLElement {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
