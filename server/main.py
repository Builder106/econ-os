"""FastAPI front door for the shared EconOS kernel.

- Static dashboard mounted at /
- /healthz for the platform's healthcheck
- /state one-shot snapshot
- /ws bidirectional: kernel ticks + events outbound; shell commands inbound

Per-connection: one receive coroutine pushes acks onto the same queue the
kernel pumps ticks/events into; one send coroutine drains that queue. Single
writer means tick frames and acks can never interleave bytes on the wire.
"""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from server.commands import Connection, dispatch
from server.kernel import KernelService

DASHBOARD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dashboard")

# CORS: dashboard on Vercel makes cross-origin requests to this kernel host.
#
# ALLOWED_ORIGINS: comma-separated exact-match list, or "*" for anything.
#   Example: ALLOWED_ORIGINS=https://econ-os.vercel.app
#
# ALLOWED_ORIGIN_REGEX: optional Python regex. Used alongside the exact-match
#   list to permit Vercel preview URLs (which have unpredictable subdomains
#   per branch). Example:
#     ALLOWED_ORIGIN_REGEX=^https://econ-os-git-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",") if o.strip()]
ALLOWED_ORIGIN_REGEX = os.environ.get("ALLOWED_ORIGIN_REGEX", "").strip() or None

kernel = KernelService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await kernel.start()
    try:
        yield
    finally:
        await kernel.stop()


app = FastAPI(title="EconOS Kernel", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {
        "ok": True,
        "step": kernel.env.num_cycles,
        "policies_loaded": kernel.policies_loaded,
        "subscribers": len(kernel.subscribers),
    }


@app.get("/state")
async def state():
    return JSONResponse(kernel.snapshot())


def _ack(cmd_id, **fields) -> str:
    return json.dumps({"type": "ack", "id": cmd_id, **fields})


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    out_queue = kernel.subscribe()
    conn = Connection()

    async def receive_loop():
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    try:
                        out_queue.put_nowait(_ack(None, ok=False, error="invalid JSON"))
                    except asyncio.QueueFull:
                        pass
                    continue

                if msg.get("type") == "cmd":
                    result = dispatch(kernel, conn, msg.get("line", ""))
                    try:
                        out_queue.put_nowait(_ack(msg.get("id"), **result))
                    except asyncio.QueueFull:
                        pass
                else:
                    try:
                        out_queue.put_nowait(
                            _ack(msg.get("id"), ok=False, error=f"unknown msg type: {msg.get('type')}")
                        )
                    except asyncio.QueueFull:
                        pass
        except WebSocketDisconnect:
            pass

    async def send_loop():
        try:
            await websocket.send_text(json.dumps(kernel.snapshot()))
            while True:
                payload = await out_queue.get()
                await websocket.send_text(payload)
        except (WebSocketDisconnect, RuntimeError):
            pass

    recv_task = asyncio.create_task(receive_loop())
    send_task = asyncio.create_task(send_loop())
    try:
        await asyncio.wait({recv_task, send_task}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in (recv_task, send_task):
            if not t.done():
                t.cancel()
        kernel.unsubscribe(out_queue)


# Mount the dashboard last so /ws and /healthz win over static routes.
if os.path.isdir(DASHBOARD_DIR):
    app.mount("/", StaticFiles(directory=DASHBOARD_DIR, html=True), name="dashboard")
