"""Write everything the website needs into dkt-lab/web/public/data/ (committed).

Adapted from Research/dkt/export_weights.py: the same base64 float32 weights
format (written by dkt.weights_json) and the same --fixture idea for the
browser parity test, here with a generic skill list instead of the curriculum.

Every reported number is copied from results/<name>.json (written by the
pipeline) without recomputation, so the website can be checked against the
results files exactly (see check_web.py).

Usage:
    python export.py              # all datasets present in results/
    python export.py --fixture    # parity fixture for the vitest DKT test
"""
import argparse
import base64
import json
import os
import shutil
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
RESULTS_DIR = os.path.join(HERE, "results")
WEB_DATA = os.path.abspath(os.path.join(HERE, "..", "web", "public", "data"))
FIXTURE_PATH = os.path.abspath(os.path.join(HERE, "..", "web", "src", "models", "fixtures", "parity.json"))

ORDER = ["assist2009", "assist2015", "synthetic5", "synaptic_sim"]

# Results the Synaptic app itself produced (read-only, like the Scheduling
# tab's scheduler-comparison.json). Copied byte-for-byte into
# web/public/data/app/, never recomputed; check_web.py fails if a copy drifts
# from its source, which is what keeps the "Synaptic app" tab honest after the
# app's own comparison scripts are re-run.
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
APP_RESULTS = [
    "Research/dkt/results/dkt12_comparison.json",
    "Research/dkt/results/level14_arms.json",
    "Research/dkt/results/synaptic_dkt_results.json",
    "Research/bkt/results/per-skill-params.json",
]
INDEX_KEYS = ("id", "name", "kind", "kind_label", "source_url", "licence", "citation", "notes",
              "downloaded_from", "download_url", "has_timestamps", "skill_trimming")


def write_json(rel: str, obj) -> None:
    path = os.path.join(WEB_DATA, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))


def load_results(name: str) -> dict:
    with open(os.path.join(RESULTS_DIR, f"{name}.json")) as f:
        return json.load(f)


def available() -> list:
    have = {fn[:-5] for fn in os.listdir(RESULTS_DIR) if fn.endswith(".json") and fn[:-5] in ORDER}
    return [n for n in ORDER if n in have]


def export_dataset(name: str) -> dict:
    res = load_results(name)
    prov = res["provenance"]
    entry = {k: prov.get(k) for k in INDEX_KEYS}
    write_json(f"{name}/stats.json", {"provenance": entry, "stats": res["stats"]})
    for part in ("metrics", "curves", "heatmap", "samples", "bkt_params", "diagnostics"):
        if part in res:
            write_json(f"{name}/{part}.json", res[part])
    weights = os.path.join(DATA_DIR, name, "dkt_weights.json")
    if os.path.exists(weights):
        with open(weights) as f:
            write_json(f"{name}/dkt_weights.json", json.load(f))
    return entry


def app_result_dest(source: str) -> str:
    return os.path.join(WEB_DATA, "app", os.path.basename(source))


def export_app_results() -> None:
    os.makedirs(os.path.join(WEB_DATA, "app"), exist_ok=True)
    for source in APP_RESULTS:
        shutil.copyfile(os.path.join(REPO, source), app_result_dest(source))


def export_all() -> None:
    names = available()
    entries = [export_dataset(n) for n in names]
    skipped_path = os.path.join(DATA_DIR, "skipped.json")
    skipped = json.load(open(skipped_path)) if os.path.exists(skipped_path) else {"not_attempted": [], "failed_this_run": {}}
    write_json("index.json", {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "datasets": entries,
        "skipped": skipped["not_attempted"] + [{"name": k, "reason": v, "url": None} for k, v in skipped["failed_this_run"].items()],
    })
    for extra in ("summary.json", "dkt_tuning.json"):
        p = os.path.join(RESULTS_DIR, extra)
        if os.path.exists(p):
            with open(p) as f:
                write_json(extra, json.load(f))
    export_app_results()
    print(f"Exported {len(names)} datasets -> {WEB_DATA}")


def b64(array) -> str:
    import numpy as np
    return base64.b64encode(np.asarray(array, dtype="<f4").tobytes()).decode("ascii")


def export_fixture() -> None:
    """Small random DKT + histories + PyTorch outputs, for the in-browser parity test."""
    import numpy as np
    import torch
    from dkt import DKTModel, weights_json, torch_predict_all

    torch.manual_seed(0)
    skills = [f"k{i}" for i in range(12)]
    model = DKTModel(len(skills), hidden_size=16)
    rng = np.random.default_rng(0)
    histories = [[]] + [[(int(rng.integers(len(skills))), int(rng.integers(2))) for _ in range(n)] for n in (1, 5, 40)]
    cases = []
    for hist in histories:
        cases.append({
            "history": [{"skill": skills[s], "correct": bool(c)} for s, c in hist],
            "expected": torch_predict_all(model, hist),
        })
    os.makedirs(os.path.dirname(FIXTURE_PATH), exist_ok=True)
    with open(FIXTURE_PATH, "w") as f:
        json.dump({"weights": weights_json(model, skills, synthetic=True), "cases": cases}, f)
    print(f"Wrote {FIXTURE_PATH}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--fixture", action="store_true")
    a = p.parse_args()
    export_fixture() if a.fixture else export_all()
