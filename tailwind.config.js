/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)', 'Arial', 'sans-serif'],
        serif: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-label)', 'ui-monospace', 'monospace'],
        reading: ['var(--font-reading)', 'Georgia', 'serif'],
      },
      colors: {
        /* CSS-variable-backed semantic palette */
        'c-bg':     'var(--bg)',
        'c-bg2':    'var(--bg2)',
        'c-bg3':    'var(--bg3)',
        'c-bg4':    'var(--bg4)',
        'c-text':   'var(--text)',
        'c-muted':  'var(--text-muted)',
        'c-faint':  'var(--text-faint)',
        'c-ghost':  'var(--text-ghost)',
        'c-purple': 'var(--purple)',
        'c-green':  'var(--green)',
        'c-yellow': 'var(--yellow)',
        'c-red':    'var(--red)',
        'c-blue':   'var(--blue)',
        'c-gold':   'var(--gold)',
        'c-orange': 'var(--orange)',
      },
      animation: {
        'fade-in':  'fadeIn 0.3s ease forwards',
        'slide-up': 'slideUp 0.35s ease forwards',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
