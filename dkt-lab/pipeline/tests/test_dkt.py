"""DKT training loop: loss decreases on a tiny learnable task; options work;
predictions are causal; export format round-trips."""
import base64

import numpy as np
import pytest

torch = pytest.importorskip("torch")
import dkt  # noqa: E402


def toy_sequences(n, rng, L=20, S=4):
    """Skill 0 and 1 are linked: getting 0 right predicts 1 right."""
    seqs = []
    for _ in range(n):
        ability = rng.random() < 0.5
        skills = rng.integers(0, S, size=L)
        correct = np.where(skills < 2, ability, rng.random(L) < 0.5).astype(np.int64)
        tdays = np.cumsum(rng.random(L))
        seqs.append(dkt.Seq(skills=skills, correct=correct, time=dkt.time_features(skills, tdays), rows=np.arange(L)))
    return seqs


@pytest.mark.parametrize("opts", [{}, {"dropout": 0.3}, {"input_time": True, "output_time": True},
                                  {"lambda_r": 0.1, "lambda_w1": 0.003, "lambda_w2": 3.0}])
def test_loss_decreases(opts):
    rng = np.random.default_rng(0)
    train, val = toy_sequences(128, rng), toy_sequences(32, rng)
    cfg = dkt.DKTConfig(hidden_size=16, lr=1e-2, batch_size=16, epochs=6, **opts)
    model, hist = dkt.train(train, val, 4, cfg, log=lambda *_: None)
    losses = [h["train_loss"] for h in hist]
    assert losses[-1] < losses[0] * 0.9, losses
    assert hist[-1]["val_auc"] > 0.6


def test_early_stopping_restores_best_epoch():
    rng = np.random.default_rng(1)
    train, val = toy_sequences(64, rng), toy_sequences(32, rng)
    cfg = dkt.DKTConfig(hidden_size=8, lr=3e-2, batch_size=16, epochs=12, early_stopping=True, patience=2)
    model, hist = dkt.train(train, val, 4, cfg, log=lambda *_: None)
    best = max(h["val_auc"] for h in hist)
    got = dkt.flat_auc(val, dkt.predict(model, val, cfg))
    assert abs(got - best) < 1e-9


def test_predictions_are_causal_and_batch_independent():
    rng = np.random.default_rng(2)
    seqs = toy_sequences(5, rng)
    cfg = dkt.DKTConfig(hidden_size=8)
    model = dkt.DKTModel(4, 8)
    together = dkt.predict(model, seqs, cfg)
    alone = [dkt.predict(model, [s], cfg)[0] for s in seqs]
    for a, b in zip(together, alone):
        np.testing.assert_allclose(a, b, atol=1e-6)
    s = seqs[0]
    changed = dkt.Seq(skills=s.skills.copy(), correct=s.correct.copy())
    changed.correct[-1] ^= 1
    np.testing.assert_allclose(dkt.predict(model, [changed], cfg)[0], alone[0], atol=1e-6)


def test_time_features():
    f = dkt.time_features(np.array([0, 1, 0, 0]), np.array([0.0, 1.0, 3.0, 3.0]))
    np.testing.assert_allclose(f[:, 0], np.log1p([0, 0, 3, 0]))
    np.testing.assert_allclose(f[:, 1], np.log1p([0, 1, 2, 0]))
    np.testing.assert_allclose(f[:, 2], np.log1p([0, 0, 1, 2]))


def test_weights_json_roundtrip():
    model = dkt.DKTModel(3, 5)
    w = dkt.weights_json(model, ["a", "b", "c"], synthetic=True)
    assert w["format"] == "synaptic-dkt-v1"
    ih = np.frombuffer(base64.b64decode(w["weight_ih"]), dtype="<f4")
    np.testing.assert_array_equal(ih, model.lstm.weight_ih_l0.detach().numpy().ravel())
    assert ih.size == 4 * 5 * 2 * 3
    assert dkt.weights_json(dkt.DKTModel(3, 5, output_time=True), ["a", "b", "c"], True)["format"] == "dkt-lab-time-v1"
