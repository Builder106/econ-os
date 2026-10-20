import copy
import json

import pytest

from scripts.private_tax_experiment import run_experiment


def _snapshot():
    return {
        "captured_at": "2026-10-20T14:44:14+00:00",
        "run": {
            "id": "saved-run",
            "initial_conditions": {
                "environment": "market_v0",
                "num_consumers": 2,
                "num_producers": 1,
                "market": {"base_price": 10.0},
            },
        },
        "state": {
            "step": 42,
            "market": {"wage": 10.0, "price": 10.0},
            "policy": {"tax_rate": 0.0},
            "metrics": {"treasury": 0.0, "total_money": 300.0},
            "agents": [
                {"id": "consumer_0", "balance": 50.0},
                {"id": "consumer_1", "balance": 50.0},
                {"id": "producer_0", "balance": 200.0},
            ],
        },
    }


def test_paired_trial_is_repeatable_and_keeps_source_unchanged():
    snapshot = _snapshot()
    original = copy.deepcopy(snapshot)
    first = run_experiment(snapshot, tax_rate=0.2, steps=20, seed=42)
    assert first == run_experiment(snapshot, tax_rate=0.2, steps=20, seed=42)
    assert snapshot == original
    assert first["source"] == {
        "run_id": "saved-run",
        "step": 42,
        "captured_at": "2026-10-20T14:44:14+00:00",
    }
    assert first["method"]["trained_models_used"] is False
    assert first["baseline"]["treasury"] == 0
    assert first["treatment"]["treasury"] > 0
    assert first["difference"]["treasury"] > 0
    assert abs(first["baseline"]["money_drift"]) < 1e-6
    assert abs(first["treatment"]["money_drift"]) < 1e-6
    json.dumps(first, allow_nan=False)


def test_same_rate_produces_identical_outcomes():
    result = run_experiment(_snapshot(), tax_rate=0.0, steps=10, seed=7)
    assert result["baseline"] == result["treatment"]
    assert all(change == 0 for change in result["difference"].values())


@pytest.mark.parametrize(
    ("rate", "steps", "seed", "message"),
    [
        (-0.1, 10, 0, "tax rate"),
        (1.1, 10, 0, "tax rate"),
        (0.2, 0, 0, "steps"),
        (0.2, 10, -1, "seed"),
    ],
)
def test_trial_rejects_invalid_controls(rate, steps, seed, message):
    with pytest.raises(ValueError, match=message):
        run_experiment(_snapshot(), tax_rate=rate, steps=steps, seed=seed)


def test_trial_rejects_mismatched_source_state():
    snapshot = _snapshot()
    snapshot["state"]["agents"].pop()
    with pytest.raises(ValueError, match="agent IDs"):
        run_experiment(snapshot, tax_rate=0.2, steps=10, seed=0)

    snapshot = _snapshot()
    snapshot["state"]["metrics"]["total_money"] = 200.0
    with pytest.raises(ValueError, match="total money"):
        run_experiment(snapshot, tax_rate=0.2, steps=10, seed=0)


def test_trial_accepts_export_rounding():
    snapshot = _snapshot()
    snapshot["state"]["metrics"]["total_money"] += 0.00005
    result = run_experiment(snapshot, tax_rate=0.2, steps=1, seed=0)
    assert result["method"]["starting_money"] == 300.0
