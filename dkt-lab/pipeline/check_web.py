"""Re-check the reported numbers: every JSON the website reads must equal the
pipeline's results/*.json exactly (same values, nothing recomputed or rounded).

Usage: python check_web.py      (exit code 1 on any mismatch)
"""
import json
import os
import sys

from export import RESULTS_DIR, WEB_DATA, available


def load(path):
    with open(path) as f:
        return json.load(f)


def main() -> int:
    problems, checked = [], 0
    for name in available():
        res = load(os.path.join(RESULTS_DIR, f"{name}.json"))
        web_stats = load(os.path.join(WEB_DATA, name, "stats.json"))
        pairs = [("stats", web_stats["stats"])]
        for part in ("metrics", "curves", "heatmap", "samples", "bkt_params", "diagnostics"):
            p = os.path.join(WEB_DATA, name, f"{part}.json")
            if part in res:
                pairs.append((part, load(p) if os.path.exists(p) else None))
        for part, web in pairs:
            checked += 1
            if web != res[part]:
                problems.append(f"{name}/{part}.json differs from results/{name}.json[{part!r}]")
    for extra in ("summary.json", "dkt_tuning.json"):
        r = os.path.join(RESULTS_DIR, extra)
        if os.path.exists(r):
            checked += 1
            w = os.path.join(WEB_DATA, extra)
            if not os.path.exists(w) or load(w) != load(r):
                problems.append(f"{extra} differs")
    for p in problems:
        print("MISMATCH:", p)
    print(f"checked {checked} files: {'OK' if not problems else f'{len(problems)} mismatches'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
