#!/usr/bin/env python3
"""Promote the JUMP FORCE raw mirror only after a complete S3 readback receipt.

This command is deliberately an integration step, not an uploader.  It reads
the receipt emitted by ``backup_intake.py``, verifies its frozen manifest and
the local archive/readback digests, then updates the Git-only mirror evidence.
Only that evidence is used to regenerate the plan, central resource entry, and
the rolling report.  A partial archive or an upload without full readback is
therefore incapable of changing the catalog from ``pending``.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from common import SOURCE_ID, load_json, sha256, write_json
from record_local_mirror import (
    EXPECTED_BYTES,
    EXPECTED_FILES,
    S3_ARCHIVE_PREFIX,
    S3_PENDING,
    S3_READBACK_VERIFIED,
    validate_evidence,
)


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
AUTHORITY = REPO / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
DEFAULT_EVIDENCE = REPO / "materials/hero-model-library/source-inventories/jump-force-full-roster-v1/local-mirror-evidence.json"
BUILD_PLAN = HERE / "build_plan.py"
UPDATE_REPORT = HERE / "update_four_day_report.py"
RECEIPT_SCHEMA = "ggd-intake-backup-receipt@1"
MANIFEST_SCHEMA = "ggd-intake-backup-manifest@1"


def file_metadata(path: Path) -> dict:
    return {
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def required_receipt_paths(receipt: dict, receipt_path: Path) -> tuple[Path, Path, Path]:
    """Return the frozen archive, full readback, and manifest paths safely."""
    try:
        archive = Path(receipt["localArchive"]).resolve()
        readback = Path(receipt["readback"]).resolve()
        manifest = Path(receipt["manifest"]).resolve()
    except (KeyError, TypeError) as error:
        raise ValueError("S3 receipt lacks one of localArchive/readback/manifest") from error
    if not archive.is_file() or not readback.is_file() or not manifest.is_file():
        raise ValueError("S3 receipt's archive, readback, or manifest is unavailable locally")
    if archive.name != "source.tar.gz" or readback.name != "readback.tar.gz" or manifest.name != "manifest.json":
        raise ValueError("S3 receipt uses an unexpected backup file layout")
    if archive.parent != readback.parent or archive.parent != manifest.parent:
        raise ValueError("S3 receipt splits its archive, readback, and manifest across directories")
    if receipt_path.resolve() == archive or receipt_path.resolve() == readback:
        raise ValueError("S3 receipt path may not alias an archive")
    return archive, readback, manifest


def validate_manifest(manifest: dict, evidence: dict, receipt: dict) -> list[dict]:
    """Check the immutable member manifest against the verified local mirror."""
    local = evidence["localMirror"]
    archive_sha = receipt["archiveSha256"]
    if (
        manifest.get("schema") != MANIFEST_SCHEMA
        or manifest.get("source") != local["absoluteRoot"]
        or manifest.get("archiveSha256") != archive_sha
        or manifest.get("archiveBytes") != receipt.get("archiveBytes")
        or manifest.get("s3Uri") != receipt.get("s3Uri")
    ):
        raise ValueError("S3 receipt and frozen archive manifest disagree")
    rows = manifest.get("files")
    if not isinstance(rows, list) or len(rows) != EXPECTED_FILES:
        raise ValueError("S3 archive manifest does not contain the complete 3,466-file mirror")
    paths = []
    total_bytes = 0
    for row in rows:
        if set(row) != {"path", "bytes", "sha256"}:
            raise ValueError("S3 archive manifest has an invalid member record")
        path, size, digest = row["path"], row["bytes"], row["sha256"]
        if (
            not isinstance(path, str)
            or not path
            or path.startswith("/")
            or ".." in Path(path).parts
            or not isinstance(size, int)
            or size < 0
            or not isinstance(digest, str)
            or len(digest) != 64
            or any(char not in "0123456789abcdef" for char in digest)
        ):
            raise ValueError("S3 archive manifest has an unsafe or incomplete member record")
        paths.append(path)
        total_bytes += size
    # ``backup_intake.py`` freezes the inventory in pathlib's deterministic
    # path order.  That order is not necessarily the bytewise string order
    # (for example ``es`` and ``es-419``), so a second sort here would reject
    # a valid frozen manifest.  Member identity is protected by the manifest
    # SHA records and the full tar readback; uniqueness is the invariant this
    # promotion gate needs to enforce.
    if len(paths) != len(set(paths)):
        raise ValueError("S3 archive manifest member paths are not unique")
    if total_bytes != EXPECTED_BYTES or local.get("fileCount") != EXPECTED_FILES or local.get("bytes") != EXPECTED_BYTES:
        raise ValueError("S3 archive manifest totals differ from the verified local mirror")
    if receipt.get("fileCount") != len(rows):
        raise ValueError("S3 receipt file count differs from its frozen archive manifest")
    return rows


def validate_completed_receipt(receipt_path: Path, evidence: dict) -> dict:
    """Validate every condition required before changing S3 status to verified."""
    receipt_path = receipt_path.resolve()
    if not receipt_path.is_file():
        raise ValueError("S3 receipt file is unavailable")
    receipt = load_json(receipt_path)
    if receipt.get("schema") != RECEIPT_SCHEMA:
        raise ValueError("unexpected S3 receipt schema")
    if receipt.get("profile") != "vibe-coding" or receipt.get("region") != "ap-east-2":
        raise ValueError("S3 receipt did not use the authorized profile and region")
    if "assumed-role/vibe-coding-s3-role/" not in str(receipt.get("callerArn", "")):
        raise ValueError("S3 receipt caller ARN is not the authorized assumed role")
    archive_sha = receipt.get("archiveSha256")
    expected_uri = S3_ARCHIVE_PREFIX + str(archive_sha) + ".tar.gz"
    if (
        not isinstance(archive_sha, str)
        or len(archive_sha) != 64
        or any(char not in "0123456789abcdef" for char in archive_sha)
        or receipt.get("s3Uri") != expected_uri
        or receipt.get("manifestUri") != expected_uri.removesuffix(".tar.gz") + ".files.json"
    ):
        raise ValueError("S3 receipt URI is outside the fixed JUMP FORCE legacy prefix")
    if (
        receipt.get("source") != evidence["localMirror"]["absoluteRoot"]
        or receipt.get("fullGetVerified") is not True
        or receipt.get("allMemberSha256Verified") is not True
        or receipt.get("manifestS3ReadbackVerified") is not True
        or receipt.get("localUnchanged") is not True
        or not isinstance(receipt.get("archiveBytes"), int)
        or receipt["archiveBytes"] <= 0
    ):
        raise ValueError("S3 receipt is not a complete full-readback verification for this local mirror")
    archive, readback, manifest_path = required_receipt_paths(receipt, receipt_path)
    if archive.stat().st_size != receipt["archiveBytes"] or sha256(archive) != archive_sha:
        raise ValueError("frozen local archive bytes no longer match the S3 receipt")
    if readback.stat().st_size != receipt["archiveBytes"] or sha256(readback) != archive_sha:
        raise ValueError("full S3 readback bytes no longer match the frozen archive")
    manifest = load_json(manifest_path)
    rows = validate_manifest(manifest, evidence, receipt)
    manifest_readback = receipt.get("manifestS3Readback")
    if not isinstance(manifest_readback, dict):
        raise ValueError("S3 receipt has no verified manifest readback")
    try:
        manifest_readback_path = Path(manifest_readback["absolutePath"]).resolve()
    except (KeyError, TypeError) as error:
        raise ValueError("S3 receipt manifest readback path is invalid") from error
    if (
        not manifest_readback_path.is_file()
        or manifest_readback.get("bytes") != manifest_path.stat().st_size
        or manifest_readback.get("sha256") != sha256(manifest_path)
        or sha256(manifest_readback_path) != sha256(manifest_path)
    ):
        raise ValueError("S3 manifest readback bytes no longer match the frozen manifest")
    return {
        "uri": receipt["s3Uri"],
        "manifestUri": receipt["manifestUri"],
        "archiveSha256": archive_sha,
        "archiveBytes": receipt["archiveBytes"],
        "fileCount": len(rows),
        "fullGetVerified": True,
        "allMemberSha256Verified": True,
        "manifestS3ReadbackVerified": True,
        "localUnchanged": True,
        "manifest": file_metadata(manifest_path),
        "manifestS3Readback": file_metadata(manifest_readback_path),
        "receipt": file_metadata(receipt_path),
    }


def promoted_evidence(evidence: dict, receipt_summary: dict) -> dict:
    """Return an evidence document with only the verified S3 fields promoted."""
    candidate = copy.deepcopy(evidence)
    if candidate.get("s3", {}).get("status") != S3_PENDING:
        raise ValueError("existing JUMP FORCE S3 status is not pending and cannot be overwritten")
    candidate["status"] = "verified-local-and-s3-readback-verified"
    candidate["s3"] = {"status": S3_READBACK_VERIFIED, **receipt_summary}
    validate_evidence(candidate, load_json(AUTHORITY))
    return candidate


def receipt_matches_evidence(evidence: dict, receipt_summary: dict) -> None:
    if evidence.get("s3", {}).get("status") != S3_READBACK_VERIFIED:
        raise ValueError("Git evidence has not promoted the S3 mirror status")
    for key, value in receipt_summary.items():
        if evidence["s3"].get(key) != value:
            raise ValueError("Git S3 evidence no longer matches the completed receipt: " + key)


def upgrade_verified_evidence(evidence: dict, receipt_summary: dict) -> dict:
    """Add newer receipt evidence without changing any verified prior value."""
    candidate = copy.deepcopy(evidence)
    if candidate.get("s3", {}).get("status") != S3_READBACK_VERIFIED:
        raise ValueError("existing JUMP FORCE S3 status is not verified")
    for key, value in receipt_summary.items():
        # A regenerated receipt is expected to change its own local metadata
        # after an additive verification step.  Archive identity and every
        # other already-published assertion remain immutable.
        if key in candidate["s3"] and candidate["s3"][key] != value and key != "receipt":
            raise ValueError("existing JUMP FORCE verified S3 value cannot be overwritten: " + key)
        candidate["s3"][key] = value
    validate_evidence(candidate, load_json(AUTHORITY))
    return candidate


def refresh_generated(repo: Path, workspace: Path, *, check: bool) -> None:
    command = [sys.executable, str(BUILD_PLAN), "--repo", str(repo), "--workspace", str(workspace)]
    if check:
        command.append("--check")
    subprocess.run(command, check=True)
    report_command = [sys.executable, str(UPDATE_REPORT), "--check" if check else "--write"]
    subprocess.run(report_command, cwd=repo, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    args = parser.parse_args()
    evidence_path = args.evidence.resolve()
    evidence = load_json(evidence_path)
    receipt_summary = validate_completed_receipt(args.receipt, evidence)
    if evidence.get("s3", {}).get("status") == S3_PENDING:
        expected = promoted_evidence(evidence, receipt_summary)
    elif evidence.get("s3", {}).get("status") == S3_READBACK_VERIFIED:
        expected = upgrade_verified_evidence(evidence, receipt_summary)
    else:
        raise ValueError("existing JUMP FORCE S3 status is not promotable")
    if args.check:
        receipt_matches_evidence(evidence, receipt_summary)
        validate_evidence(evidence, load_json(AUTHORITY))
        refresh_generated(args.repo.resolve(), args.workspace.resolve(), check=True)
    else:
        original = evidence_path.read_bytes()
        if evidence != expected:
            write_json(evidence_path, expected)
        try:
            refresh_generated(args.repo.resolve(), args.workspace.resolve(), check=False)
        except Exception:
            evidence_path.write_bytes(original)
            raise
    print(json.dumps({
        "sourceId": SOURCE_ID,
        "s3Status": S3_READBACK_VERIFIED,
        "s3Uri": receipt_summary["uri"],
        "members": receipt_summary["fileCount"],
        "fullGetVerified": True,
        "allMemberSha256Verified": True,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
