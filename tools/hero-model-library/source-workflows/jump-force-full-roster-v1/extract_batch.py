#!/usr/bin/env python3
"""Extract one planned JUMP FORCE batch with an explicitly supplied authorized key."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from common import SOURCE_ID, load_json, safe_member_path, sha256, write_json


DEFAULT_INTAKE_ROOT = Path(
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/"
    "GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149"
)
DEFAULT_MIRROR_MANIFEST = DEFAULT_INTAKE_ROOT / "pak-authority-verification.json"
DEFAULT_OUTPUT_ROOT = Path(
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/"
    "GGD-Asset-Library/extracted/jump-force-full-roster-v1"
)


def verify_mirror(manifest: dict, authority: dict) -> dict[str, Path]:
    if manifest.get("sourceId") != SOURCE_ID or manifest.get("summary", {}).get("allSha256Verified") is not True:
        raise ValueError("mirror manifest is not a verified JUMP FORCE mirror")
    expected = {row["name"]: row for row in authority.get("containers", [])}
    actual: dict[str, Path] = {}
    for row in manifest.get("containers", []):
        authority_row = expected.get(row["name"])
        if authority_row is None:
            raise ValueError(f"unexpected mirror PAK: {row['name']}")
        path = Path(row["absolutePath"])
        if not path.is_file() or path.stat().st_size != authority_row["bytes"] or sha256(path) != authority_row["sha256"]:
            raise ValueError(f"mirror PAK failed live verification: {row['name']}")
        actual[row["name"]] = path
    if set(actual) != set(expected):
        raise ValueError("mirror manifest does not contain all six authority PAKs")
    return actual


def selected_rows(path: Path, batch: int | None, native_ids: set[str]) -> list[dict]:
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if batch is not None and row["batch"] != batch:
                continue
            if native_ids and row["nativeCharacterId"] not in native_ids:
                continue
            rows.append(row)
    if not rows:
        raise ValueError("no planned rows matched the requested batch/native ID filter")
    return rows


def validate_key(authority: dict, env_name: str) -> str:
    key = os.environ.get(env_name, "")
    if not key:
        raise ValueError(f"authorized AES key is required in environment variable {env_name}")
    normalized = key[2:] if key.startswith("0x") else key
    try:
        decoded = bytes.fromhex(normalized)
    except ValueError as error:
        raise ValueError("AES key must be hexadecimal") from error
    if len(decoded) != 32:
        raise ValueError("AES key must decode to exactly 32 bytes")
    expected = authority.get("indexEncryption", {}).get("keySha256")
    if hashlib.sha256(decoded).hexdigest() != expected:
        raise ValueError("AES key identity does not match the indexed authority")
    return key


def extract(repak: Path, key: str, paks: dict[str, Path], rows: list[dict], output_root: Path) -> dict:
    unique = {(row["container"], row["path"]): row for row in rows}
    receipts = []
    for (container, member), row in sorted(unique.items()):
        member = safe_member_path(member)
        destination = output_root / "raw" / container / member
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            receipts.append({**row, "absolutePath": str(destination.resolve()), "bytes": destination.stat().st_size, "sha256": sha256(destination), "state": "already-extracted-live-sha-verified"})
            continue
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=destination.name + ".", suffix=".partial", delete=False) as stream:
            temporary = Path(stream.name)
            try:
                subprocess.run(
                    [str(repak), "--aes-key", key, "get", str(paks[container]), member],
                    stdout=stream,
                    stderr=subprocess.PIPE,
                    check=True,
                )
            except subprocess.CalledProcessError as error:
                temporary.unlink(missing_ok=True)
                raise ValueError(f"authorized extractor failed for {container}:{member} (exit {error.returncode})") from error
        temporary.replace(destination)
        receipts.append({**row, "absolutePath": str(destination.resolve()), "bytes": destination.stat().st_size, "sha256": sha256(destination), "state": "extracted-live-sha-recorded"})
    return {
        "schema": "ggd.jumpforce-full-roster-extraction-receipt@1",
        "sourceId": SOURCE_ID,
        "filters": {
            "batches": sorted({row["batch"] for row in rows}),
            "nativeCharacterIds": sorted({row["nativeCharacterId"] for row in rows}),
        },
        "summary": {
            "plannedRelations": len(rows),
            "uniqueContainerMembers": len(receipts),
            "extractedOrVerifiedFiles": len(receipts),
            "bytes": sum(row["bytes"] for row in receipts),
            "allOutputSha256Recorded": True,
        },
        "security": {
            "aesKeyStored": False,
            "aesKeyPrinted": False,
            "aesKeyIdentityVerified": True,
            "keySource": "explicit environment variable only",
        },
        "stages": {
            "extraction": "completed-for-receipt-filter",
            "dependencyClosure": "pending",
            "conversion": "not-started",
            "validation": "not-started",
            "registration": "not-started",
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "files": receipts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repak", type=Path, required=True)
    parser.add_argument("--mirror-manifest", type=Path, default=DEFAULT_MIRROR_MANIFEST)
    parser.add_argument("--authority", type=Path, default=Path("materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"))
    parser.add_argument("--plan-paths", type=Path, default=Path("materials/hero-model-library/source-inventories/jump-force-full-roster-v1/selected-paths.jsonl.gz"))
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--batch", type=int)
    group.add_argument("--native-id", action="append", default=[])
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--aes-key-env", default="UNREAL_PAK_AES_KEY")
    args = parser.parse_args()
    repak = args.repak.resolve()
    if not repak.is_file():
        raise FileNotFoundError(f"repak executable not found: {repak}")
    authority = load_json(args.authority.resolve())
    manifest = load_json(args.mirror_manifest.resolve())
    paks = verify_mirror(manifest, authority)
    rows = selected_rows(args.plan_paths.resolve(), args.batch, set(args.native_id))
    key = validate_key(authority, args.aes_key_env)
    receipt = extract(repak, key, paks, rows, args.output_root.resolve())
    write_json(args.receipt.resolve(), receipt)
    print(f"Extracted/verified JUMP FORCE members: {receipt['summary']['extractedOrVerifiedFiles']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
