"""DKT-7: synthetic-fixture tests for train_dkt.py's training loop.

Uses a tiny synthetic batch (no real ASSISTments data required -- these
run standalone via `pytest research/dkt/tests/`) to prove:
  1. loss actually decreases with gradient steps,
  2. padded (masked) positions cannot leak into the loss for other
     sequences in the same batch,
  3. model output tensor shapes are correct for a given batch/skill size.
"""
import numpy as np
import torch

import train_dkt
from train_dkt import DKTModel, encode_batch, encode_current, masked_bce_loss, train

NUM_SKILLS = 4


def make_synthetic_sequences(seed: int = 0) -> list:
    """Five short synthetic student sequences with varying lengths, skills
    drawn from range(NUM_SKILLS)."""
    rng = np.random.default_rng(seed)
    sequences = []
    for length in (3, 4, 5, 6, 4):
        skills = rng.integers(0, NUM_SKILLS, size=length)
        corrects = rng.integers(0, 2, size=length)
        sequences.append((skills, corrects))
    return sequences


def test_output_tensor_shapes():
    model = DKTModel(num_skills=NUM_SKILLS, hidden_size=8, num_layers=1)
    batch, T = 3, 5
    x = torch.zeros(batch, T, 2 * NUM_SKILLS)
    out = model(x)
    assert out.shape == (batch, T, NUM_SKILLS)
    assert torch.all((out >= 0) & (out <= 1)), "sigmoid output must be a valid probability"


def test_encode_batch_shapes_and_padding_mask():
    sequences = make_synthetic_sequences()
    x, target_skill, target_correct, mask = encode_batch(sequences, NUM_SKILLS)

    lengths = [len(skills) - 1 for skills, _ in sequences]
    max_len = max(lengths)
    n = len(sequences)

    assert x.shape == (n, max_len, 2 * NUM_SKILLS)
    assert target_skill.shape == (n, max_len)
    assert target_correct.shape == (n, max_len)
    assert mask.shape == (n, max_len)

    for i, L in enumerate(lengths):
        assert mask[i, :L].sum().item() == L, "every valid transition must be marked in the mask"
        if L < max_len:
            assert mask[i, L:].sum().item() == 0, "padded positions must be masked out"
            assert x[i, L:].sum().item() == 0, "padded input positions must stay all-zero"


def test_no_mask_leakage_across_padded_sequences():
    """Mutating a padded (masked-out) position must not change the loss --
    otherwise padding from a shorter sequence would leak into training
    signal it has no business contributing to."""
    sequences = make_synthetic_sequences()
    x, target_skill, target_correct, mask = encode_batch(sequences, NUM_SKILLS)

    torch.manual_seed(0)
    predictions = torch.rand(x.shape[0], x.shape[1], NUM_SKILLS)

    baseline_loss = masked_bce_loss(predictions, target_skill, target_correct, mask).item()

    mutated_target_correct = target_correct.clone()
    mutated_target_skill = target_skill.clone()
    padded_positions = (mask == 0)
    assert padded_positions.any(), "fixture must actually contain padding to test leakage"

    mutated_target_correct[padded_positions] = 1 - mutated_target_correct[padded_positions]
    mutated_target_skill[padded_positions] = (mutated_target_skill[padded_positions] + 1) % NUM_SKILLS

    mutated_loss = masked_bce_loss(predictions, mutated_target_skill, mutated_target_correct, mask).item()

    assert baseline_loss == mutated_loss, (
        "flipping targets only in padded/masked positions changed the loss -- "
        "padding is leaking into the training signal"
    )


def test_loss_decreases_over_training_steps():
    sequences = make_synthetic_sequences()
    x, target_skill, target_correct, mask = encode_batch(sequences, NUM_SKILLS)

    torch.manual_seed(0)
    model = DKTModel(num_skills=NUM_SKILLS, hidden_size=16, num_layers=1)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    losses = []
    for _ in range(50):
        optimizer.zero_grad()
        preds = model(x)
        loss = masked_bce_loss(preds, target_skill, target_correct, mask)
        loss.backward()
        optimizer.step()
        losses.append(loss.item())

    assert losses[-1] < losses[0], f"loss did not decrease: {losses[0]:.4f} -> {losses[-1]:.4f}"
    # Not just noisy: the tail average should be clearly below the head average.
    assert np.mean(losses[-5:]) < np.mean(losses[:5])


