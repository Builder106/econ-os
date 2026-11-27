"""Tests for vectorized multi-parameter sweeps and numerical equivalence."""

import time

import numpy as np
import pytest

from simulation.environment import MarketEnv
from simulation.logic import calculate_gini
from simulation.sweep import (
    SweepInitialState,
    SweepScenario,
    calculate_gini_batch,
    run_scalar_scenario,
    run_vectorized_sweep,
    state_from_env,
)


def test_calculate_gini_batch_matches_scalar_and_handles_empty():
    empty = np.zeros((2, 0), dtype=np.float64)
    assert np.array_equal(calculate_gini_batch(empty), np.zeros(2))

    wealths = np.array([[0.0, 0.0, 0.0], [10.0, 20.0, 70.0], [25.0, 25.0, 25.0]])
    batch = calculate_gini_batch(wealths)
    for i, row in enumerate(wealths):
        assert batch[i] == pytest.approx(calculate_gini(row.tolist()), abs=1e-12)


@pytest.mark.parametrize("heterogeneous", [False, True])
def test_vectorized_sweep_matches_scalar_across_tax_and_monetary_shocks(heterogeneous):
    env = MarketEnv(
        num_consumers=5,
        num_producers=3,
        heterogeneous=heterogeneous,
        seed=17,
    )
    env.reset()
    # Trigger insolvency in one producer to test nonlinear clamping parity
    env.agent_balances["producer_0"] = 1.0
    state = state_from_env(env)

    scenarios = [
        SweepScenario(tax_rate=tax, monetary_shock=shock)
        for tax in (0.0, 0.25, 1.0)
        for shock in (-0.2, 0.0, 0.3)
    ]
    vectorized = run_vectorized_sweep(state, scenarios, steps=40, seed=99, shock_step=5)
    for sc, row in zip(scenarios, vectorized, strict=True):
        scalar = run_scalar_scenario(state, sc, steps=40, seed=99, shock_step=5)
        assert row == pytest.approx(scalar, abs=1e-8)
        assert abs(row["money_drift"]) < 1e-9


def test_vectorized_sweep_handles_zero_labor_step():
    env = MarketEnv(num_consumers=2, num_producers=1, heterogeneous=True)
    env.reset()
    state = state_from_env(env)
    # Zero consumers' balances so spending is zero and verify sweep runs cleanly
    zero_state = SweepInitialState(
        num_consumers=state.num_consumers,
        num_producers=state.num_producers,
        consumer_balances=np.zeros(2, dtype=np.float64),
        producer_balances=state.producer_balances,
        treasury=0.0,
        market_wage=state.market_wage,
        market_price=state.market_price,
        base_price=state.base_price,
        heterogeneous=True,
        consumer_skills=np.zeros(2, dtype=np.float64),
        consumer_alphas=state.consumer_alphas,
        producer_productivities=state.producer_productivities,
        producer_betas=state.producer_betas,
    )
    scenarios = [SweepScenario(0.1, 0.0), SweepScenario(0.5, 0.2)]
    results = run_vectorized_sweep(zero_state, scenarios, steps=5, seed=3)
    for sc, row in zip(scenarios, results, strict=True):
        scalar = run_scalar_scenario(zero_state, sc, steps=5, seed=3)
        assert row == pytest.approx(scalar, abs=1e-9)


def test_vectorized_sweep_validation_errors():
    env = MarketEnv(num_consumers=2, num_producers=1)
    env.reset()
    state = state_from_env(env)

    with pytest.raises(ValueError, match="at least one scenario"):
        run_vectorized_sweep(state, [], steps=10, seed=0)
    with pytest.raises(ValueError, match="steps"):
        run_vectorized_sweep(state, [SweepScenario(0.1)], steps=0, seed=0)
    with pytest.raises(ValueError, match="seed"):
        run_vectorized_sweep(state, [SweepScenario(0.1)], steps=10, seed=-1)
    with pytest.raises(ValueError, match="shock_step"):
        run_vectorized_sweep(state, [SweepScenario(0.1)], steps=10, seed=0, shock_step=10)
    with pytest.raises(ValueError, match="tax rate"):
        run_vectorized_sweep(state, [SweepScenario(1.5)], steps=10, seed=0)
    with pytest.raises(ValueError, match="monetary shock"):
        run_vectorized_sweep(state, [SweepScenario(0.1, -1.0)], steps=10, seed=0)

    bad_state = SweepInitialState(
        num_consumers=0,
        num_producers=1,
        consumer_balances=np.zeros(0),
        producer_balances=np.array([200.0]),
        treasury=0.0,
        market_wage=10.0,
        market_price=10.0,
        base_price=10.0,
        heterogeneous=False,
        consumer_skills=np.zeros(0),
        consumer_alphas=np.zeros(0),
        producer_productivities=np.array([1.0]),
        producer_betas=np.array([0.8]),
    )
    with pytest.raises(ValueError, match="at least one consumer and one producer"):
        run_vectorized_sweep(bad_state, [SweepScenario(0.1)], steps=5, seed=0)


def test_vectorized_sweep_large_workload_conservation_and_speedup():
    env = MarketEnv(num_consumers=10, num_producers=2, heterogeneous=True, seed=42)
    env.reset()
    state = state_from_env(env)
    scenarios = [
        SweepScenario(tax_rate=t / 20.0, monetary_shock=(m - 2) * 0.1)
        for t in range(21)
        for m in range(5)
    ]
    t0 = time.perf_counter()
    results = run_vectorized_sweep(state, scenarios, steps=50, seed=7)
    vec_elapsed = time.perf_counter() - t0

    assert len(results) == 105
    assert all(abs(row["money_drift"]) < 1e-8 for row in results)

    # Spot-check scalar runtime on a 15-scenario slice to confirm throughput advantage
    t1 = time.perf_counter()
    for sc in scenarios[:15]:
        run_scalar_scenario(state, sc, steps=50, seed=7)
    scalar_slice_elapsed = time.perf_counter() - t1
    assert vec_elapsed < scalar_slice_elapsed
