import functools
from collections.abc import Sequence
from typing import ClassVar

import numpy as np
from gymnasium.spaces import Box
from pettingzoo import ParallelEnv

from simulation.logic import excess_demand_price_factor, production_function


def _resolve_profile(
    values: Sequence[float] | None,
    count: int,
    default: float,
    spread: float,
    rng: np.random.Generator | None,
    low: float,
    high: float,
    heterogeneous: bool,
    preserve_mean: bool = False,
) -> np.ndarray:
    """Resolve an agent parameter vector from overrides or deterministic/seeded heterogeneity."""
    if values is not None:
        arr = np.asarray(values, dtype=float)
        if arr.shape != (count,):
            raise ValueError(f"expected {count} profile entries, got {arr.shape}")
        if not np.all(np.isfinite(arr)) or np.any(arr < low) or np.any(arr > high):
            raise ValueError(f"profile entries must be finite and in [{low}, {high}]")
        return arr
    if count == 0 or not heterogeneous or count == 1:
        return np.full(count, default, dtype=float)
    if rng is not None:
        raw = rng.uniform(default - spread, default + spread, size=count)
    else:
        raw = np.linspace(default - spread, default + spread, num=count)
    raw = np.clip(raw, low, high)
    if preserve_mean and default > 0.0:
        raw = raw * (default / float(np.mean(raw)))
    return raw


