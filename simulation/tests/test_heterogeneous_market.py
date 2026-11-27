"""Tests for heterogeneous-agent market dynamics, price formation, and monetary shocks."""

import numpy as np
import pytest

from simulation.environment import MarketEnv
from simulation.logic import excess_demand_price_factor


def test_excess_demand_price_factor():
    assert excess_demand_price_factor(200.0, 10.0, 10.0) > 1.0
    assert excess_demand_price_factor(50.0, 10.0, 10.0) < 1.0
    assert excess_demand_price_factor(100.0, 10.0, 10.0) == pytest.approx(1.0)
    # Bounded in [0.95, 1.05] at sensitivity=0.1
    assert excess_demand_price_factor(10000.0, 1.0, 10.0) == pytest.approx(1.05)
    assert excess_demand_price_factor(0.0, 100.0, 10.0) == pytest.approx(0.95)


def test_heterogeneous_profiles_and_validation():
    env_det = MarketEnv(num_consumers=5, num_producers=3, heterogeneous=True)
    obs, _ = env_det.reset()
    assert len(obs) == 8
    assert np.unique(env_det.consumer_alphas).size == 5
    assert np.unique(env_det.consumer_skills).size == 5
    assert np.unique(env_det.producer_productivities).size == 3
    assert np.mean(env_det.consumer_skills) == pytest.approx(1.0)
    assert np.mean(env_det.producer_productivities) == pytest.approx(1.0)

    env_seeded = MarketEnv(num_consumers=4, num_producers=2, heterogeneous=True, seed=42)
    env_seeded_same = MarketEnv(num_consumers=4, num_producers=2, heterogeneous=True, seed=42)
    assert np.allclose(env_seeded.consumer_alphas, env_seeded_same.consumer_alphas)
    assert np.allclose(env_seeded.producer_productivities, env_seeded_same.producer_productivities)

    # Single-agent edge case falls back cleanly to defaults
    env_single = MarketEnv(num_consumers=1, num_producers=1, heterogeneous=True)
    assert env_single.consumer_alphas[0] == pytest.approx(0.7)

    with pytest.raises(ValueError, match="expected 2 profile entries"):
        MarketEnv(num_consumers=2, consumer_alphas=[0.5, 0.6, 0.7])
    with pytest.raises(ValueError, match="finite and in"):
        MarketEnv(num_consumers=2, consumer_alphas=[0.0, 0.5])


def test_heterogeneous_money_conservation_and_price_formation():
    env = MarketEnv(num_consumers=6, num_producers=3, heterogeneous=True, seed=11, tax_rate=0.15)
    env.reset()
    initial_money = sum(env.agent_balances.values()) + env.treasury

    rng = np.random.default_rng(11)
    for _ in range(50):
        actions = {agent: rng.random(2) for agent in env.agents}
        env.step(actions)
        total = sum(env.agent_balances.values()) + env.treasury
        assert total == pytest.approx(initial_money, rel=1e-9)


def test_excess_demand_raises_price_in_heterogeneous_market():
    high_demand = MarketEnv(num_consumers=4, num_producers=2, heterogeneous=True)
    low_demand = MarketEnv(num_consumers=4, num_producers=2, heterogeneous=True)
    high_demand.reset()
    low_demand.reset()

    high_actions = {
        **{f"consumer_{i}": np.array([0.1, 0.9], dtype=float) for i in range(4)},
        **{f"producer_{j}": np.array([0.5, 0.5], dtype=float) for j in range(2)},
    }
    low_actions = {
        **{f"consumer_{i}": np.array([0.9, 0.05], dtype=float) for i in range(4)},
        **{f"producer_{j}": np.array([0.5, 0.5], dtype=float) for j in range(2)},
    }
    high_demand.step(high_actions)
    low_demand.step(low_actions)
    assert high_demand.market_price > low_demand.market_price


def test_productive_and_cheaper_producer_wins_higher_revenue_share():
    env = MarketEnv(
        num_consumers=2,
        num_producers=2,
        heterogeneous=True,
        producer_productivities=[1.5, 0.5],
        producer_betas=[0.8, 0.8],
        producer_initial_balances=[200.0, 200.0],
    )
    env.reset()
    actions = {
        "consumer_0": np.array([0.5, 0.5]),
        "consumer_1": np.array([0.5, 0.5]),
        "producer_0": np.array([0.5, 0.3]),
        "producer_1": np.array([0.5, 0.7]),
    }
    _obs, rewards, _term, _trunc, _info = env.step(actions)
    assert rewards["producer_0"] > rewards["producer_1"]


def test_monetary_supply_shock_accounting_and_price_response():
    expansion = MarketEnv(num_consumers=6, num_producers=2, heterogeneous=True, seed=5)
    baseline = MarketEnv(num_consumers=6, num_producers=2, heterogeneous=True, seed=5)
    expansion.reset()
    baseline.reset()
    initial_money = sum(expansion.agent_balances.values())

    expansion.apply_shock("money", 0.25)
    rng = np.random.default_rng(9)
    for _ in range(5):
        actions = {agent: rng.random(2) for agent in expansion.agents}
        expansion.step(actions)
        baseline.step(actions)

    assert expansion.cumulative_monetary_shock == pytest.approx(0.25 * initial_money)
    assert sum(expansion.agent_balances.values()) + expansion.treasury == pytest.approx(
        initial_money + expansion.cumulative_monetary_shock
    )
    assert expansion.market_price > baseline.market_price

    # Contraction shock floors balances cleanly at zero
    expansion.apply_shock("money", -1.5)
    expansion.step({agent: np.array([0.0, 0.0]) for agent in expansion.agents})
    assert all(b == 0.0 for b in expansion.agent_balances.values())
