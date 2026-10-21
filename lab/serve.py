"""Serve the isolated browser Linux lab and a read-only kernel summary."""

from __future__ import annotations

import argparse
import json
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from overlay import make_overlay

LAB_DIR = Path(__file__).resolve().parent


def summary(export: dict) -> str:
    if export.get("format") != "econos-run-snapshot" or export.get("schema_version") != 1:
        raise ValueError("unexpected EconOS export format")

    run = export["run"]
    state = export["state"]
    market = state["market"]
    metrics = state["metrics"]
    return "\n".join(
        (
            "EconOS shared economy (read only)",
            f"Run: {run['id']}",
            f"Step: {state['step']}",
            f"Policies: {'loaded' if state['policies_loaded'] else 'sampled actions'}",
            f"Wage: {market['wage']:.2f}",
            f"Price: {market['price']:.2f}",
            f"Gini: {metrics['gini']:.3f}",
            f"Captured: {export['captured_at']}",
            "",
        )
    )


def handler_for(assets: Path, kernel_url: str) -> type[BaseHTTPRequestHandler]:
    files = {
        "/": (LAB_DIR / "index.html", "text/html; charset=utf-8"),
        "/lab.js": (LAB_DIR / "lab.js", "text/javascript; charset=utf-8"),
        "/lab.css": (LAB_DIR / "lab.css", "text/css; charset=utf-8"),
        "/vendor/libv86.mjs": (
            assets / "node_modules" / "v86" / "build" / "libv86.mjs",
            "text/javascript; charset=utf-8",
        ),
        "/vendor/v86.wasm": (
            assets / "node_modules" / "v86" / "build" / "v86.wasm",
            "application/wasm",
        ),
        "/assets/seabios.bin": (assets / "assets" / "seabios.bin", "application/octet-stream"),
        "/assets/vgabios.bin": (assets / "assets" / "vgabios.bin", "application/octet-stream"),
        "/assets/buildroot-bzimage68.bin": (
            assets / "assets" / "buildroot-bzimage68.bin",
            "application/octet-stream",
        ),
    }

    class LabHandler(BaseHTTPRequestHandler):
        def respond(self, body: bytes, content_type: str, status: int = 200) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            path = urlsplit(self.path).path
            if path == "/assets/econos-initrd.cpio.gz":
                self.respond(make_overlay(self.server.server_port), "application/gzip")
                return
            if path == "/snapshot.txt":
                try:
                    with urllib.request.urlopen(kernel_url, timeout=8) as response:
                        capture = json.load(response)
                    body = summary(capture).encode("utf-8")
                    self.respond(body, "text/plain; charset=utf-8")
                except (OSError, ValueError, KeyError, TypeError) as error:
                    self.respond(
                        f"Kernel snapshot unavailable: {error}\n".encode(), "text/plain", 502
                    )
                return

            entry = files.get(path)
            if entry is None:
                self.send_error(404)
                return
            file, content_type = entry
            try:
                self.respond(file.read_bytes(), content_type)
            except FileNotFoundError:
                self.send_error(503, "lab assets are not prepared")

    return LabHandler


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--kernel-url", required=True, help="Existing kernel's GET /export URL")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(
        ("127.0.0.1", args.port),
        handler_for(args.assets.expanduser().resolve(), args.kernel_url),
    )
    print(f"Lab listening on http://localhost:{args.port}", flush=True)
    server.serve_forever()
