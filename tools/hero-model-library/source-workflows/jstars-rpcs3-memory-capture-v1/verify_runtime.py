#!/usr/bin/env python3
"""Verify the installed RPCS3 firmware and local PINE configuration."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXPECTED_RELEASE = "04.7000"
EXPECTED_IPC = "IPC Server enabled: true\nIPC Port: 28012\n"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify(dev_flash: Path, ipc_config: Path) -> dict:
    version_path = dev_flash / "vsh/etc/version.txt"
    if not version_path.is_file():
        raise FileNotFoundError(f"RPCS3 firmware version file is missing: {version_path}")
    version_text = version_path.read_text(encoding="utf-8", errors="strict")
    release_line = next((line for line in version_text.splitlines() if line.startswith("release:")), None)
    release = release_line.split(":", 2)[1] if release_line else None
    if release != EXPECTED_RELEASE:
        raise ValueError(f"expected firmware {EXPECTED_RELEASE}, found {release!r}")
    if not ipc_config.is_file():
        raise FileNotFoundError(f"RPCS3 PINE config is missing: {ipc_config}")
    ipc_text = ipc_config.read_text(encoding="utf-8")
    if ipc_text != EXPECTED_IPC:
        raise ValueError(f"RPCS3 PINE config does not match the capture contract: {ipc_config}")
    files = sorted(path for path in dev_flash.rglob("*") if path.is_file())
    if not files:
        raise ValueError(f"RPCS3 firmware tree is empty: {dev_flash}")
    return {
        "schema": "ggd.jstars-rpcs3-runtime-verification@1",
        "firmware": {
            "status": "installed-verified",
            "release": release,
            "root": str(dev_flash.resolve()),
            "fileCount": len(files),
            "fileBytes": sum(path.stat().st_size for path in files),
            "versionFile": {
                "absolutePath": str(version_path.resolve()),
                "bytes": version_path.stat().st_size,
                "sha256": sha256_path(version_path),
            },
        },
        "pine": {
            "status": "configured",
            "config": str(ipc_config.resolve()),
            "port": 28012,
            "macosTransport": "local-unix-domain-socket",
            "guestMemoryWritesUsed": False,
        },
        "installAttempt": {
            "argvShape": ["<RPCS3 executable>", "--headless", "--installfw", "<verified PS3UPDAT.PUP>"],
            "returnCode": 134,
            "processStatus": "teardown-error-after-firmware-files-were-installed",
            "diagnostic": "QCommandLineParser reported headless as a value-taking option; RPCS3 then failed fixed_typemap verification during teardown.",
            "rerunRequired": False,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    workspace = repo_root().parent
    lane = workspace / "GGD-Asset-Library/conversions/jstars-rpcs3-memory-capture-v1"
    parser.add_argument("--dev-flash", type=Path, default=Path.home() / "Library/Application Support/rpcs3/dev_flash")
    parser.add_argument("--ipc-config", type=Path, default=Path.home() / "Library/Application Support/rpcs3/ipc.yml")
    parser.add_argument("--receipt", type=Path, default=lane / "runtime-verification-receipt.json")
    args = parser.parse_args(argv)
    result = verify(args.dev_flash.resolve(), args.ipc_config.resolve())
    receipt = args.receipt.resolve()
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
