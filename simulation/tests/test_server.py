import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from server.kernel import KernelService, _try_load_ppo
from server.main import _ack, app, ws


def test_healthz_endpoint():
    """Verify /healthz returns kernel status, step, and subscribers count."""
    with TestClient(app) as client:
        res = client.get("/healthz")
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert "step" in data
        assert "policies_loaded" in data
        assert "subscribers" in data


def test_state_endpoint():
    """Verify /state returns the current kernel snapshot."""
    with TestClient(app) as client:
        res = client.get("/state")
        assert res.status_code == 200
        data = res.json()
        assert data["type"] == "tick"
        assert "market" in data
        assert "policy" in data
        assert "metrics" in data
        assert "agents" in data


def test_ack_helper():
    """Verify _ack JSON formatter."""
    ack_str = _ack("cmd123", ok=True, output="pong")
    ack_json = json.loads(ack_str)
    assert ack_json == {"type": "ack", "id": "cmd123", "ok": True, "output": "pong"}


def test_try_load_ppo(tmp_path):
    """Verify _try_load_ppo handles non-existent and corrupt files gracefully."""
    assert _try_load_ppo("non_existent_path.zip") is None

    # Test corrupted zip file to trigger exception handler in _try_load_ppo
    corrupt_file = tmp_path / "corrupt.zip"
    corrupt_file.write_bytes(b"not a valid zip file content")
    assert _try_load_ppo(str(corrupt_file)) is None


def test_act_with_none_model():
    """Verify _act falls back to sampling action space when model is None."""
    ks = KernelService()
    ks.consumer_model = None
    ks.producer_model = None
    c_action = ks._act("consumer_0", None)
    p_action = ks._act("producer_0", None)
    assert c_action.shape == (2,)
    assert p_action.shape == (2,)


def test_act_with_mock_model():
    """Verify _act invokes model.predict when model is loaded."""
    ks = KernelService()

    class MockModel:
        def predict(self, obs, deterministic=False):
            return 42, None

    ks.consumer_model = MockModel()
    action = ks._act("consumer_0", None)
    assert action == 42


def test_websocket_connect_and_snapshot():
    """Verify WebSocket connection sends initial snapshot."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            initial = ws.receive_json()
            assert initial["type"] == "tick"
            assert "market" in initial


def test_websocket_binary_frame_and_disconnect():
    """Verify WebSocket handles binary frames and client disconnections gracefully."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            _ = ws.receive_json()
            ws.send_bytes(b"\x00\x01\x02\x03")


@pytest.mark.asyncio
async def test_ws_send_loop_disconnect_handling():
    """Verify send_loop catches WebSocketDisconnect and RuntimeError."""
    # Test WebSocketDisconnect in send_loop
    mock_ws1 = AsyncMock()
    mock_ws1.accept = AsyncMock()
    mock_ws1.receive_text = AsyncMock(side_effect=asyncio.Event().wait)
    mock_ws1.send_text = AsyncMock(side_effect=WebSocketDisconnect(1000))
    await ws(mock_ws1)

    # Test RuntimeError in send_loop
    mock_ws2 = AsyncMock()
    mock_ws2.accept = AsyncMock()
    mock_ws2.receive_text = AsyncMock(side_effect=asyncio.Event().wait)
    mock_ws2.send_text = AsyncMock(side_effect=RuntimeError("send failed"))
    await ws(mock_ws2)


