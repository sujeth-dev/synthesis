// Prediction-quality metrics shared by the simulator reports.

export interface Prediction { predicted: number; actual: boolean }

const EPS = 1e-6

export function logLoss(predictions: Prediction[]): number {
  if (predictions.length === 0) return NaN
  let sum = 0
  for (const { predicted, actual } of predictions) {
    const p = Math.min(1 - EPS, Math.max(EPS, predicted))
    sum += actual ? -Math.log(p) : -Math.log(1 - p)
  }
  return sum / predictions.length
}

// Rank-based AUC (Mann-Whitney U) with average ranks for ties.
export function auc(predictions: Prediction[]): number {
  const positives = predictions.filter(p => p.actual).length
  const negatives = predictions.length - positives
  if (positives === 0 || negatives === 0) return NaN
  const sorted = [...predictions].sort((a, b) => a.predicted - b.predicted)
  let rankSumPositive = 0
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].predicted === sorted[i].predicted) j++
    const averageRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) if (sorted[k].actual) rankSumPositive += averageRank
    i = j + 1
  }
  return (rankSumPositive - (positives * (positives + 1)) / 2) / (positives * negatives)
}

export function mean(values: number[]): number {
  return values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length
}
