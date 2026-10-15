import { h } from '../ui/dom'
import type { TabContext } from '../main'

export function renderMethod(root: HTMLElement, ctx: TabContext): void {
  root.append(
    h('h1', 'Method & limitations'),
    h('p.lede', 'What the numbers on this site are, how they were produced, and what they cannot tell you.'),
    h('h2', 'Pipeline'),
    h('ol',
      h('li', h('strong', 'Convert. '), 'Each dataset is downloaded, its source, mirror, licence and checksum recorded, and converted to student_id, skill_id, correct, order (pipeline/datasets.py).'),
      h('li', h('strong', 'Split by student. '), '70 / 15 / 15 train / validation / test with seed 42, so no student’s answers appear in two splits (split.py).'),
      h('li', h('strong', 'BKT. '), 'One 2-state hidden Markov model per skill — prior, learn, slip, guess — fitted with EM (Baum–Welch) on the training students; no forgetting (bkt.py, adapted from Research/dkt/bkt_baseline.py).'),
      h('li', h('strong', 'DKT. '), 'Single-layer LSTM, 100 hidden units, one-hot (skill × correct) input, trained 10 epochs with Adam (lr 0.001, batch 32) on the training students (dkt.py, adapted from Research/dkt/train_dkt.py).'),
      h('li', h('strong', 'Evaluate. '), 'Next-step prediction on the test students: each model sees only earlier answers. Both are scored on identical rows — every test answer except each student’s first, which DKT cannot predict (evaluate.py, run.py).'),
      h('li', h('strong', 'Export. '), 'Numbers are copied, not recomputed, into web/public/data (export.py); check_web.py verifies the site’s JSON equals pipeline/results/*.json.'),
    ),
    h('h2', 'Limitations'),
    h('ul.caveats',
      h('li', h('strong', 'Two of the four datasets are synthetic. '), 'Synthetic-5 is the DKT paper’s simulated benchmark and the Synaptic data comes from this repository’s own learner simulator. Results on them describe the simulators, not real learners. Both are labelled synthetic wherever they appear.'),
      h('li', h('strong', 'Neither model sees elapsed time. '), 'Classic BKT has no forgetting at all, and DKT’s input is only (skill, correct). On data where learners forget over days — the Synaptic simulator is built that way — both models are missing the main signal. The DKT tuning section tests time features.'),
      h('li', h('strong', 'Mirrors, not always the official files. '), 'The official ASSISTments and Figshare hosts were unreachable from the build environment, so ASSISTments 2009 comes from a pinned GitHub mirror of the official “corrected” release (same row, student and skill counts as the Figshare file after cleaning), and ASSISTments 2015 from the DKVMN preprocessed copy, which drops student ids and timestamps.'),
      h('li', h('strong', 'Skill trimming. '), 'Datasets with more than 300 skills are trimmed to the 300 most frequent to keep the browser weights under 3 MB. None of the four datasets used here needed it (largest: 123 skills).'),
      h('li', h('strong', 'Skill definitions. '), 'Multi-skill ASSISTments problems appear once per skill tag, as in the original preprocessing; this repeats some answers and is known to flatter DKT slightly.'),
      h('li', h('strong', 'One split, one seed. '), 'Each number comes from a single split and seed. Differences of a few thousandths of AUC are within run-to-run noise.'),
      h('li', h('strong', 'Modest DKT tuning in the main table. '), 'The headline comparison uses one fixed DKT configuration; the separate DKT tuning experiments report every variant tried, tuned on validation only.'),
      h('li', h('strong', 'AUC is about ranking. '), 'A model can rank answers well and still be badly calibrated; log-loss and RMSE are shown for that reason.'),
      h('li', h('strong', 'Explainer sequences are truncated. '), 'Sample students in the explainer show at most their first 60 answers; the heatmap uses their full held-out sequence.'),
    ),
    h('h2', 'Datasets used'),
    h('ul', ctx.index.datasets.map(d => h('li', h(`span.badge.${d.kind}`, d.kind_label), ' ', h('strong', d.name), ' — ', d.citation))),
    h('h2', 'Further reading'),
    h('ul.small',
      h('li', 'Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. UMUAI 4, 253–278.'),
      h('li', 'Piech, C. et al. (2015). Deep Knowledge Tracing. NeurIPS.'),
      h('li', 'Khajah, M., Lindsey, R. V., & Mozer, M. C. (2016). How deep is knowledge tracing? EDM.'),
      h('li', 'Yeung, C.-K., & Yeung, D.-Y. (2018). Addressing two problems in deep knowledge tracing via prediction-consistent regularization. L@S.'),
      h('li', 'Nagatani, K. et al. (2019). Augmenting knowledge tracing by considering forgetting behavior. WWW.')),
  )
}
