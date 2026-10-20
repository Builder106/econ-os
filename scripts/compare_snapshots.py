"""Compare two EconOS exports without changing the shared kernel."""

import argparse
import json
import math
from pathlib import Path

FIELDS = (
    ("Market wage", "market", "wage"),
    ("Market price", "market", "price"),
    ("Tax rate", "policy", "tax_rate"),
    ("Gini coefficient", "metrics", "gini"),
    ("CPI", "metrics", "cpi"),
    ("Real GDP", "metrics", "real_gdp"),
    ("Total money", "metrics", "total_money"),
    ("Treasury", "metrics", "treasury"),
)


def load_snapshot(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        snapshot = json.load(source)
    if not isinstance(snapshot, dict):
        raise ValueError(f"{path}: expected a JSON object")
    if snapshot.get("format") != "econos-run-snapshot" or snapshot.get("schema_version") != 1:
        raise ValueError(f"{path}: expected an EconOS run snapshot at schema version 1")
    try:
        state = snapshot["state"]
        if state["step"] != snapshot["run"]["step_interval"]["to"]:
            raise ValueError("state step does not match run interval")
        for _, group, field in FIELDS:
            value = state[group][field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{group}.{field} is not a number")
            if not math.isfinite(value):
                raise ValueError(f"{group}.{field} is not finite")
        agents = state["agents"]
        ids = [agent["id"] for agent in agents]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate agent IDs")
        for agent in agents:
            balance = agent["balance"]
            if isinstance(balance, bool) or not isinstance(balance, (int, float)):
                raise ValueError("agent balance is not a number")
            if not math.isfinite(balance):
                raise ValueError("agent balance is not finite")
    except (KeyError, TypeError) as exc:
        raise ValueError(f"{path}: missing or invalid snapshot field: {exc}") from exc
    except ValueError as exc:
        raise ValueError(f"{path}: {exc}") from exc
    return snapshot


def compare(before: dict, after: dict) -> str:
    same_run = before["run"]["id"] == after["run"]["id"]
    old_step = before["state"]["step"]
    new_step = after["state"]["step"]
    if same_run and new_step < old_step:
        raise ValueError("the later snapshot precedes the earlier snapshot in the same run")

    same_initial = before["run"]["initial_conditions"] == after["run"]["initial_conditions"]
    same_models = before["run"]["models"] == after["run"]["models"]
    lines = [
        "EconOS snapshot comparison",
        f"Earlier: {before['captured_at']} | run {before['run']['id']} | step {old_step}",
        f"Later:   {after['captured_at']} | run {after['run']['id']} | step {new_step}",
        f"Same run: {'yes' if same_run else 'no'}",
        f"Same initial conditions: {'yes' if same_initial else 'no'}",
        f"Same model checkpoints: {'yes' if same_models else 'no'}",
        "",
        "Measure                 Earlier        Later       Change",
    ]
    for label, group, field in FIELDS:
        old = before["state"][group][field]
        new = after["state"][group][field]
        lines.append(f"{label:<22} {old:>10.3f}   {new:>10.3f}   {new - old:>+10.3f}")

    old_agents = {agent["id"]: agent["balance"] for agent in before["state"]["agents"]}
    new_agents = {agent["id"]: agent["balance"] for agent in after["state"]["agents"]}
    shared = sorted(old_agents.keys() & new_agents.keys())
    lines.extend(["", f"Matched agents: {len(shared)}"])
    for agent in shared:
        lines.append(
            f"{agent:<22} {old_agents[agent]:>10.3f}   {new_agents[agent]:>10.3f}   "
            f"{new_agents[agent] - old_agents[agent]:>+10.3f}"
        )
    if old_agents.keys() != new_agents.keys():
        lines.append("Agent IDs differ; unmatched agents are omitted.")

    changes = after["run"]["policy_changes"]
    if (
        same_run
        and changes[: len(before["run"]["policy_changes"])] == before["run"]["policy_changes"]
    ):
        changes = changes[len(before["run"]["policy_changes"]) :]
    lines.extend(["", f"Policy changes in later export: {len(changes)}"])
    for change in changes:
        lines.append(f"  step {change['step']}: {change['command']}")
    lines.extend(
        [
            "",
            "Descriptive comparison only. Exports omit per-step actions and random state;",
            "differences do not establish the effect of a policy change.",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("earlier", type=Path, help="first exported JSON file")
    parser.add_argument("later", type=Path, help="second exported JSON file")
    args = parser.parse_args()
    try:
        print(compare(load_snapshot(args.earlier), load_snapshot(args.later)))
    except (OSError, KeyError, TypeError, AttributeError, ValueError) as exc:
        parser.exit(2, f"comparison failed: {exc}\n")


if __name__ == "__main__":
    main()
