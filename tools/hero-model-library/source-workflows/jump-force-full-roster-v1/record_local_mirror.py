#!/usr/bin/env python3
"""Record the completed local JUMP FORCE mirror without committing its payload."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import AS_OF_DATE, SOURCE_ID, load_json, sha256, write_json


REPO = Path(__file__).resolve().parents[4]
OUTPUT = REPO / "materials/hero-model-library/source-inventories/jump-force-full-roster-v1/local-mirror-evidence.json"
AUTHORITY = REPO / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
DEFAULT_RECEIPT_ROOT = Path(
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/"
    "GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149"
)
EXPECTED_FILES = 3466
EXPECTED_BYTES = 23856777652
EXPECTED_INDEX_SHA256 = "6ee6b4c2a17c886f2ddf675a4a6028c40ec3e5fd59abfc8df0aa2414495f0d06"
S3_PENDING = "pending"
S3_READBACK_VERIFIED = "s3-readback-verified"
S3_ARCHIVE_PREFIX = (
    "s3://ggd-390630837668-ap-east-2-an/legacy/game-intakes/"
    "jump-force-steam-full-build-8523149/"
)


def input_receipt(path: Path) -> dict:
    return {
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def validate_evidence(evidence: dict, authority: dict) -> None:
    if evidence.get("schema") != "ggd.jumpforce-local-mirror-evidence@1":
        raise ValueError("unexpected local mirror evidence schema")
    if evidence.get("sourceId") != SOURCE_ID:
        raise ValueError("JUMP FORCE local mirror source identity differs")
    local = evidence.get("localMirror", {})
    if local.get("fileCount") != EXPECTED_FILES or local.get("bytes") != EXPECTED_BYTES:
        raise ValueError("local mirror file or byte count differs from the frozen receipt")
    if evidence.get("filesIndex", {}).get("sha256") != EXPECTED_INDEX_SHA256:
        raise ValueError("local mirror full index SHA-256 differs from the frozen receipt")
    expected_rows = [
        {key: row[key] for key in ("name", "order", "bytes", "sha256")}
        for row in sorted(authority.get("containers", []), key=lambda row: row["order"])
    ]
    rows = evidence.get("containers", [])
    if len(rows) != 6 or any(not row.get("identityVerified") for row in rows):
        raise ValueError("local mirror does not prove six verified authority PAKs")
    actual_rows = [{key: row[key] for key in ("name", "order", "bytes", "sha256")} for row in rows]
    if actual_rows != expected_rows:
        raise ValueError("local mirror PAK identities differ from Git authority")
    verification = evidence.get("verification", {})
    if verification.get("verifiedContainers") != 6 or verification.get("allSha256Verified") is not True:
        raise ValueError("local mirror authority verification is incomplete")
    s3 = evidence.get("s3", {})
    s3_status = s3.get("status")
    if s3_status == S3_PENDING:
        if evidence.get("status") != "verified-local" or s3.get("uri") is not None:
            raise ValueError("pending S3 evidence must remain local-only")
    elif s3_status == S3_READBACK_VERIFIED:
        if evidence.get("status") != "verified-local-and-s3-readback-verified":
            raise ValueError("S3-verified mirror has an unexpected overall status")
        required = {
            "uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount",
            "fullGetVerified", "allMemberSha256Verified", "localUnchanged", "manifest", "receipt",
        }
        if not required.issubset(s3):
            raise ValueError("S3-verified mirror lacks a complete backup receipt summary")
        archive_sha = s3["archiveSha256"]
        if (
            not isinstance(archive_sha, str)
            or len(archive_sha) != 64
            or any(char not in "0123456789abcdef" for char in archive_sha)
            or s3["uri"] != S3_ARCHIVE_PREFIX + archive_sha + ".tar.gz"
            or s3["manifestUri"] != S3_ARCHIVE_PREFIX + archive_sha + ".files.json"
            or s3["fileCount"] != EXPECTED_FILES
            or not isinstance(s3["archiveBytes"], int)
            or s3["archiveBytes"] <= 0
            or s3["fullGetVerified"] is not True
            or s3["allMemberSha256Verified"] is not True
            or s3["localUnchanged"] is not True
        ):
            raise ValueError("S3-verified mirror receipt fields are incomplete or inconsistent")
        for label in ("manifest", "receipt"):
            metadata = s3[label]
            if (
                not isinstance(metadata, dict)
                or not isinstance(metadata.get("sha256"), str)
                or len(metadata["sha256"]) != 64
                or not isinstance(metadata.get("bytes"), int)
                or metadata["bytes"] <= 0
            ):
                raise ValueError("S3-verified mirror " + label + " identity is incomplete")
    else:
        raise ValueError("JUMP FORCE local mirror S3 status is not recognized")
    scope = evidence.get("scope", {})
    if scope.get("lv99ShareRequiredForExtraction") is not False:
        raise ValueError("verified local mirror must be independent from LV99")
    states = evidence.get("states", {})
    for key in ("extractedFiles", "convertedModels", "convertedMotions", "convertedVfx", "decodedAudio", "backendOptions", "deployed"):
        if states.get(key) != 0:
            raise ValueError(f"local mirror evidence overclaims downstream state: {key}")


def build(receipt_root: Path, authority_path: Path, *, verify_local_index: bool) -> dict:
    mirror_path = receipt_root / "mirror-complete.json"
    index_path = receipt_root / "files.jsonl.gz"
    verification_path = receipt_root / "pak-authority-verification.json"
    mirror = load_json(mirror_path)
    verification = load_json(verification_path)
    authority = load_json(authority_path)
    if mirror.get("schema") != "ggd.local-readonly-game-mirror@1" or mirror.get("complete") is not True:
        raise ValueError("source mirror completion receipt is incomplete")
    if mirror.get("fileCount") != EXPECTED_FILES or mirror.get("bytes") != EXPECTED_BYTES:
        raise ValueError("source mirror totals differ from expected completed copy")
    if mirror.get("filesIndex", {}).get("sha256") != EXPECTED_INDEX_SHA256:
        raise ValueError("source mirror receipt points to an unexpected full index")
    if verify_local_index and sha256(index_path) != EXPECTED_INDEX_SHA256:
        raise ValueError("local files.jsonl.gz failed SHA-256 verification")
    if verification.get("schema") != "ggd.jumpforce-pak-mirror@1" or verification.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected PAK authority verification receipt")
    if verification.get("summary", {}).get("verifiedContainers") != 6 or verification.get("summary", {}).get("allSha256Verified") is not True:
        raise ValueError("PAK authority verification is incomplete")
    evidence = {
        "schema": "ggd.jumpforce-local-mirror-evidence@1",
        "asOfDate": AS_OF_DATE,
        "sourceId": SOURCE_ID,
        "status": "verified-local",
        "source": {
            "url": mirror["source"],
            "readOnly": mirror["sourceReadOnly"],
        },
        "localMirror": {
            "absoluteRoot": mirror["destination"],
            "paksRoot": verification["mirrorRoot"],
            "fileCount": mirror["fileCount"],
            "bytes": mirror["bytes"],
            "copyMode": mirror["copyMode"],
            "startedAt": mirror["startedAt"],
            "finishedAt": mirror["finishedAt"],
            "durationSeconds": mirror["durationSeconds"],
            "averageBytesPerSecond": mirror["averageBytesPerSecond"],
        },
        "filesIndex": {
            "absolutePath": mirror["filesIndex"]["path"],
            "bytes": mirror["filesIndex"]["bytes"],
            "sha256": mirror["filesIndex"]["sha256"],
        },
        "authority": {
            "gitPath": "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json",
            "sha256": sha256(authority_path),
        },
        "inputReceipts": {
            "mirrorCompletion": input_receipt(mirror_path),
            "pakAuthorityVerification": input_receipt(verification_path),
        },
        "verification": verification["summary"],
        "containers": verification["containers"],
        "s3": {"status": "pending", "uri": None},
        "scope": {
            "lv99ShareRequiredForExtraction": False,
            "steamLibraryRescanRequired": False,
            "gameDirectoryRescanRequired": False,
            "payloadCommittedToGit": False,
            "payloadModified": False,
        },
        "states": {
            "mirror": "verified-local-6-of-6-authority-paks",
            "extractedFiles": 0,
            "convertedModels": 0,
            "convertedMotions": 0,
            "convertedVfx": 0,
            "decodedAudio": 0,
            "backendOptions": 0,
            "deployed": 0,
        },
    }
    validate_evidence(evidence, authority)
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--receipt-root", type=Path, default=DEFAULT_RECEIPT_ROOT)
    parser.add_argument("--authority", type=Path, default=AUTHORITY)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--verify-local-index", action="store_true")
    args = parser.parse_args()
    authority = load_json(args.authority.resolve())
    if args.write:
        evidence = build(args.receipt_root.resolve(), args.authority.resolve(), verify_local_index=args.verify_local_index)
        write_json(args.output.resolve(), evidence)
    else:
        evidence = load_json(args.output.resolve())
        validate_evidence(evidence, authority)
        if args.verify_local_index:
            if sha256(Path(evidence["filesIndex"]["absolutePath"])) != evidence["filesIndex"]["sha256"]:
                raise ValueError("local files index no longer matches committed evidence")
    print("JUMP FORCE local mirror evidence is current: 3466 files; 6/6 PAKs verified")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
