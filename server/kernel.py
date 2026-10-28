"""The shared kernel: one MarketEnv, one tick loop, fan-out broadcast.

Every connected client subscribes to the same instance. The kernel runs whether
clients are connected or not — like a real mainframe — so visitors join an
already-running economy mid-stream.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import os
import time
from datetime import UTC, datetime
from uuid import uuid4

from simulation.environment import MarketEnv
from simulation.logic import (
    calculate_cpi,
    calculate_gini,
    calculate_lorenz_curve,
    calculate_real_gdp,
)

CONSUMER_MODEL_PATH = os.environ.get("CONSUMER_MODEL", "").strip() or "models/consumer_policy.zip"
PRODUCER_MODEL_PATH = os.environ.get("PRODUCER_MODEL", "").strip() or "models/producer_policy.zip"
TICK_MS = int(os.environ.get("TICK_MS", "").strip() or "500")
MAX_CYCLES = int(os.environ.get("MAX_CYCLES", "").strip() or "5000")


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _model_sha256(path: str) -> str:
    with open(path, "rb") as model_file:
        return hashlib.file_digest(model_file, "sha256").hexdigest()


def _try_load_ppo(path: str):
    if not os.path.exists(path):
        return None
    try:
        from stable_baselines3 import PPO

        return PPO.load(path)
    except Exception as exc:
        print(f"[kernel] failed to load {path}: {exc}", flush=True)
        return None


class KernelService:
    """Owns the running MarketEnv and broadcasts each tick to subscribers."""

    def __init__(self) -> None:
        self.env = MarketEnv(num_consumers=10, num_producers=2, max_cycles=MAX_CYCLES)
        self.env.reset()
        self.consumer_model = _try_load_ppo(CONSUMER_MODEL_PATH)
        self.producer_model = _try_load_ppo(PRODUCER_MODEL_PATH)
        self.model_versions = {
            "consumer": (
                _model_sha256(CONSUMER_MODEL_PATH) if self.consumer_model is not None else None
            ),
            "producer": (
                _model_sha256(PRODUCER_MODEL_PATH) if self.producer_model is not None else None
            ),
        }
        self.subscribers: set[asyncio.Queue] = set()
        self.paused = False
        self.last_rewards: dict = {}
        self.uptime_seconds = 0.0
        self._started_at = time.monotonic()
        self._task: asyncio.Task | None = None
        self._begin_run("startup")

    @property
    def policies_loaded(self) -> bool:
        return self.consumer_model is not None and self.producer_model is not None

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task

    def _act(self, agent: str, obs):
        model = self.consumer_model if "consumer" in agent else self.producer_model
        if model is None:
            return self.env.action_space(agent).sample()
        action, _ = model.predict(obs, deterministic=False)
        return action

    def snapshot(self) -> dict:
        balances = list(self.env.agent_balances.values())
        consumer_balances = [self.env.agent_balances[a] for a in self.env.agents if "consumer" in a]
        return {
            "type": "tick",
            "step": int(self.env.num_cycles),
            "uptime_s": round(time.monotonic() - self._started_at, 1),
            "paused": self.paused,
            "policies_loaded": self.policies_loaded,
            "market": {
                "wage": float(self.env.market_wage),
                "price": float(self.env.market_price),
            },
            "policy": {
                "tax_rate": float(self.env.tax_rate),
            },
            "metrics": {
                "gini": float(calculate_gini(consumer_balances)) if consumer_balances else 0.0,
                "cpi": float(
                    calculate_cpi(self.env.market_price, getattr(self.env, "base_price", 10.0))
                ),
                "real_gdp": float(
                    calculate_real_gdp(
                        getattr(self.env, "last_consumption_spend", 0.0),
                        self.env.market_price,
                        getattr(self.env, "base_price", 10.0),
                    )
                ),
                "lorenz_curve": (
                    calculate_lorenz_curve(consumer_balances)
                    if consumer_balances
                    else {"quantiles": [], "cumulative_wealth": []}
                ),
                "total_money": float(sum(balances) + self.env.treasury),
                "treasury": float(self.env.treasury),
            },
            "agents": [
                {
                    "id": a,
                    "role": "consumer" if "consumer" in a else "producer",
                    "balance": float(self.env.agent_balances[a]),
                    "reward": float(self.last_rewards.get(a, 0.0)),
                }
                for a in self.env.agents
            ],
        }

    def _begin_run(self, reason: str) -> None:
        self.run_id = uuid4().hex
        self.run_started_at = _utc_now()
        self.run_start_reason = reason
        self.initial_conditions = {
            "environment": self.env.metadata["name"],
            "seed": None,
            "max_cycles": self.env.max_cycles,
            "num_consumers": self.env.num_consumers,
            "num_producers": self.env.num_producers,
            "market": {
                "wage": float(self.env.market_wage),
                "price": float(self.env.market_price),
                "base_price": float(self.env.base_price),
            },
            "policy": {"tax_rate": float(self.env.tax_rate)},
            "treasury": float(self.env.treasury),
            "agent_balances": {
                agent: float(balance) for agent, balance in self.env.agent_balances.items()
            },
        }
        self.policy_changes: list[dict] = []

    def _record_change(self, command: str, detail: dict) -> None:
        self.policy_changes.append(
            {
                "step": int(self.env.num_cycles),
                "at": _utc_now(),
                "command": command,
                "detail": detail,
            }
        )

    def export_run(self) -> dict:
        state = self.snapshot()
        return {
            "format": "econos-run-snapshot",
            "schema_version": 1,
            "captured_at": _utc_now(),
            "run": {
                "id": self.run_id,
                "started_at": self.run_started_at,
                "start_reason": self.run_start_reason,
                "step_interval": {"from": 0, "to": state["step"]},
                "initial_conditions": self.initial_conditions,
                "models": {
                    role: {
                        "sha256": digest,
                        "action_source": "trained_ppo" if digest is not None else "sampled_actions",
                    }
                    for role, digest in self.model_versions.items()
                },
                "policy_changes": list(self.policy_changes),
            },
            "state": state,
            "replay": {
                "exact": False,
                "reason": "Per-step actions and random generator state are not recorded.",
            },
        }

    async def _run(self) -> None:
        last_obs = {a: self.env._get_obs(a) for a in self.env.agents}
        period = TICK_MS / 1000.0

        while True:
            t0 = time.monotonic()

            if not self.paused:
                actions = {a: self._act(a, last_obs[a]) for a in self.env.agents}
                obs, rewards, _, truncations, _ = self.env.step(actions)
                self.last_rewards = rewards
                last_obs = obs

                if truncations and any(truncations.values()):
                    self.env.reset()
                    self.last_rewards = {}
                    self._begin_run("cycle_limit")
                    last_obs = {a: self.env._get_obs(a) for a in self.env.agents}

            payload = json.dumps(self.snapshot())
            dead = []
            for q in self.subscribers:
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self.subscribers.discard(q)

            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, period - elapsed))

    # --- admin operations (auth checked at the WS layer) ---

    def cmd_pause(self) -> dict:
        self.paused = True
        self._record_change("pause", {"paused": True})
        return {"ok": True, "paused": True}

    def cmd_resume(self) -> dict:
        self.paused = False
        self._record_change("resume", {"paused": False})
        return {"ok": True, "paused": False}

    def cmd_set_tax(self, rate: float) -> dict:
        self.env.set_tax_rate(rate)
        self._record_change("tax", {"tax_rate": float(self.env.tax_rate)})
        return {"ok": True, "tax_rate": float(self.env.tax_rate)}

    def cmd_redistribute(self) -> dict:
        total, per_consumer = self.env.redistribute_treasury()
        self._record_change(
            "redistribute", {"total": float(total), "per_consumer": float(per_consumer)}
        )
        return {"ok": True, "total": float(total), "per_consumer": float(per_consumer)}

    def cmd_shock(self, kind: str, magnitude: float) -> dict:
        self.env.apply_shock(kind, magnitude)
        self._record_change("shock_queued", {"kind": kind, "magnitude": magnitude})
        return {"ok": True, "queued": {"kind": kind, "magnitude": magnitude}}

    def cmd_reset(self) -> dict:
        self.env.reset()
        self.last_rewards = {}
        self._begin_run("manual_reset")
        return {"ok": True, "reset": True}

    def broadcast_event(self, payload: dict) -> None:
        """Push an out-of-band event to every subscriber (admin actions, shocks, etc.)."""
        msg = json.dumps(payload)
        dead = []
        for q in self.subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.subscribers.discard(q)
