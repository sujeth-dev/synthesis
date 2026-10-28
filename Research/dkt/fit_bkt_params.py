"""BKT-14: fit per-skill BKT parameters for the app's live engine.

The app runs ONE global parameter set for all 120 skills
(`BKT_DEFAULTS` in src/lib/bkt/index.ts). Every BKT the research in this
repository reports is per-skill EM-fitted, and on the app's own simulated data
that model scores AUC 0.7345 against the live engine's 0.7168 -- better than
every DKT variant measured. This script produces that parameter set in a shape
the app can load.

It reuses bkt_baseline.py's EM (Baum-Welch) fit unchanged; only the input,
the output shape and the provenance are new.

Input: any CSV whose columns include student_id, skill_id, correct
  - the simulator's event log (Research/sim/output/sm2_events.csv)  SYNTHETIC
  - or real attempts from `npm run dkt:export`
      (Research/dkt/data/synaptic_interactions.csv)

Output: src/lib/bkt/fitted-params.json (committed)

The `synthetic` flag in that file is load-bearing, not documentation: a
parameter set fitted on the simulator describes the simulator's hand-written
memory model, not learners, so src/lib/bkt/params.ts refuses to APPLY one even
when BKT_PER_SKILL=1 is set. It is still logged for comparison.

Usage: python fit_bkt_params.py [--input PATH] [--out PATH]
"""
import argparse
import json
import os
from datetime import datetime, timezone

import pandas as pd

from bkt_baseline import MIN_TRAIN_SEQUENCES, fit_skill_bkt
from train_synaptic import DEFAULT_INPUT, REPO, curriculum_skill_index

OUT_PATH = os.path.join(REPO, "src", "lib", "bkt", "fitted-params.json")
FORMAT = "synaptic-bkt-params-v1"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--out", default=OUT_PATH)
    args = parser.parse_args()
    if not os.path.exists(args.input):
        raise FileNotFoundError(f"{args.input} not found -- run `npm run sim` (or `npm run dkt:export`) first.")

    skill_index = curriculum_skill_index()
    df = pd.read_csv(args.input)
    unknown = sorted(set(df["skill_id"]) - set(skill_index))
    if unknown:
        raise ValueError(f"{len(unknown)} skill IDs are not in the curriculum, e.g. {unknown[:3]}")
    df["correct"] = df["correct"].astype(int)
    # `true_recall` is a column only the simulator writes, so its presence is
    # what marks a parameter set as describing simulated learners.
    synthetic = "true_recall" in df.columns

    skills, skipped = {}, []
    for skill_id, rows in df.groupby("skill_id"):
        sequences = [g["correct"].to_numpy() for _, g in rows.groupby("student_id") if len(g) > 0]
        if len(sequences) < MIN_TRAIN_SEQUENCES:
            skipped.append(skill_id)
            continue
        params = fit_skill_bkt(sequences)
        skills[str(skill_id)] = {
            "p_init": params["p_init"], "p_transit": params["p_transit"],
            "p_slip": params["p_slip"], "p_guess": params["p_guess"],
            "n_sequences": len(sequences),
        }

    out = {
        "format": FORMAT,
        "fitted_from": {
            "source": os.path.relpath(args.input, REPO),
            "rows": int(len(df)),
            "learners": int(df["student_id"].nunique()),
            "synthetic": synthetic,
            "min_sequences": MIN_TRAIN_SEQUENCES,
            "fitted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "skills": skills,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
        f.write("\n")

    print(f"Fitted {len(skills)} of {len(skill_index)} curriculum skills "
          f"from {len(df)} rows ({'SYNTHETIC' if synthetic else 'real'}); "
          f"{len(skipped)} skipped under {MIN_TRAIN_SEQUENCES} sequences.")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
