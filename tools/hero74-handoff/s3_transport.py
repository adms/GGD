#!/usr/bin/env python3
"""Download immutable hero-74 archive objects and verify every local byte."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from verify import ArchiveMetadata, digest_file, load_metadata, require_absolute_outside_git


BUCKET = "ggd-390630837668-ap-east-2-an"
REGION = "ap-east-2"
PROFILE = "vibe-coding"
ROLE = "arn:aws:sts::390630837668:assumed-role/vibe-coding-s3-role/"


def _aws(arguments: list[str], metadata: ArchiveMetadata, action: str, resource: str) -> dict:
    command = [
        "aws",
        *arguments,
        "--profile",
        metadata.location["profile"],
        "--region",
        metadata.location["region"],
        "--no-cli-pager",
        "--output",
        "json",
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as error:
        raise RuntimeError("AWS CLI is not installed") from error
    if result.returncode:
        match = re.search(r"An error occurred \(([^)]+)\)", result.stderr)
        code = match.group(1) if match else f"CLI exit {result.returncode}"
        if code in {"AccessDenied", "Forbidden", "403"}:
            raise PermissionError(f"AccessDenied: {action} on {resource}")
        raise RuntimeError(f"{action} failed ({code}) on {resource}")
    return json.loads(result.stdout or "{}")


def _verify_identity(metadata: ArchiveMetadata) -> None:
    identity = _aws(["sts", "get-caller-identity"], metadata, "sts:GetCallerIdentity", "current profile")
    arn = identity.get("Arn", "")
    if not isinstance(arn, str) or not arn.startswith(ROLE):
        raise PermissionError(f"Unexpected AWS role; no S3 object downloaded: {arn or '(missing ARN)'}")


def _download(metadata: ArchiveMetadata, key: str, target: Path) -> None:
    bucket = metadata.location["bucket"]
    resource = f"s3://{bucket}/{key}"
    _aws(
        ["s3api", "get-object", "--bucket", bucket, "--key", key, "--checksum-mode", "ENABLED", str(target)],
        metadata,
        "s3:GetObject",
        resource,
    )


def _temporary_path(cache: Path, name: str) -> Path:
    descriptor, raw = tempfile.mkstemp(prefix=f"{name}.", suffix=".download", dir=cache)
    os.close(descriptor)
    return Path(raw)


def fetch_parts(manifest_dir: Path, cache: Path) -> dict:
    metadata = load_metadata(manifest_dir)
    expected_location = {"bucket": BUCKET, "region": REGION, "profile": PROFILE}
    if any(metadata.location.get(key) != value for key, value in expected_location.items()):
        raise ValueError("S3 location is outside the authorized archive destination")
    cache = require_absolute_outside_git(cache, "Part cache")
    if cache.is_symlink():
        raise ValueError("Part cache cannot be a symlink")
    cache.mkdir(parents=True, exist_ok=True)
    _verify_identity(metadata)

    remote_manifest = _temporary_path(cache, "manifest.json")
    try:
        _download(metadata, metadata.location["prefix"] + "manifest.json", remote_manifest)
        if digest_file(remote_manifest) != metadata.manifest_sha256:
            raise ValueError("S3 manifest differs from the committed manifest")
    finally:
        remote_manifest.unlink(missing_ok=True)

    downloaded = 0
    verified = 0
    for row in metadata.parts:
        target = cache / row["path"]
        if target.exists() or target.is_symlink():
            if target.is_symlink() or not target.is_file():
                raise ValueError(f"Invalid part cache path: {target}")
            if target.stat().st_size != row["bytes"] or digest_file(target) != row["sha256"]:
                raise ValueError(f"Existing part differs from manifest: {row['path']}")
        else:
            temporary = _temporary_path(cache, row["path"])
            try:
                _download(metadata, metadata.location["prefix"] + row["path"], temporary)
                if temporary.stat().st_size != row["bytes"] or digest_file(temporary) != row["sha256"]:
                    raise ValueError(f"Downloaded part differs from manifest: {row['path']}")
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
            downloaded += 1
        verified += 1
        print(json.dumps({"verifiedParts": verified, "totalParts": len(metadata.parts)}), flush=True)
    return {
        "manifestSha256": metadata.manifest_sha256,
        "verifiedParts": len(metadata.parts),
        "downloadedParts": downloaded,
        "bytes": sum(row["bytes"] for row in metadata.parts),
        "cache": str(cache),
    }
