/**
 * NLP-3: runs the LLM grader against the NLP-1 labeled validation set and
 * measures agreement (Cohen's kappa) vs. human labels and vs. the existing
 * rule-based classifier. Observational only — does not touch the live
 * /api/attempt path.
 *
 * Usage: npx tsx scripts/run-nlp-eval.ts
 */
import fs from 'node:fs'
import path from 'node:path'

loadEnvLocal()

import { classifyExplanation, type ExplanationCategory } from '../src/lib/feynman/classifier'
import { gradeExplanation } from '../src/lib/nlp/grader'
import { LABELED_EXAMPLES } from '../src/lib/nlp/data/labeled-examples'
import { GradeCache } from '../src/lib/nlp/cache'

const CATEGORIES: ExplanationCategory[] = ['gap', 'method-only', 'meaning-included']
const DELAY_BETWEEN_CALLS_MS = 350

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

function computeKappa(labelsA: ExplanationCategory[], labelsB: ExplanationCategory[]): number {
  const n = labelsA.length
  const confusion: Record<string, Record<string, number>> = {}
  for (const c of CATEGORIES) confusion[c] = Object.fromEntries(CATEGORIES.map(c2 => [c2, 0]))

  for (let i = 0; i < n; i++) confusion[labelsA[i]][labelsB[i]] += 1

  const po = CATEGORIES.reduce((sum, c) => sum + confusion[c][c], 0) / n

  const rowTotals = Object.fromEntries(CATEGORIES.map(c => [c, CATEGORIES.reduce((s, c2) => s + confusion[c][c2], 0)]))
  const colTotals = Object.fromEntries(CATEGORIES.map(c => [c, CATEGORIES.reduce((s, c2) => s + confusion[c2][c], 0)]))
  const pe = CATEGORIES.reduce((sum, c) => sum + (rowTotals[c] / n) * (colTotals[c] / n), 0)

  if (pe === 1) return 1
  return (po - pe) / (1 - pe)
}

function accuracy(labelsA: ExplanationCategory[], labelsB: ExplanationCategory[]): number {
  const n = labelsA.length
  const correct = labelsA.filter((a, i) => a === labelsB[i]).length
  return correct / n
}

function confusionMatrix(human: ExplanationCategory[], predicted: ExplanationCategory[]): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {}
  for (const c of CATEGORIES) matrix[c] = Object.fromEntries(CATEGORIES.map(c2 => [c2, 0]))
  for (let i = 0; i < human.length; i++) matrix[human[i]][predicted[i]] += 1
  return matrix
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface ExampleResult {
  id: string
  concept: string
  humanLabel: ExplanationCategory
  ruleLabel: ExplanationCategory
  llmLabel: ExplanationCategory
  llmServedBy: string
  llmConfidence: number
  llmFromCache: boolean
  adversarial: boolean
}

async function main() {
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY)
  const hasGroq = Boolean(process.env.GROQ_API_KEY)
  console.log(`API keys present — OpenRouter: ${hasOpenRouter}, Groq: ${hasGroq}`)
  console.log(`Grading ${LABELED_EXAMPLES.length} labeled examples...\n`)

  const cache = new GradeCache()
  const results: ExampleResult[] = []
  let fallbackCount = 0
  const servedByCounts: Record<string, number> = {}

  for (let i = 0; i < LABELED_EXAMPLES.length; i++) {
    const ex = LABELED_EXAMPLES[i]
    const ruleLabel = classifyExplanation(ex.text)
    const llm = await gradeExplanation({ concept: ex.concept, explanationText: ex.text }, { cache })

    servedByCounts[llm.servedBy] = (servedByCounts[llm.servedBy] ?? 0) + 1
    if (llm.servedBy === 'rule-based-fallback') fallbackCount++

    results.push({
      id: ex.id,
      concept: ex.concept,
      humanLabel: ex.humanLabel,
      ruleLabel,
      llmLabel: llm.category,
      llmServedBy: llm.servedBy,
      llmConfidence: llm.confidence,
      llmFromCache: llm.fromCache,
      adversarial: ex.adversarial ?? false,
    })

    process.stdout.write(
      `[${i + 1}/${LABELED_EXAMPLES.length}] ${ex.id} human=${ex.humanLabel} rule=${ruleLabel} llm=${llm.category} (${llm.servedBy})\n`
    )

    if (!llm.fromCache) await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  const humanLabels = results.map(r => r.humanLabel)
  const ruleLabels = results.map(r => r.ruleLabel)
  const llmLabels = results.map(r => r.llmLabel)

  const ruleKappa = computeKappa(humanLabels, ruleLabels)
  const llmKappa = computeKappa(humanLabels, llmLabels)
  const ruleAccuracy = accuracy(humanLabels, ruleLabels)
  const llmAccuracy = accuracy(humanLabels, llmLabels)
  const llmVsRuleKappa = computeKappa(ruleLabels, llmLabels)

  const adversarialResults = results.filter(r => r.adversarial)
  const adversarialRuleAccuracy = adversarialResults.length
    ? accuracy(adversarialResults.map(r => r.humanLabel), adversarialResults.map(r => r.ruleLabel))
    : null
  const adversarialLlmAccuracy = adversarialResults.length
    ? accuracy(adversarialResults.map(r => r.humanLabel), adversarialResults.map(r => r.llmLabel))
    : null

  const summary = {
    promptVersion: 'v1',
    generatedAt: new Date().toISOString(),
    exampleCount: results.length,
    apiKeysPresent: { openRouter: hasOpenRouter, groq: hasGroq },
    servedByCounts,
    fallbackRate: fallbackCount / results.length,
    ruleBased: {
      accuracyVsHuman: ruleAccuracy,
      cohenKappaVsHuman: ruleKappa,
      confusionMatrixVsHuman: confusionMatrix(humanLabels, ruleLabels),
    },
    llmGrader: {
      accuracyVsHuman: llmAccuracy,
      cohenKappaVsHuman: llmKappa,
      confusionMatrixVsHuman: confusionMatrix(humanLabels, llmLabels),
      cohenKappaVsRuleBased: llmVsRuleKappa,
    },
    adversarialSubset: {
      count: adversarialResults.length,
      ruleAccuracyVsHuman: adversarialRuleAccuracy,
      llmAccuracyVsHuman: adversarialLlmAccuracy,
    },
    examples: results,
  }

  console.log('\n' + '='.repeat(72))
  console.log('RESULTS')
  console.log('='.repeat(72))
  console.log(`Rule-based  — accuracy vs human: ${(ruleAccuracy * 100).toFixed(1)}%  kappa: ${ruleKappa.toFixed(3)}`)
  console.log(`LLM grader  — accuracy vs human: ${(llmAccuracy * 100).toFixed(1)}%  kappa: ${llmKappa.toFixed(3)}`)
  console.log(`LLM vs rule-based kappa: ${llmVsRuleKappa.toFixed(3)}`)
  console.log(`Fallback-to-rule-based rate: ${(summary.fallbackRate * 100).toFixed(1)}%`)
  console.log(`Served by: ${JSON.stringify(servedByCounts, null, 2)}`)
  if (adversarialResults.length) {
    console.log(
      `\nAdversarial subset (n=${adversarialResults.length}) — rule accuracy: ${((adversarialRuleAccuracy ?? 0) * 100).toFixed(1)}%  llm accuracy: ${((adversarialLlmAccuracy ?? 0) * 100).toFixed(1)}%`
    )
  }

  const outPath = path.join(__dirname, '..', 'src', 'lib', 'nlp', 'data', 'eval-results-v1.json')
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  console.log(`\nFull results written to ${path.relative(process.cwd(), outPath)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
