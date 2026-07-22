"""Unit tests for the shell command dispatcher.

Drives the dispatch layer against a real KernelService (no asyncio tick loop —
we never call .start()), so command effects on env state are visible
synchronously.
"""
import importlib

import pytest

from server.kernel import KernelService


@pytest.fixture
def kernel():
    return KernelService()


@pytest.fixture
def commands_module(monkeypatch):
    """Reload commands.py with a known ADMIN_TOKEN so sudo is testable."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-token-xyz")
    import server.commands as commands
    return importlib.reload(commands)


def test_help_lists_every_command(kernel, commands_module):
    conn = commands_module.Connection()
    res = commands_module.dispatch(kernel, conn, "help")
    assert res["ok"]
    for name in commands_module.COMMANDS:
        assert name in res["output"]


def test_unknown_command_errors(kernel, commands_module):
    conn = commands_module.Connection()
    res = commands_module.dispatch(kernel, conn, "frobnicate")
    assert not res["ok"]
    assert "unknown command" in res["error"]


def test_blank_line_is_ok_noop(kernel, commands_module):
    conn = commands_module.Connection()
    assert commands_module.dispatch(kernel, conn, "")["ok"]
    assert commands_module.dispatch(kernel, conn, "   ")["ok"]


def test_inspect_known_and_unknown_agent(kernel, commands_module):
    conn = commands_module.Connection()
    ok = commands_module.dispatch(kernel, conn, "inspect consumer_0")
    assert ok["ok"]
    assert "consumer_0" in ok["output"]
    assert "balance=" in ok["output"]

    bad = commands_module.dispatch(kernel, conn, "inspect ghost_42")
    assert not bad["ok"]
    assert "unknown agent" in bad["error"]


def test_top_default_and_custom_count(kernel, commands_module):
    conn = commands_module.Connection()
    five = commands_module.dispatch(kernel, conn, "top")
    assert five["ok"]
    assert len(five["output"].splitlines()) == 5

    three = commands_module.dispatch(kernel, conn, "top 3")
    assert three["ok"]
    assert len(three["output"].splitlines()) == 3

    bad = commands_module.dispatch(kernel, conn, "top notanint")
    assert not bad["ok"]


def test_admin_commands_blocked_for_visitors(kernel, commands_module):
    conn = commands_module.Connection()  # is_admin=False
    for cmd in ["pause", "resume", "tax 25", "shock wage 10", "reset"]:
        res = commands_module.dispatch(kernel, conn, cmd)
        assert not res["ok"]
        assert "requires admin" in res["error"]


def test_sudo_flow_elevates_connection(kernel, commands_module):
    conn = commands_module.Connection()
    bad = commands_module.dispatch(kernel, conn, "sudo wrong")
    assert not bad["ok"]
    assert not conn.is_admin

    ok = commands_module.dispatch(kernel, conn, "sudo test-token-xyz")
    assert ok["ok"]
    assert conn.is_admin
    assert ok.get("auth", {}).get("is_admin") is True


def test_sudo_disabled_without_admin_token(kernel, monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    import server.commands as commands
    importlib.reload(commands)
    conn = commands.Connection()
    res = commands.dispatch(kernel, conn, "sudo anything")
    assert not res["ok"]
    assert "ADMIN_TOKEN" in res["error"]


def test_tax_command_mutates_kernel_and_clamps(kernel, commands_module):
    conn = commands_module.Connection(is_admin=True)
    res = commands_module.dispatch(kernel, conn, "tax 25")
    assert res["ok"]
    assert kernel.env.tax_rate == pytest.approx(0.25)

    out_of_range = commands_module.dispatch(kernel, conn, "tax 250")
    assert not out_of_range["ok"]
    assert kernel.env.tax_rate == pytest.approx(0.25)  # unchanged


def test_shock_queues_pending(kernel, commands_module):
    conn = commands_module.Connection(is_admin=True)
    res = commands_module.dispatch(kernel, conn, "shock wage 10")
    assert res["ok"]
    assert kernel.env._pending_shocks == [("wage", 0.10)]

    bad_target = commands_module.dispatch(kernel, conn, "shock dollars 5")
    assert not bad_target["ok"]


def test_pause_resume_toggles_kernel(kernel, commands_module):
    conn = commands_module.Connection(is_admin=True)
    commands_module.dispatch(kernel, conn, "pause")
    assert kernel.paused is True
    commands_module.dispatch(kernel, conn, "resume")
    assert kernel.paused is False


def test_command_error_branches(kernel, commands_module):
    conn = commands_module.Connection(is_admin=True)

    # sudo missing token
    assert not commands_module.dispatch(kernel, conn, "sudo")["ok"]

    # tax errors
    assert not commands_module.dispatch(kernel, conn, "tax")["ok"]
    assert not commands_module.dispatch(kernel, conn, "tax abc")["ok"]
    assert not commands_module.dispatch(kernel, conn, "tax -10")["ok"]

    # shock errors
    assert not commands_module.dispatch(kernel, conn, "shock")["ok"]
    assert not commands_module.dispatch(kernel, conn, "shock wage")["ok"]
    assert not commands_module.dispatch(kernel, conn, "shock wage abc")["ok"]
    assert not commands_module.dispatch(kernel, conn, "shock wage 99")["ok"]

    # inspect error
    assert not commands_module.dispatch(kernel, conn, "inspect")["ok"]

    # who and gini commands
    who_res = commands_module.dispatch(kernel, conn, "who")
    assert who_res["ok"]
    assert "role=admin" in who_res["output"]

    gini_res = commands_module.dispatch(kernel, conn, "gini")
    assert gini_res["ok"]
    assert "gini =" in gini_res["output"]

    # top count out of range
    assert not commands_module.dispatch(kernel, conn, "top 101")["ok"]

    # reset command
    reset_res = commands_module.dispatch(kernel, conn, "reset")
    assert reset_res["ok"]
    assert "kernel reset" in reset_res["output"]

    # unhandled syntax error (unclosed quote)
    err = commands_module.dispatch(kernel, conn, 'tax "unclosed quote')
    assert not err["ok"]
    assert "parse error" in err["error"]


