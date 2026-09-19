#!/usr/bin/env python3
"""Enable RPCS3's local read-only PINE endpoint while preserving prior config."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DESIRED = "IPC Server enabled: true\nIPC Port: 28012\n"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def normalized(text: str) -> str:
    retained = []
    for line in text.splitlines():
        key = line.split(":", 1)[0].strip()
        if key not in {"IPC Server enabled", "IPC Port"}:
            retained.append(line)
    if retained and retained[-1]:
        retained.append("")
    retained.extend(DESIRED.rstrip("\n").splitlines())
    return "\n".join(retained) + "\n"


def configure(config: Path, backup_root: Path) -> dict:
    before = config.read_bytes() if config.is_file() else b""
    after = normalized(before.decode("utf-8"))
    backup = None
    if before:
        backup_root.mkdir(parents=True, exist_ok=True)
        backup = backup_root / f"ipc-{sha256_bytes(before)}.yml"
        if backup.exists() and backup.read_bytes() != before:
            raise ValueError(f"refusing to overwrite different IPC backup: {backup}")
        backup.write_bytes(before)
    encoded = after.encode("utf-8")
    changed = before != encoded
    if changed:
        config.parent.mkdir(parents=True, exist_ok=True)
        temporary = config.with_name(config.name + ".ggd-partial")
        if temporary.exists():
            raise FileExistsError(f"stale IPC config temporary file requires review: {temporary}")
        temporary.write_bytes(encoded)
        temporary.replace(config)
    return {
        "schema": "ggd.jstars-rpcs3-ipc-config@1",
        "config": str(config.resolve()),
        "changed": changed,
        "before": {"bytes": len(before), "sha256": sha256_bytes(before)} if before else None,
        "backup": str(backup.resolve()) if backup else None,
        "after": {"bytes": len(encoded), "sha256": sha256_bytes(encoded)},
        "serverEnabled": True,
        "port": 28012,
        "networkExposure": "local-unix-domain-socket-only-on-macos",
        "guestMemoryWritesUsed": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    workspace = repo_root().parent
    lane = workspace / "GGD-Asset-Library/conversions/jstars-rpcs3-memory-capture-v1"
    parser.add_argument("--config", type=Path, default=Path.home() / "Library/Application Support/rpcs3/ipc.yml")
    parser.add_argument("--backup-root", type=Path, default=lane / "config-backups")
    parser.add_argument("--receipt", type=Path, default=lane / "ipc-config-receipt.json")
    args = parser.parse_args(argv)
    result = configure(args.config.resolve(), args.backup_root.resolve())
    receipt = args.receipt.resolve()
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
