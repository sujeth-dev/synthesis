// Running AUC for the explainer (rank-based, ties averaged).
export function auc(pairs: { p: number; y: boolean }[]): number | null {
  const pos = pairs.filter(x => x.y).length
  const neg = pairs.length - pos
  if (!pos || !neg) return null
  const sorted = [...pairs].sort((a, b) => a.p - b.p)
  let rankSum = 0
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].p === sorted[i].p) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) if (sorted[k].y) rankSum += avg
    i = j + 1
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg)
}
