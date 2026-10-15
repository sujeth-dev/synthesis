"""Download every dataset the lab uses and convert it to one common schema.

Adapted from Research/dkt/download_data.py (download + MD5 check) and
Research/dkt/preprocess.py (ASSISTments 2009 cleaning rules, reproduced in
convert_assist2009), generalised to several datasets and mirrors.

Output per dataset, under pipeline/data/<name>/ (gitignored):
    sequences.csv     student_id, skill_id, correct, order[, t_days]
    provenance.json   source URL, mirror actually used, licence, citation,
                      checksum, cleaning notes, skill trimming (if any)
    skills.json       skill_id -> human label (and hidden metadata if known)

`order` is a strictly increasing per-student ordering key. `t_days` (elapsed
days, float) is present ONLY for datasets with real timestamps; the lab's
time-feature experiments use it and skip datasets without it.

Rules this file enforces (see README "Datasets"):
  * Every download URL and licence is recorded. If a download is blocked, the
    dataset is skipped and the reason recorded -- never replaced by look-alike
    generated data under a real dataset's name.
  * Synthetic data is labelled synthetic in provenance.json, and from there on
    every page of the website.
  * More than MAX_SKILLS skills -> keep the MAX_SKILLS most frequent, drop the
    rest, and say so in provenance.json.

Usage:
    python datasets.py                 # all datasets
    python datasets.py assist2009      # one dataset
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

MAX_SKILLS = 300
SCHEMA = ["student_id", "skill_id", "correct", "order"]


# ── provenance ──────────────────────────────────────────────────────────────
@dataclass
class Source:
    id: str
    name: str
    kind: str                 # "real" | "synthetic"
    kind_label: str           # what the website prints next to the name
    source_url: str           # the dataset's official page
    licence: str
    citation: str
    urls: list[tuple[str, str]] = field(default_factory=list)   # (label, url) tried in order
    md5: dict[str, str] = field(default_factory=dict)           # url -> expected md5
    notes: list[str] = field(default_factory=list)
    has_timestamps: bool = False


SOURCES: dict[str, Source] = {
    "assist2009": Source(
        id="assist2009",
        name="ASSISTments 2009-2010 skill builder",
        kind="real",
        kind_label="real",
        source_url="https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data/skill-builder-data-2009-2010",
        licence=(
            "Figshare copy (skill_builder_data.csv): CC BY 4.0. The 'corrected' release used when "
            "Figshare is unreachable is the same ASSISTments data, distributed for research with "
            "citation required by the ASSISTments terms; the GitHub mirror has no licence file of its own."
        ),
        citation=(
            "Feng, M., Heffernan, N., & Koedinger, K. (2009). Addressing the assessment challenge with an "
            "online system that tutors as it assesses. User Modeling and User-Adapted Interaction, 19(3), 243-266."
        ),
        urls=[
            ("Figshare (CC BY 4.0), skill_builder_data.csv",
             "https://ndownloader.figshare.com/files/44732737"),
            ("GitHub mirror of the official corrected release, skill_builder_data_corrected.csv "
             "(LegionKing/Dynamic-Cognitive-Diagnosis @ fbc29da)",
             "https://raw.githubusercontent.com/LegionKing/Dynamic-Cognitive-Diagnosis/"
             "fbc29da881775905bcfc1f39832f554f9a9f6cab/data/assist2009/skill_builder_data_corrected.csv"),
        ],
        md5={
            "https://ndownloader.figshare.com/files/44732737": "9410c31fadc7ad6518d296ce254ec4ab",
            "https://raw.githubusercontent.com/LegionKing/Dynamic-Cognitive-Diagnosis/"
            "fbc29da881775905bcfc1f39832f554f9a9f6cab/data/assist2009/skill_builder_data_corrected.csv":
                "a8c89f7ccc6836041ba7b33a47c40375",
        },
        notes=[
            "Cleaning follows Research/dkt/preprocess.py: drop rows with no skill_id; drop duplicate "
            "(user_id, order_id, skill_id) rows; multi-skill problems stay one row per skill.",
            "No wall-clock timestamp in this export: order_id is the ordering key, so no time features.",
        ],
    ),
    "synthetic5": Source(
        id="synthetic5",
        name="Synthetic-5 (Piech et al. 2015)",
        kind="synthetic",
        kind_label="synthetic (paper benchmark)",
        source_url="https://github.com/chrispiech/DeepKnowledgeTracing",
        licence=(
            "No licence file in the repository. Published with the DKT paper as a benchmark; used here "
            "for non-commercial research. The raw file is not redistributed (gitignored); only derived "
            "aggregates and model weights are committed."
        ),
        citation=(
            "Piech, C., Bassen, J., Huang, J., Ganguli, S., Sahami, M., Guibas, L., & Sohl-Dickstein, J. "
            "(2015). Deep Knowledge Tracing. NeurIPS 28."
        ),
        urls=[
            ("chrispiech/DeepKnowledgeTracing @ 5973a6c, data/synthetic/naive_c5_q50_s4000_v0.csv",
             "https://raw.githubusercontent.com/chrispiech/DeepKnowledgeTracing/"
             "5973a6ce805fec7472fc5c02d4d98989abf7f3ad/data/synthetic/naive_c5_q50_s4000_v0.csv"),
        ],
        notes=[
            "SIMULATED: 4,000 virtual students answer the same 50 exercises in the same order; each "
            "exercise belongs to one of 5 hidden concepts (IRT-style simulation from the DKT paper).",
            "skill_id = exercise index (0-49). The hidden concept of each exercise is kept as metadata "
            "for the explainer only; neither model is given it.",
        ],
    ),
    "assist2015": Source(
        id="assist2015",
        name="ASSISTments 2015 skill builder",
        kind="real",
        kind_label="real",
        source_url="https://sites.google.com/site/assistmentsdata/datasets/2015-assistments-skill-builder-data",
        licence=(
            "ASSISTments research data, free for research use with citation per the ASSISTments terms. "
            "The official Google-Sites/Drive download is blocked from this build environment, so the "
            "widely used DKVMN preprocessed copy is used; that mirror repository has no licence file."
        ),
        citation=(
            "Heffernan, N. T., & Heffernan, C. L. (2014). The ASSISTments ecosystem. International Journal "
            "of Artificial Intelligence in Education, 24(4), 470-497. Mirror: Zhang, J., Shi, X., King, I., "
            "& Yeung, D.-Y. (2017). Dynamic Key-Value Memory Networks for Knowledge Tracing. WWW."
        ),
        urls=[
            ("jennyzhang0215/DKVMN @ 96c2834, data/assist2015/assist2015_train.csv + _test.csv",
             "https://raw.githubusercontent.com/jennyzhang0215/DKVMN/"
             "96c2834ae6968fbfb761b5ba96be26b054c7c1c3/data/assist2015/"),
        ],
        notes=[
            "Mirror format: three lines per student (length, skill ids, answers), 100 skills. The "
            "mirror's train and test files are concatenated and re-split by student with this lab's seed.",
            "Original student ids and log ids are not in the mirror: students are numbered in file "
            "order, and no time features are available.",
        ],
    ),
    "synaptic_sim": Source(
        id="synaptic_sim",
        name="Synaptic simulator (1,000 learners x 60 days)",
        kind="synthetic",
        kind_label="synthetic (Synaptic simulator)",
        source_url="scripts/sim-run.ts in this repository (npm run sim -- --learners 1000 --days 60)",
        licence="Generated by this repository's own simulator; same licence as the repository.",
        citation="Synaptic learner simulator, src/lib/sim (this repository).",
        notes=[
            "SIMULATED learners with a known memory model (src/lib/sim/learner.ts) that forgets over "
            "time, practising the real 120-skill Synaptic curriculum under the SM-2 scheduler.",
            "Has simulated timestamps, so it is the one dataset where time features are available.",
        ],
        has_timestamps=True,
    ),
}


# ── helpers ─────────────────────────────────────────────────────────────────
def md5sum(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: str, timeout: int = 120) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=timeout) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(tmp, dest)


def fetch_first(src: Source, dest: str, suffix: str = "") -> tuple[str, str, list[str]]:
    """Try each URL in order. Returns (label, url, failures). Raises if all fail."""
    failures = []
    for label, url in src.urls:
        full = url + suffix
        try:
            if not os.path.exists(dest) or (full in src.md5 and md5sum(dest) != src.md5[full]):
                fetch(full, dest)
            if full in src.md5:
                got = md5sum(dest)
                if got != src.md5[full]:
                    os.remove(dest)
                    raise RuntimeError(f"MD5 mismatch: expected {src.md5[full]}, got {got}")
            return label, full, failures
        except Exception as e:  # noqa: BLE001 -- recorded, then the next mirror is tried
            failures.append(f"{full}: {type(e).__name__}: {e}")
    raise RuntimeError("all download URLs failed:\n  " + "\n  ".join(failures))


def trim_skills(df: pd.DataFrame, max_skills: int = MAX_SKILLS) -> tuple[pd.DataFrame, dict | None]:
    """Keep the `max_skills` most frequent skills (ties broken by skill id)."""
    counts = df["skill_id"].value_counts()
    if len(counts) <= max_skills:
        return df, None
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))
    keep = {k for k, _ in ranked[:max_skills]}
    out = df[df["skill_id"].isin(keep)].copy()
    info = {
        "skills_before": int(len(counts)),
        "skills_after": int(max_skills),
        "interactions_dropped": int(len(df) - len(out)),
        "interactions_dropped_pct": float((len(df) - len(out)) / len(df)),
    }
    return out, info


def finalize(df: pd.DataFrame) -> pd.DataFrame:
    """Common schema, sorted, `order` re-numbered 0..n-1 within each student."""
    cols = SCHEMA + (["t_days"] if "t_days" in df.columns else [])
    df = df.sort_values(["student_id", "order"], kind="stable").reset_index(drop=True)
    df["order"] = df.groupby("student_id").cumcount()
    df["correct"] = df["correct"].astype(int)
    df["student_id"] = df["student_id"].astype(str)
    df["skill_id"] = df["skill_id"].astype(str)
    return df[cols]


# ── converters (pure functions of raw files -> common schema; unit-tested) ──
def convert_assist2009(raw: pd.DataFrame) -> pd.DataFrame:
    """Research/dkt/preprocess.py's cleaning rules, adapted to the common schema."""
    df = raw.dropna(subset=["skill_id"]).copy()
    df["skill_id"] = df["skill_id"].astype(int)
    df["correct"] = df["correct"].astype(int)
    df["user_id"] = df["user_id"].astype(int)
    df["order_id"] = df["order_id"].astype(int)
    df = df.drop_duplicates(subset=["user_id", "order_id", "skill_id"], keep="first")
    df = df.rename(columns={"user_id": "student_id", "order_id": "order"})
    # order_id ties within a student = one multi-skill problem; keep file order.
    return finalize(df[["student_id", "skill_id", "correct", "order"]])


