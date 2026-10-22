import { h } from '../ui/dom'
import { f4, pct } from '../ui/format'
import { loadJson } from '../data'

// One page: the six asks, what state each is in, where it lives in the real app,
// how to see it, and why anything is not live. Prose here describes the code and
// where to click; every result quoted comes from a file the pipeline copied
// unchanged into public/data/app/ (or scheduler-comparison.json), never typed.

type Status = 'live' | 'shadow' | 'setup' | 'not'
const STATUS: Record<Status, string> = { live: 'Live in the app', shadow: 'Running in shadow', setup: 'Built, needs setup', not: 'Partly built' }

interface Feature {
  n: number; title: string; ask: string; status: Status; blocker: string; say: string
  what: (string | HTMLElement)[]; where: string[]; see: (string | HTMLElement)[]; why: string
}

interface EvalFile { exampleCount: number; generatedAt: string; ruleBased: { accuracyVsHuman: number; cohenKappaVsHuman: number }; llmGrader: { accuracyVsHuman: number; cohenKappaVsHuman: number }; adversarialSubset: { count: number; ruleAccuracyVsHuman: number; llmAccuracyVsHuman: number } }
interface ArmsFile { arms: { arm: string; dkt: { auc: number; slopeRatio: number }; bkt: { auc: number; slopeRatio: number } }[] }
interface GateFile { decision: { reason: string; checks: { sampleSize: { required: number }; ranking: { aucGain: number; required: number }; growth: { dktSlopeRatio: number; bktSlopeRatio: number; maxLoss: number } } } }
interface SchedFile { reports: { scheduler: 'sm2' | 'fsrs'; reviewsPerLearner: number; forgottenFraction: number }[] }
interface ParamsFile { live: { auc: number }; fitted: { auc: number }; fittedSkills: number; provenance: { synthetic: boolean } }

const code = (t: string) => h('code', t)
const cmd = (t: string) => h('span.cmd', t)
const list = (items: (string | HTMLElement)[], ordered = false) => h(ordered ? 'ol' : 'ul', items.map(i => h('li', i)))
const badge = (s: Status) => h(`span.badge.${s}`, STATUS[s])

function featureCard(f: Feature, open: boolean): HTMLElement {
  return h('details.feature', { open },
    h('summary', h('span.fnum', `ASK ${f.n}`), h('span.ftitle', f.title), badge(f.status)),
    h('div.fbody',
      h('p', { style: { margin: '12px 0 0' } }, h('strong', 'Say it in one line: '), f.say),
      h('dl',
        h('dt', 'Your ask'), h('dd', h('em', f.ask)),
        h('dt', 'What exists'), h('dd', list(f.what)),
        h('dt', 'Where in the code'), h('dd', list(f.where.map(w => code(w)))),
        h('dt', 'See it in the real app'), h('dd', list(f.see, true)),
        h('dt', 'Why not (fully) live'), h('dd', f.why))))
}

