#!/usr/bin/env python3
"""Locate inventoried FUC PSP payloads across read-only library roots.

The scanner does not copy, extract, mount, or modify a source.  It only hashes a
file after both its basename and recorded size match the Windows inventory row.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
DEFAULT_CONFIG = HERE / "platform-config.json"
DEFAULT_INVENTORY = REPO / "materials/hero-model-library/source-inventories/windows-game-library.json.gz"


def read_json(path: Path) -> dict[str, Any]:
    payload = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json.loads(payload.decode("utf-8-sig"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def expected_payloads(config: dict[str, Any], inventory: dict[str, Any]) -> list[dict[str, Any]]:
    rows = {row["id"]: row for row in inventory.get("romCandidates", [])}
    expected = []
    for spec in config["inventoryCandidates"]:
        source = rows.get(spec["inventoryId"])
        if source is None:
            raise ValueError("Missing Windows inventory row: " + spec["inventoryId"])
        expected.append({
            "sourceId": spec["sourceId"],
            "inventoryId": spec["inventoryId"],
            "releasePlatform": spec["releasePlatform"],
            "region": spec["region"],
            "container": spec["container"],
            "expectedBasename": Path(source["fileName"]).name,
            "expectedBytes": source["sizeBytes"],
            "windowsSourcePath": source["sourcePath"],
        })
    return expected


def scan_roots(roots: list[Path], expected: list[dict[str, Any]]) -> dict[str, Any]:
    by_name: dict[str, list[dict[str, Any]]] = {}
    for row in expected:
        by_name.setdefault(row["expectedBasename"].casefold(), []).append(row)

    root_rows = []
    matches: dict[str, list[dict[str, Any]]] = {row["sourceId"]: [] for row in expected}
    name_size_mismatches: list[dict[str, Any]] = []
    for root in roots:
        resolved = root.expanduser().resolve()
        root_evidence = {
            "root": str(resolved),
            "exists": resolved.is_dir(),
            "filesVisited": 0,
            "directoriesVisited": 0,
            "permissionErrors": 0,
        }
        if not resolved.is_dir():
            root_rows.append(root_evidence)
            continue

        def onerror(_error: OSError) -> None:
            root_evidence["permissionErrors"] += 1

        for current, directories, files in os.walk(resolved, topdown=True, followlinks=False, onerror=onerror):
            directories[:] = sorted(
                name for name in directories
                if not (Path(current) / name).is_symlink()
            )
            root_evidence["directoriesVisited"] += 1
            for name in sorted(files):
                root_evidence["filesVisited"] += 1
                candidates = by_name.get(name.casefold())
                if not candidates:
                    continue
                path = Path(current) / name
                if path.is_symlink() or not path.is_file():
                    continue
                actual_bytes = path.stat().st_size
                for wanted in candidates:
                    if actual_bytes != wanted["expectedBytes"]:
                        name_size_mismatches.append({
                            "sourceId": wanted["sourceId"],
                            "absolutePath": str(path),
                            "expectedBytes": wanted["expectedBytes"],
                            "actualBytes": actual_bytes,
                        })
                        continue
                    matches[wanted["sourceId"]].append({
                        "absolutePath": str(path),
                        "bytes": actual_bytes,
                        "sha256": sha256(path),
                        "matchBasis": "case-insensitive-basename-and-exact-recorded-size",
                        "sourceReadOnly": True,
                        "contentInspected": False,
                        "extractionStatus": "not-started",
                        "conversionStatus": "not-started",
                    })
        root_rows.append(root_evidence)

    candidates = []
    for row in expected:
        found = matches[row["sourceId"]]
        candidates.append({
            **row,
            "matches": found,
            "matchCount": len(found),
            "payloadLocated": bool(found),
            "payloadBytesRead": sum(match["bytes"] for match in found),
            "acquisitionStatus": "payload-located-hashed-uninspected" if found else "inventory-metadata-only",
        })
    return {
        "schema": "ggd-fuc-local-payload-scan@1",
        "scope": {
            "readOnly": True,
            "copiesCreated": 0,
            "filesExtracted": 0,
            "contentInspectionPerformed": False,
            "matchRequiresBasenameAndRecordedSize": True,
        },
        "roots": root_rows,
        "candidates": candidates,
        "nameSizeMismatches": name_size_mismatches,
        "summary": {
            "rootsRequested": len(roots),
            "rootsReadable": sum(row["exists"] for row in root_rows),
            "filesVisited": sum(row["filesVisited"] for row in root_rows),
            "directoriesVisited": sum(row["directoriesVisited"] for row in root_rows),
            "permissionErrors": sum(row["permissionErrors"] for row in root_rows),
            "expectedPayloads": len(expected),
            "exactPayloadMatches": sum(row["matchCount"] for row in candidates),
            "nameSizeMismatches": len(name_size_mismatches),
            "payloadBytesRead": sum(row["payloadBytesRead"] for row in candidates),
            "filesExtracted": 0,
            "filesConverted": 0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", action="append", type=Path, required=True,
                        help="Library root to scan; repeat for each mounted disk/share")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = scan_roots(args.root, expected_payloads(read_json(args.config), read_json(args.inventory)))
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    main()
