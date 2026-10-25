/**
 * Rules vs score, measured (SCORE-4).
 *
 * `selection_shadow` logs the two selectors side by side in production, but the
 * pinned guided arc has a single candidate by construction, so real rows
 * accumulate far more slowly than attempt volume suggests (PROGRESS.md item 19).
 * This is where a broad comparison actually comes from.
 *
 * It does not reimplement either selector. Both policies are handed the same
 * pool from the real `selectNextTaskDetailed()`, on the real 120-node graph and
 * the real question bank; only the choice from that pool differs. Outcomes come
 * from the simulator's own learner model, so the memory, forgetting and spacing
 * effects are the ones every other sim script in this repo already uses.
 *
 * Two things are reported, and they answer different questions:
 *  - Agreement, from a run that FOLLOWS the rules and records what the score
 *    would have done. Per-decision, large sample, ties separated out.
 *  - Outcomes, from two independent runs over the same seeded population, one
 *    following each policy. Whether the disagreements were actually better.
 *
 * Usage: npm run selector:compare -- [--learners 120] [--days 60] [--seed 4242]
 */
import fs from 'fs'
import path from 'path'
import { getAllNodes, getHardPrereqs } from '../src/lib/graph'
import { bktUpdate, initSkillState, MASTERY_THRESHOLD } from '../src/lib/bkt'
import { bktToQuality, initSM2, reconcileBktSm2, reconcileBktSm2OnLoad } from '../src/lib/sm2'
import { initMotivationState, updateMotivationState } from '../src/lib/motivation'
import {
  DEFAULT_REVIEW_OFFER_SIZE, SESSION_TASK_CAP, selectNextTaskDetailed, type SelectionTrace,
} from '../src/lib/session/engine'
import { rankCandidates, type ScoreTermName } from '../src/lib/session/score'
import { SCORE_TIE_EPSILON, toScoreInputs } from '../src/lib/session/shadow'
import { ELO_START } from '../src/lib/elo'
import { createRng } from '../src/lib/sim/rng'
import { practice, sampleLearnerParams, trueRecallProbability, type TrueSkillMemory } from '../src/lib/sim/learner'
import { mean } from '../src/lib/sim/metrics'
import type { LearnerSkillState, MotivationState, Question, ReviewSchedule } from '../src/types'

const DAY_MS = 86_400_000
const QUESTIONS_DIR = path.join(process.cwd(), 'content', 'questions', 'by-skill')
const OUT_PATH = path.join(process.cwd(), 'dkt-lab', 'web', 'public', 'data', 'selector-comparison.json')

type Policy = 'rules' | 'score'

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag)
  if (i < 0) return fallback
  const value = Number(process.argv[i + 1])
  return Number.isFinite(value) ? value : fallback
}

function loadQuestionsCache(skillIds: string[]): Map<string, Question[]> {
  const cache = new Map<string, Question[]>()
  for (const id of skillIds) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, `${id}.json`), 'utf-8'))
      if (Array.isArray(parsed) && parsed.length > 0) cache.set(id, parsed)
    } catch {
      // A node with no authored questions is simply not selectable, exactly as
      // in /api/session.
    }
  }
  return cache
}

interface Disagreement {
  /** The term with the largest gap between the score's pick and the rules' pick. */
  dominantTerm: ScoreTermName
  gap: number
}

interface RunResult {
  attempts: number
  reviewAttempts: number
  skillsLearnedPerLearner: number
  endRetention: number
  forgottenFraction: number
  meanEndPKnow: number
  pKnowGainPerAttempt: number
  overdueAtEndPerLearner: number
  /** Only populated on the rules-following run. */
  decisions: number
  agreed: number
  tied: number
  disagreements: Disagreement[]
}

function emptyResult(): RunResult {
  return {
    attempts: 0, reviewAttempts: 0, skillsLearnedPerLearner: 0, endRetention: 0,
    forgottenFraction: 0, meanEndPKnow: 0, pKnowGainPerAttempt: 0, overdueAtEndPerLearner: 0,
    decisions: 0, agreed: 0, tied: 0, disagreements: [],
  }
}

