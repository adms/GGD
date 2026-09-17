"""Resolve compact full-audit archive status from the published local receipt.

This module never reads source archives or accesses the network. A file becomes
verified only when the receipt verifies the full GET and every archive member,
and its unique member record matches the compact reference exactly.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
GIT_MANIFEST = "materials/hero-model-library/pr1284-preparation-s3.json"
PENDING = "pending-manifest-publication-and-readback"
VERIFIED = "full-get-and-member-sha256-verified"
COMPACT_AUDITS = (
    "materials/hero-model-library/source-module-catalog-v1/300-mba.json",
    "materials/hero-model-library/source-module-catalog-v1/ssbu.json",
    "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json",
    "materials/hero-model-library/priority-evidence/jstars-priority-six-v1/source-receipt.json",
    "materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1/inventory.json",
)


def refreshed_full_audit(audit: dict[str, Any], repo: Path = REPO) -> dict[str, Any]:
    """Preserve the reference, deriving only its two readiness status fields."""
    result = copy.deepcopy(audit)
    verified = False
    if (
        audit.get("gitManifest") == GIT_MANIFEST
        and isinstance(audit.get("archiveMember"), str)
        and type(audit.get("bytes")) is int
        and audit["bytes"] > 0
        and re.fullmatch(r"[0-9a-f]{64}", str(audit.get("sha256", "")))
    ):
        try:
            manifest = json.loads((repo / GIT_MANIFEST).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            manifest = None
        if (
            isinstance(manifest, dict)
            and manifest.get("fullGetVerified") is True
            and manifest.get("allArchiveMembersSha256Verified") is True
            and isinstance(manifest.get("files"), list)
        ):
            members = [
                row for row in manifest["files"]
                if isinstance(row, dict) and row.get("path") == audit["archiveMember"]
            ]
            verified = (
                len(members) == 1
                and type(members[0].get("bytes")) is int
                and members[0]["bytes"] == audit["bytes"]
                and members[0].get("sha256") == audit["sha256"]
            )
    status = (
        "local-preserved-s3-readback-verified" if verified
        else "local-preserved-s3-readback-pending"
    )
    archive_status = VERIFIED if verified else PENDING
    # Retain the existing generated field order for byte-stable pending output.
    result.pop("status", None)
    result.pop("archiveStatus", None)
    refreshed = {"status": status}
    for key, value in result.items():
        if key.startswith("restoreRequired"):
            refreshed.setdefault("archiveStatus", archive_status)
        refreshed[key] = value
    refreshed.setdefault("archiveStatus", archive_status)
    return refreshed


def refresh_compact_audits(repo: Path = REPO, *, check: bool = False) -> list[str]:
    """Refresh only five fullAudit objects, without rerunning source scanners."""
    updates: list[tuple[Path, str]] = []
    for relative in COMPACT_AUDITS:
        path = repo / relative
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or not isinstance(doc.get("fullAudit"), dict):
            raise ValueError(f"missing fullAudit object: {relative}")
        if doc["fullAudit"].get("archiveMember") != relative:
            raise ValueError(f"archiveMember does not match compact audit: {relative}")
        before = copy.deepcopy(doc)
        doc["fullAudit"] = refreshed_full_audit(doc["fullAudit"], repo)
        if doc != before:
            # The workflow must preserve every identity, count and source field.
            untouched_before = {key: value for key, value in before.items() if key != "fullAudit"}
            untouched_after = {key: value for key, value in doc.items() if key != "fullAudit"}
            if untouched_before != untouched_after:
                raise ValueError(f"refresh changed non-audit data: {relative}")
            updates.append((path, json.dumps(doc, ensure_ascii=False, indent=2) + "\n"))
    if not check:
        for path, contents in updates:
            path.write_text(contents, encoding="utf-8")
    return [path.relative_to(repo).as_posix() for path, _ in updates]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--check", action="store_true", help="fail if fullAudit statuses need refresh")
    args = parser.parse_args()
    changed = refresh_compact_audits(args.repo.resolve(), check=args.check)
    print(json.dumps({"checked": len(COMPACT_AUDITS), "changed": changed, "checkOnly": args.check}))
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
