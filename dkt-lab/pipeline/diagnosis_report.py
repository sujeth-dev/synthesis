"""Turn results/<ds>.json["diagnostics"] into the markdown tables of the
write-up, so no number in FINDINGS-CURVES.md is typed by hand.

Public benchmarks and the Synaptic simulator are tabulated in separate
sections: they answer different questions, and the simulator's "ground truth"
is only as good as the simulator's own assumptions.

Usage:
    python diagnosis_report.py            # print to stdout
    python diagnosis_report.py --write    # replace the tables in FINDINGS-CURVES.md
"""
from __future__ import annotations

import argparse
import json
import os

from stats import RESULTS_DIR

HERE = os.path.dirname(os.path.abspath(__file__))
FINDINGS = os.path.abspath(os.path.join(HERE, "..", "FINDINGS-CURVES.md"))
BEGIN = "<!-- BEGIN GENERATED TABLES -->"
END = "<!-- END GENERATED TABLES -->"

PUBLIC = ["assist2009", "assist2015", "synthetic5"]
SIM = ["synaptic_sim"]
BASELINES = ["global_rate", "skill_rate", "student_rate", "skill_and_student"]


def load(names: list[str]) -> dict:
    out = {}
    for n in names:
        p = os.path.join(RESULTS_DIR, f"{n}.json")
        if not os.path.exists(p):
            continue
        with open(p) as f:
            d = json.load(f)
        if "diagnostics" in d:
            out[n] = d["diagnostics"]
    return out


def _f(v, nd=4, signed=False):
    if v is None or (isinstance(v, float) and v != v):
        return "—"
    return f"{v:+.{nd}f}" if signed else f"{v:.{nd}f}"


