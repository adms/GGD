#!/usr/bin/env python3
"""Rehash locally retained files while keeping the detailed rows in authority JSON."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from build_inventory import (
    DOWNLOAD_SOURCES, LOCAL_RECEIPT, PUBLIC_FILES, RECEIPT_SCHEMA, WORKSPACE,
    asset_kinds, load, public_manifest_by_id, relevant_scope, sha,
)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(8 * 1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def verify() -> dict:
    downloads = load(DOWNLOAD_SOURCES)
    manifests = public_manifest_by_id(load(PUBLIC_FILES))
    rows = []
    for source in downloads.get("publicSources", []):
        if not str(source.get("acquisitionStatus", "")).startswith(("downloaded", "priority-scope-extracted")):
            continue
        kinds, _ = asset_kinds(source)
        if not relevant_scope(source, kinds):
            continue
        # The final row is the active local tree; earlier rows remain preserved
        # as immutable S3 versions in public-source-files.json. Newer sources
        # can use the per-source file list in download-sources directly.
        versions = manifests.get(source["id"], [])
        manifest = versions[-1] if versions else {"files": source.get("files", [])}
        root_value = source.get("localPath") or source.get("localRoot") or source.get("upstreamLocalRoot")
        root = Path(root_value) if root_value and Path(root_value).is_absolute() else WORKSPACE / str(root_value or "")
        checked = missing = mismatched = verified_bytes = 0
        problems = []
        for expected in manifest.get("files", []):
            path = root / expected["path"]
            if not path.is_file():
                missing += 1
                problems.append({"path": expected["path"], "problem": "missing", "expectedSha256": expected.get("sha256"), "expectedBytes": expected.get("bytes")})
                continue
            checked += 1
            actual_sha = digest(path)
            if path.stat().st_size != expected.get("bytes") or actual_sha != expected.get("sha256"):
                mismatched += 1
                problems.append({"path": expected["path"], "problem": "content-mismatch", "expectedSha256": expected.get("sha256"), "actualSha256": actual_sha, "expectedBytes": expected.get("bytes"), "actualBytes": path.stat().st_size})
            else:
                verified_bytes += path.stat().st_size
        component_expected = component_verified = component_missing = component_mismatched = component_bytes = 0
        component_problems = []
        for component in source.get("componentCandidates") or []:
            value = component.get("absolutePath") or component.get("path")
            expected_sha = component.get("sha256")
            if not value or not expected_sha:
                continue
            component_expected += 1
            path = Path(value)
            if not path.is_file():
                component_missing += 1
                component_problems.append({"id": component.get("id"), "path": value, "problem": "missing", "expectedSha256": expected_sha})
                continue
            actual_sha = digest(path)
            if actual_sha != expected_sha or (component.get("bytes") is not None and path.stat().st_size != component["bytes"]):
                component_mismatched += 1
                component_problems.append({"id": component.get("id"), "path": value, "problem": "content-mismatch", "expectedSha256": expected_sha, "actualSha256": actual_sha})
            else:
                component_verified += 1
                component_bytes += path.stat().st_size
        all_verified = missing == 0 and mismatched == 0 and checked == len(manifest.get("files", [])) and checked > 0
        rows.append({
            "sourceId": source["id"],
            "localAbsolutePath": str(root.resolve()),
            "expectedFiles": len(manifest.get("files", [])),
            "verifiedFiles": checked - mismatched,
            "verifiedBytes": verified_bytes,
            "missingFiles": missing,
            "mismatchedFiles": mismatched,
            "allManifestFilesVerified": all_verified,
            "verificationState": "all-enumerated-files-verified" if all_verified else ("no-enumerated-files" if not manifest.get("files") else "incomplete-or-mismatched"),
            "problems": problems,
            "componentFilesExpected": component_expected,
            "componentFilesVerified": component_verified,
            "componentVerifiedBytes": component_bytes,
            "componentMissingFiles": component_missing,
            "componentMismatchedFiles": component_mismatched,
            "allEnumeratedComponentsVerified": component_expected > 0 and component_expected == component_verified,
            "componentProblems": component_problems,
        })
    summary = {
        "state": "complete",
        "sourcesChecked": len(rows),
        "sourcesFullyVerified": sum(r["allManifestFilesVerified"] for r in rows),
        "expectedFiles": sum(r["expectedFiles"] for r in rows),
        "verifiedFiles": sum(r["verifiedFiles"] for r in rows),
        "verifiedBytes": sum(r["verifiedBytes"] or 0 for r in rows),
        "missingFiles": sum(r["missingFiles"] for r in rows),
        "mismatchedFiles": sum(r["mismatchedFiles"] for r in rows),
        "componentFilesExpected": sum(r["componentFilesExpected"] for r in rows),
        "componentFilesVerified": sum(r["componentFilesVerified"] for r in rows),
        "componentVerifiedBytes": sum(r["componentVerifiedBytes"] for r in rows),
        "componentMissingFiles": sum(r["componentMissingFiles"] for r in rows),
        "componentMismatchedFiles": sum(r["componentMismatchedFiles"] for r in rows),
    }
    return {
        "schema": RECEIPT_SCHEMA,
        "inputSha256": {"downloadSources": sha(DOWNLOAD_SOURCES), "publicSourceFiles": sha(PUBLIC_FILES)},
        "scope": "All acquired sources in the four-kind community/MOD inventory; every authoritative manifest member is checked.",
        "summary": summary,
        "sources": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = verify()
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not LOCAL_RECEIPT.exists() or LOCAL_RECEIPT.read_text() != encoded:
            raise ValueError("local verification receipt is stale")
    else:
        LOCAL_RECEIPT.parent.mkdir(parents=True, exist_ok=True)
        LOCAL_RECEIPT.write_text(encoded)
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))
