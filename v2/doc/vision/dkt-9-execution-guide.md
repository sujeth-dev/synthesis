# DKT-9 Execution Guide — real interaction export

**Status:** ready to execute. This turns the DKT-9 row in `MASTER_PLAN.md` and
the "what can genuinely start today" section of
`v2/doc/vision/dkt-live-integration-scope.md` into concrete steps for a new
session. Read that scope doc first — this guide assumes its three blockers as
context and only details how to clear the one (`DKT-9`) that's actually
startable right now.

## The discovery that changes DKT-9's shape

DKT-9 was scoped as "log real learner interactions in Synaptic's own
`(student_id, skill_id, correct, timestamp)` shape." Checking the schema
before writing this guide found that this already exists and has since
`001_initial_schema.sql`:

- `attempt_events` (`supabase/migrations/001_initial_schema.sql`) has
  `learner_id`, `skill_id`, `correct`, `attempted_at` on every row.
- Every real attempt writes one via `insertAttempt()`
  (`src/lib/db/queries.ts:197`), called from
  `src/app/api/attempt/route.ts:178`.
- That is exactly `(student_id, skill_id, correct, timestamp)` — DKT-9's
  target shape — already being written, with no new instrumentation needed.

So **DKT-9 is not "build a logger."** The logger has existed the whole time.
The real remaining work is: export what's already logged into the CSV shape
`Research/dkt/`'s existing pipeline expects, and report real volume against
the retraining threshold DKT-10 is gated on. That's a smaller, more precise
task than the original one-line scope suggested — do exactly this, nothing
more.

## What the export must match

`Research/dkt/preprocess.py`'s docstring defines the target contract other
scripts in the pipeline (`split.py`, `bkt_baseline.py`, `train_dkt.py`)
already consume without modification:

```
Output: data/sequences.csv with columns
    student_id, skill_id, correct, timestamp
sorted by (student_id, timestamp), one row per retained interaction.
```

`train_dkt.py`'s `build_skill_index()` (`Research/dkt/train_dkt.py:65-67`)
builds its skill vocabulary from `sorted(df["skill_id"].unique())` — fully
data-driven, so Synaptic's string skill IDs (`p1_what_is_computer`, etc.)
work as-is for training. **One known exception, not this session's job to
fix:** `train_dkt.py:248` does `int(index_to_skill[...])` when rebuilding
test predictions for the results file — that line assumes ASSISTments'
numeric skill IDs and will throw on Synaptic's string ones. Leave it. Note
it in this session's commit message as a flagged DKT-10 follow-up; do not
edit `train_dkt.py` in this session — that file's contract is
research-benchmark-only per `DKT-1`'s original guardrails.

## Where this runs

A **new** worktree, `dkt-live-track`, branched from `v2`'s tip — not the
existing `dkt-track` worktree (`C:/Users/user/OneDrive/Desktop/Grit/synaptic-dkt`,
branch `dkt-track`, based on pre-`v2` `main`). That one is reserved for the
ASSISTments benchmark under its original "never touch `src/`, never touch
live data" guardrail. This task is the opposite: it needs the live app's
Supabase connection and DB-access conventions, so it belongs on `v2`, in a
worktree of its own so it can commit independently without racing other
tracks' doc edits.

## Deliverables, in order

1. **`scripts/dkt-export-interactions.js`** — model its Supabase connection
   handling directly on `scripts/fsrs-shadow-comparison.js`: `pg` `Client` +
   `SUPABASE_DB_URL` read from `.env.local`, the same `sanitize()` regex so a
   connection string can never leak into stdout/stderr on error. Query:

   ```sql
   select learner_id as student_id, skill_id, correct, attempted_at as timestamp
   from attempt_events
   order by learner_id, attempted_at asc
   ```

   Write the result to `Research/dkt/data/synaptic_interactions.csv` with a
   `student_id,skill_id,correct,timestamp` header — same columns, same order,
   same filename convention `preprocess.py` already uses for its own output.

