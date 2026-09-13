"""Verify every local file in one voice-index group and emit a deterministic receipt.

This proves local path, byte size and SHA-256 only.  It deliberately preserves
the voice index's language, speaker, transcript and runtime-readiness state.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INDEX_ROOT = ROOT / "materials/hero-model-library"


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def build(group_id: str, workspace_override: Path | None = None) -> dict:
    index_path = INDEX_ROOT / "voice-index.json"
    manifest_path = INDEX_ROOT / "voice-files.jsonl.gz"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    matches = [row for row in index["groups"] if row["id"] == group_id]
    if len(matches) != 1:
        raise ValueError(f"Expected one exact voice group {group_id!r}; found {len(matches)}")
    group = matches[0]

    workspace = (workspace_override or Path(index["localWorkspace"])).resolve()
    rows = []
    with gzip.open(manifest_path, "rt", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            row = json.loads(line)
            if row["groupId"] == group_id:
                rows.append((line_number, row))
    rows.sort(key=lambda item: item[1]["path"])
    if len(rows) != group["fileCount"]:
        raise ValueError(f"Indexed file count mismatch: group={group['fileCount']} manifest={len(rows)}")

    verified = []
    for line_number, row in rows:
        local = (workspace / row["path"]).resolve()
        if not local.is_relative_to(workspace):
            raise ValueError(f"Indexed path escapes local workspace: {row['path']}")
        if not local.is_file():
            raise FileNotFoundError(local)
        actual_bytes = local.stat().st_size
        actual_sha = digest(local)
        if actual_bytes != row["bytes"] or actual_sha != row["sha256"]:
            raise ValueError(
                f"Local file mismatch: {local}; "
                f"bytes {actual_bytes}/{row['bytes']}; sha256 {actual_sha}/{row['sha256']}"
            )
        verified.append(
            {
                "manifestLine": line_number,
                "absolutePath": str(local),
                "path": row["path"],
                "bytes": actual_bytes,
                "sha256": actual_sha,
                "seconds": row.get("seconds"),
                "category": row.get("category"),
                "archiveMember": row.get("archiveMember"),
                "backupId": row.get("backupId"),
                "languageReviewed": row.get("languageReviewed", False),
                "speakerReviewed": row.get("speakerReviewed", False),
                "transcriptReviewed": row.get("transcriptReviewed", False),
                "synthesisReady": row.get("synthesisReady", False),
                "excludedFromSpeechInput": row.get("excludedFromSpeechInput"),
            }
        )

    total_bytes = sum(row["bytes"] for row in verified)
    duration_rows = [row["seconds"] for row in verified if row["seconds"] is not None]
    total_duration = sum(duration_rows)
    category_counts = dict(sorted(Counter(row["category"] for row in verified).items()))
    if total_bytes != group["bytes"]:
        raise ValueError(f"Group byte count mismatch: {total_bytes}/{group['bytes']}")
    if len(duration_rows) != group["durationMeasuredFiles"]:
        raise ValueError("Group duration file count mismatch")
    if abs(total_duration - group["knownDurationSeconds"]) > 1e-6:
        raise ValueError("Group duration sum mismatch")
    if category_counts != group["categoryCounts"]:
        raise ValueError(f"Group category count mismatch: {category_counts}/{group['categoryCounts']}")

    backup_ids = group.get("backupIds", [])
    backups = {backup_id: index["backups"][backup_id] for backup_id in backup_ids}
    return {
        "schema": "ggd-local-voice-group-verification@1",
        "group": group,
        "inputs": [
            {
                "path": index_path.relative_to(ROOT).as_posix(),
                "bytes": index_path.stat().st_size,
                "sha256": digest(index_path),
            },
            {
                "path": manifest_path.relative_to(ROOT).as_posix(),
                "bytes": manifest_path.stat().st_size,
                "sha256": digest(manifest_path),
            },
        ],
        "localWorkspace": str(workspace),
        "summary": {
            "indexedFiles": len(verified),
            "existingFiles": len(verified),
            "byteAndSha256VerifiedFiles": len(verified),
            "bytes": total_bytes,
            "knownDurationSeconds": total_duration,
            "durationMeasuredFiles": len(duration_rows),
            "categoryCounts": category_counts,
            "missingFiles": 0,
            "mismatchedFiles": 0,
        },
        "backups": backups,
        "files": verified,
        "status": {
            "localSourceBytesVerified": True,
            "language": group.get("language", "unreviewed"),
            "speakerVerified": group.get("speakerVerified", False),
            "listeningReviewComplete": group.get("listeningReviewComplete", False),
            "synthesisReady": group.get("synthesisReady", False),
            "runtimeSelectable": False,
            "deployed": False,
        },
        "boundaries": [
            "Directory and filename grouping is not per-clip speaker, language, transcript or event verification.",
            "Local byte verification is not decoded-audio quality, listening, synthesis, runtime binding or deployment acceptance.",
            "Original OGG files remain in the local asset library and S3 legacy; this receipt contains paths and hashes only.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("group_id")
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    blob = encoded(build(args.group_id, args.workspace))
    output = args.output.resolve()
    if args.check:
        if not output.is_file() or output.read_bytes() != blob:
            raise SystemExit(f"STALE VOICE GROUP VERIFICATION: {output}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(blob)
    report = json.loads(blob)
    print(json.dumps({"check": args.check, "groupId": args.group_id, **report["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
