# FSRS shadow-mode comparison (FSRS-4)

Doc ref: `MASTER_PLAN.md`'s FSRS track, `basic-guide.md` §"DKT / FSRS / NLP" section B.

## Status: methodology and tooling complete; real-data comparison pending volume

This document is the FSRS-4 deliverable — a comparison of what FSRS would
have scheduled against what SM-2 actually scheduled, over shadow-mode data
logged by FSRS-3 (`src/app/api/attempt/route.ts`, `fsrs_shadow_log` table,
migration `supabase/migrations/004_fsrs_shadow_log.sql`).

~~**There is currently no real shadow-mode data to compare.**~~ **Resolved
2026-08-12:** migration 004 is applied to the live Supabase database (via
`supabase link`/`supabase db push` with a personal access token, the same
one-off CLI method used for 002/003 — the originally-preferred
`apply-migrations.js`/`SUPABASE_DB_URL` path needed the direct-connection
host, which turned out to be IPv6-only and unreachable from the network in
use; the session-pooler connection string resolved it, and `SUPABASE_DB_URL`
is now correctly set for future use of that script too). One real review
cycle has been produced end-to-end (`tests/e2e/fsrs-shadow-live-cycle.spec.ts`
— registers a real learner, runs diagnostic init, submits one real attempt
through the live `/api/attempt` path, confirms a real `fsrs_shadow_log` row).

**First real `npm run fsrs:compare` output (2026-08-12, n=1):**

```
Sample size:                 1
Mean SM-2 interval (days):   1.00
Mean FSRS interval (days):   8.00
Mean signed delta (days):    7.00 (positive = FSRS longer)
Mean absolute delta (days):  7.00
Interval correlation (r):    n/a
```

`hasSufficientSample()`'s 30-row minimum is correctly not met by n=1 — no
cutover recommendation is drawn from this. This single point does show FSRS
scheduling a materially longer interval than SM-2 on a first-ever review
(expected: FSRS's default parameters assume more initial stability than a
fresh SM-2 card does), but one data point proves the pipeline works, not
that FSRS is right. **Still needed before FSRS-4 can write an actual
recommendation:** real usage accumulating ≥30 shadow-log rows — either
organic learner activity, or a deliberately larger scripted batch if that's
preferred over waiting. Re-run `npm run fsrs:compare` once that volume
exists and replace this section with the real output + recommendation.

Concretely, that means:
- No real learner has any `fsrs_shadow_log` rows yet.
- FSRS-3's "run in shadow mode for ≥1 full review cycle" has not happened
  against production data — only against the mocked integration test's
  simulated cycle.
- **No cutover recommendation can honestly be made yet.** Writing one now
  would mean fabricating a conclusion from data that doesn't exist. That is
  exactly the kind of guess `DEVELOPMENT_LOOP.md` says to stop and flag
  rather than make.

## What's ready to run once the migration is live

1. A human applies migration 004 (e.g. by adding `SUPABASE_DB_URL` to
   `.env.local` and running `npm run db:migrate`, or by whatever mechanism
   they choose for this deployment).
2. The app runs normally for at least one full review cycle so
   `fsrs_shadow_log` accumulates real rows alongside real SM-2 reviews.
3. Run `npm run fsrs:compare` (`scripts/fsrs-shadow-comparison.js`). It
   connects with the same `SUPABASE_DB_URL` used for migrations, pulls every
   `fsrs_shadow_log` row, and prints:
   - sample size
   - mean SM-2 interval vs. mean FSRS interval (days)
   - mean signed delta (positive = FSRS scheduled longer than SM-2)
   - mean absolute delta
   - Pearson correlation between the two interval series
4. The script flags whether the sample meets `MIN_SAMPLE_FOR_SIGNAL` (30
   rows) — below that, the numbers are printed but explicitly labeled as too
   thin to draw a conclusion from.
5. Once there's a real, sufficiently large sample, replace this section with
   the actual output and a written recommendation: does FSRS's schedule
   diverge meaningfully from SM-2's (low correlation / large mean delta), and
   if so, does it look like FSRS is being more conservative or more
   aggressive than SM-2 (sign of the mean delta)? That recommendation is
   input to `FSRS-5`, which still needs separate human sign-off regardless of
   what the numbers show — this script never renders a "cutover: yes/no"
   verdict itself, by design (see `hasSufficientSample()` in
   `src/lib/fsrs/comparison.ts`).

## Where the logic lives

- `src/lib/fsrs/comparison.ts` — pure statistics (`computeShadowDivergence`,
  `hasSufficientSample`), unit-tested in
  `src/lib/fsrs/comparison.test.ts` against synthetic data (empty sample,
  mixed deltas, perfect correlation, zero-variance/undefined correlation).
- `scripts/fsrs-shadow-comparison.js` — the runnable script; duplicates the
  same small pure formula in plain JS (this repo's scripts have no TS build
  step, matching `scripts/apply-migrations.js`'s existing convention) — keep
  the two in sync if the formula changes.