def convert_piech_synthetic(text: str) -> pd.DataFrame:
    """One line per student: comma-separated 0/1 answers to exercises 0..Q-1, in order."""
    rows = []
    for s, line in enumerate(l for l in text.splitlines() if l.strip()):
        answers = [int(v) for v in line.strip().strip(",").split(",")]
        for q, c in enumerate(answers):
            rows.append((f"s{s:04d}", q, c, q))
    return finalize(pd.DataFrame(rows, columns=SCHEMA))


def convert_three_line(text: str, prefix: str) -> pd.DataFrame:
    """DKVMN/Piech three-line format: length / skills / answers, one block per student."""
    lines = [l.strip().strip(",") for l in text.splitlines() if l.strip()]
    if len(lines) % 3:
        raise ValueError(f"three-line file has {len(lines)} lines, not a multiple of 3")
    rows = []
    for b in range(0, len(lines), 3):
        n = int(lines[b])
        skills = [int(float(v)) for v in lines[b + 1].split(",")]
        answers = [int(float(v)) for v in lines[b + 2].split(",")]
        if not (len(skills) == len(answers) == n):
            raise ValueError(f"block {b // 3}: length {n} vs {len(skills)} skills / {len(answers)} answers")
        sid = f"{prefix}{b // 3:05d}"
        rows.extend((sid, k, c, t) for t, (k, c) in enumerate(zip(skills, answers)))
    return finalize(pd.DataFrame(rows, columns=SCHEMA))


