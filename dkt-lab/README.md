# DKT Lab

A standalone research dashboard comparing **Bayesian Knowledge Tracing (BKT)** and
**Deep Knowledge Tracing (DKT)** on public knowledge-tracing datasets, with an
interactive, in-browser explainer of how each model works.

Everything lives in `dkt-lab/`. It does not import from, or change, the Synaptic
app (`src/`, `content/`, `Research/`, `scripts/`, root `package.json`). The style
and tab structure follow the *Adaptive Learning System Lab* reference, but with
real datasets and a static-site architecture instead of a Flask server.

```
dkt-lab/
├── package.json          convenience scripts (delegates to web/ and pipeline/)
├── requirements.txt      Python deps for the offline pipeline
├── pipeline/             Python, run offline (never on Vercel)
│   ├── datasets.py       download + convert each dataset to student_id,skill_id,correct,order
│   ├── split.py          70/15/15 split by student (seeded)
│   ├── bkt.py            per-skill BKT fitted with EM
│   ├── dkt.py            single-layer LSTM DKT (PyTorch)
│   ├── evaluate.py       metrics on the same held-out rows
│   ├── export.py         writes web/public/data/*.json (committed)
│   ├── results/          per-dataset result JSON (committed; the website must match these)
│   └── tests/            pytest
└── web/                  Vite + TypeScript static site (this is what Vercel deploys)
    ├── public/data/      JSON written by pipeline/export.py
    └── src/              dashboard + in-browser BKT/DKT inference
```

## Deploy on Vercel (separately from the Synaptic app)

1. In Vercel, **Add New → Project** and import the `sujeth-dev/synthesis` repository
   (a second project; the existing Synaptic project is unaffected).
2. **Root Directory:** `dkt-lab/web` (click *Edit* next to Root Directory). Leave
   "Include files outside the root directory" at its default; nothing outside
   `dkt-lab/web` is needed.
3. **Framework Preset:** `Vite` (or `Other`).
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Install Command:** `npm install` (the default).
7. No environment variables are needed. Click **Deploy**.

`dkt-lab/web/vercel.json` pins the same settings, so steps 3–6 are already
filled in once the root directory is set. The build runs `tsc --noEmit` and then
`vite build`; it does not run Python. All model results are pre-computed and
committed under `web/public/data/`.

Optional: under *Settings → Git → Ignored Build Step*, use
`git diff --quiet HEAD^ HEAD -- .` so the lab only redeploys when `dkt-lab/web`
changes.

## Run locally

```bash
cd dkt-lab/web
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: DKT parity with PyTorch, BKT update maths
npm run build      # type-check + production build into dist/
```

## Isolation from the Synaptic app

- The lab has its own `package.json`, `package-lock.json`, `.gitignore`,
  `tsconfig.json` and `requirements.txt`.
- The repo root `tsconfig.json` globs `**/*.ts`, so the lab's TypeScript is also
  seen by the main app's type-check. The lab therefore keeps its build config in
  plain `.mjs`, and imports no npm package from `.ts` files except `chart.js`
  (one import, in `src/ui/charts.ts`) and `vitest` (tests only). See the comment
  there.
- Check before merging: `git diff --stat main -- . ':!dkt-lab'` must be empty.
