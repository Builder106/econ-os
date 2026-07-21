import pytest
import numpy as np
from simulation.environment import MarketEnv

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
    obs, info = env.reset()
    
    def get_total_money():
        # Sum of all agent balances
        return sum(env.agent_balances.values())

    initial_money = get_total_money()
    
    # Run 100 steps with random actions
    for _ in range(100):
        actions = {}
        for agent in env.agents:
            actions[agent] = env.action_space(agent).sample()
        
        obs, rewards, terminations, truncations, infos = env.step(actions)
        if any(terminations.values()): break
    
    final_money = get_total_money()
    
    # In a market with no credit creation/destruction, money should be perfectly conserved.
    # We allow for floating point precision differences.
    assert final_money == pytest.approx(initial_money, rel=1e-5)

def test_environment_reset():
    """Verify that reset returns valid observations for all agents."""
    env = MarketEnv()
    obs, info = env.reset()
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
    o, r, t, tr, i = env.step({})
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

from simulation.logic import utility_function, production_function, calculate_gini

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
