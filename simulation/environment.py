import functools
import numpy as np
from gymnasium.spaces import Box
from pettingzoo import ParallelEnv

class MarketEnv(ParallelEnv):
    metadata = {"render_modes": ["human"], "name": "market_v0"}

    def __init__(self, num_consumers=10, num_producers=2, max_cycles=100, agent_filter=None, render_mode=None, tax_rate=0.0):
        self.num_consumers = num_consumers
        self.num_producers = num_producers
        self.max_cycles = max_cycles
        self.render_mode = render_mode
        self.tax_rate = float(tax_rate)
        self.treasury = 0.0
        self._pending_shocks = []

        all_agents = [f"consumer_{i}" for i in range(num_consumers)] + \
                    [f"producer_{i}" for i in range(num_producers)]

        if agent_filter == "consumers":
            self.possible_agents = [f"consumer_{i}" for i in range(num_consumers)]
        elif agent_filter == "producers":
            self.possible_agents = [f"producer_{i}" for i in range(num_producers)]
        else:
            self.possible_agents = all_agents

        self.agent_name_mapping = dict(zip(self.possible_agents, range(len(self.possible_agents))))

    def set_tax_rate(self, rate):
        self.tax_rate = float(np.clip(rate, 0.0, 1.0))

    def apply_shock(self, kind, magnitude):
        if kind not in ("wage", "price"):
            raise ValueError(f"unknown shock kind: {kind}")
        self._pending_shocks.append((kind, float(magnitude)))

    def _calculate_utility(self, consumption, labor):
        """Cobb-Douglas utility: C^0.7 * (1-L)^0.3"""
        return float((consumption ** 0.7) * ((1.0 - labor) ** 0.3))

    @functools.lru_cache(maxsize=None)
    def observation_space(self, agent):
        # [normalized_prev_wage, normalized_prev_price, normalized_balance]
        return Box(low=0, high=1, shape=(3,), dtype=np.float32)

    @functools.lru_cache(maxsize=None)
    def action_space(self, agent):
        if "consumer" in agent:
            # [labor (0-1), consumption_percent (0-1)]
            return Box(low=0, high=1, shape=(2,), dtype=np.float32)
        else:
            # [wage_percent_change (0-1), price_percent_change (0-1)]
            return Box(low=0, high=1, shape=(2,), dtype=np.float32)

    def reset(self, seed=None, options=None):
        self.agents = self.possible_agents[:]
        self.rewards = {agent: 0 for agent in self.agents}
        self.terminations = {agent: False for agent in self.agents}
        self.truncations = {agent: False for agent in self.agents}
        self.infos = {agent: {} for agent in self.agents}
        self.num_cycles = 0

        # State: [Wage, Price, Balance]
        # We start with some sensible defaults
        self.market_wage = 10.0
        self.market_price = 10.0

        self.agent_balances = {
            agent: 50.0 if "consumer" in agent else 200.0 for agent in self.agents
        }
        self.treasury = 0.0
        self._pending_shocks = []

        observations = {agent: self._get_obs(agent) for agent in self.agents}
        return observations, self.infos

    def _get_obs(self, agent):
        # Simple normalization: divide by 100 max
        return np.array([
            self.market_wage / 100.0,
            self.market_price / 100.0,
            self.agent_balances[agent] / 1000.0
        ], dtype=np.float32)

    def step(self, actions):
        if not actions:
            self.agents = []
            return {}, {}, {}, {}, {}

        # 0. Apply admin-issued shocks before normal market dynamics
        for kind, magnitude in self._pending_shocks:
            if kind == "wage":
                self.market_wage = float(np.clip(self.market_wage * (1.0 + magnitude), 1.0, 100.0))
            elif kind == "price":
                self.market_price = float(np.clip(self.market_price * (1.0 + magnitude), 1.0, 100.0))
        self._pending_shocks = []

        # 1. Update Market Parameters based on Producer actions
        producer_actions = [actions[a] for a in self.agents if "producer" in a]
        if producer_actions:
            # Producers adjust wage and price by a percentage
            avg_wage_adj = np.mean([a[0] for a in producer_actions]) * 2.0 - 1.0 # [-1, 1]
            avg_price_adj = np.mean([a[1] for a in producer_actions]) * 2.0 - 1.0 # [-1, 1]
            
            self.market_wage *= (1.0 + avg_wage_adj * 0.1) # Max 10% change
            self.market_price *= (1.0 + avg_price_adj * 0.1)
            
            # Keep within bounds
            self.market_wage = np.clip(self.market_wage, 1.0, 100.0)
            self.market_price = np.clip(self.market_price, 1.0, 100.0)

        # 2. Economic Logic Phase
        rewards = {}
        
        # Calculate Total Labor and Total Consumption
        total_labor = sum([actions[a][0] for a in self.agents if "consumer" in a])
        total_wage_bill = total_labor * self.market_wage
        total_consumption_spend = sum([actions[a][1] * self.agent_balances[a] for a in self.agents if "consumer" in a])
        
        # 2a. Update Consumers
        for agent in self.agents:
            if "consumer" in agent:
                labor = actions[agent][0]
                consumption_intent = actions[agent][1] * self.agent_balances[agent]

                # Income comes from labor; tax skim goes to treasury
                gross_income = labor * self.market_wage
                tax_paid = gross_income * self.tax_rate
                self.treasury += tax_paid

                self.agent_balances[agent] += (gross_income - tax_paid) - consumption_intent
                self.agent_balances[agent] = max(0, self.agent_balances[agent])

                actual_consumption = consumption_intent / (self.market_price + 1e-6)
                rewards[agent] = self._calculate_utility(actual_consumption, labor)
        
        # 2b. Update Producers
        for agent in self.agents:
            if "producer" in agent:
                prev_balance = self.agent_balances[agent]
                
                # Revenue from consumption - Costs from wages
                # Distributed equally among producers for simplicity
                share_of_revenue = total_consumption_spend / self.num_producers
                share_of_costs = total_wage_bill / self.num_producers
                
                self.agent_balances[agent] += share_of_revenue - share_of_costs
                self.agent_balances[agent] = max(0, self.agent_balances[agent])
                
                rewards[agent] = float(self.agent_balances[agent] - prev_balance)

        self.num_cycles += 1
        env_truncation = self.num_cycles >= self.max_cycles
        truncations = {agent: env_truncation for agent in self.agents}
        terminations = {agent: False for agent in self.agents}
        
        observations = {agent: self._get_obs(agent) for agent in self.agents}

        return observations, rewards, terminations, truncations, self.infos

    def render(self):
        pass

    def close(self):
        pass
