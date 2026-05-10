"""The shared kernel: one MarketEnv, one tick loop, fan-out broadcast.

Every connected client subscribes to the same instance. The kernel runs whether
clients are connected or not — like a real mainframe — so visitors join an
already-running economy mid-stream.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Optional, Set

import numpy as np

from simulation.environment import MarketEnv
from simulation.logic import calculate_gini

CONSUMER_MODEL_PATH = os.environ.get("CONSUMER_MODEL", "models/consumer_policy.zip")
PRODUCER_MODEL_PATH = os.environ.get("PRODUCER_MODEL", "models/producer_policy.zip")
TICK_MS = int(os.environ.get("TICK_MS", "500"))
MAX_CYCLES = int(os.environ.get("MAX_CYCLES", "5000"))


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
        self.subscribers: Set[asyncio.Queue] = set()
        self.paused = False
        self.last_rewards: dict = {}
        self.uptime_seconds = 0.0
        self._started_at = time.monotonic()
        self._task: Optional[asyncio.Task] = None

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
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    def _act(self, agent: str, obs):
        model = self.consumer_model if "consumer" in agent else self.producer_model
        if model is None:
            return self.env.action_space(agent).sample()
        action, _ = model.predict(obs, deterministic=False)
        return action

    def snapshot(self) -> dict:
        balances = list(self.env.agent_balances.values())
        consumer_balances = [
            self.env.agent_balances[a] for a in self.env.agents if "consumer" in a
        ]
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
        return {"ok": True, "paused": True}

    def cmd_resume(self) -> dict:
        self.paused = False
        return {"ok": True, "paused": False}

    def cmd_set_tax(self, rate: float) -> dict:
        self.env.set_tax_rate(rate)
        return {"ok": True, "tax_rate": float(self.env.tax_rate)}

    def cmd_shock(self, kind: str, magnitude: float) -> dict:
        self.env.apply_shock(kind, magnitude)
        return {"ok": True, "queued": {"kind": kind, "magnitude": magnitude}}

    def cmd_reset(self) -> dict:
        self.env.reset()
        self.last_rewards = {}
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
