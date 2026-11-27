"""Run a paired, local tax trial from an exported EconOS state."""

import argparse
import json
import math
from pathlib import Path

import numpy as np

from scripts.compare_snapshots import load_snapshot
from simulation.environment import MarketEnv
from simulation.logic import calculate_cpi, calculate_gini, calculate_real_gdp
from simulation.sweep import SweepScenario, run_vectorized_sweep, state_from_env

SUMMARY_KEYS = (
    "tax_rate",
    "gini",
    "wage",
    "price",
    "cpi",
    "real_gdp",
    "treasury",
    "total_money",
    "money_drift",
)


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


def run_sweep(
    snapshot: dict,
    tax_rates: list[float],
    steps: int,
    seed: int,
    monetary_shocks: list[float] | None = None,
    heterogeneous: bool = False,
) -> dict:
    if not tax_rates:
        raise ValueError("at least one tax rate is required")
    first = run_experiment(snapshot, tax_rates[0], steps, seed)
    shocks = [0.0] if monetary_shocks is None else monetary_shocks
    if not shocks:
        raise ValueError("at least one monetary shock is required")

    base_env = _restore(snapshot, tax_rates[0], steps)
    if heterogeneous:
        het_env = MarketEnv(
            num_consumers=base_env.num_consumers,
            num_producers=base_env.num_producers,
            max_cycles=steps,
            tax_rate=tax_rates[0],
            heterogeneous=True,
            seed=seed,
        )
        base_env.heterogeneous = True
        base_env.consumer_alphas = het_env.consumer_alphas
        base_env.consumer_skills = het_env.consumer_skills
        base_env.producer_productivities = het_env.producer_productivities
        base_env.producer_betas = het_env.producer_betas

    state = state_from_env(base_env)
    scenarios = [
        SweepScenario(tax_rate=rate, monetary_shock=shock) for rate in tax_rates for shock in shocks
    ]
    sweep_rows = run_vectorized_sweep(state, scenarios, steps=steps, seed=seed)

    control = first["baseline"]
    include_monetary = monetary_shocks is not None
    trials = []
    for row in sweep_rows:
        trial = {key: row[key] for key in SUMMARY_KEYS}
        if include_monetary:
            trial["monetary_shock"] = row["monetary_shock"]
            trial["monetary_shock_total"] = row["monetary_shock_total"]
        trials.append(
            {
                "treatment": trial,
                "difference": {key: trial[key] - control[key] for key in control},
            }
        )
    return {
        "format": "econos-private-tax-sweep",
        "schema_version": 1,
        "source": first["source"],
        "method": {**first["method"], "heterogeneous": heterogeneous},
        "baseline": control,
        "trials": trials,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--tax-rate", type=float, action="append", required=True)
    parser.add_argument("--monetary-shock", type=float, action="append", default=None)
    parser.add_argument("--heterogeneous", action="store_true")
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    try:
        snapshot = load_snapshot(args.snapshot)
        if len(args.tax_rate) == 1 and args.monetary_shock is None and not args.heterogeneous:
            report = run_experiment(snapshot, args.tax_rate[0], args.steps, args.seed)
        else:
            report = run_sweep(
                snapshot,
                args.tax_rate,
                args.steps,
                args.seed,
                monetary_shocks=args.monetary_shock,
                heterogeneous=args.heterogeneous,
            )
    except (OSError, KeyError, TypeError, ValueError) as exc:
        parser.exit(2, f"experiment failed: {exc}\n")
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
