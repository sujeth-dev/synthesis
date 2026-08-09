# DEVELOPMENT_LOOP.md — Autonomous Execution Loop

This defines exactly how an agent (with no memory of any prior conversation) executes work on this repository. The loop is: **READ STATE → SELECT TASK → DEVELOP → TEST → FIX UNTIL PASSING → VERIFY → COMMIT → PUSH → UPDATE PLAN → REPEAT.**

**Governing principle: the repository is the source of truth, not conversation history.** `git log`, `git status`, and the current file contents always outrank anything remembered from a prior session. If `PROGRESS.md` claims something that the repo contradicts, trust the repo and correct `PROGRESS.md` before doing anything else.

---

## Step 1 — READ CURRENT STATE

Every loop iteration starts here, with zero assumptions carried in from before.

1. Read `PROGRESS.md` — completed work, current task, blockers, next action.
2. Read `MASTER_PLAN.md` — full task list and statuses.
3. Run `git status` and `git log --oneline -15`. Confirm the working tree is clean (no uncommitted changes from an interrupted prior run). If there are uncommitted changes:
   - If they look like a completed-but-uncommitted task (matches a task's "Do" description and its tests pass), proceed to Step 6 (VERIFY) for that task instead of starting a new one.
   - If they look like a partial/broken attempt, do not discard them silently — stash with `git stash -u` and note it in `PROGRESS.md`'s Blockers section, then stop and request human input (see Step 9, blocker rules). Never `git reset --hard` or `git clean -f` without a human confirming first.
4. Re-run the last known-good baseline: `npm run build` and `npm test` (once P0-0 exists). If either fails and `PROGRESS.md` didn't already say so, the repo is in an unexpected broken state — this is a blocker, stop and report it (Step 9 rules), do not start new work on top of a broken baseline.

---

## Step 2 — SELECT NEXT TASK

1. Default: the first task in `MASTER_PLAN.md`, in document order, with status `not_started` and all its `Depends on` tasks already `done`.
2. Parallel-eligible tracks (BLOOM-\*, DKT-\*, FSRS-\*, NLP-\*) are lower priority than the sequential Phase 0/1/2/3 line — only pick from them if the next sequential task is genuinely blocked (see Step 9) or a human has explicitly asked for that track.
3. If a task's status is `blocked`, check whether its blocking condition (recorded in `PROGRESS.md`) has been resolved by something outside the loop (e.g. a human answered a question). If yes, set it back to `not_started` and proceed. If no, skip it and continue down the list.
4. If literally every remaining task is `blocked` or has unmet dependencies, stop and report — this is itself a blocker requiring human input.
5. Write the selected task ID into `PROGRESS.md`'s "Current task" field and set its `MASTER_PLAN.md` status to `in_progress` **before** writing any code — this is what makes the loop resumable if it's interrupted mid-task.

---

## Step 3 — DEVELOP

1. Implement the minimal change described in the task's "Do" line. Do not scope-creep into adjacent tasks, even if it's tempting — each task is its own commit and its own verification unit.
2. Follow this repo's existing conventions: no comments unless a non-obvious WHY needs explaining, no speculative abstractions, no error handling for scenarios that can't happen, TypeScript strict mode must stay clean.
3. If, while implementing, it becomes clear the task as written is ambiguous, contradicts another task, or requires a decision only a human can make (e.g. "combination" vs. "pure" scope calls, anything touching money/credentials/external accounts, a design judgment with no documented answer) — stop here, do not guess. Record the specific question in `PROGRESS.md`'s Blockers section, set the task back to `blocked`, and end the loop iteration (Step 9 rules).

---

## Step 4 — TEST

1. Run the task's `Required tests` from `MASTER_PLAN.md` specifically.
2. Run the full test suite (`npm test`).
3. Run `npm run build`.
4. If the task touches `content/`, run `npm run validate`.

---

## Step 5 — FIX UNTIL PASSING

1. If any check from Step 4 fails, diagnose the root cause and fix it. Do not delete or weaken a test to make it pass, and do not add `--no-verify`/skip flags.
2. Retry cap: **5 fix attempts** per task per loop iteration. If still failing after 5 attempts, this is a blocker — do not commit broken or half-working code. Record what was tried and the current failure mode in `PROGRESS.md`, set the task to `blocked`, stop (Step 9 rules).
3. Do not silently reduce a task's acceptance criteria to make it pass faster. If the criteria genuinely seem wrong given what was learned during implementation, that's a blocker to flag, not a thing to quietly edit.

---

## Step 6 — VERIFY

1. Re-check the task's exact `Acceptance criteria` list in `MASTER_PLAN.md` line by line — not just "tests are green," but each stated criterion specifically (e.g. "manual check p_know visibly decreases" needs an actual manual/scripted confirmation, not just inference from a unit test passing).
2. Confirm no regression: full test suite still green, `npm run build` clean.
3. If a criterion can't be verified automatically (e.g. a manual UI check with no test harness available), perform the closest available check and say so explicitly in the commit message and `PROGRESS.md` — never mark a task `done` on an unverified claim.

---

## Step 7 — COMMIT

1. One task = one commit (or a small, clearly-scoped group of commits if the task naturally splits, e.g. "add failing test" then "fix it" for P0-1/P0-2-style pairs — but never bundle two different task IDs into one commit).
2. Stage only files relevant to the task (`git add <specific files>`, never blanket `-A` without reviewing `git status` first).
3. Before committing, check `git status` output for anything unexpected (stray files, anything that looks like it could contain a secret) — double-check contents of anything suspicious before staging it.
4. Commit message format: short imperative summary, then 1-2 sentences on why, referencing the task ID:
   ```
   Fix p_know decay on overdue reviews (P0-2)

   reconcileBktSm2() now applies decay on every session load,
   not just the mastery-loss edge case. Closes Finding 01.
   ```
5. Never use `--no-verify`, `--no-gpg-sign`, or amend an existing commit. Always a new commit.

---

## Step 8 — PUSH

1. `git push origin main`.
2. If the push is rejected because remote has diverged: `git pull --rebase origin main` once, re-run the full test suite after the rebase (the rebase can silently reintroduce a conflict-resolution bug), then push again.
3. If the rebase produces a merge conflict, or the second push attempt also fails: stop. Do not force-push. Record the exact situation in `PROGRESS.md`, set the task to `blocked`, request human input.
4. Never force-push (`--force`/`--force-with-lease`) without explicit human instruction for that specific push.

---

## Step 9 — UPDATE PLAN

1. On success: set the task's status to `done` in `MASTER_PLAN.md`. Append a one-line entry to `PROGRESS.md`'s "Completed work" log (task ID, one-line summary, commit hash). Clear "Current task." Set "Next action" to the next task the loop would pick per Step 2.
2. On blocker (from Step 3, 5, or 8): set the task's status to `blocked` in `MASTER_PLAN.md`. Write a specific, actionable entry in `PROGRESS.md`'s "Blockers" section: what was attempted, what failed, what decision or input is needed. Set "Next action" to "awaiting human input on <task ID>." **Stop the loop here** — do not proceed to another task while a blocker is unresolved and unacknowledged, unless the blocked task is explicitly non-blocking for the rest of the plan (parallel-eligible tracks only).
3. Commit the `MASTER_PLAN.md`/`PROGRESS.md` update itself — either combined with the task's commit (Step 7) or as a small separate `docs: update plan` commit. Plan-doc updates follow the same push rules as Step 8.

---

## Step 10 — REPEAT

Return to Step 1. Every iteration re-reads state from scratch — nothing is carried over from "memory" of the previous iteration within the same run, and definitely nothing from a previous conversation.

---

## What counts as a blocker requiring human input (stop, don't guess)

- Ambiguous or contradictory acceptance criteria that can't be resolved by re-reading the cited doc.
- A task requires a decision with no documented answer (design judgment, scope call, product tradeoff).
- A task needs credentials, an external account, or a paid API key that isn't already configured (e.g. the LLM API for NLP-\* tasks — confirm `ANTHROPIC_API_KEY` or equivalent exists in `.env.local` before starting NLP-2 onward; if missing, that's a blocker, not something to fabricate).
- 5 fix attempts exhausted on the same failure (Step 5).
- A push conflict that survives one rebase attempt (Step 8).
- Anything that would require a destructive git operation (`reset --hard`, `push --force`, deleting a branch) to proceed.
- A task whose implementation would touch production data, send external communications, or affect shared infrastructure beyond this repo.
- Live cutover of an experimental system to production behavior (e.g. FSRS-5, DKT live cutover at P3-3) — shadow-mode/benchmark work up to that point is fine to automate; flipping it live gets a human sign-off first, flagged explicitly even if all automated checks pass.

When any of these hit: write the specific blocker to `PROGRESS.md`, stop, do not attempt a workaround that bypasses the actual question.

---

## Resumability contract

Any agent — with zero memory of this or any prior session — can resume the loop correctly by:
1. Reading `PROGRESS.md` (what's done, what's current, what's blocked).
2. Reading `MASTER_PLAN.md` (task statuses, acceptance criteria).
3. Running `git log`/`git status` to confirm the repo matches what those two files claim.
4. Starting at Step 1 above.

No other context is required. If at any point the repo state and the docs disagree, the repo wins — fix the docs to match reality as the very first action, then proceed.
