"""Build a tiny initramfs overlay containing the guest's read-only command."""

from __future__ import annotations

import gzip


def cpio_entry(name: str, data: bytes, mode: int, inode: int) -> bytes:
    encoded_name = name.encode() + b"\0"
    fields = (inode, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(encoded_name), 0)
    header = b"070701" + b"".join(f"{field:08x}".encode() for field in fields)
    name_padding = b"\0" * (-(len(header) + len(encoded_name)) % 4)
    data_padding = b"\0" * (-len(data) % 4)
    return header + encoded_name + name_padding + data + data_padding


def make_overlay(port: int) -> bytes:
    if not 1 <= port <= 65535:
        raise ValueError("invalid lab port")
    script = (f"#!/bin/sh\nexec wget -qO- http://{port}.external/snapshot.txt\n").encode()
    archive = cpio_entry("bin/econos", script, 0o100755, 1)
    archive += cpio_entry("TRAILER!!!", b"", 0, 2)
    return gzip.compress(archive, mtime=0)
