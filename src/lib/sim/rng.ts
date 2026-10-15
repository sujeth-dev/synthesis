// Seeded PRNG for the learner simulator. Every simulation run must be exactly
// reproducible from its seed, so nothing in src/lib/sim may call Math.random.

export interface Rng {
  next(): number
  normal(mean?: number, sd?: number): number
  logNormal(median: number, sigma: number): number
  pick<T>(items: readonly T[]): T
}

// mulberry32 — small, fast, and good enough for simulation (not cryptography).
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = (mean = 0, sd = 1) => {
    // Box-Muller; 1 - next() keeps the log argument in (0, 1].
    const u = 1 - next()
    const v = next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return {
    next,
    normal,
    logNormal: (median, sigma) => median * Math.exp(normal(0, sigma)),
    pick: items => items[Math.floor(next() * items.length)],
  }
}
