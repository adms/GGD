#!/usr/bin/env python3
"""Verify an already-downloaded intake backup and emit its promotion receipt.

This is deliberately separate from ``backup_intake.py``.  It resumes the
verification half of a backup when upload and full readback completed in a
previous process, without writing to S3 again.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tarfile
from pathlib import Path


BUCKET = "ggd-390630837668-ap-east-2-an"
PROFILE = "vibe-coding"
REGION = "ap-east-2"
ROLE_FRAGMENT = "assumed-role/vibe-coding-s3-role/"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_member(handle) -> tuple[int, str]:
    digest = hashlib.sha256()
    count = 0
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        count += len(chunk)
        digest.update(chunk)
    return count, digest.hexdigest()


def inventory(root: Path) -> list[dict]:
    rows = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink not allowed: {path}")
        if path.is_file():
            rows.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                }
            )
    if not rows:
        raise ValueError("Empty intake")
    return rows


def caller_arn() -> str:
    environment = {**os.environ, "AWS_PROFILE": PROFILE, "AWS_REGION": REGION, "AWS_PAGER": ""}
    result = subprocess.run(
        [
            "aws", "sts", "get-caller-identity", "--query", "Arn", "--output", "text",
            "--profile", PROFILE, "--region", REGION, "--no-cli-pager",
        ],
        text=True,
        capture_output=True,
        check=False,
        env=environment,
    )
    if result.returncode:
        raise RuntimeError(f"sts:GetCallerIdentity configured role: {result.stderr.strip()}")
    arn = result.stdout.strip()
    if ROLE_FRAGMENT not in arn:
        raise RuntimeError(f"STOP identity mismatch: {arn}")
    return arn


def readback_manifest_from_s3(manifest: dict, destination: Path) -> dict:
    """Read back the separately stored manifest and pin its local bytes."""
    uri = str(manifest["s3Uri"]).removesuffix(".tar.gz") + ".files.json"
    target = destination / "manifest-s3-readback.json"
    environment = {**os.environ, "AWS_PROFILE": PROFILE, "AWS_REGION": REGION, "AWS_PAGER": ""}
    result = subprocess.run(
        ["aws", "s3", "cp", uri, str(target), "--only-show-errors", "--profile", PROFILE, "--region", REGION, "--no-cli-pager"],
        text=True,
        capture_output=True,
        check=False,
        env=environment,
    )
    if result.returncode:
        raise RuntimeError(f"s3:GetObject {uri}: {result.stderr.strip()}")
    expected = sha256(destination / "manifest.json")
    if target.stat().st_size != (destination / "manifest.json").stat().st_size or sha256(target) != expected:
        raise ValueError("S3 manifest readback differs from frozen local manifest")
    return {"absolutePath": str(target), "bytes": target.stat().st_size, "sha256": expected}


def expected_uri(manifest: dict, prefix: str) -> str:
    return f"s3://{BUCKET}/{prefix.strip('/')}/{manifest['archiveSha256']}.tar.gz"


def verify(source: Path, destination: Path, prefix: str) -> dict:
    source, destination = source.resolve(), destination.resolve()
    manifest_path = destination / "manifest.json"
    archive = destination / "source.tar.gz"
    readback = destination / "readback.tar.gz"
    if not manifest_path.is_file() or not archive.is_file() or not readback.is_file():
        raise ValueError("Manifest, local archive, and complete readback.tar.gz are all required")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != "ggd-intake-backup-manifest@1":
        raise ValueError("Unexpected manifest schema")
    if manifest.get("source") != str(source):
        raise ValueError("Frozen backup source differs from requested source")
    if manifest.get("archiveBytes") != archive.stat().st_size:
        raise ValueError("Local archive byte count differs from manifest")
    if sha256(archive) != manifest.get("archiveSha256"):
        raise ValueError("Local archive SHA-256 differs from manifest")
    if readback.stat().st_size != manifest["archiveBytes"]:
        raise ValueError("Readback byte count differs from local archive")
    if sha256(readback) != manifest["archiveSha256"]:
        raise ValueError("Readback SHA-256 differs from local archive")

    expected_rows = {row["path"]: row for row in manifest.get("files", [])}
    seen = set()
    with tarfile.open(readback, "r:gz") as package:
        for member in package:
            if not member.isfile():
                raise ValueError(f"Archive member is not a regular file: {member.name}")
            row = expected_rows.get(member.name)
            if row is None or member.name in seen:
                raise ValueError(f"Unexpected or duplicated archive member: {member.name}")
            extracted = package.extractfile(member)
            if extracted is None:
                raise ValueError(f"Cannot read archive member: {member.name}")
            size, digest = hash_member(extracted)
            if size != row["bytes"] or digest != row["sha256"]:
                raise ValueError(f"Archive member hash mismatch: {member.name}")
            seen.add(member.name)
    if seen != set(expected_rows):
        raise ValueError("Archive member list differs from frozen manifest")
    if inventory(source) != manifest["files"]:
        raise ValueError("Local intake changed during readback verification")
    uri = expected_uri(manifest, prefix)
    if manifest.get("s3Uri") != uri:
        raise ValueError("Frozen backup has an unexpected destination")
    manifest_s3_readback = readback_manifest_from_s3(manifest, destination)
    return {
        "schema": "ggd-intake-backup-receipt@1",
        "s3Uri": uri,
        "manifestUri": uri.removesuffix(".tar.gz") + ".files.json",
        "archiveSha256": manifest["archiveSha256"],
        "archiveBytes": manifest["archiveBytes"],
        "fileCount": len(manifest["files"]),
        "fullGetVerified": True,
        "allMemberSha256Verified": True,
        "manifestS3ReadbackVerified": True,
        "manifestS3Readback": manifest_s3_readback,
        "localUnchanged": True,
        "source": str(source),
        "localArchive": str(archive),
        "readback": str(readback),
        "manifest": str(manifest_path),
        "profile": PROFILE,
        "region": REGION,
        "callerArn": caller_arn(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--write", action="store_true", help="write receipt.json and latest-receipt.json after validation")
    parser.add_argument("--check", action="store_true", help="compare an existing receipt after validation")
    args = parser.parse_args()
    if args.write == args.check:
        parser.error("choose exactly one of --write or --check")
    prefix = args.prefix.strip("/")
    if not prefix.startswith("legacy/") or ".." in Path(prefix).parts:
        parser.error("--prefix must be a relative legacy/ path")
    receipt = verify(args.source, args.destination, prefix)
    receipt_path = args.destination.resolve() / "receipt.json"
    latest_path = args.destination.resolve().parent / "latest-receipt.json"
    if args.check:
        if not receipt_path.is_file() or not latest_path.is_file():
            raise ValueError("Receipt files are unavailable")
        if json.loads(receipt_path.read_text()) != receipt or json.loads(latest_path.read_text()) != receipt:
            raise ValueError("Existing receipt differs from verification result")
    else:
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        latest_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"fileCount": receipt["fileCount"], "archiveSha256": receipt["archiveSha256"], "fullGetVerified": True, "allMemberSha256Verified": True}))


if __name__ == "__main__":
    main()
