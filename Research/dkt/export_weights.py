"""DKT-11: export a trained Synaptic DKT model for the app's TypeScript
inference (src/lib/dkt/index.ts), plus a parity fixture proving the two
implementations agree.

  python export_weights.py
      data/synaptic_dkt.pt -> src/lib/dkt/model/synaptic-dkt.json
  python export_weights.py --fixture
      small random model + histories + PyTorch outputs
      -> src/lib/dkt/fixtures/parity.json (used by the vitest parity test)
"""
import argparse
import base64
import json
import os

import numpy as np
import torch

from train_dkt import DKTModel
from train_synaptic import MODEL_PATH, REPO, curriculum_skill_index

OUT_MODEL = os.path.join(REPO, "src", "lib", "dkt", "model", "synaptic-dkt.json")
OUT_FIXTURE = os.path.join(REPO, "src", "lib", "dkt", "fixtures", "parity.json")


def b64(tensor: torch.Tensor) -> str:
    return base64.b64encode(tensor.detach().cpu().numpy().astype("<f4").tobytes()).decode("ascii")


def weights_json(model: DKTModel, skills: list, synthetic: bool, training: dict | None = None) -> dict:
    lstm = model.lstm
    return {
        "format": "synaptic-dkt-v1",
        "synthetic": synthetic,
        "skills": skills,
        "hidden_size": lstm.hidden_size,
        **({"training": training} if training else {}),
        "weight_ih": b64(lstm.weight_ih_l0),
        "weight_hh": b64(lstm.weight_hh_l0),
        "bias_ih": b64(lstm.bias_ih_l0),
        "bias_hh": b64(lstm.bias_hh_l0),
        "out_weight": b64(model.output.weight),
        "out_bias": b64(model.output.bias),
    }


def ordered_skills(skill_index: dict) -> list:
    return [s for s, _ in sorted(skill_index.items(), key=lambda kv: kv[1])]


def torch_predict_next(model: DKTModel, skill_index: dict, history: list) -> list:
    """P(correct) for every skill after `history`, the same contract as
    predictNext() in TypeScript."""
    num_skills = len(skill_index)
    with torch.no_grad():
        if not history:
            h = torch.zeros(model.lstm.hidden_size)
        else:
            x = torch.zeros(1, len(history), 2 * num_skills)
            for t, (skill, correct) in enumerate(history):
                i = skill_index[skill]
                x[0, t, i if correct else num_skills + i] = 1.0
            out, _ = model.lstm(x)
            h = out[0, -1]
        return torch.sigmoid(model.output(h)).tolist()


def export_model() -> None:
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"{MODEL_PATH} not found -- run train_synaptic.py first.")
    checkpoint = torch.load(MODEL_PATH, weights_only=False)
    skill_index = checkpoint["skill_index"]
    model = DKTModel(checkpoint["num_skills"], hidden_size=checkpoint["hidden_size"])
    model.load_state_dict(checkpoint["state_dict"])
    results_path = os.path.join(os.path.dirname(__file__), "results", "synaptic_dkt_results.json")
    synthetic = True
    if os.path.exists(results_path):
        with open(results_path) as f:
            synthetic = json.load(f).get("synthetic", True)
    os.makedirs(os.path.dirname(OUT_MODEL), exist_ok=True)
    with open(OUT_MODEL, "w") as f:
        json.dump(weights_json(model, ordered_skills(skill_index), synthetic,
                               checkpoint.get("training")), f)
    print(f"Wrote {OUT_MODEL} ({os.path.getsize(OUT_MODEL) / 1e6:.1f} MB)")


def export_fixture() -> None:
    torch.manual_seed(0)
    skill_index = curriculum_skill_index()
    skills = ordered_skills(skill_index)
    model = DKTModel(len(skills), hidden_size=16)
    rng = np.random.default_rng(0)
    histories = [[]] + [
        [(skills[int(rng.integers(len(skills)))], bool(rng.integers(2))) for _ in range(n)]
        for n in (1, 5, 40)
    ]
    cases = [{"history": [{"skill_id": s, "correct": c} for s, c in hist],
              "expected": torch_predict_next(model, skill_index, hist)} for hist in histories]
    os.makedirs(os.path.dirname(OUT_FIXTURE), exist_ok=True)
    with open(OUT_FIXTURE, "w") as f:
        json.dump({"weights": weights_json(model, skills, True), "cases": cases}, f)
    print(f"Wrote {OUT_FIXTURE}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", action="store_true")
    args = parser.parse_args()
    export_fixture() if args.fixture else export_model()
