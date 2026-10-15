export const int = (n: number) => Math.round(n).toLocaleString('en-US')
export const f3 = (n: number) => n.toFixed(3)
export const f4 = (n: number) => n.toFixed(4)
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`
export const signed = (n: number, d = 3) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`