def table(header: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(header) + " |",
           "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(rows_) + " |" for rows_ in rows]
    return "\n".join(out)


def growth_table(d: dict) -> str:
    """The headline: does the model reproduce the observed growth?"""
    rows, notes = [], []
    for name, g in d.items():
        cf = g["cohort_curve_fidelity"]
        if not cf.get("models"):
            rows.append([f"`{name}`", str(g["cohort_curve"]["pairs"])] + ["—"] * 5)
            notes.append(f"`{name}` has no cohort curve: every (student, skill) pair is answered "
                         f"exactly once, so there is no n-th attempt to plot.")
            continue
        m = cf["models"]
        rows.append([f"`{name}`", str(g["cohort_curve"]["pairs"]), _f(cf["actual_slope"], 5),
                     _f(m["bkt"]["slope_ratio"], 2), _f(m["dkt"]["slope_ratio"], 2),
                     _f(m["bkt"]["mae"]), _f(m["dkt"]["mae"])])
    out = table(["dataset", "pairs", "observed slope", "BKT slope ratio", "DKT slope ratio",
                 "BKT curve MAE", "DKT curve MAE"], rows)
    return out + ("\n\n" + "\n".join(f"- {n}" for n in notes) if notes else "")


def baseline_table(d: dict) -> str:
    """AUC of every model and every no-learning baseline on identical rows."""
    rows = []
    for name, g in d.items():
        s = g["all_model_scores"]
        rows.append([f"`{name}`", str(s["bkt"]["n"]), _f(s["bkt"]["auc"]), _f(s["dkt"]["auc"])]
                    + [_f(s[b]["auc"]) for b in BASELINES])
    return table(["dataset", "n", "BKT", "DKT", "global rate", "skill rate",
                  "student rate", "skill+student"], rows)


def mechanism_table(d: dict) -> str:
    """Does the model update on the answer it just saw, and does it hold still
    on the skills it did not?"""
    rows = []
    for name, g in d.items():
        for model in ("bkt", "dkt"):
            e = g["evidence_response"][model]
            c = g["consistency"][model]
            rows.append([f"`{name}`", model.upper(),
                         _f(e["after_correct"]["fraction_positive"], 2),
                         _f(e["after_wrong"]["fraction_negative"], 2),
                         _f(e["separation"], 4, signed=True),
                         _f(c["w1"], 5), _f(c["reconstruction_error"])])
    return table(["dataset", "model", "moves up after correct", "moves down after wrong",
                  "separation", "w1 (cross-skill thrash)", "reconstruction error"], rows)


def position_table(d: dict) -> str:
    """Ranking vs calibration as a sequence runs on: the first and last decile."""
    rows = []
    for name, g in d.items():
        bins = g["position_slices"]["bins"]
        if len(bins) < 2:
            rows.append([f"`{name}`"] + ["—"] * 6)
            continue
        a, z = bins[0], bins[-1]
        rows.append([f"`{name}`", f"{a['from']}–{a['to']} / {z['from']}–{z['to']}",
                     f"{_f(a['dkt']['auc'])} → {_f(z['dkt']['auc'])}",
                     f"{_f(a['dkt']['ece'])} → {_f(z['dkt']['ece'])}",
                     f"{_f(a['bkt']['auc'])} → {_f(z['bkt']['auc'])}",
                     f"{_f(a['bkt']['ece'])} → {_f(z['bkt']['ece'])}"])
    return table(["dataset", "position decile (first / last)", "DKT AUC", "DKT ECE",
                  "BKT AUC", "BKT ECE"], rows)


def audit_table(d: dict) -> str:
    """Can the dataset support a learning curve at all?"""
    rows = []
    for name, g in d.items():
        a = g["dataset_audit"]
        multi = a.get("raw_multi_skill")
        rows.append([f"`{name}`", str(a["max_opportunity"]),
                     _f(a["mean_attempts_per_student_skill"], 2),
                     _f(a["fraction_pairs_with_one_attempt"], 2),
                     str(a["max_sequence_length"]),
                     _f(multi["fraction_rows_from_multi_skill_problems"], 2) if multi else "—"])
    return table(["dataset", "max opportunity", "mean attempts per (student, skill)",
                  "pairs with one attempt", "longest sequence", "rows from multi-skill problems"], rows)


def reproduction_table(d: dict) -> str:
    rows = [[f"`{name}`", f"{g['reproduction_check']['max_abs_delta']:.1e}",
             "yes" if g["reproduction_check"]["ok"] else "**NO**"] for name, g in d.items()]
    return table(["dataset", "largest absolute difference vs committed metrics",
                  "within tolerance"], rows)


def section(title: str, d: dict) -> str:
    if not d:
        return f"### {title}\n\n_No diagnostics found — run `python diagnose.py` first._\n"
    return "\n".join([
        f"### {title}", "",
        "**Growth fidelity** — the cohort curve holds the population fixed, so a flat line here is a real",
        "absence of growth rather than a change of who is being averaged. A slope ratio of 1.00 reproduces",
        "the observed growth; 0.00 is flat.", "", growth_table(d), "",
        "**AUC against no-learning baselines** — identical held-out rows. The baselines contain no notion of",
        "practice on a skill, so they bound what difficulty and ability alone can buy.", "", baseline_table(d), "",
        "**Mechanism** — does the prediction for a skill move the right way after an answer on that skill,",
        "and do the untouched skills stay still?", "", mechanism_table(d), "",
        "**Ranking vs calibration with depth into the sequence** — first and last position decile.", "",
        position_table(d), "",
        "**Dataset audit** — whether a learning curve is measurable at all.", "", audit_table(d), "",
        "**Reproduction check** — predictions were reproduced from the committed weights, not retrained.", "",
        reproduction_table(d), "",
    ])


# ── Lab 9: the fix experiments ──────────────────────────────────────────────
IMPROVE = os.path.join(RESULTS_DIR, "dkt_improve.json")


def load_improve() -> dict:
    if not os.path.exists(IMPROVE):
        return {}
    with open(IMPROVE) as f:
        return json.load(f)


def candidate_table(runs: list[dict], dataset: str) -> str:
    rows = []
    for r in runs:
        if r["dataset"] != dataset:
            continue
        m = r.get("mechanism") or {}
        sr = r["test"]["curve"]["slope_ratio"]
        rows.append([r["variant"], _f(r["val"]["auc"]), _f(r["test"]["auc"]),
                     _f(r["test"]["log_loss"]), _f(sr, 2) if sr is not None else "—",
                     _f(m.get("separation"), 4) if m else "—",
                     _f(m.get("reconstruction_error")) if m else "—"])
    return table(["variant", "val AUC", "test AUC", "test log-loss", "test slope ratio",
                  "evidence separation", "reconstruction error"], rows)


def dose_table(dose: list[dict]) -> str:
    rows = [[f"`{d['dataset']}`", _f(d["lambda_r"], 2), _f(d["test_slope_ratio"], 2),
             _f(d["test_auc"]), _f(d["test_log_loss"]),
             _f(d["evidence_separation"], 4), _f(d["reconstruction_error"]), _f(d["w1"], 5)]
            for d in dose]
    return table(["dataset", "lambda_r", "test slope ratio", "test AUC", "test log-loss",
                  "evidence separation", "reconstruction error", "w1"], rows)


def fixes_section() -> str:
    s = load_improve()
    if not s:
        return "_No fix experiments found — run `python improve.py` first._\n"
    datasets = []
    for r in s.get("runs", []):
        if r["dataset"] not in datasets:
            datasets.append(r["dataset"])
    parts = [
        "**Selection rule used.** " + s.get("selection_rule", "—") + "", "",
        "**Candidates, per dataset.** Every variant run is listed, including the ones that do not help.", "",
    ]
    for ds in datasets:
        parts += [f"*`{ds}`*", "", candidate_table(s["runs"], ds), ""]
    if s.get("confirmation"):
        parts += ["**Confirmation of the selected variant elsewhere.**", ""]
        for ds in dict.fromkeys(r["dataset"] for r in s["confirmation"]):
            parts += [f"*`{ds}`*", "", candidate_table(s["confirmation"], ds), ""]
    if s.get("dose_response"):
        parts += ["**The reconstruction term as a dose.** Variants with no waviness penalty, ordered by strength.",
                  "", dose_table(s["dose_response"]), ""]
    return "\n".join(parts)


def build() -> str:
    return "\n".join([
        section("Public benchmarks", load(PUBLIC)), "",
        section("Synaptic simulator (synthetic — not evidence about real learners)", load(SIM)), "",
        "### Fix experiments (Lab 9)", "", fixes_section(),
    ])


def main(write: bool) -> int:
    text = build()
    if not write:
        print(text)
        return 0
    if not os.path.exists(FINDINGS):
        print(f"{FINDINGS} does not exist yet; printing instead")
        print(text)
        return 1
    with open(FINDINGS) as f:
        doc = f.read()
    if BEGIN not in doc or END not in doc:
        print(f"{FINDINGS} has no {BEGIN} / {END} markers; printing instead")
        print(text)
        return 1
    head, rest = doc.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    with open(FINDINGS, "w") as f:
        f.write(f"{head}{BEGIN}\n\n{text}\n{END}{tail}")
    print(f"Updated the generated tables in {FINDINGS}")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--write", action="store_true")
    raise SystemExit(main(p.parse_args().write))
