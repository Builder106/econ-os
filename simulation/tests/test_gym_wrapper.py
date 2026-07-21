import numpy as np
from simulation.gym_wrapper import MarketGymEnv

def test_market_gym_env():
    env = MarketGymEnv(agent_filter="consumers")
    
    # Test initialization
    assert env.action_space is not None
    assert env.observation_space is not None
    
    # Test reset
    obs, info = env.reset()
    assert obs is not None
    assert not np.isnan(obs).any()
    
    # Test step
    action = env.action_space.sample()
    obs, reward, done, truncated, info = env.step(action)
    
    assert obs is not None
    assert not np.isnan(obs).any()
    assert isinstance(reward, float) or isinstance(reward, np.float32) or isinstance(reward, np.float64)
    assert isinstance(done, bool) or isinstance(done, np.bool_)
    assert isinstance(truncated, bool) or isinstance(truncated, np.bool_)
    assert isinstance(info, dict)