function run(
  policy: Policy,
  learners: number,
  days: number,
  seed: number,
  recordAgreement: boolean,
): RunResult {
  const nodes = getAllNodes().filter(node => !node.deprecated)
  const skillIds = nodes.map(node => node.id)
  const questionsCache = loadQuestionsCache(skillIds)
  const prereqs = new Map(skillIds.map(id => [id, getHardPrereqs(id)]))

  const result = emptyResult()
  const endRecalls: number[] = []
  const endPKnow: number[] = []
  let learnedTotal = 0
  let pKnowGain = 0
  let overdueTotal = 0

  const start = new Date('2026-01-05T00:00:00Z').getTime()

  for (let l = 0; l < learners; l++) {
    // Same stream per learner index as the simulator uses, so both policies see
    // the same population.
    const rng = createRng((seed * 1_000_003 + l) >>> 0)
    // Study days and session start times come from their own stream. Once the
    // two policies pick different skills, their practice draws diverge and so
    // would the days they study at all -- which showed up as a 17% gap in total
    // attempts between the policies, pure noise that swamped the thing being
    // measured. Separating the streams matches exposure across policies.
    const scheduleRng = createRng((seed * 7_919 + l * 31 + 1) >>> 0)
    const studentId = `sel_${seed}_${l}`
    const params = sampleLearnerParams(rng)

    const skillStates = new Map<string, LearnerSkillState>()
    const reviewSchedules = new Map<string, ReviewSchedule>()
    const memories = new Map<string, TrueSkillMemory>()
    const introduced = new Set<string>()
    for (const id of skillIds) {
      skillStates.set(id, initSkillState(studentId, id))
      reviewSchedules.set(id, initSM2(studentId, id, new Date(start)))
    }
    let motivation: MotivationState = initMotivationState(studentId)

    for (let day = 0; day < days; day++) {
      if (scheduleRng.next() >= params.studyProbability) continue
      let clock = start + day * DAY_MS + (8 + scheduleRng.next() * 14) * 3_600_000

      // The on-load reconciliation /api/session runs before every selection.
      for (const id of Array.from(introduced)) {
        const state = skillStates.get(id)!
        const refreshed = reconcileBktSm2OnLoad(state, reviewSchedules.get(id)!, new Date(clock))
        skillStates.set(id, refreshed.state)
        reviewSchedules.set(id, refreshed.schedule)
      }

      const seenSkills: string[] = []
      let tasksDone = 0

      const attempt = (skillId: string, isReview: boolean) => {
        const now = new Date(clock)
        const nowDays = (clock - start) / DAY_MS
        const prereqRecall = (prereqs.get(skillId) ?? []).reduce(
          (p, id) => p * Math.max(0.05, trueRecallProbability(memories.get(id), nowDays)), 1)

        const outcome = practice(rng, params, memories.get(skillId), nowDays, prereqRecall)
        const state = skillStates.get(skillId)!
        const schedule = reviewSchedules.get(skillId)!
        const wasMastered = state.mastery_state === 'mastered'
        const before = state.p_know

        const updated = bktUpdate(state, outcome.correct, schedule.repetitions)
        skillStates.set(skillId, updated)
        reviewSchedules.set(skillId, reconcileBktSm2(
          updated.p_know, wasMastered, schedule, bktToQuality(outcome.correct, outcome.latencyMs), now))
        motivation = updateMotivationState(motivation, outcome.correct, outcome.latencyMs, updated)
        memories.set(skillId, outcome.memory)
        introduced.add(skillId)

        pKnowGain += updated.p_know - before
        result.attempts += 1
        if (isReview) result.reviewAttempts += 1
        seenSkills.push(skillId)
        tasksDone += 1
        clock += outcome.latencyMs + 15_000
      }

      /** The skill this policy takes from the pool the cascade just ranked. */
      const choose = (trace: SelectionTrace): string | null => {
        const ruleChoice = trace.chosen?.skill_id ?? null
        if (trace.candidates.length === 0) return ruleChoice

        const inputs = toScoreInputs(
          trace.candidates, skillStates, reviewSchedules, motivation.state,
          questionsCache, new Map(),
        )
        // No exploration here: this measures the ranking, and a 12% random arm
        // would only add noise to both the agreement and the outcome figures.
        const ranked = rankCandidates(inputs, {
          now: new Date(clock), learner_rating: ELO_START,
          motivation_state: motivation.state, recent_skill_ids: [...seenSkills].reverse(),
        }, () => 1)
        const scoreChoice = ranked.chosen?.skill_id ?? null

        if (recordAgreement && ruleChoice && scoreChoice && trace.candidates.length >= 2) {
          result.decisions += 1
          const ruleScored = ranked.ranked.find(c => c.skill_id === ruleChoice)
          const top = ranked.chosen!
          if (scoreChoice === ruleChoice) {
            result.agreed += 1
          } else if (ruleScored && Math.abs(top.score - ruleScored.score) < SCORE_TIE_EPSILON) {
            result.tied += 1
          } else if (ruleScored) {
            // Which term actually drove the disagreement.
            let dominantTerm: ScoreTermName = top.terms[0].name
            let gap = -Infinity
            for (const term of top.terms) {
              const mine = term.contribution
              const theirs = ruleScored.terms.find(t => t.name === term.name)?.contribution ?? 0
              if (mine - theirs > gap) { gap = mine - theirs; dominantTerm = term.name }
            }
            result.disagreements.push({ dominantTerm, gap })
          }
        }

        return policy === 'score' ? scoreChoice : ruleChoice
      }

      const select = (mode: 'review' | 'learn') => selectNextTaskDetailed({
        skillStates, reviewSchedules, motivationState: motivation,
        seenSkillsThisSession: seenSkills,
        // Empty on purpose: the seen-question set steers which question is
        // served, never which skill is a candidate, and outcomes here depend
        // only on the skill.
        seenQuestionIdsThisSession: new Set<string>(),
        questionsCache, mode,
      })

      // Reviews are consent-based in the live app; a simulated learner always
      // accepts, the same assumption src/lib/sim/run.ts already makes.
      while (tasksDone < DEFAULT_REVIEW_OFFER_SIZE) {
        const trace = select('review')
        if (!trace.task) break
        const skill = choose(trace)
        if (!skill) break
        attempt(skill, true)
      }

      while (tasksDone < SESSION_TASK_CAP) {
        const trace = select('learn')
        if (!trace.task) break
        const skill = choose(trace)
        if (!skill) break
        attempt(skill, false)
      }
    }

    for (const [id, memory] of Array.from(memories)) {
      if (!memory.learned) continue
      learnedTotal += 1
      endRecalls.push(trueRecallProbability(memory, days))
      endPKnow.push(skillStates.get(id)!.p_know)
    }
    const endOfRun = start + days * DAY_MS
    overdueTotal += Array.from(introduced)
      .filter(id => new Date(reviewSchedules.get(id)!.due_at).getTime() <= endOfRun).length
  }

  result.skillsLearnedPerLearner = learnedTotal / learners
  result.endRetention = mean(endRecalls)
  result.forgottenFraction = endRecalls.length ? endRecalls.filter(r => r < 0.7).length / endRecalls.length : NaN
  result.meanEndPKnow = mean(endPKnow)
  result.pKnowGainPerAttempt = result.attempts > 0 ? pKnowGain / result.attempts : 0
  result.overdueAtEndPerLearner = overdueTotal / learners
  return result
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function main() {
  const learners = arg('--learners', 120)
  const days = arg('--days', 60)
  const seed = arg('--seed', 4242)

  console.log(`Rules vs score over ${learners} simulated learners x ${days} days (seed ${seed})`)
  console.log(`Mastery threshold ${MASTERY_THRESHOLD}; both policies rank the same pool from selectNextTaskDetailed().\n`)

  const rules = run('rules', learners, days, seed, true)
  const score = run('score', learners, days, seed, false)

  const nonTied = rules.decisions - rules.tied
  const agreementExcludingTies = nonTied > 0 ? rules.agreed / nonTied : NaN

  console.log('── Agreement (following the rules, recording what the score would have done)')
  console.log(`  decisions with a real choice   ${rules.decisions}`)
  console.log(`  same pick                      ${rules.agreed} (${pct(rules.agreed / Math.max(1, rules.decisions))})`)
  console.log(`  score indifferent (tied)       ${rules.tied} (${pct(rules.tied / Math.max(1, rules.decisions))})`)
  console.log(`  genuine disagreement           ${rules.disagreements.length} (${pct(rules.disagreements.length / Math.max(1, rules.decisions))})`)
  console.log(`  agreement excluding ties       ${pct(agreementExcludingTies)}`)

  const byTerm = new Map<ScoreTermName, { count: number; gaps: number[] }>()
  for (const d of rules.disagreements) {
    const entry = byTerm.get(d.dominantTerm) ?? { count: 0, gaps: [] }
    entry.count += 1
    entry.gaps.push(d.gap)
    byTerm.set(d.dominantTerm, entry)
  }
  console.log('\n── What drove the disagreements')
  const sortedTerms = Array.from(byTerm).sort((a, b) => b[1].count - a[1].count)
  if (sortedTerms.length === 0) console.log('  none')
  for (const [term, entry] of sortedTerms) {
    console.log(`  ${term.padEnd(17)} ${String(entry.count).padStart(6)}  mean gap ${mean(entry.gaps).toFixed(4)}`)
  }

  const rows: [string, number, number][] = [
    ['attempts', rules.attempts, score.attempts],
    ['review attempts', rules.reviewAttempts, score.reviewAttempts],
    ['skills learned / learner', rules.skillsLearnedPerLearner, score.skillsLearnedPerLearner],
    ['end retention', rules.endRetention, score.endRetention],
    ['forgotten fraction', rules.forgottenFraction, score.forgottenFraction],
    ['mean end p_know', rules.meanEndPKnow, score.meanEndPKnow],
    ['p_know gain / attempt', rules.pKnowGainPerAttempt, score.pKnowGainPerAttempt],
    ['overdue at end / learner', rules.overdueAtEndPerLearner, score.overdueAtEndPerLearner],
  ]
  console.log('\n── Outcomes, same population under each policy')
  console.log(`  ${'metric'.padEnd(26)} ${'rules'.padStart(10)} ${'score'.padStart(10)}  delta`)
  for (const [name, a, b] of rows) {
    const delta = b - a
    const sign = delta > 0 ? '+' : ''
    console.log(`  ${name.padEnd(26)} ${a.toFixed(4).padStart(10)} ${b.toFixed(4).padStart(10)}  ${sign}${delta.toFixed(4)}`)
  }

  // Deliberately not a verdict. Retention and forgetting are what matter, and
  // one simulated population under a hand-written memory model is evidence for
  // a human to read at LAB-3, not grounds for a cutover.
  console.log('\nNot a cutover recommendation. These are simulated learners under this repo’s own')
  console.log('memory model, so they can show a selector is no worse — never that it is better')
  console.log('for real people. LIVE-1 needs human sign-off (DEVELOPMENT_LOOP.md:113).')

  if (rules.decisions === 0) {
    console.error('\nRefusing to write output: the run produced no decision with a real choice.')
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    config: { learners, days, seed },
    agreement: {
      decisions: rules.decisions,
      agreed: rules.agreed,
      tied: rules.tied,
      disagreed: rules.disagreements.length,
      agreement_excluding_ties: agreementExcludingTies,
      by_term: sortedTerms.map(([term, entry]) => ({ term, count: entry.count, mean_gap: mean(entry.gaps) })),
    },
    outcomes: rows.map(([metric, rulesValue, scoreValue]) => ({ metric, rules: rulesValue, score: scoreValue, delta: scoreValue - rulesValue })),
    caveat: 'Simulated learners under this repository\'s own memory model. Evidence for a human decision at LAB-3, not a cutover.',
  }, null, 2) + '\n')
  console.log(`\nWrote ${path.relative(process.cwd(), OUT_PATH)}`)
}

main()
