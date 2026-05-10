"""Shell command registry, parser, and dispatcher for the EconOS kernel.

Each command declares whether it requires admin elevation. The same auth
predicate is enforced at dispatch time *and* on the kernel methods themselves
(via the `requires_admin` flag here gating the call) — visitors who bypass the
disabled UI by speaking WS directly get the same answer.

Admin elevation is per-WebSocket-connection. Reconnecting drops it — by design.
If ADMIN_TOKEN is unset on the server, admin commands are universally denied
(no insecure default).
"""
from __future__ import annotations

import os
import shlex
from dataclasses import dataclass, field
from typing import Callable, Dict, List

from simulation.logic import calculate_gini

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "").strip()


class CommandError(Exception):
    """Raised by handlers for user-visible errors (bad args, unknown agent)."""


@dataclass
class Connection:
    """Per-WebSocket session state."""
    is_admin: bool = False


@dataclass
class Command:
    name: str
    requires_admin: bool
    summary: str
    handler: Callable[..., dict]


COMMANDS: Dict[str, Command] = {}


def _register(name: str, requires_admin: bool, summary: str):
    def deco(fn):
        COMMANDS[name] = Command(name=name, requires_admin=requires_admin, summary=summary, handler=fn)
        return fn
    return deco


# ---------- public commands ----------

@_register("help", False, "list commands")
def _cmd_help(kernel, conn: Connection, args: List[str]) -> dict:
    lines = ["EconOS shell — commands:"]
    for c in COMMANDS.values():
        marker = "[admin]" if c.requires_admin else "       "
        lines.append(f"  {marker} {c.name:<8} {c.summary}")
    return {"output": "\n".join(lines)}


@_register("who", False, "show your session info")
def _cmd_who(kernel, conn: Connection, args: List[str]) -> dict:
    role = "admin" if conn.is_admin else "visitor"
    return {"output": f"role={role}  step={kernel.env.num_cycles}  uptime_s={kernel.snapshot()['uptime_s']}"}


@_register("gini", False, "current consumer-wealth Gini")
def _cmd_gini(kernel, conn: Connection, args: List[str]) -> dict:
    cb = [kernel.env.agent_balances[a] for a in kernel.env.agents if "consumer" in a]
    g = calculate_gini(cb) if cb else 0.0
    return {"output": f"gini = {g:.4f}"}


@_register("inspect", False, "inspect <agent_id>")
def _cmd_inspect(kernel, conn: Connection, args: List[str]) -> dict:
    if not args:
        raise CommandError("usage: inspect <agent_id>")
    agent_id = args[0]
    if agent_id not in kernel.env.agent_balances:
        raise CommandError(f"unknown agent: {agent_id}")
    bal = kernel.env.agent_balances[agent_id]
    role = "consumer" if "consumer" in agent_id else "producer"
    last_r = kernel.last_rewards.get(agent_id, 0.0)
    return {"output": f"{agent_id}  role={role}  balance={bal:.3f}  last_reward={last_r:.4f}"}


@_register("top", False, "top [N] agents by balance (default 5)")
def _cmd_top(kernel, conn: Connection, args: List[str]) -> dict:
    try:
        n = int(args[0]) if args else 5
    except ValueError:
        raise CommandError("top expects an integer count")
    if not (1 <= n <= 100):
        raise CommandError("top N must be in [1, 100]")
    ranked = sorted(kernel.env.agent_balances.items(), key=lambda kv: kv[1], reverse=True)
    lines = [f"  {a:<14} {b:>10.3f}" for a, b in ranked[:n]]
    return {"output": "\n".join(lines)}


@_register("sudo", False, "sudo <token> — elevate this session to admin")
def _cmd_sudo(kernel, conn: Connection, args: List[str]) -> dict:
    if not args:
        raise CommandError("usage: sudo <token>")
    if not ADMIN_TOKEN:
        raise CommandError("admin disabled — server has no ADMIN_TOKEN configured")
    if args[0] != ADMIN_TOKEN:
        raise CommandError("invalid token")
    conn.is_admin = True
    return {"output": "admin enabled.", "auth": {"is_admin": True}}


