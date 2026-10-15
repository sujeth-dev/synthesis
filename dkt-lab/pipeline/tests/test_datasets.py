"""Dataset converters: common schema, ordering, trimming, and the student split."""
import pandas as pd
import pytest

from datasets import (SCHEMA, convert_assist2009, convert_piech_synthetic, convert_synaptic_sim,
                      convert_three_line, trim_skills)
from split import split_students


def assert_schema(df: pd.DataFrame, extra=()):
    assert list(df.columns) == SCHEMA + list(extra)
    assert set(df["correct"].unique()) <= {0, 1}
    assert df["student_id"].map(type).eq(str).all() and df["skill_id"].map(type).eq(str).all()
    for _, g in df.groupby("student_id"):
        assert g["order"].tolist() == list(range(len(g))), "order must be 0..n-1 per student"


def test_assist2009_cleaning_rules():
    raw = pd.DataFrame({
        "order_id": [5, 3, 3, 3, 9, 4],
        "user_id": [1, 1, 1, 1, 2, 2],
        "skill_id": [10.0, 10.0, 10.0, 11.0, None, 12.0],
        "correct": [1, 0, 0, 1, 1, 0],
    })
    df = convert_assist2009(raw)
    assert_schema(df)
    # duplicate (1,3,10) dropped; multi-skill (1,3,11) kept; blank skill dropped
    assert len(df) == 4
    s1 = df[df["student_id"] == "1"]
    assert s1["skill_id"].tolist() == ["10", "11", "10"]  # sorted by order_id: 3,3,5
    assert df[df["student_id"] == "2"]["skill_id"].tolist() == ["12"]


def test_piech_synthetic():
    df = convert_piech_synthetic("0,1,1\n1,1,0\n")
    assert_schema(df)
    assert len(df) == 6 and df["student_id"].nunique() == 2
    assert df[df["student_id"] == "s0000"]["skill_id"].tolist() == ["0", "1", "2"]
    assert df[df["student_id"] == "s0001"]["correct"].tolist() == [1, 1, 0]


def test_three_line_format():
    text = "3\n1,1,2,\n0,1,1,\n2\n5,6\n1,0\n"
    df = convert_three_line(text, prefix="a")
    assert_schema(df)
    assert df["student_id"].nunique() == 2 and len(df) == 5
    with pytest.raises(ValueError):
        convert_three_line("3\n1,2\n0,1\n", prefix="a")


def test_synaptic_sim_has_time():
    raw = pd.DataFrame({
        "student_id": ["a", "a", "b"],
        "skill_id": ["x", "y", "x"],
        "correct": [True, False, True],
        "timestamp": ["2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", "2026-01-01T12:00:00Z"],
    })
    df = convert_synaptic_sim(raw)
    assert_schema(df, extra=("t_days",))
    a = df[df["student_id"] == "a"]
    assert a["skill_id"].tolist() == ["y", "x"]          # sorted by time
    assert a["t_days"].tolist() == [0.0, 1.0]
    assert df[df["student_id"] == "b"]["t_days"].iloc[0] == 0.5


def test_trim_skills_keeps_most_frequent():
    df = pd.DataFrame({"student_id": ["s"] * 6, "skill_id": ["a", "a", "a", "b", "b", "c"],
                       "correct": [1] * 6, "order": range(6)})
    out, info = trim_skills(df, max_skills=2)
    assert set(out["skill_id"]) == {"a", "b"}
    assert info == {"skills_before": 3, "skills_after": 2, "interactions_dropped": 1,
                    "interactions_dropped_pct": 1 / 6}
    same, none = trim_skills(df, max_skills=3)
    assert none is None and len(same) == 6


def test_split_is_by_student_and_disjoint():
    students = [f"s{i}" for i in range(1000)]
    sp = split_students(students)
    train, val, test = map(set, (sp["train"], sp["val"], sp["test"]))
    assert not (train & test) and not (train & val) and not (val & test)
    assert train | val | test == set(students)
    assert (len(train), len(val), len(test)) == (700, 150, 150)
    assert split_students(students) == sp, "split must be deterministic for a fixed seed"


def test_no_student_rows_cross_splits():
    rows = [(f"s{i % 40}", str(i % 7), i % 2, i) for i in range(400)]
    df = pd.DataFrame(rows, columns=SCHEMA)
    sp = split_students(df["student_id"].unique().tolist())
    side = {s: k for k, ids in sp.items() for s in ids}
    assert df.groupby("student_id")["student_id"].apply(lambda g: g.map(side).nunique()).eq(1).all()
