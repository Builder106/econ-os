import numpy as np
import pytest

from simulation.environment import MarketEnv
from simulation.logic import calculate_gini, production_function, utility_function


def test_cobb_douglas_utility():
    """Verify that utility is 0 if either consumption or leisure is 0."""
    env = MarketEnv()

    # Test 0 consumption
    u_zero_c = env._calculate_utility(consumption=0, labor=0.5)
    assert u_zero_c == 0

    # Test 0 leisure (labor = 1)
    u_zero_l = env._calculate_utility(consumption=10, labor=1.0)
    assert u_zero_l == pytest.approx(0, abs=1e-5)

    # Test normal values
    u_norm = env._calculate_utility(consumption=1, labor=0)
    assert u_norm > 0


def test_money_conservation():
    """Verify that total money in the system is conserved across steps."""
    env = MarketEnv(num_consumers=10, num_producers=2)
    _obs, _info = env.reset()

    def get_total_money():
        # Sum of all agent balances
        return sum(env.agent_balances.values())

    initial_money = get_total_money()

    # Run 100 steps with random actions
    for _ in range(100):
        actions = {}
        for agent in env.agents:
            actions[agent] = env.action_space(agent).sample()

        _obs, _rewards, _terminations, _truncations, _infos = env.step(actions)

    final_money = get_total_money()

    # In a market with no credit creation/destruction, money should be perfectly conserved.
    # We allow for floating point precision differences.
    assert final_money == pytest.approx(initial_money, rel=1e-5)


def test_insolvent_producer_cannot_pay_unfunded_wages():
    env = MarketEnv(num_consumers=2, num_producers=1, tax_rate=0.2)
    env.reset()
    env.market_wage = 100.0
    env.agent_balances["producer_0"] = 1.0
    initial_money = sum(env.agent_balances.values()) + env.treasury
    actions = {
        "consumer_0": np.array([1.0, 0.0]),
        "consumer_1": np.array([1.0, 0.0]),
        "producer_0": np.array([0.5, 0.5]),
    }

    for _ in range(3):
        env.step(actions)
        assert env.agent_balances["producer_0"] == pytest.approx(0.0)
        assert sum(env.agent_balances.values()) + env.treasury == pytest.approx(initial_money)

    assert env.treasury == pytest.approx(0.2)
    assert env.agent_balances["consumer_0"] == pytest.approx(50.4)
    assert env.agent_balances["consumer_1"] == pytest.approx(50.4)


def test_environment_reset():
    """Verify that reset returns valid observations for all agents."""
    env = MarketEnv()
    obs, _info = env.reset()
    assert len(obs) == len(env.possible_agents)
    for agent, o in obs.items():
        assert not np.isnan(o).any()
        assert o.shape == env.observation_space(agent).shape


def test_environment_branches():
    # test agent_filter
    env_c = MarketEnv(agent_filter="consumers")
    assert "consumer_0" in env_c.possible_agents
    assert "producer_0" not in env_c.possible_agents

    env_p = MarketEnv(agent_filter="producers")
    assert "producer_0" in env_p.possible_agents
    assert "consumer_0" not in env_p.possible_agents

    # test apply_shock errors and valid
    env = MarketEnv()
    with pytest.raises(ValueError, match="unknown shock kind"):
        env.apply_shock("aliens", 10.0)

    env.reset()
    env.apply_shock("wage", 0.5)
    env.apply_shock("price", -0.2)
    # trigger step with empty actions to hit 'if not actions'
    o, _r, _t, _tr, _i = env.step({})
    assert not o

    # trigger step with actual actions to apply shocks
    env.reset()
    env.apply_shock("wage", 0.5)
    env.apply_shock("price", -0.2)
    actions = {a: env.action_space(a).sample() for a in env.agents}
    env.step(actions)

    # test coverage for render and close
    env.render()
    env.close()


def test_logic_functions():
    # test utility_function
    u = utility_function(0, 0.5)
    assert u >= 0
    u = utility_function(10, 1.0)
    assert u >= 0

    # test production_function
    q = production_function(0.5, efficiency=2.0)
    assert q > 0

    # test calculate_gini
    assert calculate_gini([]) == 0
    assert calculate_gini([0, 0, 0]) == 0

    # max inequality
    gini_max = calculate_gini([0, 0, 100])
    assert gini_max > 0.5

    # perfect equality
    gini_zero = calculate_gini([10, 10, 10])
    assert gini_zero == pytest.approx(0.0, abs=1e-5)


def test_ubi_redistribution():
    """Verify that treasury tax revenue is correctly redistributed to consumers as UBI."""
    env = MarketEnv(num_consumers=10, num_producers=2, tax_rate=0.20)
    env.reset()

    # Generate income and tax to populate treasury
    actions = {a: env.action_space(a).sample() for a in env.agents}
    env.step(actions)

    initial_treasury = env.treasury
    if initial_treasury > 0:
        consumer_balances_before = [env.agent_balances[c] for c in env.agents if "consumer" in c]
        total_disbursed, per_consumer = env.redistribute_treasury()

        assert env.treasury == 0.0
        assert total_disbursed == pytest.approx(initial_treasury)
        assert per_consumer == pytest.approx(initial_treasury / 10.0)

        consumer_balances_after = [env.agent_balances[c] for c in env.agents if "consumer" in c]
        for b_before, b_after in zip(
            consumer_balances_before, consumer_balances_after, strict=True
        ):
            assert b_after == pytest.approx(b_before + per_consumer)


def test_macro_analytics():
    """Verify CPI, Real GDP, and Lorenz Curve calculation functions."""
    from simulation.logic import calculate_cpi, calculate_lorenz_curve, calculate_real_gdp

    # CPI & GDP
    cpi = calculate_cpi(15.0, base_price=10.0)
    assert cpi == 150.0

    gdp = calculate_real_gdp(300.0, current_price=15.0, base_price=10.0)
    assert gdp == 200.0

    # Lorenz curve
    lorenz = calculate_lorenz_curve([10, 20, 30, 40], num_points=5)
    assert "quantiles" in lorenz and "cumulative_wealth" in lorenz
    assert len(lorenz["quantiles"]) == 6
    assert lorenz["quantiles"][0] == 0.0
    assert lorenz["quantiles"][-1] == 1.0