# ---------- admin commands ----------

def _parse_pct(s: str) -> float:
    return float(s.strip().rstrip("%"))


@_register("pause", True, "pause the kernel tick loop")
def _cmd_pause(kernel, conn: Connection, args: List[str]) -> dict:
    kernel.cmd_pause()
    kernel.broadcast_event({"type": "event", "kind": "paused", "by": "admin", "detail": {}})
    return {"output": "paused."}


@_register("resume", True, "resume the kernel tick loop")
def _cmd_resume(kernel, conn: Connection, args: List[str]) -> dict:
    kernel.cmd_resume()
    kernel.broadcast_event({"type": "event", "kind": "resumed", "by": "admin", "detail": {}})
    return {"output": "resumed."}


@_register("tax", True, "tax <pct> — set income tax rate (0–100)")
def _cmd_tax(kernel, conn: Connection, args: List[str]) -> dict:
    if not args:
        raise CommandError("usage: tax <pct>   (0-100)")
    try:
        pct = _parse_pct(args[0])
    except ValueError:
        raise CommandError("tax pct must be numeric")
    if not (0.0 <= pct <= 100.0):
        raise CommandError("tax pct must be in [0, 100]")
    result = kernel.cmd_set_tax(pct / 100.0)
    kernel.broadcast_event({
        "type": "event", "kind": "tax_changed", "by": "admin",
        "detail": {"tax_rate": result["tax_rate"]},
    })
    return {"output": f"tax_rate → {result['tax_rate']*100:.2f}%"}


@_register("shock", True, "shock <wage|price> <pct> — one-shot multiplicative")
def _cmd_shock(kernel, conn: Connection, args: List[str]) -> dict:
    if len(args) < 2:
        raise CommandError("usage: shock <wage|price> <pct>")
    kind, pct_s = args[0], args[1]
    if kind not in ("wage", "price"):
        raise CommandError("shock target must be 'wage' or 'price'")
    try:
        pct = _parse_pct(pct_s)
    except ValueError:
        raise CommandError("shock magnitude must be numeric")
    if not (-50.0 <= pct <= 50.0):
        raise CommandError("shock magnitude must be in [-50, 50] %")
    kernel.cmd_shock(kind, pct / 100.0)
    kernel.broadcast_event({
        "type": "event", "kind": "shock_applied", "by": "admin",
        "detail": {"kind": kind, "magnitude": pct / 100.0},
    })
    return {"output": f"queued {kind} shock {pct:+.2f}% (lands next tick)"}


@_register("reset", True, "reset the simulation")
def _cmd_reset(kernel, conn: Connection, args: List[str]) -> dict:
    kernel.cmd_reset()
    kernel.broadcast_event({"type": "event", "kind": "reset", "by": "admin", "detail": {}})
    return {"output": "kernel reset."}


# ---------- dispatcher ----------

def dispatch(kernel, conn: Connection, line: str) -> dict:
    """Parse and run one shell line. Returns {ok, ...payload}."""
    line = (line or "").strip()
    if not line:
        return {"ok": True, "output": ""}
    try:
        tokens = shlex.split(line)
    except ValueError as e:
        return {"ok": False, "error": f"parse error: {e}"}
    name, *args = tokens
    cmd = COMMANDS.get(name)
    if cmd is None:
        return {"ok": False, "error": f"unknown command: {name}  (try 'help')"}
    if cmd.requires_admin and not conn.is_admin:
        return {"ok": False, "error": f"'{name}' requires admin (run 'sudo <token>')"}
    try:
        result = cmd.handler(kernel, conn, args)
    except CommandError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"internal error: {e}"}
    return {"ok": True, **result}
