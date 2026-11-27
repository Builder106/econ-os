"""Vectorized multi-parameter sweep engine for EconOS market simulations."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from simulation.environment import MarketEnv
from simulation.logic import calculate_cpi, calculate_gini, calculate_real_gdp


@dataclass(frozen=True)
class SweepScenario:
    """One parameter point in a multi-parameter market sweep."""

    tax_rate: float
    monetary_shock: float = 0.0


@dataclass(frozen=True)
class SweepInitialState:
    """Validated starting state and agent heterogeneity profiles for a sweep."""

    num_consumers: int
    num_producers: int
    consumer_balances: np.ndarray
    producer_balances: np.ndarray
    treasury: float
    market_wage: float
    market_price: float
    base_price: float
    heterogeneous: bool
    consumer_skills: np.ndarray
    consumer_alphas: np.ndarray
    producer_productivities: np.ndarray
    producer_betas: np.ndarray


def state_from_env(env: MarketEnv) -> SweepInitialState:
    """Extract a SweepInitialState from an initialized MarketEnv."""
    consumers = [f"consumer_{i}" for i in range(env.num_consumers)]
    producers = [f"producer_{j}" for j in range(env.num_producers)]
    return SweepInitialState(
        num_consumers=env.num_consumers,
        num_producers=env.num_producers,
        consumer_balances=np.array([env.agent_balances[c] for c in consumers], dtype=np.float64),
        producer_balances=np.array([env.agent_balances[p] for p in producers], dtype=np.float64),
        treasury=float(env.treasury),
        market_wage=float(env.market_wage),
        market_price=float(env.market_price),
        base_price=float(env.base_price),
        heterogeneous=bool(env.heterogeneous),
        consumer_skills=np.asarray(env.consumer_skills, dtype=np.float64),
        consumer_alphas=np.asarray(env.consumer_alphas, dtype=np.float64),
        producer_productivities=np.asarray(env.producer_productivities, dtype=np.float64),
        producer_betas=np.asarray(env.producer_betas, dtype=np.float64),
    )


def build_env_from_state(
    state: SweepInitialState,
    tax_rate: float,
    steps: int,
) -> MarketEnv:
    """Create a scalar MarketEnv matching a SweepInitialState for reference checks."""
    env = MarketEnv(
        num_consumers=state.num_consumers,
        num_producers=state.num_producers,
        max_cycles=steps,
        tax_rate=tax_rate,
        heterogeneous=state.heterogeneous,
        consumer_alphas=state.consumer_alphas.tolist(),
        consumer_skills=state.consumer_skills.tolist(),
        producer_productivities=state.producer_productivities.tolist(),
        producer_betas=state.producer_betas.tolist(),
        consumer_initial_balances=state.consumer_balances.tolist(),
        producer_initial_balances=state.producer_balances.tolist(),
    )
    env.reset()
    env.market_wage = float(state.market_wage)
    env.market_price = float(state.market_price)
    env.base_price = float(state.base_price)
    env.treasury = float(state.treasury)
    return env


def calculate_gini_batch(wealths: np.ndarray) -> np.ndarray:
    """Compute Gini index for each row of a 2D (scenarios, agents) wealth array."""
    n = wealths.shape[1]
    if n == 0:
        return np.zeros(wealths.shape[0], dtype=np.float64)
    sorted_w = np.sort(wealths, axis=1)
    sum_w = sorted_w.sum(axis=1)
    index = np.arange(1, n + 1, dtype=np.float64)
    safe_sum = np.where(sum_w > 0.0, sum_w, 1.0)
    raw = (2.0 * (sorted_w @ index) / (n * safe_sum)) - (n + 1) / n
    return np.where(sum_w > 0.0, raw, 0.0)


def _validate_scenarios(
    scenarios: Sequence[SweepScenario],
    steps: int,
    seed: int,
    shock_step: int,
) -> tuple[np.ndarray, np.ndarray]:
    if not scenarios:
        raise ValueError("at least one scenario is required")
    if type(steps) is not int or not 1 <= steps <= 10000:
        raise ValueError("steps must be between 1 and 10000")
    if type(seed) is not int or seed < 0:
        raise ValueError("seed must be a nonnegative integer")
    if type(shock_step) is not int or not 0 <= shock_step < steps:
        raise ValueError("shock_step must be within [0, steps)")

    tax_rates = np.empty(len(scenarios), dtype=np.float64)
    monetary_shocks = np.empty(len(scenarios), dtype=np.float64)
    for i, sc in enumerate(scenarios):
        if not math.isfinite(sc.tax_rate) or not 0.0 <= sc.tax_rate <= 1.0:
            raise ValueError("tax rate must be between 0 and 1")
        if not math.isfinite(sc.monetary_shock) or sc.monetary_shock <= -1.0:
            raise ValueError("monetary shock must be finite and greater than -1.0")
        tax_rates[i] = sc.tax_rate
        monetary_shocks[i] = sc.monetary_shock
    return tax_rates, monetary_shocks


def run_scalar_scenario(
    state: SweepInitialState,
    scenario: SweepScenario,
    steps: int,
    seed: int,
    shock_step: int = 0,
) -> dict[str, float]:
    """Run one scalar MarketEnv reference trajectory and return summary metrics."""
    _validate_scenarios([scenario], steps, seed, shock_step)
    env = build_env_from_state(state, scenario.tax_rate, steps)
    starting_money = float(sum(env.agent_balances.values()) + env.treasury)
    rng = np.random.default_rng(seed)
    for step_idx in range(steps):
        if step_idx == shock_step and scenario.monetary_shock != 0.0:
            env.apply_shock("money", scenario.monetary_shock)
        actions = {agent: rng.random(2) for agent in env.agents}
        env.step(actions)

    consumers = [env.agent_balances[f"consumer_{i}"] for i in range(env.num_consumers)]
    total_money = float(sum(env.agent_balances.values()) + env.treasury)
    return {
        "tax_rate": float(env.tax_rate),
        "monetary_shock": float(scenario.monetary_shock),
        "gini": float(calculate_gini(consumers)),
        "wage": float(env.market_wage),
        "price": float(env.market_price),
        "cpi": calculate_cpi(env.market_price, env.base_price),
        "real_gdp": calculate_real_gdp(
            env.last_consumption_spend, env.market_price, env.base_price
        ),
        "treasury": float(env.treasury),
        "monetary_shock_total": float(env.cumulative_monetary_shock),
        "total_money": total_money,
        "money_drift": total_money - (starting_money + float(env.cumulative_monetary_shock)),
    }


def run_vectorized_sweep(
    state: SweepInitialState,
    scenarios: Sequence[SweepScenario],
    steps: int,
    seed: int,
    shock_step: int = 0,
) -> list[dict[str, float]]:
    """Advance all scenarios together in contiguous NumPy arrays for high throughput."""
    if state.num_consumers < 1 or state.num_producers < 1:
        raise ValueError("sweep requires at least one consumer and one producer")
    tax_rates, monetary_shocks = _validate_scenarios(scenarios, steps, seed, shock_step)
    s = len(scenarios)
    n = state.num_consumers
    m = state.num_producers

    consumer_balances = np.broadcast_to(state.consumer_balances, (s, n)).copy()
    producer_balances = np.broadcast_to(state.producer_balances, (s, m)).copy()
    treasury = np.full(s, state.treasury, dtype=np.float64)
    cumulative_shock = np.zeros(s, dtype=np.float64)
    wage = np.full(s, state.market_wage, dtype=np.float64)
    price = np.full(s, state.market_price, dtype=np.float64)

    starting_money = float(
        state.consumer_balances.sum() + state.producer_balances.sum() + state.treasury
    )
    skills = state.consumer_skills
    productivities = state.producer_productivities
    betas = state.producer_betas
    uniform_shares = np.full(m, 1.0 / m, dtype=np.float64)
    shock_scales = (1.0 + monetary_shocks)[:, None]
    has_shocks = bool(np.any(monetary_shocks != 0.0))

    rng = np.random.default_rng(seed)
    spending = np.zeros(s, dtype=np.float64)
    for step_idx in range(steps):
        if step_idx == shock_step and has_shocks:
            new_c = np.maximum(0.0, consumer_balances * shock_scales)
            new_p = np.maximum(0.0, producer_balances * shock_scales)
            cumulative_shock += (new_c - consumer_balances).sum(axis=1) + (
                new_p - producer_balances
            ).sum(axis=1)
            consumer_balances = new_c
            producer_balances = new_p

        actions = rng.random((n + m, 2))
        c_labor = actions[:n, 0]
        c_spend = actions[:n, 1]
        p_wage_act = actions[n:, 0]
        p_price_act = actions[n:, 1]

        eff_labor = c_labor * skills
        total_eff_labor = float(eff_labor.sum())
        spending = (consumer_balances * c_spend).sum(axis=1)

        w_mult = 1.0 + (p_wage_act * 2.0 - 1.0) * 0.1
        p_mult = 1.0 + (p_price_act * 2.0 - 1.0) * 0.1
        wage = np.clip(wage * float(np.mean(w_mult)), 1.0, 100.0)
        mean_p_mult = float(np.mean(p_mult))

        if state.heterogeneous:
            rev_weights = productivities / p_mult
            rev_shares = rev_weights / rev_weights.sum()
            labor_weights = productivities * w_mult
            labor_shares = labor_weights / labor_weights.sum()
            supply_terms = productivities * ((total_eff_labor * labor_shares) ** betas)
            total_supply = float(np.sum(supply_terms))
            safe_price = np.maximum(price, 1e-6)
            real_demand = spending / safe_price
            supply_scale = max(total_supply, 1.0)
            ed_ratio = np.clip((real_demand - total_supply) / supply_scale, -0.5, 0.5)
            ed_factor = 1.0 + 0.1 * ed_ratio
            price = np.clip(price * mean_p_mult * ed_factor, 1.0, 100.0)
        else:
            rev_shares = uniform_shares
            labor_shares = uniform_shares
            price = np.clip(price * mean_p_mult, 1.0, 100.0)

        revenue = spending[:, None] * rev_shares[None, :]
        due = (total_eff_labor * wage)[:, None] * labor_shares[None, :]
        available_p = producer_balances + revenue
        paid = np.minimum(due, available_p)
        wage_per_labor = (
            paid.sum(axis=1) / total_eff_labor if total_eff_labor else np.zeros(s, dtype=np.float64)
        )
        gross = wage_per_labor[:, None] * eff_labor[None, :]
        tax = gross * tax_rates[:, None]
        treasury += tax.sum(axis=1)
        consumer_balances = np.maximum(
            0.0, consumer_balances + ((gross - tax) - consumer_balances * c_spend)
        )
        producer_balances = available_p - paid

    ginis = calculate_gini_batch(consumer_balances)
    total_money = consumer_balances.sum(axis=1) + producer_balances.sum(axis=1) + treasury
    money_drift = total_money - (starting_money + cumulative_shock)
    results: list[dict[str, float]] = []
    for i in range(s):
        p_val = float(price[i])
        results.append(
            {
                "tax_rate": float(tax_rates[i]),
                "monetary_shock": float(monetary_shocks[i]),
                "gini": float(ginis[i]),
                "wage": float(wage[i]),
                "price": p_val,
                "cpi": calculate_cpi(p_val, state.base_price),
                "real_gdp": calculate_real_gdp(float(spending[i]), p_val, state.base_price),
                "treasury": float(treasury[i]),
                "monetary_shock_total": float(cumulative_shock[i]),
                "total_money": float(total_money[i]),
                "money_drift": float(money_drift[i]),
            }
        )
    return results
