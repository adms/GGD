#!/usr/bin/env python3
"""Freeze the asset workflow files removed by the priority option merge."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DELETION_COMMIT = "818566183fbb127a5730aa6115d23d600dbedcee"
DELETION_PARENT = "fcb1e8dfd457f510f7a0d2a6715331c55a38a6a0"
OUTPUT = (
    ROOT
    / "materials/hero-model-library/priority-evidence/asset-workflow-restoration/manifest.json"
)
POST_DELETE_FIXES = {
    "tools/hero-model-library/source-workflows/zero-lancer-validation-20260911-v1/validate.mts": (
        "Preserve the local post-deletion fix that creates the evidence directory before writing validation output."
    ),
}


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def git_bytes(repo: Path, revision_path: str) -> bytes:
    return subprocess.check_output(["git", "show", revision_path], cwd=repo)


def deleted_paths(repo: Path) -> list[str]:
    output = subprocess.check_output(
        [
            "git",
            "diff-tree",
            "--no-commit-id",
            "--name-status",
            "-r",
            "--diff-filter=D",
            DELETION_COMMIT,
            "--",
            "tools/hero-model-library",
        ],
        cwd=repo,
        text=True,
    )
    paths = sorted(line.split("\t", 1)[1] for line in output.splitlines() if line)
    if not paths or len(paths) != len(set(paths)):
        raise ValueError("Unexpected asset workflow deletion set")
    return paths


def build(repo: Path = ROOT) -> dict:
    rows = []
    exact = 0
    fixed = 0
    for path in deleted_paths(repo):
        absolute = repo / path
        if not absolute.is_file():
            raise FileNotFoundError(f"Deleted workflow has not been restored: {path}")
        historical = git_bytes(repo, f"{DELETION_PARENT}:{path}")
        restored = absolute.read_bytes()
        relationship = "historical-byte-exact"
        note = None
        if historical != restored:
            note = POST_DELETE_FIXES.get(path)
            if not note:
                raise ValueError(f"Unreviewed restored workflow difference: {path}")
            relationship = "historical-plus-reviewed-local-fix"
            fixed += 1
        else:
            exact += 1
        row = {
            "gitPath": path,
            "bytes": len(restored),
            "sha256": sha256(restored),
            "historicalBytes": len(historical),
            "historicalSha256": sha256(historical),
            "relationship": relationship,
        }
        if note:
            row["reviewedDifference"] = note
        rows.append(row)
    if set(POST_DELETE_FIXES) != {
        row["gitPath"] for row in rows if row["relationship"] != "historical-byte-exact"
    }:
        raise ValueError("Reviewed workflow fix set drifted")
    return {
        "schema": "ggd-asset-workflow-restoration@1",
        "deletionCommit": DELETION_COMMIT,
        "deletionParent": DELETION_PARENT,
        "scope": "Versioned programs and dependency manifests under tools/hero-model-library only.",
        "summary": {
            "restoredFiles": len(rows),
            "historicalByteExactFiles": exact,
            "reviewedPostDeletionFixFiles": fixed,
            "restoredBytes": sum(row["bytes"] for row in rows),
        },
        "files": rows,
        "boundaries": [
            "Generated central indexes, previews, runtime assets and Windows source inventories are outside this restoration batch.",
            "Restoration preserves rebuild tooling; it does not claim source acquisition, conversion, runtime registration or deployment completed.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    report = build()
    payload = (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode()
    output = args.output.resolve()
    if args.check:
        if not output.is_file() or output.read_bytes() != payload:
            raise SystemExit(f"STALE ASSET WORKFLOW RESTORATION MANIFEST: {output}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(payload)
    print(json.dumps({"check": args.check, **report["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