export async function renderGuide(root: HTMLElement): Promise<void> {
  const [ev, arms, gate, sched, params] = await Promise.all([
    loadJson<EvalFile>('app/eval-results-v1.json'),
    loadJson<ArmsFile>('app/level14_arms.json'),
    loadJson<GateFile>('app/dkt12_comparison.json'),
    loadJson<SchedFile>('scheduler-comparison.json'),
    loadJson<ParamsFile>('app/per-skill-params.json'),
  ])
  const after = arms.arms[arms.arms.length - 1]
  const sm2 = sched.reports.find(r => r.scheduler === 'sm2')!, fsrs = sched.reports.find(r => r.scheduler === 'fsrs')!
  const g = gate.decision.checks

  const features: Feature[] = [
    {
      n: 1, title: 'Reasoning evaluation: rules first, then an LLM', status: 'setup', blocker: 'The LLM half needs an API key (on hold); the rules run today.',
      ask: 'Build a reasoning evaluation module (rule-based → NLP/LLM upgrade).',
      say: 'When a learner explains a concept in their own words, the app grades the meaning, not just the answer: a rule-based grader always works, and a language model does the grading when a key is configured.',
      what: [
        'A rule-based classifier that sorts an explanation into gap / method-only / meaning-included.',
        'An LLM grader with a failover list of free OpenRouter and Groq models, a cache, a call log, and an automatic fall back to the rule-based classifier when no model answers.',
        '120 explain-format questions, so there is something to grade. For those, the server’s grade is the only verdict, and the learner’s words and the grade are stored (migration 006).',
        `Measured once on ${ev.exampleCount} hand-labelled explanations (${ev.generatedAt.slice(0, 10)}): the rules agree with the human label ${pct(ev.ruleBased.accuracyVsHuman)} of the time (κ ${ev.ruleBased.cohenKappaVsHuman.toFixed(2)}), the LLM ${pct(ev.llmGrader.accuracyVsHuman)} (κ ${ev.llmGrader.cohenKappaVsHuman.toFixed(2)}); on the ${ev.adversarialSubset.count} deliberately tricky ones, ${pct(ev.adversarialSubset.ruleAccuracyVsHuman, 0)} against ${pct(ev.adversarialSubset.llmAccuracyVsHuman, 0)}. The labels are written in the repo, so this validates the grader, not real-learner outcomes.`,
      ],
      where: ['src/lib/feynman/classifier.ts', 'src/lib/nlp/grader.ts', 'src/app/api/attempt/route.ts', 'supabase/migrations/006_explanation_grades.sql'],
      see: [
        'Sign in, open Study (/learn), and from a skill choose “Teach it with the Feynman Loop →”.',
        'Type an explanation in your own words and submit.',
        'Open Engine (/engine), section “Reasoning”: your words, the category, the confidence, who served the grade, and the reasoning quality BKT used.',
        'With no key, “served by” reads rule-based-fallback and confidence is 0. Add OPENROUTER_API_KEY or GROQ_API_KEY to .env.local and repeat to see a model name instead.',
      ],
      why: 'It runs today on the rules. The LLM half needs an API key; that is on hold until you have keys. Nothing in this lab or in the offline checks calls a model.',
    },
    {
      n: 2, title: 'Correctness + reasoning + behaviour → BKT', status: 'live', blocker: 'None. Tuning the 0.6 / 0.4 weights needs real data.',
      ask: 'Combine correctness + reasoning + behaviour as input to BKT.',
      say: 'Every answer moves the “does this learner know it” estimate by an amount that depends on whether it was right, how well they explained it, and how they behaved while answering.',
      what: [
        'BKT scales how much one answer counts: evidence strength = 0.6 × reasoning quality + 0.4 × behaviour. Both inputs used to be constant 1, so the formula existed but did nothing. They are now real.',
        'Reasoning quality comes from the grade in ask 1 (explain questions only; other formats count as full quality).',
        'Behaviour is a modifier built from the slow-answer streak and consecutive errors (ask 5).',
        'The weights 0.6 and 0.4 are set by hand, not fitted; that needs real learner data.',
      ],
      where: ['src/lib/bkt/index.ts (bktUpdate)', 'src/lib/motivation/index.ts', 'src/app/api/attempt/route.ts'],
      see: [
        'Answer several questions in /learn, some quickly, some slowly (wait over 15 seconds on a few).',
        'Open /engine, section “Per-attempt signals”: each row shows the behaviour modifier and how far BKT moved for that answer.',
        'Compare a fast and a slow correct answer: the slow one moves the estimate less.',
      ],
      why: 'It is live. The only open item is tuning the two weights, which has to wait for real data.',
    },
    {
      n: 3, title: 'BKT → DKT (modern knowledge tracing)', status: 'shadow', blocker: 'Fails the gate on ranking and growth; needs real learner rows.',
      ask: 'Upgrade BKT to modern knowledge tracing (e.g., DKT).',
      say: 'A neural network (DKT) is built, trained and running beside BKT, being judged on every answer; it has not replaced BKT because on this evidence it does not yet earn it.',
      what: [
        'A DKT model in plain TypeScript (no Python at run time), trained on simulated learners and retrained with early stopping and a reconstruction term.',
        'With DKT_SHADOW=1 it predicts every answer next to BKT and logs both (migration 005).',
        `A cutover gate checks three things and reports all of them. Today: ranking ${f4(g.ranking.aucGain)} AUC gain against ${g.ranking.required} required — FAIL; growth ${f4(g.growth.dktSlopeRatio)} against BKT’s ${f4(g.growth.bktSlopeRatio)}, may lose ${g.growth.maxLoss} — FAIL.`,
        `Cheaper upgrade found on the way: per-skill BKT parameters raise AUC ${f4(params.live.auc)} → ${f4(params.fitted.auc)}, logged in shadow, kept off (the fitted file is ${params.provenance.synthetic ? 'synthetic' : 'real'}).`,
      ],
      where: ['src/lib/dkt/', 'src/lib/dkt/compare.ts (the gate)', 'Research/dkt/ (training)', 'src/lib/bkt/params.ts'],
      see: [
        'No setup: this lab’s Model comparison and Learning curves tabs, or run npm run dkt:compare -- --sim and read the three-row gate table.',
        'In the app: set DKT_SHADOW=1, answer questions, open /engine, section “Model comparison”: DKT and BKT predictions side by side, the three gate conditions, and the verdict.',
      ],
      why: `It stays in shadow on purpose. The model learned from simulated learners, the gate needs ${g.sampleSize.required.toLocaleString('en-US')} real attempts and cohorts of learners with 10+ attempts on a skill, and there is deliberately no switch: promoting DKT would be a code change after the gate recommends it, so it cannot happen by accident.`,
    },
    {
      n: 4, title: 'Stronger SM-2: adaptive scheduling', status: 'shadow', blocker: 'Switching changes real due dates; all evidence is simulated.',
      ask: 'Strengthen SM2 with adaptive scheduling based on performance patterns.',
      say: 'SM-2 now gets honest speed data, and two stronger schedulers run beside it, logged but not applied: a behaviour-aware SM-2 and FSRS.',
      what: [
        'Fixed first: SM-2 graded every right answer “fast” because the timer was broken (see ask 5 and the Scheduling tab).',
        'Behaviour-aware quality (ADAPTIVE_QUALITY): demotes the grade one step after a long hesitation or repeated answer changes. Both the live and the adaptive grade, and the interval each would set, are logged (migration 007).',
        `FSRS runs on every answer and is logged beside SM-2 (migration 004). In simulation it asks for ${pct(fsrs.reviewsPerLearner / sm2.reviewsPerLearner - 1, 0)} more reviews and leaves ${pct(fsrs.forgottenFraction)} of learned skills forgotten against SM-2’s ${pct(sm2.forgottenFraction)}.`,
      ],
      where: ['src/lib/sm2/adaptive.ts', 'src/lib/fsrs/', 'src/lib/fsrs/scheduler.ts (the switch)', 'supabase/migrations/004 and 007'],
      see: [
        'No setup: the lab’s Scheduling tab (the conversation, the interval chart, the population results).',
        'In the app: answer and review in /learn, then open /engine, section “Scheduling”: for each skill, the SM-2 interval beside FSRS and the adaptive version.',
      ],
      why: 'Switching either one changes every learner’s due dates, and every number so far is from simulated learners. The behaviour-aware grade in particular cannot be justified offline: the simulator has no hesitation or retries. So SCHEDULER=fsrs and ADAPTIVE_QUALITY=1 stay off until real rows say otherwise and you decide.',
    },
    {
      n: 5, title: 'Behaviour analytics: time, retries, hesitation', status: 'live', blocker: 'None. No person has used it in a browser yet, only tests.',
      ask: 'Integrate behaviour analytics (time, retries, hesitation) for accuracy.',
      say: 'The browser now measures how long each answer took, how long the learner paused before touching it, and how often they changed their mind, and those numbers feed BKT and the schedulers.',
      what: [
        'The table below follows each signal from the browser to where it is used.',
        'Before this, the client sent about 0 ms for every answer, never sent hesitation or retries, and the Feynman loop sent a hard-coded 5,000 ms.',
      ],
      where: ['src/lib/timing/answer-timing.ts', 'src/app/learn/page.tsx', 'src/app/learn/diagnostic/page.tsx', 'src/app/api/attempt/route.ts', 'src/lib/motivation/index.ts'],
      see: [
        'Open Study (/learn) and answer a question: answer one at once, then one after waiting 20 seconds, then one where you click an option, change it twice, and submit.',
        'Open /engine, section “Per-attempt signals”: latency, hesitation, and the behaviour modifier for each row.',
        'No browser: npx vitest run src/lib/timing src/app/api/attempt runs the timing logic with named cases for slow answers, hesitation and revisions.',
      ],
      why: 'Live. Missing: nothing here has been exercised by a real person in a browser yet — only by tests — and the thresholds (3 s, 8 s, 15 s, 10 s hesitation) are hand-set.',
    },
    {
      n: 6, title: 'Bloom’s taxonomy tagging for cognitive-level control', status: 'not', blocker: 'Phase evaluations only; session routing left out by your decision.',
      ask: 'Implement Bloom’s taxonomy tagging for cognitive-level control.',
      say: 'Bloom tagging exists for the phase evaluations (every question is tagged, results are shown per level); steering ordinary study sessions by Bloom level was left out by your decision.',
      what: [
        '153 phase-evaluation questions across 9 phase sets, each tagged with one of the six levels (remember, understand, apply, analyze, evaluate, create), at least two per level in every set (a test enforces it).',
        'The evaluation page shows a per-level breakdown instead of one score.',
        'Not built: tags on the regular question bank, and a session engine that picks the next question by cognitive level. The design notes describe that routing; the code does not do it.',
      ],
      where: ['content/questions/phase-evaluation/*.json', 'src/types/index.ts (BloomLevel)', 'src/app/learn/evaluate/[phase]/page.tsx', 'src/lib/ui/phase-evaluation.test.ts'],
      see: [
        'Sign in, open the Dashboard, master at least one skill in a phase, and use that phase’s “Evaluate” button.',
        'Answer the questions; the result page lists a score for each Bloom level.',
      ],
      why: 'You said to leave Bloom as it was. Tagging the whole bank and routing sessions by level is the remaining work if you reverse that.',
    },
  ]

  root.append(
    h('h1', 'Real-app guide: what is built, where, and how to see it'),
    h('p.lede', 'Everything you asked for, on one page: its state, where it lives, how to see it in the running app, and the reason when something is not switched on. Results quoted here are read from files the app produced; the app’s own results are simulated learners.'),
    h('div.row', { style: { marginBottom: '14px' } }, (['live', 'shadow', 'setup', 'not'] as Status[]).map(s => badge(s)),
      h('span.small.muted', '“Shadow” means computed and logged beside the live value, but not applied.')),
  )

  root.append(h('div.card', { style: { marginBottom: '16px' } }, h('h3', 'The six asks at a glance'),
    h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', '#'), h('th', 'Ask'), h('th', 'State'), h('th', 'The blocker'))),
      h('tbody', features.map(f => h('tr', h('td.num', String(f.n)), h('td', f.title), h('td', badge(f.status)), h('td.small.muted', f.blocker))))))))

  root.append(h('h2', 'Each ask in detail'), ...features.map((f, i) => featureCard(f, i === 0)))

  root.append(
    h('h2', { style: { marginTop: '28px' } }, 'Where each behaviour is tracked'),
    h('p.small.muted', 'Follow one signal from the learner’s hands to the place it is used.'),
    h('div.card', h('div.table-wrap', h('table',
      h('thead', h('tr', h('th', 'Signal'), h('th', 'Measured by'), h('th', 'Stored'), h('th', 'Used for'))),
      h('tbody',
        h('tr', h('td', h('strong', 'Time to answer'), h('div.small.muted', 'latency')), h('td', 'Browser: submitted − question shown'), h('td', code('attempt_events.latency_ms')),
          h('td', 'Picks the SM-2 quality and FSRS rating (under 3 s easy, under 8 s good, slower hard); feeds the slow-answer streak')),
        h('tr', h('td', h('strong', 'Hesitation')), h('td', 'Browser: first click or keystroke − question shown (the server cuts it to the latency)'), h('td', code('attempt_events.hesitation_ms')),
          h('td', 'Motivation state; in shadow, 10 s or more demotes the grade one step')),
        h('tr', h('td', h('strong', 'Retries'), h('div.small.muted', 'answer changes')), h('td', 'Browser: edits after a 1.5 s pause count once, so typing is not a retry'), h('td', code('behavior_quality_shadow.revision_count')),
          h('td', 'In shadow only: two or more demote the grade one step')),
        h('tr', h('td', h('strong', 'Slow streak')), h('td', 'Server: consecutive answers over 15 s'), h('td', code('attempt_events.slow_response_streak')),
          h('td', 'Lowers the behaviour modifier; four in a row marks the learner “frustrated”')),
        h('tr', h('td', h('strong', 'Behaviour modifier')), h('td', 'Server: from errors and the slow streak'), h('td', code('attempt_events.behavior_modifier')),
          h('td', 'The 0.4 share of BKT’s evidence strength (ask 2)')))))),
  )

  const step = (n: string, label: string, text: string, now = false) =>
    h('div.node' + (now ? '.now' : ''), h('b', `${n} · ${label}`), text)
  const gap = () => h('span.gap', '→')
  root.append(
    h('h2', { style: { marginTop: '28px' } }, 'How DKT and FSRS get into the app, and why they are not in yet'),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'FSRS'),
        h('div.pipeline', step('1', 'Built', 'scheduler + tests'), gap(), step('2', 'Shadow', 'computed on every answer, logged', true), gap(), step('3', 'Evidence', 'real review rows'), gap(), step('4', 'Your call', 'SCHEDULER=fsrs')),
        list([
          'It is already in the app, running beside SM-2 on every answer.',
          `The simulation favours it (${pct(fsrs.reviewsPerLearner / sm2.reviewsPerLearner - 1, 0)} more reviews, less forgotten), but that is simulated learners and uncalibrated default parameters.`,
          'Switching changes every learner’s due dates and review load, which is a product decision, so it is left to you.',
        ])),
      h('div.card', h('h3', 'DKT'),
        h('div.pipeline', step('1', 'Built', 'model + training + tests'), gap(), step('2', 'Shadow', 'DKT_SHADOW=1 logs it beside BKT', true), gap(), step('3', 'Gate', 'ranking + growth + volume'), gap(), step('4', 'Your call', 'a code change')),
        list([
          `Today it fails the gate on ranking and growth (${gate.decision.reason.replace(/_/g, ' ')}); its AUC is ${f4(after.dkt.auc)} against BKT’s ${f4(after.bkt.auc)}.`,
          'The shadow log fills only while DKT_SHADOW=1 and people use the app.',
          'There is no automatic switch by design.',
        ]))),
  )

  root.append(
    h('h2', { style: { marginTop: '28px' } }, 'Demoing it'),
    h('div.grid.cols-2',
      h('div.card', h('h3', 'Works now, with nothing to set up'),
        list([
          h('span', 'This lab: Learning curves, Scheduling, Synaptic app, Real-app guide.'),
          h('span', cmd('npm run sim:latency'), ' the cost of the broken timing signal.'),
          h('span', cmd('npm run dkt:compare -- --sim'), ' DKT vs BKT and the gate.'),
          h('span', cmd('npm run bkt:compare'), ' per-skill vs global BKT.'),
          h('span', cmd('npm run sim:walkthrough'), ' the one-learner scheduling conversation.'),
          h('span', cmd('npx vitest run'), ' every check, including the behaviour timing tests.'),
          h('span', cmd('npm run dev'), ' then open ', code('/demo'), ': a scripted product walkthrough with hard-coded numbers. Good for the flow, not evidence of anything.'),
        ])),
      h('div.card', h('h3', 'Needs your machine'),
        list([
          h('span', 'A Supabase project and ', code('.env.local'), ' (copy ', code('.env.local.example'), ').'),
          h('span', cmd('npm run db:migrate'), ' to apply migrations 001–008.'),
          h('span', cmd('npm run seed:demo'), ' fills one synthetic learner so ', code('/engine'), ' is not empty; ', cmd('npm run seed:demo -- --dry-run'), ' shows the rows first.'),
          h('span', cmd('npm run dev'), ', sign up or log in, answer questions in ', code('/learn'), ', watch ', code('/engine'), '.'),
          h('span', 'Optional: ', code('OPENROUTER_API_KEY'), ' or ', code('GROQ_API_KEY'), ' for LLM grading; ', code('DKT_SHADOW=1'), ' to fill the DKT log.'),
          h('span', 'Not yet done by anyone: a browser click-through of placement, an order question and the Feynman loop.'),
        ]))),
    h('p.small.muted', 'Be upfront when demoing: the engine’s numbers are simulated learners, and no real learner has used these changes yet.'),
  )
}
