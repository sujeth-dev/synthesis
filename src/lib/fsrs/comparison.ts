// Pure summary statistics over fsrs_shadow_log rows, used by
// scripts/fsrs-shadow-comparison.js (FSRS-4) to compare what FSRS would have
// scheduled against what SM-2 actually scheduled. Kept separate from any DB
// access so it's directly unit-testable against synthetic data.

export interface ShadowComparisonInput {
  sm2_interval_days: number
  fsrs_interval_days: number
}

export interface ShadowComparisonResult {
  count: number
  mean_sm2_interval_days: number
  mean_fsrs_interval_days: number
  mean_absolute_delta_days: number
  // Positive = FSRS scheduled longer than SM-2 on average.
  mean_signed_delta_days: number
  // Pearson r between SM-2 and FSRS intervals; null when there are fewer
  // than 2 points or either series has zero variance (correlation undefined).
  interval_correlation: number | null
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 2) return null
  const mx = mean(xs)
  const my = mean(ys)
  let numerator = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    numerator += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  if (dx2 === 0 || dy2 === 0) return null
  return numerator / Math.sqrt(dx2 * dy2)
}

export function computeShadowDivergence(entries: ShadowComparisonInput[]): ShadowComparisonResult {
  if (entries.length === 0) {
    return {
      count: 0, mean_sm2_interval_days: 0, mean_fsrs_interval_days: 0,
      mean_absolute_delta_days: 0, mean_signed_delta_days: 0, interval_correlation: null,
    }
  }
  const sm2 = entries.map(e => e.sm2_interval_days)
  const fsrs = entries.map(e => e.fsrs_interval_days)
  const deltas = entries.map(e => e.fsrs_interval_days - e.sm2_interval_days)
  return {
    count: entries.length,
    mean_sm2_interval_days: mean(sm2),
    mean_fsrs_interval_days: mean(fsrs),
    mean_absolute_delta_days: mean(deltas.map(Math.abs)),
    mean_signed_delta_days: mean(deltas),
    interval_correlation: pearsonCorrelation(sm2, fsrs),
  }
}

// A real cutover recommendation (FSRS-5) needs a sample large enough for the
// summary stats above to mean anything — this only flags whether that bar is
// met, it never itself renders a "cutover: yes/no" verdict.
export const MIN_SAMPLE_FOR_SIGNAL = 30

export function hasSufficientSample(result: ShadowComparisonResult): boolean {
  return result.count >= MIN_SAMPLE_FOR_SIGNAL
}