def convert_synaptic_sim(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()
    ts = pd.to_datetime(df["timestamp"], utc=True)
    df["t_days"] = (ts - ts.min()).dt.total_seconds() / 86400.0
    df["correct"] = df["correct"].astype(int)
    # Stable sort keeps file order for same-timestamp rows (as train_synaptic.py).
    df = df.sort_values(["student_id", "t_days"], kind="stable")
    df["order"] = df.groupby("student_id").cumcount()
    return finalize(df[["student_id", "skill_id", "correct", "order", "t_days"]])


# ── per-dataset preparation (download + convert + write) ────────────────────
def _write(name: str, df: pd.DataFrame, prov: dict, skills: dict) -> None:
    out_dir = os.path.join(DATA_DIR, name)
    os.makedirs(out_dir, exist_ok=True)
    df, trim = trim_skills(df)
    if trim:
        prov["skill_trimming"] = trim
        prov.setdefault("notes", []).append(
            f"Trimmed to the {MAX_SKILLS} most frequent skills (from {trim['skills_before']}); "
            f"{trim['interactions_dropped']} interactions dropped.")
    else:
        prov["skill_trimming"] = None
    df.to_csv(os.path.join(out_dir, "sequences.csv"), index=False)
    present = set(df["skill_id"].unique())
    with open(os.path.join(out_dir, "skills.json"), "w") as f:
        json.dump({k: v for k, v in skills.items() if k in present}, f, indent=1)
    prov.update({
        "students": int(df["student_id"].nunique()),
        "skills": int(df["skill_id"].nunique()),
        "interactions": int(len(df)),
        "has_timestamps": "t_days" in df.columns,
    })
    with open(os.path.join(out_dir, "provenance.json"), "w") as f:
        json.dump(prov, f, indent=2)
    print(f"[{name}] {prov['interactions']} interactions, {prov['students']} students, "
          f"{prov['skills']} skills -> {out_dir}")


def _base_prov(src: Source) -> dict:
    return {k: getattr(src, k) for k in ("id", "name", "kind", "kind_label", "source_url", "licence", "citation")} | {
        "notes": list(src.notes)}


def prepare_assist2009() -> None:
    src = SOURCES["assist2009"]
    dest = os.path.join(RAW_DIR, "assist2009", "skill_builder.csv")
    label, url, failures = fetch_first(src, dest)
    raw = pd.read_csv(dest, encoding="latin-1", low_memory=False,
                      usecols=["order_id", "user_id", "skill_id", "correct", "skill_name"])
    names = (raw.dropna(subset=["skill_id"]).assign(skill_id=lambda d: d["skill_id"].astype(int).astype(str))
             .groupby("skill_id")["skill_name"].first().to_dict())
    prov = _base_prov(src) | {"downloaded_from": label, "download_url": url, "md5": md5sum(dest),
                              "download_failures": failures}
    _write("assist2009", convert_assist2009(raw), prov, {k: {"label": str(v)} for k, v in names.items()})


def prepare_synthetic5() -> None:
    src = SOURCES["synthetic5"]
    dest = os.path.join(RAW_DIR, "synthetic5", "naive_c5_q50_s4000_v0.csv")
    label, url, failures = fetch_first(src, dest)
    info_dest = os.path.join(RAW_DIR, "synthetic5", "info.txt")
    info_url = url.replace("data/synthetic/naive_c5_q50_s4000_v0.csv",
                           "data/synthetic/info/naive_c5_q50_s4000_v0_info.txt")
    if not os.path.exists(info_dest):
        fetch(info_url, info_dest)
    concepts = {}
    with open(info_dest) as f:
        for q, line in enumerate(l for l in f if l.strip()):
            parts = line.split()
            concepts[str(q)] = {"label": f"Q{q + 1}", "hidden_concept": int(parts[2]),
                                "difficulty": float(parts[3])}
    with open(dest) as f:
        df = convert_piech_synthetic(f.read())
    prov = _base_prov(src) | {"downloaded_from": label, "download_url": url, "md5": md5sum(dest),
                              "download_failures": failures, "info_url": info_url}
    _write("synthetic5", df, prov, concepts)


def prepare_assist2015() -> None:
    src = SOURCES["assist2015"]
    label, base = src.urls[0]
    parts, md5s = [], {}
    for split in ("train", "test"):
        dest = os.path.join(RAW_DIR, "assist2015", f"assist2015_{split}.csv")
        if not os.path.exists(dest):
            fetch(base + f"assist2015_{split}.csv", dest)
        md5s[split] = md5sum(dest)
        with open(dest) as f:
            parts.append(f.read())
    df = convert_three_line("\n".join(parts), prefix="a")
    prov = _base_prov(src) | {"downloaded_from": label, "download_url": base, "md5": md5s, "download_failures": []}
    _write("assist2015", df, prov, {k: {"label": f"skill {k}"} for k in df["skill_id"].unique()})


def run_simulator(learners: int, days: int = 60) -> str:
    """Runs the repo's existing simulator (read-only use: the committed result
    files it rewrites are restored byte-for-byte afterwards) and returns the
    path of a private copy of its SM-2 event log."""
    dest_dir = os.path.join(RAW_DIR, f"synaptic_sim_{learners}")
    dest = os.path.join(dest_dir, "sm2_events.csv")
    if os.path.exists(dest):
        return dest
    committed = os.path.join(REPO_ROOT, "Research", "sim", "results")
    saved = {}
    for fn in os.listdir(committed):
        with open(os.path.join(committed, fn), "rb") as f:
            saved[fn] = f.read()
    try:
        subprocess.run(["npm", "run", "sim", "--", "--learners", str(learners), "--days", str(days)],
                       cwd=REPO_ROOT, check=True)
    finally:
        for fn, data in saved.items():
            with open(os.path.join(committed, fn), "wb") as f:
                f.write(data)
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy(os.path.join(REPO_ROOT, "Research", "sim", "output", "sm2_events.csv"), dest)
    return dest


def prepare_synaptic_sim(learners: int = 1000, name: str = "synaptic_sim") -> None:
    src = SOURCES["synaptic_sim"]
    path = run_simulator(learners)
    raw = pd.read_csv(path, usecols=["student_id", "skill_id", "correct", "timestamp"])
    nodes_path = os.path.join(REPO_ROOT, "content", "graph", "nodes.json")
    labels = {}
    if os.path.exists(nodes_path):
        with open(nodes_path) as f:
            labels = {n["id"]: {"label": n.get("label") or n["id"], "topic": n.get("topic")} for n in json.load(f)}
    df = convert_synaptic_sim(raw)
    prov = _base_prov(src) | {"downloaded_from": f"npm run sim -- --learners {learners} --days 60 (seed 2026)",
                              "download_url": None, "md5": md5sum(path), "download_failures": [],
                              "learners": learners}
    if learners != 1000:
        prov["name"] = f"Synaptic simulator ({learners:,} learners x 60 days)"
    _write(name, df, prov, {k: labels.get(k, {"label": k}) for k in df["skill_id"].unique()})


PREPARERS: dict[str, Callable[[], None]] = {
    "assist2009": prepare_assist2009,
    "synthetic5": prepare_synthetic5,
    "assist2015": prepare_assist2015,
    "synaptic_sim": prepare_synaptic_sim,
}

# Datasets considered and skipped, with the reason (shown in README and on the site).
SKIPPED = [
    {"name": "ASSISTments 2017", "url": "https://sites.google.com/view/assistmentsdatamining/dataset",
     "reason": "Official download is behind a Google Drive link and a data-request form; Google hosts are "
               "blocked from this build environment, and no verifiable mirror of the raw file was found."},
    {"name": "EdNet KT1", "url": "https://github.com/riiid/ednet",
     "reason": "The data itself (about 1.2 GB) is hosted on Google Drive, which is blocked here; the GitHub "
               "repository only links to it."},
    {"name": "Statics 2011", "url": "https://pslcdatashop.web.cmu.edu/DatasetInfo?datasetId=507",
     "reason": "PSLC DataShop requires a login to download and is blocked from this build environment."},
]


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser()
    p.add_argument("names", nargs="*", default=list(PREPARERS))
    args = p.parse_args(argv)
    failed = {}
    for name in args.names:
        try:
            PREPARERS[name]()
        except Exception as e:  # noqa: BLE001 -- skip and record, never substitute data
            failed[name] = f"{type(e).__name__}: {e}"
            print(f"[{name}] SKIPPED: {failed[name]}", file=sys.stderr)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "skipped.json"), "w") as f:
        json.dump({"failed_this_run": failed, "not_attempted": SKIPPED}, f, indent=2)


if __name__ == "__main__":
    main()