2. **Volume report**, printed by the same script (mirror
   `fsrs-shadow-comparison.js`'s reporting style): total row count, unique
   `student_id` count, unique `skill_id` count, and an explicit line
   comparing the row count against the 50k-interaction figure from
   `dkt-live-integration-scope.md`'s Blocker 1 — e.g.
   `"12 / 50,000 interactions (0.02%) — DKT-10 retraining is not yet justified by volume."`
   Don't editorialize beyond that one line; the actual go/no-go call for
   DKT-10 is a separate decision, not this script's job.

3. **Register the run command** — add `"dkt:export": "node scripts/dkt-export-interactions.js"`
   to `package.json`'s `scripts` block, next to the existing `fsrs:compare`
   entry.

4. **Verify the ignore pattern actually matches before trusting it.** The
   existing `.gitignore` has `research/dkt/data/` (lowercase `research/`),
   but the real directory on disk is `Research/dkt/` (capital `R`, confirmed
   via `git worktree` listing). Run
   `git check-ignore -v Research/dkt/data/synaptic_interactions.csv` after
   the first export. If it reports *not* ignored, add an explicit
   `Research/dkt/data/` line to `.gitignore` rather than assuming
   case-insensitivity saves you — don't let a real (if small) interaction
   dataset get committed.

5. **Update `MASTER_PLAN.md`'s `DKT-9` row** (currently `not_started` at
   line 151) to `done`, with the real row/student/skill counts from step 2
   inline — not "logging implemented," since logging already existed; say
   what was actually built (the export + report). Add a `PROGRESS.md` entry
   with the same real numbers.

6. **Only if there's real non-trivial logic to test** (e.g., a timestamp
   format transform, filtering of malformed rows), add a small unit test for
   it. If the script ends up being a thin query-and-write with no branching
   worth testing in isolation, say so explicitly in the commit message
   rather than writing a test for the sake of having one.

## Guardrails

- **Read-only.** This script must never write to `attempt_events` or any
  other production table — only `select`.
- No PII beyond what's already in the schema: `attempt_events` has no name,
  email, or free-text column — `learner_id` is an opaque generated ID
  (`generateId()`), `skill_id`/`correct`/`attempted_at` are non-identifying.
  If anything unexpected turns up in a real row that looks like PII, stop
  and flag it before writing the CSV.
- Never `console.log` the connection string or any raw `.env.local` value —
  reuse `sanitize()` on every error path, same as the two existing scripts.
- Do not edit `Research/dkt/preprocess.py`, `split.py`, `bkt_baseline.py`, or
  `train_dkt.py`. DKT-9 produces a second, additional input file for that
  pipeline — it does not modify the pipeline itself. Adapting the pipeline
  to actually train on Synaptic's export (including the `train_dkt.py:248`
  int-cast issue) is DKT-10, not this session.
- Do not start DKT-10. This session's output (the real volume numbers) is
  what DKT-10's go/no-go depends on — report the numbers and stop.

## Verification before committing

- `npm run dkt:export` runs against the real Supabase DB and produces
  `Research/dkt/data/synaptic_interactions.csv` with a real row count
  (could legitimately be a small number — report it honestly either way).
- `npm test`, `npm run build`, `npm run validate` all stay green — this
  change touches one new script file + one `package.json` line +
  doc/plan files, nothing in `src/`.
- `git status` shows only: `scripts/dkt-export-interactions.js` (new),
  `package.json` (one line), `MASTER_PLAN.md`, `PROGRESS.md`, possibly
  `.gitignore` (only if step 4 found it necessary). The CSV itself must
  show as ignored/untracked, never staged.
- Commit locally on `dkt-live-track`. **Do not push. Do not merge into
  `v2`.** Same review-before-merge pattern already used for
  `fsrs-live-track` — the orchestrating session reviews the real volume
  numbers before this goes anywhere near `v2`.

## Session-start prompt

```
Continue the Synaptic project's DKT live-integration track. Read
v2/doc/vision/dkt-9-execution-guide.md in full first — it has the exact
deliverables, file/query shapes, and guardrails for this session. Read
v2/doc/vision/dkt-live-integration-scope.md for the full blocker context
behind why this step exists. Execute DKT-9 exactly as scoped in the
execution guide: an export script (scripts/dkt-export-interactions.js)
that pulls real rows from the live attempt_events table into the CSV shape
Research/dkt/preprocess.py already expects, plus a real volume report
against the 50k-interaction figure — nothing beyond that (no retraining,
no pipeline edits, no cutover). Commit locally on this branch when done;
do not push, do not merge. Report back the real numbers you found.
```
