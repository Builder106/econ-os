"""Run a paired, local tax trial from an exported EconOS state."""

import argparse
import json
import math
from pathlib import Path

import numpy as np

from scripts.compare_snapshots import load_snapshot
from simulation.environment import MarketEnv
from simulation.logic import calculate_cpi, calculate_gini, calculate_real_gdp


def _restore(snapshot: dict, tax_rate: float, steps: int) -> MarketEnv:
    source = snapshot["run"]["initial_conditions"]
    state = snapshot["state"]
    if source["environment"] != MarketEnv.metadata["name"]:
        raise ValueError("snapshot uses an unsupported market environment")
    consumers = source["num_consumers"]
    producers = source["num_producers"]
    if type(consumers) is not int or type(producers) is not int or consumers < 1 or producers < 1:
        raise ValueError("snapshot has invalid agent counts")

    env = MarketEnv(
        num_consumers=consumers,
        num_producers=producers,
        max_cycles=steps,
        tax_rate=tax_rate,
    )
    env.reset()
    balances = {agent["id"]: agent["balance"] for agent in state["agents"]}
    if set(balances) != set(env.agents):
        raise ValueError("snapshot agent IDs do not match its agent counts")

    wage = state["market"]["wage"]
    price = state["market"]["price"]
    base_price = source["market"]["base_price"]
    treasury = state["metrics"]["treasury"]
    if not all(math.isfinite(value) and value > 0 for value in (wage, price, base_price)):
        raise ValueError("snapshot market prices must be finite and positive")
    if (
        not math.isfinite(treasury)
        or treasury < 0
        or any(balance < 0 for balance in balances.values())
    ):
        raise ValueError("snapshot balances and treasury must be nonnegative")
    if not math.isclose(
        sum(balances.values()) + treasury,
        state["metrics"]["total_money"],
        rel_tol=1e-6,
        abs_tol=1e-4,
    ):
        raise ValueError("snapshot total money does not match agent balances and treasury")

    env.agent_balances = balances
    env.market_wage = float(wage)
    env.market_price = float(price)
    env.base_price = float(base_price)
    env.treasury = float(treasury)
    return env


def _summary(env: MarketEnv, starting_money: float) -> dict:
    consumers = [env.agent_balances[agent] for agent in env.agents if "consumer" in agent]
    total_money = float(sum(env.agent_balances.values()) + env.treasury)
    return {
        "tax_rate": float(env.tax_rate),
        "gini": float(calculate_gini(consumers)),
        "wage": float(env.market_wage),
        "price": float(env.market_price),
        "cpi": calculate_cpi(env.market_price, env.base_price),
        "real_gdp": calculate_real_gdp(
            env.last_consumption_spend, env.market_price, env.base_price
        ),
        "treasury": float(env.treasury),
        "total_money": total_money,
        "money_drift": total_money - starting_money,
    }


def run_experiment(snapshot: dict, tax_rate: float, steps: int, seed: int) -> dict:
    if not math.isfinite(tax_rate) or not 0 <= tax_rate <= 1:
        raise ValueError("tax rate must be between 0 and 1")
    if type(steps) is not int or not 1 <= steps <= 1000:
        raise ValueError("steps must be between 1 and 1000")
    if type(seed) is not int or seed < 0:
        raise ValueError("seed must be a nonnegative integer")

    baseline_rate = snapshot["state"]["policy"]["tax_rate"]
    if not math.isfinite(baseline_rate) or not 0 <= baseline_rate <= 1:
        raise ValueError("snapshot tax rate must be between 0 and 1")
    baseline = _restore(snapshot, baseline_rate, steps)
    treatment = _restore(snapshot, tax_rate, steps)
    starting_money = float(sum(baseline.agent_balances.values()) + baseline.treasury)
    rng = np.random.default_rng(seed)
    for _ in range(steps):
        actions = {agent: rng.random(2) for agent in baseline.agents}
        baseline.step(actions)
        treatment.step(actions)

    control = _summary(baseline, starting_money)
    trial = _summary(treatment, starting_money)
    return {
        "format": "econos-private-tax-experiment",
        "schema_version": 1,
        "question": "How does the tax rate change outcomes under the same actions?",
        "source": {
            "run_id": snapshot["run"]["id"],
            "step": snapshot["state"]["step"],
            "captured_at": snapshot["captured_at"],
        },
        "method": {
            "steps": steps,
            "seed": seed,
            "actions": "uniform random values shared by both scenarios",
            "starting_state": "saved market, balances, and treasury; pending shocks omitted",
            "trained_models_used": False,
            "exact_live_replay": False,
            "tax_receipts_redistributed": False,
            "wages_limited_by_producer_funds": True,
            "starting_money": starting_money,
        },
        "baseline": control,
        "treatment": trial,
        "difference": {key: trial[key] - control[key] for key in control},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--tax-rate", type=float, required=True)
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    try:
        report = run_experiment(load_snapshot(args.snapshot), args.tax_rate, args.steps, args.seed)
    except (OSError, KeyError, TypeError, ValueError) as exc:
        parser.exit(2, f"experiment failed: {exc}\n")
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