# ── DKT-14: the DKT+ reconstruction option ─────────────────────────────────
def test_encode_current_is_the_interaction_the_model_consumed():
    """encode_current's pair at step t must be the input at step t, which is
    exactly encode_batch's target at step t-1 -- one step behind, never the
    answer being predicted."""
    sequences = make_synthetic_sequences()
    _, target_skill, target_correct, mask = encode_batch(sequences, NUM_SKILLS)
    current_skill, current_correct = encode_current(sequences, NUM_SKILLS)

    assert current_skill.shape == target_skill.shape
    for i, (skills, corrects) in enumerate(sequences):
        L = len(skills) - 1
        assert current_skill[i, :L].tolist() == skills[:L].tolist()
        assert current_correct[i, :L].tolist() == corrects[:L].astype(float).tolist()
        assert current_skill[i, 1:L].tolist() == target_skill[i, : L - 1].tolist()
        assert (current_skill[i, L:] * mask[i, L:]).sum().item() == 0


def _train_tiny(lambda_r: float, epochs: int = 6):
    sequences = make_synthetic_sequences()
    torch.manual_seed(0)
    model = DKTModel(num_skills=NUM_SKILLS, hidden_size=16, num_layers=1)
    original = train_dkt.NUM_EPOCHS
    train_dkt.NUM_EPOCHS = epochs
    try:
        train(model, sequences, sequences, NUM_SKILLS, lambda_r=lambda_r)
    finally:
        train_dkt.NUM_EPOCHS = original
    return model, sequences


def test_lambda_r_zero_reproduces_the_pre_dkt14_loss_exactly():
    """The reconstruction term is opt-in: at lambda_r = 0 training must take
    the same steps the loop took before the option existed, so the published
    ASSISTments and app models are unaffected by the port."""
    ported, sequences = _train_tiny(0.0)

    # The pre-DKT-14 loop, written out: plain masked BCE, same seeds and order.
    torch.manual_seed(0)
    reference = DKTModel(num_skills=NUM_SKILLS, hidden_size=16, num_layers=1)
    optimizer = torch.optim.Adam(reference.parameters(), lr=train_dkt.LEARNING_RATE)
    rng = np.random.default_rng(train_dkt.SEED)
    for _ in range(6):
        reference.train()
        order = rng.permutation(len(sequences))
        for start in range(0, len(order), train_dkt.BATCH_SIZE):
            batch = [sequences[i] for i in order[start : start + train_dkt.BATCH_SIZE]]
            x, target_skill, target_correct, mask = encode_batch(batch, NUM_SKILLS)
            optimizer.zero_grad()
            loss = masked_bce_loss(reference(x), target_skill, target_correct, mask)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(reference.parameters(), train_dkt.GRAD_CLIP)
            optimizer.step()

    for key, value in reference.state_dict().items():
        assert torch.equal(ported.state_dict()[key], value), f"{key} diverged at lambda_r = 0"


def test_lambda_r_improves_reconstruction_of_the_consumed_answer():
    """What the term is for: the model should get better at reproducing the
    answer it has just been told, which is the signal dkt-lab measured as too
    faint (FINDINGS-CURVES.md, H2)."""
    sequences = make_synthetic_sequences()
    current_skill, current_correct = encode_current(sequences, NUM_SKILLS)
    x, _, _, mask = encode_batch(sequences, NUM_SKILLS)

    def reconstruction_loss(model):
        with torch.no_grad():
            return masked_bce_loss(model(x), current_skill, current_correct, mask).item()

    plain, _ = _train_tiny(0.0)
    regularised, _ = _train_tiny(1.0)
    assert reconstruction_loss(regularised) < reconstruction_loss(plain)
