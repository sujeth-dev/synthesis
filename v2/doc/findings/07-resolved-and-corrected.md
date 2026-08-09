# Finding 07 — Corrections to earlier findings (resolved, not open)

Two items that earlier documentation (the lab audit, and an earlier draft of `basic-guide.md`) listed as open critical gaps turn out to already be handled in code. Recorded here explicitly so neither gets re-flagged as new work, and so `basic-guide.md`'s "Critical Fixes" section can be corrected to match.

## Motivation FSM "has no defined transition signals" — already resolved

`Research/lab/07-audit.md` lists this as CRITICAL. Direct inspection of `src/lib/motivation/index.ts` shows concrete numeric triggers already exist (≥3 consecutive errors, ≥4 slow responses over 15s, ≥5-correct streak with `p_know` ≥ 0.80, 10-minute intervention cooldown). The lab doc was stale relative to the code at the time this was first checked. No action needed beyond noting it.

## Orbit stage → `p_know` mapping — already resolved, corrects `basic-guide.md` Phase 0 item 3

`basic-guide.md`'s "Critical Fixes" section currently lists *"Orbit stages never mapped to BKT `p_known` ranges (CRITICAL, still open)"* as Phase 0 item 3, inherited from `07-audit.md`. Direct inspection this session shows this is **not open**: `deriveMasteryState()` (`src/lib/bkt/index.ts:15-21`) already maps `p_know` to the 5-state `MasteryState` (`blocked | ready | learning | fragile | mastered`, `src/types/index.ts:1`) with explicit thresholds — `MASTERY_THRESHOLD = 0.65`, `FRAGILE_THRESHOLD = 0.55`, `LEARNING_THRESHOLD = 0.30` (`bkt/index.ts:3`). The mastery badge shown in the UI is an honest read of this function's output.

**What's genuinely still open** is a different, narrower thing than what was documented: `p_know` itself never decays with elapsed time (Finding 01) — so the *mapping* is correct, but the *input to the mapping* can go stale. `basic-guide.md`'s Phase 0 item 3 should be corrected to point at Finding 01 rather than restating the "mapping doesn't exist" claim, which is false.

**Action:** done — `basic-guide.md`'s Critical Fixes section (item 3) and Phase 0 build list were updated 2026-08-09 to reflect this correction.