class MarketEnv(ParallelEnv):
    metadata: ClassVar[dict] = {"render_modes": ["human"], "name": "market_v0"}

    def __init__(
        self,
        num_consumers: int = 10,
        num_producers: int = 2,
        max_cycles: int = 100,
        agent_filter: str | None = None,
        render_mode: str | None = None,
        tax_rate: float = 0.0,
        heterogeneous: bool = False,
        seed: int | None = None,
        consumer_alphas: Sequence[float] | None = None,
        consumer_skills: Sequence[float] | None = None,
        producer_productivities: Sequence[float] | None = None,
        producer_betas: Sequence[float] | None = None,
        consumer_initial_balances: Sequence[float] | None = None,
        producer_initial_balances: Sequence[float] | None = None,
    ) -> None:
        self.num_consumers = num_consumers
        self.num_producers = num_producers
        self.max_cycles = max_cycles
        self.render_mode = render_mode
        self.tax_rate = float(tax_rate)
        self.heterogeneous = bool(heterogeneous)
        self.treasury = 0.0
        self.cumulative_monetary_shock = 0.0
        self._pending_shocks: list[tuple[str, float]] = []

        rng = np.random.default_rng(seed) if seed is not None else None
        self.consumer_alphas = _resolve_profile(
            consumer_alphas,
            num_consumers,
            default=0.7,
            spread=0.15,
            rng=rng,
            low=0.05,
            high=0.95,
            heterogeneous=self.heterogeneous,
        )
        self.consumer_skills = _resolve_profile(
            consumer_skills,
            num_consumers,
            default=1.0,
            spread=0.25,
            rng=rng,
            low=0.0,
            high=5.0,
            heterogeneous=self.heterogeneous,
            preserve_mean=True,
        )
        self.producer_productivities = _resolve_profile(
            producer_productivities,
            num_producers,
            default=1.0,
            spread=0.2,
            rng=rng,
            low=0.1,
            high=5.0,
            heterogeneous=self.heterogeneous,
            preserve_mean=True,
        )
        self.producer_betas = _resolve_profile(
            producer_betas,
            num_producers,
            default=0.8,
            spread=0.1,
            rng=rng,
            low=0.1,
            high=1.0,
            heterogeneous=self.heterogeneous,
        )
        self.consumer_initial_balances = _resolve_profile(
            consumer_initial_balances,
            num_consumers,
            default=50.0,
            spread=25.0,
            rng=rng,
            low=0.0,
            high=1e9,
            heterogeneous=self.heterogeneous,
            preserve_mean=True,
        )
        self.producer_initial_balances = _resolve_profile(
            producer_initial_balances,
            num_producers,
            default=200.0,
            spread=80.0,
            rng=rng,
            low=0.0,
            high=1e9,
            heterogeneous=self.heterogeneous,
            preserve_mean=True,
        )

        all_agents = [f"consumer_{i}" for i in range(num_consumers)] + [
            f"producer_{i}" for i in range(num_producers)
        ]

        if agent_filter == "consumers":
            self.possible_agents = [f"consumer_{i}" for i in range(num_consumers)]
        elif agent_filter == "producers":
            self.possible_agents = [f"producer_{i}" for i in range(num_producers)]
        else:
            self.possible_agents = all_agents

        self.agent_name_mapping = dict(
            zip(self.possible_agents, range(len(self.possible_agents)), strict=False)
        )

    def set_tax_rate(self, rate):
        self.tax_rate = float(np.clip(rate, 0.0, 1.0))

    def apply_shock(self, kind, magnitude):
        if kind not in ("wage", "price", "money"):
            raise ValueError(f"unknown shock kind: {kind}")
        self._pending_shocks.append((kind, float(magnitude)))

    def _calculate_utility(self, consumption, labor, alpha: float = 0.7):
        """Cobb-Douglas utility: C^alpha * (1-L)^(1-alpha)"""
        return float((consumption**alpha) * ((1.0 - labor) ** (1.0 - alpha)))

    @functools.cache
    def observation_space(self, agent):
        # [normalized_prev_wage, normalized_prev_price, normalized_balance]
        return Box(low=0, high=1, shape=(3,), dtype=np.float32)

    @functools.cache
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

        self.market_wage = 10.0
        self.market_price = 10.0
        self.base_price = 10.0
        self.last_cpi = 100.0
        self.last_real_gdp = 0.0
        self.last_consumption_spend = 0.0

        self.agent_balances = {
            agent: (
                float(self.consumer_initial_balances[int(agent.split("_")[1])])
                if "consumer" in agent
                else float(self.producer_initial_balances[int(agent.split("_")[1])])
            )
            for agent in self.agents
        }
        self.treasury = 0.0
        self.cumulative_monetary_shock = 0.0
        self._pending_shocks = []

        observations = {agent: self._get_obs(agent) for agent in self.agents}
        return observations, self.infos

    def redistribute_treasury(self):
        """Disburse accumulated treasury tax revenue equally to active consumers as UBI."""
        consumers = [a for a in self.agents if "consumer" in a]
        if not consumers or self.treasury <= 0:
            return 0.0, 0.0
        amount_per_consumer = float(self.treasury / len(consumers))
        total_disbursed = float(self.treasury)
        for c in consumers:
            self.agent_balances[c] += amount_per_consumer
        self.treasury = 0.0
        return total_disbursed, amount_per_consumer

    def _get_obs(self, agent):
        return np.array(
            [
                self.market_wage / 100.0,
                self.market_price / 100.0,
                self.agent_balances[agent] / 1000.0,
            ],
            dtype=np.float32,
        )

    def step(self, actions):
        if not actions:
            self.agents = []
            return {}, {}, {}, {}, {}

        for kind, magnitude in self._pending_shocks:
            if kind == "wage":
                self.market_wage = float(np.clip(self.market_wage * (1.0 + magnitude), 1.0, 100.0))
            elif kind == "price":
                self.market_price = float(
                    np.clip(self.market_price * (1.0 + magnitude), 1.0, 100.0)
                )
            elif kind == "money":
                for agent in self.agents:
                    prev = self.agent_balances[agent]
                    updated = max(0.0, prev * (1.0 + magnitude))
                    self.cumulative_monetary_shock += updated - prev
                    self.agent_balances[agent] = updated
        self._pending_shocks = []

        consumers = [agent for agent in self.agents if "consumer" in agent]
        producers = [agent for agent in self.agents if "producer" in agent]

        consumer_indices = [int(agent.split("_")[1]) for agent in consumers]
        eff_labor = {
            agent: float(actions[agent][0]) * float(self.consumer_skills[idx])
            for agent, idx in zip(consumers, consumer_indices, strict=True)
        }
        total_eff_labor = sum(eff_labor.values())
        total_consumption_spend = sum(
            actions[agent][1] * self.agent_balances[agent] for agent in consumers
        )

        if producers:
            w_mult = np.array(
                [1.0 + (actions[p][0] * 2.0 - 1.0) * 0.1 for p in producers],
                dtype=float,
            )
            p_mult = np.array(
                [1.0 + (actions[p][1] * 2.0 - 1.0) * 0.1 for p in producers],
                dtype=float,
            )
            self.market_wage = float(np.clip(self.market_wage * float(np.mean(w_mult)), 1.0, 100.0))
            if self.heterogeneous:
                p_indices = [int(p.split("_")[1]) for p in producers]
                productivities = self.producer_productivities[p_indices]
                betas = self.producer_betas[p_indices]
                rev_weights = productivities / p_mult
                rev_shares = rev_weights / np.sum(rev_weights)
                labor_weights = productivities * w_mult
                labor_shares = labor_weights / np.sum(labor_weights)
                total_supply = sum(
                    production_function(
                        total_eff_labor * float(labor_shares[j]),
                        efficiency=float(productivities[j]),
                        beta=float(betas[j]),
                    )
                    for j in range(len(producers))
                )
                ed_factor = excess_demand_price_factor(
                    total_consumption_spend, total_supply, self.market_price
                )
                self.market_price = float(
                    np.clip(self.market_price * float(np.mean(p_mult)) * ed_factor, 1.0, 100.0)
                )
            else:
                rev_shares = np.full(len(producers), 1.0 / len(producers), dtype=float)
                labor_shares = rev_shares
                self.market_price = float(
                    np.clip(self.market_price * float(np.mean(p_mult)), 1.0, 100.0)
                )

        rewards = {}
        total_wage_bill = total_eff_labor * self.market_wage

        paid_by_producer: dict[str, float] = {}
        revenue_by_producer: dict[str, float] = {}
        if producers:
            for j, agent in enumerate(producers):
                revenue_j = total_consumption_spend * float(rev_shares[j])
                wage_due_j = total_wage_bill * float(labor_shares[j])
                revenue_by_producer[agent] = revenue_j
                paid_by_producer[agent] = min(
                    wage_due_j,
                    self.agent_balances[agent] + revenue_j,
                )
            wage_paid = sum(paid_by_producer.values())
        else:
            # Single-role training environments keep their synthetic counterparty.
            wage_paid = total_wage_bill
        paid_wage_per_labor = wage_paid / total_eff_labor if total_eff_labor else 0.0

        self.last_consumption_spend = float(total_consumption_spend)
        self.last_cpi = float((self.market_price / self.base_price) * 100.0)
        cpi_ratio = self.last_cpi / 100.0
        self.last_real_gdp = float(total_consumption_spend / cpi_ratio) if cpi_ratio > 0 else 0.0

        for agent, idx in zip(consumers, consumer_indices, strict=True):
            labor = actions[agent][0]
            consumption_intent = actions[agent][1] * self.agent_balances[agent]

            gross_income = eff_labor[agent] * paid_wage_per_labor
            tax_paid = gross_income * self.tax_rate
            self.treasury += tax_paid

            self.agent_balances[agent] += (gross_income - tax_paid) - consumption_intent
            self.agent_balances[agent] = max(0, self.agent_balances[agent])

            actual_consumption = consumption_intent / (self.market_price + 1e-6)
            alpha = float(self.consumer_alphas[idx])
            rewards[agent] = self._calculate_utility(actual_consumption, labor, alpha=alpha)

        for agent in producers:
            prev_balance = self.agent_balances[agent]
            available = prev_balance + revenue_by_producer[agent]
            self.agent_balances[agent] = available - paid_by_producer[agent]
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
