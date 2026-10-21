"""Download the pinned v86 runtime and Linux boot assets outside the checkout."""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import urllib.request
from pathlib import Path

ASSETS = {
    "buildroot-bzimage68.bin": (
        "https://i.copy.sh/buildroot-bzimage68.bin",
        "507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c",
    ),
    "seabios.bin": (
        "https://raw.githubusercontent.com/copy/v86/cc37f35/bios/seabios.bin",
        "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98",
    ),
    "vgabios.bin": (
        "https://raw.githubusercontent.com/copy/v86/cc37f35/bios/vgabios.bin",
        "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880",
    ),
}

RUNTIME = {
    "libv86.mjs": "c4e0281ed9566edfcff54e4660c635f14d32e136104b475763b19ac87b891dc1",
    "v86.wasm": "2f0c4150f266415b754a84a32e6f8e4c975a1d3abb94c78b047fa30027db1ef1",
}


def verify(path: Path, expected: str) -> bool:
    if not path.is_file():
        return False
    with path.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    return digest == expected


def prepare(output: Path) -> None:
    asset_dir = output / "assets"
    asset_dir.mkdir(parents=True, exist_ok=True)

    runtime_dir = output / "node_modules" / "v86" / "build"
    if any(not verify(runtime_dir / name, digest) for name, digest in RUNTIME.items()):
        subprocess.run(
            ["npm", "install", "--prefix", str(output), "--no-save", "--no-audit", "v86@0.5.472"],
            check=True,
        )
    for name, digest in RUNTIME.items():
        if not verify(runtime_dir / name, digest):
            raise RuntimeError(f"v86 runtime checksum mismatch: {name}")

    for name, (url, digest) in ASSETS.items():
        target = asset_dir / name
        if verify(target, digest):
            continue
        with urllib.request.urlopen(url, timeout=30) as response, target.open("wb") as file:
            while chunk := response.read(1024 * 1024):
                file.write(chunk)
        if not verify(target, digest):
            target.unlink()
            raise RuntimeError(f"boot asset checksum mismatch: {name}")

    print(f"Lab assets ready in {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    prepare(parser.parse_args().output.expanduser().resolve())
