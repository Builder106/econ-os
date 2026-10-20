import json

import pytest

from scripts.compare_snapshots import compare, load_snapshot


def _snapshot(step=1, run_id="one"):
    return {
        "format": "econos-run-snapshot",
        "schema_version": 1,
        "captured_at": "2026-10-20T00:00:00+00:00",
        "run": {
            "id": run_id,
            "step_interval": {"from": 0, "to": step},
            "initial_conditions": {"seed": None},
            "models": {"consumer": {"action_source": "sampled_actions", "sha256": None}},
            "policy_changes": [],
        },
        "state": {
            "step": step,
            "market": {"wage": 10.0, "price": 10.0},
            "policy": {"tax_rate": 0.0},
            "metrics": {
                "gini": 0.1,
                "cpi": 100.0,
                "real_gdp": 4.0,
                "total_money": 900.0,
                "treasury": 0.0,
            },
            "agents": [{"id": "consumer_0", "balance": 50.0}],
        },
    }


def test_compare_shows_changes_and_policy_context():
    before = _snapshot()
    after = _snapshot(step=2)
    after["state"]["market"]["wage"] = 11.0
    after["state"]["agents"][0]["balance"] = 52.0
    after["run"]["policy_changes"] = [{"step": 1, "command": "tax"}]
    report = compare(before, after)
    assert "Same run: yes" in report
    assert "Same initial conditions: yes" in report
    assert "Same model checkpoints: yes" in report
    assert "Market wage                10.000       11.000       +1.000" in report
    assert "consumer_0                 50.000       52.000       +2.000" in report
    assert "step 1: tax" in report
    assert "do not establish the effect" in report


def test_compare_identifies_different_runs_and_reverse_order():
    assert "Same run: no" in compare(_snapshot(), _snapshot(run_id="two"))
    with pytest.raises(ValueError, match="precedes"):
        compare(_snapshot(step=2), _snapshot(step=1))


def test_load_rejects_wrong_version_and_invalid_values(tmp_path):
    path = tmp_path / "capture.json"
    path.write_text("[]")
    with pytest.raises(ValueError, match="expected a JSON object"):
        load_snapshot(path)

    capture = _snapshot()
    path.write_text(json.dumps(capture))
    assert load_snapshot(path)["state"]["step"] == 1

    capture["schema_version"] = 2
    path.write_text(json.dumps(capture))
    with pytest.raises(ValueError, match="schema version 1"):
        load_snapshot(path)

    capture["schema_version"] = 1
    capture["state"]["market"]["wage"] = float("nan")
    path.write_text(json.dumps(capture))
    with pytest.raises(ValueError, match="not finite"):
        load_snapshot(path)