def test_websocket_command_dispatch():
    """Verify executing shell commands over WebSocket."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            _ = ws.receive_json()  # Consume initial snapshot

            # Test valid public command (help)
            ws.send_json({"type": "cmd", "id": 1, "line": "help"})
            ack = ws.receive_json()
            assert ack["type"] == "ack"
            assert ack["id"] == 1
            assert ack["ok"] is True
            assert "EconOS shell" in ack["output"]

            # Test invalid JSON message
            ws.send_text("not a valid json")
            ack_err = ws.receive_json()
            assert ack_err["type"] == "ack"
            assert ack_err["ok"] is False
            assert "invalid JSON" in ack_err["error"]

            # Test unknown message type
            ws.send_json({"type": "foo", "id": 2})
            ack_unknown = ws.receive_json()
            assert ack_unknown["type"] == "ack"
            assert ack_unknown["ok"] is False
            assert "unknown msg type" in ack_unknown["error"]


def test_websocket_admin_flow_and_broadcast():
    """Verify sudo, admin commands, and broadcast events over WebSocket."""
    with TestClient(app) as client:
        with (
            client.websocket_connect("/ws") as admin_ws,
            client.websocket_connect("/ws") as viewer_ws,
        ):
            _ = admin_ws.receive_json()
            _ = viewer_ws.receive_json()

            # Command requiring admin before sudo
            admin_ws.send_json({"type": "cmd", "id": 10, "line": "pause"})
            ack_unauth = admin_ws.receive_json()
            assert ack_unauth["ok"] is False
            assert "requires admin" in ack_unauth["error"]

            admin_ws.send_json({"type": "cmd", "id": 11, "line": "sudo test-token-xyz"})
            assert admin_ws.receive_json()["ok"] is True
            admin_ws.send_json({"type": "cmd", "id": 12, "line": "pause"})
            admin_event = admin_ws.receive_json()
            assert admin_event == {"type": "event", "kind": "paused", "by": "admin", "detail": {}}
            pause_ack = admin_ws.receive_json()
            assert pause_ack["type"] == "ack"
            assert pause_ack["id"] == 12
            assert pause_ack["output"] == "paused."

            viewer_event = viewer_ws.receive_json()
            assert viewer_event == admin_event


def test_unhandled_route_errors():
    """Verify unhandled route errors and method not allowed responses."""
    with TestClient(app) as client:
        res_404 = client.get("/nonexistent/api/path")
        assert res_404.status_code == 404

        res_405 = client.post("/healthz")
        assert res_405.status_code == 405


@pytest.mark.asyncio
async def test_kernel_service_run_loop_and_admin_cmds():
    """Verify KernelService async tick loop, pause/resume, shocks, and event broadcast."""
    ks = KernelService()
    q = ks.subscribe()
    assert q in ks.subscribers

    # Start tick loop task
    await ks.start()
    assert ks._task is not None and not ks._task.done()

    # Wait for a tick payload to arrive in queue
    payload_str = await asyncio.wait_for(q.get(), timeout=2.0)
    payload = json.loads(payload_str)
    assert payload["type"] == "tick"

    # Test admin methods directly
    assert ks.cmd_pause()["ok"] is True
    assert ks.paused is True

    assert ks.cmd_resume()["ok"] is True
    assert ks.paused is False

    tax_res = ks.cmd_set_tax(0.15)
    assert tax_res["ok"] is True
    assert tax_res["tax_rate"] == 0.15

    redist_res = ks.cmd_redistribute()
    assert redist_res["ok"] is True
    assert "total" in redist_res

    shock_res = ks.cmd_shock("wage", 0.05)
    assert shock_res["ok"] is True

    reset_res = ks.cmd_reset()
    assert reset_res["ok"] is True

    # Broadcast event test
    ks.broadcast_event({"type": "event", "kind": "test_event"})
    event_str = await asyncio.wait_for(q.get(), timeout=2.0)
    event_json = json.loads(event_str)
    assert event_json == {"type": "event", "kind": "test_event"}

    # Unsubscribe and stop
    ks.unsubscribe(q)
    assert q not in ks.subscribers
    await ks.stop()
    # Stopping when task is None or already done is a no-op
    await ks.stop()


@pytest.mark.asyncio
async def test_kernel_service_truncation_reset_in_run_loop():
    """Verify that truncation in the tick loop triggers environment reset."""
    ks = KernelService()
    ks.env.max_cycles = 1  # Force immediate truncation after 1 tick
    q = ks.subscribe()

    await ks.start()
    # Receive at least 2 ticks to exercise truncation branch and reset in _run loop
    _ = await asyncio.wait_for(q.get(), timeout=2.0)
    _ = await asyncio.wait_for(q.get(), timeout=2.0)
    await ks.stop()


@pytest.mark.asyncio
async def test_kernel_service_queue_full_in_run_loop():
    """Verify kernel drops subscribers whose queues overflow during the tick loop."""
    ks = KernelService()
    q_full = asyncio.Queue(maxsize=1)
    q_full.put_nowait("existing")
    ks.subscribers.add(q_full)

    await ks.start()
    await asyncio.sleep(0.6)  # Allow at least one tick to execute and discard q_full
    assert q_full not in ks.subscribers
    await ks.stop()


@pytest.mark.asyncio
async def test_kernel_service_queue_full_pruning():
    """Verify kernel drops subscribers with full queues during broadcast."""
    ks = KernelService()
    # Create queue with maxsize=1 and fill it
    q_full = asyncio.Queue(maxsize=1)
    q_full.put_nowait("item1")
    ks.subscribers.add(q_full)

    ks.broadcast_event({"type": "event", "kind": "overflow"})
    # Full queue should have been removed from subscribers
    assert q_full not in ks.subscribers
