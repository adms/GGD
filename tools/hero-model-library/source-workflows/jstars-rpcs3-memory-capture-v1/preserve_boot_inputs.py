#!/usr/bin/env python3
"""Preserve verified RPCS3 boot inputs from the read-only J-Stars disc mount."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


FILES = (
    ("PS3_GAME/USRDIR/EBOOT.BIN", 9_725_496, "1e71ce86047f7cf99f29904a9fd045e818730425be76b4c780f42a3d8d8975f1"),
    ("PS3_GAME/PARAM.SFO", 1_396, "522e138818ccf177044ce5dc3ecacfc0087a42e5154b19f9a3e8805ba1e317bc"),
    ("PS3_UPDATE/PS3UPDAT.PUP", 268_435_456, "b0064cb5a019856bdcf91c28c7806f5565b3e16ccf5070607e04d3ac967fa515"),
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def copy_exact(source: Path, destination: Path, expected_bytes: int, expected_sha256: str) -> dict:
    if not source.is_file() or source.stat().st_size != expected_bytes or sha256_path(source) != expected_sha256:
        raise ValueError(f"source boot input does not match its fixed receipt: {source}")
    if destination.is_file():
        if destination.stat().st_size != expected_bytes or sha256_path(destination) != expected_sha256:
            raise ValueError(f"refusing to overwrite mismatched preserved boot input: {destination}")
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(destination.name + ".partial")
        if temporary.exists():
            raise FileExistsError(f"stale boot-input temporary file requires review: {temporary}")
        digest = hashlib.sha256()
        with source.open("rb") as reader, temporary.open("xb") as writer:
            for block in iter(lambda: reader.read(8 * 1024 * 1024), b""):
                writer.write(block)
                digest.update(block)
        if temporary.stat().st_size != expected_bytes or digest.hexdigest() != expected_sha256:
            raise ValueError(f"copied boot input failed verification: {temporary}")
        temporary.rename(destination)
    return {
        "source": str(source.resolve()),
        "absolutePath": str(destination.resolve()),
        "bytes": expected_bytes,
        "sha256": expected_sha256,
        "readbackVerified": True,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    workspace = repo_root().parent
    default_output = workspace / "GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917/boot-inputs"
    parser.add_argument("--volume", type=Path, default=Path("/Volumes/PS3VOLUME"))
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args(argv)
    volume, output = args.volume.resolve(), args.output.resolve()
    rows = []
    for relative, size, digest in FILES:
        rows.append(copy_exact(volume / relative, output / relative, size, digest))
    receipt = {
        "schema": "ggd.jstars-rpcs3-boot-input-preservation@1",
        "sourceId": "owner-jstars-victory-vs-plus-20260917",
        "sourceVolume": str(volume),
        "titleId": "BLUS31519",
        "files": rows,
        "allReadbackVerified": all(row["readbackVerified"] for row in rows),
    }
    receipt_path = output / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(receipt_path), "files": len(rows), "bytes": sum(row["bytes"] for row in rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
