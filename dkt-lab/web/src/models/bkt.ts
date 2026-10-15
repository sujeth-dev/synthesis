// BKT in the browser: the classical Corbett & Anderson update with per-skill
// parameters fitted by EM offline (dkt-lab/pipeline/bkt.py, bkt_step()).
// Each skill is an independent two-state HMM; an answer on one skill never
// changes another skill's belief.

export interface BktParams { p_init: number; p_transit: number; p_slip: number; p_guess: number; p_forget?: number }

export interface BktStep {
  prior: number          // P(L) before the answer
  pCorrect: number       // predicted P(correct) = prior(1-slip) + (1-prior)guess
  likelihoodMastered: number    // P(answer | mastered)   = 1-slip or slip
  likelihoodUnmastered: number  // P(answer | unmastered) = guess or 1-guess
  evidence: number       // P(answer)
  posterior: number      // P(L | answer)
  next: number           // P(L) for the next attempt after the learn (and forget) transition
}

const EPS = 1e-4

export function pCorrect(belief: number, p: BktParams): number {
  return belief * (1 - p.p_slip) + (1 - belief) * p.p_guess
}

export function bktStep(prior: number, correct: boolean, p: BktParams): BktStep {
  const likelihoodMastered = correct ? 1 - p.p_slip : p.p_slip
  const likelihoodUnmastered = correct ? p.p_guess : 1 - p.p_guess
  const evidence = prior * likelihoodMastered + (1 - prior) * likelihoodUnmastered
  const posterior = (prior * likelihoodMastered) / Math.max(evidence, EPS)
  const next = posterior * (1 - (p.p_forget ?? 0)) + (1 - posterior) * p.p_transit
  return { prior, pCorrect: pCorrect(prior, p), likelihoodMastered, likelihoodUnmastered, evidence, posterior, next }
}

// Forward-only predictions over a sequence on ONE skill: predicted[t] uses obs[0..t-1].
export function predictSequence(obs: boolean[], p: BktParams): number[] {
  let belief = p.p_init
  return obs.map(o => {
    const s = bktStep(belief, o, p)
    belief = s.next
    return s.pCorrect
  })
}
