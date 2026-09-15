#!/usr/bin/env python3
"""Verify or mirror only the six authority-pinned JUMP FORCE PAK files."""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from common import AS_OF_DATE, SOURCE_ID, load_json, sha256, write_json


DEFAULT_INTAKE_ROOT = Path(
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/"
    "GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149"
)
DEFAULT_PAKS_ROOT = DEFAULT_INTAKE_ROOT / "raw-game/JUMP_FORCE/Content/Paks"
DEFAULT_COMPLETION_RECEIPT = DEFAULT_INTAKE_ROOT / "mirror-complete.json"


def authority_containers(authority: dict) -> list[dict]:
    if authority.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected JUMP FORCE source authority")
    rows = sorted(authority.get("containers", []), key=lambda row: row["order"])
    if len(rows) != 6:
        raise ValueError("JUMP FORCE authority must pin exactly six PAK files")
    return rows


def verify_source(paks_root: Path, authority: dict) -> list[dict]:
    result = []
    for expected in authority_containers(authority):
        path = paks_root / expected["name"]
        if not path.is_file():
            raise FileNotFoundError(f"missing authority PAK: {path}")
        size = path.stat().st_size
        if size != expected["bytes"]:
            raise ValueError(f"PAK byte count mismatch: {expected['name']}")
        digest = sha256(path)
        if digest != expected["sha256"]:
            raise ValueError(f"PAK SHA-256 mismatch: {expected['name']}")
        result.append({
            "name": expected["name"],
            "order": expected["order"],
            "absolutePath": str(path.resolve()),
            "bytes": size,
            "sha256": digest,
            "identityVerified": True,
        })
    return result


def build_manifest(
    paks_root: Path,
    authority_path: Path,
    mirror_root: Path | None,
    completion_receipt: Path | None = None,
) -> dict:
    upstream_receipt = None
    if completion_receipt is not None:
        if not completion_receipt.is_file():
            raise FileNotFoundError(f"source mirror is not complete; missing receipt: {completion_receipt}")
        upstream_receipt = {
            "absolutePath": str(completion_receipt.resolve()),
            "bytes": completion_receipt.stat().st_size,
            "sha256": sha256(completion_receipt),
        }
    authority = load_json(authority_path)
    source_rows = verify_source(paks_root, authority)
    rows = source_rows
    operation = "verified-in-place"
    if mirror_root is not None:
        mirror_root.mkdir(parents=True, exist_ok=True)
        for row in source_rows:
            source = Path(row["absolutePath"])
            destination = mirror_root / row["name"]
            if destination.exists() and (destination.stat().st_size != row["bytes"] or sha256(destination) != row["sha256"]):
                raise ValueError(f"refusing to overwrite mismatched mirror PAK: {destination}")
            if not destination.exists():
                temporary = destination.with_suffix(destination.suffix + ".partial")
                if temporary.exists():
                    temporary.unlink()
                shutil.copyfile(source, temporary)
                if temporary.stat().st_size != row["bytes"] or sha256(temporary) != row["sha256"]:
                    temporary.unlink(missing_ok=True)
                    raise ValueError(f"copied PAK failed verification: {row['name']}")
                temporary.replace(destination)
        rows = verify_source(mirror_root, authority)
        operation = "mirrored-and-verified"
    return {
        "schema": "ggd.jumpforce-pak-mirror@1",
        "asOfDate": AS_OF_DATE,
        "sourceId": SOURCE_ID,
        "operation": operation,
        "sourceRoot": str(paks_root.resolve()),
        "mirrorRoot": str((mirror_root or paks_root).resolve()),
        "authority": {
            "gitPath": "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json",
            "sha256": sha256(authority_path),
        },
        "upstreamMirrorCompletionReceipt": upstream_receipt,
        "containers": rows,
        "summary": {
            "requiredContainers": 6,
            "verifiedContainers": len(rows),
            "verifiedBytes": sum(row["bytes"] for row in rows),
            "allSha256Verified": len(rows) == 6,
        },
        "scope": {
            "steamLibraryRescanRequired": False,
            "gameDirectoryRescanRequired": False,
            "inputRequired": "JUMP_FORCE/Content/Paks only",
            "payloadModified": False,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paks-root", type=Path, default=DEFAULT_PAKS_ROOT)
    parser.add_argument(
        "--authority",
        type=Path,
        default=Path("materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"),
    )
    parser.add_argument("--mirror-root", type=Path)
    parser.add_argument(
        "--completion-receipt",
        type=Path,
        default=DEFAULT_COMPLETION_RECEIPT,
        help="Completion marker for the upstream copy. Verification refuses to start while it is absent.",
    )
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    receipt = build_manifest(
        args.paks_root.resolve(),
        args.authority.resolve(),
        args.mirror_root.resolve() if args.mirror_root else None,
        args.completion_receipt.resolve() if args.completion_receipt else None,
    )
    write_json(args.receipt.resolve(), receipt)
    print(f"Verified JUMP FORCE PAKs: {receipt['summary']['verifiedContainers']}/6")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
