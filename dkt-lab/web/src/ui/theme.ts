// Light/dark theme. The choice is a per-viewer convenience, so storage
// failures (private mode, blocked storage) silently fall back to the OS.
const KEY = 'dkt-lab-theme'
type Theme = 'light' | 'dark'
const listeners: (() => void)[] = []

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function onThemeChange(fn: () => void): void {
  listeners.push(fn)
}

export function initTheme(button: HTMLElement): void {
  const s = stored()
  if (s) document.documentElement.dataset.theme = s
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => listeners.forEach(f => f()))
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(KEY, next) } catch { /* per-viewer only */ }
    listeners.forEach(f => f())
  })
}

// Read a CSS custom property (resolved for the current theme).
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
