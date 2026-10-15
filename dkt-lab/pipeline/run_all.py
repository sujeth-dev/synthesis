"""Whole offline pipeline, in order. Run from dkt-lab/pipeline:

    python run_all.py            # datasets -> split -> stats -> BKT+DKT -> export -> check
    python run_all.py --tuning   # also the Lab 6 DKT tuning experiments (slow)
"""
import argparse
import subprocess
import sys

STEPS = [
    ["datasets.py"], ["split.py"], ["stats.py"], ["run.py"],
]

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--tuning", action="store_true")
    a = p.parse_args()
    steps = STEPS + ([["tune.py"], ["tuning_report.py"]] if a.tuning else []) + [["export.py"], ["export.py", "--fixture"], ["check_web.py"]]
    for s in steps:
        print(f"\n=== python {' '.join(s)}")
        subprocess.run([sys.executable, *s], check=True)
