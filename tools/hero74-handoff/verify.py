#!/usr/bin/env python3
"""Validate the small Git index for the immutable hero-74 S3 archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


ARCHIVE_SCHEMA = "ggd-community-materials-archive@1"
LOCATION_SCHEMA = "ggd-community-materials-s3@1"
HEX64 = re.compile(r"[0-9a-f]{64}")


@dataclass(frozen=True)
class ArchiveMetadata:
    manifest_dir: Path
    manifest_sha256: str
    manifest: dict
    location: dict
    files: dict[str, dict]
    parts: tuple[dict, ...]


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_relative(raw: object) -> PurePosixPath:
    if not isinstance(raw, str) or not raw:
        raise ValueError("Archive path must be a non-empty string")
    path = PurePosixPath(raw)
    if path.is_absolute() or ".." in path.parts or "\\" in raw or path.as_posix() != raw:
        raise ValueError(f"Unsafe archive path: {raw}")
    if ".git" in path.parts or "node_modules" in path.parts:
        raise ValueError(f"Forbidden archive path: {raw}")
    return path


def require_absolute_outside_git(path: Path, label: str) -> Path:
    if not path.is_absolute():
        raise ValueError(f"{label} must be an absolute path")
    resolved = path.resolve(strict=False)
    for candidate in (resolved, *resolved.parents):
        if (candidate / ".git").exists():
            raise ValueError(f"{label} must be outside a Git worktree: {resolved}")
    return resolved


def _require_sha(value: object, label: str) -> str:
    if not isinstance(value, str) or HEX64.fullmatch(value) is None:
        raise ValueError(f"Invalid SHA-256 for {label}")
    return value


def _require_bytes(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"Invalid byte count for {label}")
    return value


def load_metadata(manifest_dir: Path | None = None) -> ArchiveMetadata:
    if manifest_dir is None:
        root = Path(__file__).resolve().parents[2]
        manifest_dir = root / "docs/_reports/hero74-handoff/archive"
    manifest_dir = manifest_dir.resolve()
    manifest_path = manifest_dir / "manifest.json"
    location_path = manifest_dir / "s3-location.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
    manifest = json.loads(manifest_bytes)
    location = json.loads(location_path.read_text(encoding="utf-8"))

    if manifest.get("schema") != ARCHIVE_SCHEMA:
        raise ValueError("Unknown archive manifest schema")
    if location.get("schema") != LOCATION_SCHEMA:
        raise ValueError("Unknown S3 location schema")
    if location.get("manifestSha256") != manifest_sha256:
        raise ValueError("S3 location does not match the committed manifest")
    expected_prefix = f"community-hero-forge/{manifest_sha256}/"
    if location.get("prefix") != expected_prefix:
        raise ValueError("S3 prefix is not content-addressed by the manifest")
    for key in ("bucket", "region", "profile"):
        if not isinstance(location.get(key), str) or not location[key]:
            raise ValueError(f"S3 location is missing {key}")

    raw_parts = manifest.get("parts")
    if not isinstance(raw_parts, list) or not raw_parts:
        raise ValueError("Archive manifest has no parts")
    parts: list[dict] = []
    for index, row in enumerate(raw_parts):
        if not isinstance(row, dict):
            raise ValueError("Invalid archive part row")
        expected_name = f"payload.tar.gz.part{index:03d}"
        if row.get("path") != expected_name:
            raise ValueError(f"Archive part order is invalid at {expected_name}")
        size = _require_bytes(row.get("bytes"), expected_name)
        if size == 0 or size > 32 * 1024 * 1024:
            raise ValueError(f"Archive part has invalid size: {expected_name}")
        _require_sha(row.get("sha256"), expected_name)
        parts.append(row)

    raw_files = manifest.get("files")
    if not isinstance(raw_files, list) or not raw_files:
        raise ValueError("Archive manifest has no files")
    files: dict[str, dict] = {}
    for row in raw_files:
        if not isinstance(row, dict):
            raise ValueError("Invalid archive file row")
        name = safe_relative(row.get("path")).as_posix()
        if name in files:
            raise ValueError(f"Duplicate archive path: {name}")
        _require_bytes(row.get("bytes"), name)
        _require_sha(row.get("sha256"), name)
        mode = row.get("mode")
        if not isinstance(mode, int) or isinstance(mode, bool) or mode < 0 or mode & ~0o777:
            raise ValueError(f"Invalid file mode: {name}")
        files[name] = row

    summary = manifest.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("Archive manifest has no summary")
    expected_summary = {
        "files": len(files),
        "uniquePayloads": len({row["sha256"] for row in files.values()}),
        "bytes": sum(row["bytes"] for row in files.values()),
        "compressedBytes": sum(row["bytes"] for row in parts),
    }
    for key, expected in expected_summary.items():
        if summary.get(key) != expected:
            raise ValueError(f"Archive summary mismatch: {key}")
    if summary.get("redactedFiles") != 0:
        raise ValueError("Archive unexpectedly reports redacted payloads")

    return ArchiveMetadata(
        manifest_dir=manifest_dir,
        manifest_sha256=manifest_sha256,
        manifest=manifest,
        location=location,
        files=files,
        parts=tuple(parts),
    )


def verify_parts(metadata: ArchiveMetadata, parts_dir: Path) -> int:
    parts_dir = require_absolute_outside_git(parts_dir, "Part cache")
    for row in metadata.parts:
        path = parts_dir / safe_relative(row["path"])
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Missing archive part: {row['path']}")
        if path.stat().st_size != row["bytes"] or digest_file(path) != row["sha256"]:
            raise ValueError(f"Corrupt archive part: {row['path']}")
    return len(metadata.parts)


def verify_restored(metadata: ArchiveMetadata, restored_dir: Path) -> int:
    restored_dir = require_absolute_outside_git(restored_dir, "Restored directory")
    if restored_dir.is_symlink() or not restored_dir.is_dir():
        raise ValueError(f"Restored directory is missing: {restored_dir}")
    allowed_directories = {
        parent.as_posix()
        for name in metadata.files
        for parent in PurePosixPath(name).parents
        if parent != PurePosixPath(".")
    }
    seen: set[str] = set()
    for path in restored_dir.rglob("*"):
        if path.is_dir() and not path.is_symlink():
            relative = path.relative_to(restored_dir).as_posix()
            if relative not in allowed_directories:
                raise ValueError(f"Unexpected restored directory: {relative}")
            continue
        relative = path.relative_to(restored_dir).as_posix()
        if relative not in metadata.files:
            raise ValueError(f"Unexpected restored path: {relative}")
        row = metadata.files[relative]
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Restored path is not a regular file: {relative}")
        if path.stat().st_size != row["bytes"] or digest_file(path) != row["sha256"]:
            raise ValueError(f"Restored bytes differ: {relative}")
        seen.add(relative)
    missing = set(metadata.files) - seen
    if missing:
        raise ValueError(f"Restored archive is incomplete; first missing path: {sorted(missing)[0]}")
    return len(seen)


def summary(metadata: ArchiveMetadata, parts_verified: int = 0, restored_verified: int = 0) -> dict:
    archive_summary = metadata.manifest["summary"]
    return {
        "schema": ARCHIVE_SCHEMA,
        "manifestSha256": metadata.manifest_sha256,
        "bucket": metadata.location["bucket"],
        "prefix": metadata.location["prefix"],
        "files": archive_summary["files"],
        "uniquePayloads": archive_summary["uniquePayloads"],
        "bytes": archive_summary["bytes"],
        "parts": len(metadata.parts),
        "compressedBytes": archive_summary["compressedBytes"],
        "partsVerified": parts_verified,
        "restoredFilesVerified": restored_verified,
        "acceptance": "material-delivery-only; not hero runtime or model quality",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest-dir", type=Path)
    parser.add_argument("--parts-dir", type=Path, help="Optional absolute cache containing all archive parts")
    parser.add_argument("--restored-dir", type=Path, help="Optional absolute restored tree to hash completely")
    args = parser.parse_args()
    metadata = load_metadata(args.manifest_dir)
    parts_verified = verify_parts(metadata, args.parts_dir) if args.parts_dir else 0
    restored_verified = verify_restored(metadata, args.restored_dir) if args.restored_dir else 0
    print(json.dumps(summary(metadata, parts_verified, restored_verified), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
