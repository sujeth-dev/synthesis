'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [isLight, setIsLight] = useState(false)

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggleTheme() {
    const next = !isLight
    setIsLight(next)
    if (next) {
      document.documentElement.classList.add('light')
      localStorage.setItem('synaptic-theme', 'light')
    } else {
      document.documentElement.classList.remove('light')
      localStorage.setItem('synaptic-theme', 'dark')
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/graph',     label: 'Graph' },
    { href: '/learn',     label: 'Study' },
    { href: '/engine',    label: 'Engine' },
    { href: '/profile',   label: 'Profile' },
  ]

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-8 py-3 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-xl transition-colors">
      <Link href="/dashboard" className="font-serif italic text-[20px] text-c-text hover:text-c-purple transition-colors">
        Synaptic<span className="text-c-purple">.</span>
      </Link>

      <nav className="flex items-center gap-1">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              pathname.startsWith(l.href)
                ? 'text-c-text bg-[var(--border-hi)]'
                : 'text-c-faint hover:text-c-muted hover:bg-[var(--border)]'
            }`}>
            {l.label}
          </Link>
        ))}

        {/* Theme toggle — SVG icon, proper tap target */}
        <button
          onClick={toggleTheme}
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          className="ml-1 w-9 h-9 flex items-center justify-center rounded-lg text-c-faint hover:text-c-muted hover:bg-[var(--border)] transition-colors"
          title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {isLight ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="ml-1 px-3.5 py-2 rounded-lg text-[13px] text-c-faint hover:text-c-muted hover:bg-[var(--border)] transition-colors"
        >
          Logout
        </button>
      </nav>
    </header>
  )
}
