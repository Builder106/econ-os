import gymnasium as gym
import numpy as np
from simulation.environment import MarketEnv

class MarketGymEnv(gym.Env):
    """
    A single-agent Gymnasium wrapper for MarketEnv (shared policy).
    This treats every agent step as an independent experience for the RL model.
    """
    def __init__(self, agent_filter=None):
        super().__init__()
        self.env = MarketEnv(agent_filter=agent_filter)
        self.action_space = self.env.action_space(self.env.possible_agents[0])
        self.observation_space = self.env.observation_space(self.env.possible_agents[0])
        self.current_agent_idx = 0
        self.agents = self.env.possible_agents
        self.last_obs = None

    def reset(self, seed=None, options=None):
        obs, info = self.env.reset(seed=seed, options=options)
        self.last_obs = obs
        self.current_agent_idx = 0
        return obs[self.agents[0]], info

    def step(self, action):
        # In this simplified single-agent view, we apply the same action to all agents
        # (Parameter sharing)
        actions = {agent: action for agent in self.agents}
        obs, rewards, terminations, truncations, infos = self.env.step(actions)
        
        # Return the average reward and common obs for the next step
        avg_reward = np.mean(list(rewards.values()))
        done = all(terminations.values())
        truncated = all(truncations.values())
        
        self.last_obs = obs
        return obs[self.agents[0]], avg_reward, done, truncated, {}
