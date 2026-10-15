"""DKT-10: tests for training on Synaptic's skill space (no data files needed)."""
import numpy as np
import pandas as pd
import pytest

from train_dkt import json_safe_skill_id
from train_synaptic import curriculum_skill_index, load_interactions


def test_skill_index_covers_the_curriculum_in_a_stable_order():
    index = curriculum_skill_index()
    assert len(index) == 120
    assert sorted(index.values()) == list(range(120))
    assert curriculum_skill_index() == index  # fixed by nodes.json, not by data


def test_json_safe_skill_id_keeps_each_datasets_native_type():
    assert json_safe_skill_id(np.int64(7)) == 7
    assert json_safe_skill_id("p1_what_is_computer") == "p1_what_is_computer"


def test_load_interactions_rejects_skills_outside_the_curriculum(tmp_path):
    index = curriculum_skill_index()
    known = next(iter(index))
    path = tmp_path / "events.csv"
    pd.DataFrame({"student_id": ["s1", "s1"], "skill_id": [known, "not_a_skill"],
                  "correct": [1, 0], "timestamp": ["2026-01-01", "2026-01-02"]}).to_csv(path, index=False)
    with pytest.raises(ValueError, match="not in the curriculum"):
        load_interactions(str(path), index)


def test_load_interactions_orders_each_student_by_time(tmp_path):
    index = curriculum_skill_index()
    a, b = list(index)[:2]
    path = tmp_path / "events.csv"
    pd.DataFrame({"student_id": ["s1", "s1"], "skill_id": [b, a], "correct": [1, 0],
                  "timestamp": ["2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"]}).to_csv(path, index=False)
    df = load_interactions(str(path), index)
    assert df["skill_id"].tolist() == [a, b]
