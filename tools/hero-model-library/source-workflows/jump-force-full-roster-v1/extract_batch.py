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
from collections import defaultdict
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


def chunk_members(base_args: list[str], members: list[str], max_command_bytes: int) -> list[list[str]]:
    """Split repeated ``-i member`` arguments below a conservative argv limit."""
    if max_command_bytes < 4096:
        raise ValueError("--max-command-bytes must be at least 4096")
    base_size = sum(len(os.fsencode(value)) + 1 for value in base_args)
    chunks: list[list[str]] = []
    current: list[str] = []
    current_size = base_size
    for member in members:
        addition = len(os.fsencode("--include")) + 1 + len(os.fsencode(member)) + 1
        if base_size + addition > max_command_bytes:
            raise ValueError(f"single member exceeds command-size budget: {member}")
        if current and current_size + addition > max_command_bytes:
            chunks.append(current)
            current = []
            current_size = base_size
        current.append(member)
        current_size += addition
    if current:
        chunks.append(current)
    return chunks


def unpack_container_chunks(
    repak: Path,
    key: str,
    pak: Path,
    members: list[str],
    staging_root: Path,
    max_command_bytes: int,
) -> tuple[dict[str, Path], int]:
    """Use repak unpack with repeated includes, never one process per member."""
    # repak creates the final output directory, but its current CLI does not
    # create a missing parent directory.  Each container gets its own staging
    # parent so the real extractor behaves like the transactional test double.
    staging_root.mkdir(parents=True, exist_ok=True)
    extracted: dict[str, Path] = {}
    invocation_count = 0
    base_for_budget = [
        str(repak), "--aes-key", key, "unpack", "--quiet", "--output",
        str(staging_root / "chunk-9999"), str(pak),
    ]
    for chunk_index, chunk in enumerate(chunk_members(base_for_budget, members, max_command_bytes), 1):
        chunk_root = staging_root / f"chunk-{chunk_index:04d}"
        command = [str(repak), "--aes-key", key, "unpack", "--quiet", "--output", str(chunk_root)]
        for member in chunk:
            command.extend(["--include", member])
        command.append(str(pak))
        try:
            subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        except subprocess.CalledProcessError as error:
            raise ValueError(
                f"authorized batch extractor failed for {pak.name} chunk {chunk_index} (exit {error.returncode})"
            ) from error
        invocation_count += 1
        for member in chunk:
            source = chunk_root / safe_member_path(member)
            if not source.is_file():
                raise ValueError(f"batch extractor omitted planned member: {pak.name}:{member}")
            extracted[member] = source
    return extracted, invocation_count


def extract(
    repak: Path,
    key: str,
    paks: dict[str, Path],
    rows: list[dict],
    output_root: Path,
    max_command_bytes: int = 200_000,
) -> dict:
    unique: dict[tuple[str, str], dict] = {}
    for row in rows:
        container = str(row["container"])
        if Path(container).name != container:
            raise ValueError(f"unsafe PAK container name: {container!r}")
        if row.get("selectedByPatchOrder") is not True:
            raise ValueError(f"planned member is not the patch winner: {container}:{row['path']}")
        member = safe_member_path(row["path"])
        unique.setdefault((container, member), row)
    output_root.mkdir(parents=True, exist_ok=True)
    receipts: list[dict] = []
    pending_by_container: dict[str, list[str]] = defaultdict(list)
    for (container, member), row in sorted(unique.items()):
        if container not in paks:
            raise ValueError(f"planned member references unknown PAK: {container}")
        destination = output_root / "raw" / container / member
        if destination.exists():
            if not destination.is_file():
                raise ValueError(f"existing extraction target is not a file: {destination}")
            receipts.append({**row, "absolutePath": str(destination.resolve()), "bytes": destination.stat().st_size, "sha256": sha256(destination), "state": "already-extracted-live-sha-verified"})
            continue
        pending_by_container[container].append(member)

    staged: dict[tuple[str, str], Path] = {}
    invocation_count = 0
    container_batch_count = 0
    promoted: list[Path] = []
    # Every repak command and every expected-member check finishes in an
    # isolated transaction directory before anything enters raw/.
    with tempfile.TemporaryDirectory(prefix=".jumpforce-extract-", dir=output_root) as temporary_name:
        transaction_root = Path(temporary_name)
        for container, members in sorted(pending_by_container.items()):
            container_batch_count += 1
            extracted, invocations = unpack_container_chunks(
                repak,
                key,
                paks[container],
                sorted(members),
                transaction_root / container,
                max_command_bytes,
            )
            invocation_count += invocations
            for member, source in extracted.items():
                staged[(container, member)] = source

        staged_evidence = {
            key_: {"bytes": path.stat().st_size, "sha256": sha256(path)}
            for key_, path in staged.items()
        }
        try:
            for (container, member), source in sorted(staged.items()):
                destination = output_root / "raw" / container / member
                destination.parent.mkdir(parents=True, exist_ok=True)
                evidence = staged_evidence[(container, member)]
                if destination.exists():
                    if not destination.is_file() or destination.stat().st_size != evidence["bytes"] or sha256(destination) != evidence["sha256"]:
                        raise ValueError(f"extraction target changed during transaction: {destination}")
                    state = "concurrent-existing-live-sha-verified"
                else:
                    source.replace(destination)
                    promoted.append(destination)
                    state = "extracted-live-sha-recorded"
                row = unique[(container, member)]
                receipts.append({
                    **row,
                    "absolutePath": str(destination.resolve()),
                    "bytes": evidence["bytes"],
                    "sha256": evidence["sha256"],
                    "state": state,
                })
        except (OSError, ValueError):
            # Roll back only files created by this transaction. Pre-existing
            # verified outputs are never removed or overwritten.
            for destination in reversed(promoted):
                destination.unlink(missing_ok=True)
            raise

    receipts.sort(key=lambda row: (row["container"], row["path"]))
    already_verified = sum(row["state"] == "already-extracted-live-sha-verified" for row in receipts)
    newly_extracted = sum(row["state"] == "extracted-live-sha-recorded" for row in receipts)
    concurrently_verified = sum(row["state"] == "concurrent-existing-live-sha-verified" for row in receipts)
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
            "containerBatchesWithNewFiles": container_batch_count,
            "repakUnpackInvocations": invocation_count,
            "preExistingFilesLiveVerified": already_verified,
            "concurrentExistingFilesLiveVerified": concurrently_verified,
            "newFilesExtracted": newly_extracted,
            "bytes": sum(row["bytes"] for row in receipts),
            "allOutputSha256Recorded": True,
            "oneProcessPerMember": False,
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
    parser.add_argument(
        "--max-command-bytes",
        type=int,
        default=200_000,
        help="Conservative argv budget; oversized container batches are split into a few unpack invocations.",
    )
    args = parser.parse_args()
    repak = args.repak.resolve()
    if not repak.is_file():
        raise FileNotFoundError(f"repak executable not found: {repak}")
    authority = load_json(args.authority.resolve())
    manifest = load_json(args.mirror_manifest.resolve())
    paks = verify_mirror(manifest, authority)
    rows = selected_rows(args.plan_paths.resolve(), args.batch, set(args.native_id))
    key = validate_key(authority, args.aes_key_env)
    receipt = extract(repak, key, paks, rows, args.output_root.resolve(), args.max_command_bytes)
    write_json(args.receipt.resolve(), receipt)
    print(f"Extracted/verified JUMP FORCE members: {receipt['summary']['extractedOrVerifiedFiles']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
