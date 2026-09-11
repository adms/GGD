#!/usr/bin/env python3
"""Merge a Windows asset-container metadata scan into the game source index."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from build_windows_game_inventory import markdown


REQUIRED_FILES = (
    "game-file-summaries.csv",
    "asset-container-files.csv",
    "scan-receipt.json",
)
OPTIONAL_FILES = ("scan-errors.csv",)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def integer(value: object) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return 0


def boolean(value: object) -> bool:
    return str(value).strip().casefold() in {"true", "1", "yes"}


def path_key(value: object) -> str:
    return str(value or "").replace("/", "\\").rstrip("\\").casefold()


def split_hints(value: object) -> list[str]:
    return [part.strip() for part in str(value or "").split(";") if part.strip()]


def parse_top_extensions(value: object) -> list[dict[str, object]]:
    try:
        parsed = json.loads(str(value or "[]"))
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, dict):
        parsed = [parsed]
    return [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []


def summary_key(row: dict[str, object]) -> tuple[str, str, str]:
    return (
        str(row.get("SourceKind") or ""),
        str(row.get("AppId") or ""),
        path_key(row.get("FullPath")),
    )


def candidate_key(row: dict[str, object]) -> tuple[str, str, str]:
    source_kind = str(row.get("SourceKind") or "")
    app_id = str(row.get("AppId") or "")
    full_path = path_key(row.get("FullPath"))
    relative_path = path_key(row.get("RelativePath"))
    if relative_path and full_path.endswith("\\" + relative_path):
        full_path = full_path[: -(len(relative_path) + 1)]
    return source_kind, app_id, full_path


def source_files(scan_dir: Path) -> list[dict[str, object]]:
    missing = [name for name in REQUIRED_FILES if not (scan_dir / name).is_file()]
    if missing:
        raise ValueError(f"container scan is missing required files: {', '.join(missing)}")
    return [
        {"name": name, "path": str((scan_dir / name).resolve()), "bytes": (scan_dir / name).stat().st_size,
         "sha256": sha256(scan_dir / name)}
        for name in REQUIRED_FILES + OPTIONAL_FILES
        if (scan_dir / name).is_file()
    ]


def choose_base_record(index: dict, scan: dict[str, object]) -> dict | None:
    source_kind = str(scan.get("sourceKind") or "")
    scan_path = path_key(scan.get("sourcePath"))
    app_id = str(scan.get("appId") or "")
    if source_kind == "steam-install":
        candidates = [row for row in index.get("steamGames", []) if str(row.get("appId") or "") == app_id]
    else:
        candidates = list(index.get("directoryCollections", []))
    for row in candidates:
        if path_key(row.get("sourcePath")) == scan_path:
            return row
    if len(candidates) == 1:
        return candidates[0]
    title = str(scan.get("title") or "").casefold()
    titled = [row for row in candidates if str(row.get("title") or "").casefold() == title]
    return titled[0] if len(titled) == 1 else None


def normalize_candidate(row: dict[str, str]) -> dict[str, object]:
    return {
        "sourceKind": row.get("SourceKind") or None,
        "appId": row.get("AppId") or None,
        "buildId": row.get("BuildId") or None,
        "gameTitle": row.get("GameTitle") or None,
        "installDirectory": row.get("InstallDirectory") or None,
        "assetKind": row.get("AssetKind") or None,
        "extension": (row.get("Extension") or "").casefold(),
        "sizeBytes": integer(row.get("SizeBytes")),
        "relativePath": row.get("RelativePath") or None,
        "sourcePath": row.get("FullPath") or None,
        "lastWriteTimeUtc": row.get("LastWriteTimeUtc") or None,
        "sha256": row.get("Sha256") or None,
        "contentRead": boolean(row.get("ContentRead")),
        "inventoryStatus": row.get("Status") or "metadata-only-container-candidate",
    }


def merge(
    base_index: dict,
    scan_dir: Path,
    source_zip: Path | None = None,
    backup_manifest: Path | None = None,
) -> tuple[dict, dict]:
    files = source_files(scan_dir)
    receipt = json.loads((scan_dir / "scan-receipt.json").read_text(encoding="utf-8-sig"))
    game_rows = load_csv(scan_dir / "game-file-summaries.csv")
    candidate_rows = load_csv(scan_dir / "asset-container-files.csv")
    error_path = scan_dir / "scan-errors.csv"
    error_rows = load_csv(error_path) if error_path.is_file() and error_path.stat().st_size else []

    candidates_by_game: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in candidate_rows:
        candidates_by_game[candidate_key(row)].append(row)

    normalized_games = []
    matched_ids: list[str] = []
    unmatched = []
    for row in game_rows:
        candidates = candidates_by_game.get(summary_key(row), [])
        kind_counts = Counter(candidate.get("AssetKind") or "unknown" for candidate in candidates)
        extension_counts = Counter((candidate.get("Extension") or "").casefold() for candidate in candidates)
        normalized = {
            "sourceKind": row.get("SourceKind") or None,
            "appId": row.get("AppId") or None,
            "buildId": row.get("BuildId") or None,
            "title": row.get("Title") or row.get("InstallDirectory") or "unknown",
            "installDirectory": row.get("InstallDirectory") or None,
            "sourcePath": row.get("FullPath") or None,
            "fileCount": integer(row.get("FileCount")),
            "logicalFileBytes": integer(row.get("TotalBytes")),
            "assetContainerCandidateCount": integer(row.get("AssetContainerCandidateCount")),
            "engineHints": split_hints(row.get("EngineHints")),
            "topExtensions": parse_top_extensions(row.get("TopExtensionsJson")),
            "assetKindCounts": dict(sorted(kind_counts.items())),
            "candidateExtensionCounts": dict(sorted(extension_counts.items())),
            "manifestMatched": boolean(row.get("ManifestMatched")) if row.get("ManifestMatched") else None,
            "inventoryStatus": row.get("InventoryStatus") or "metadata-only-files-enumerated",
            "contentInspected": boolean(row.get("ContentInspected")),
            "payloadBytesRead": integer(row.get("PayloadBytesRead")),
        }
        target = choose_base_record(base_index, normalized)
        if target is None:
            unmatched.append(normalized)
        else:
            target["containerInventoryStatus"] = normalized["inventoryStatus"]
            target["containerInventory"] = normalized
            matched_ids.append(str(target.get("id")))
        normalized_games.append(normalized)

    generated_at = receipt.get("generatedAt") or datetime.now(timezone.utc).isoformat()
    source = {
        "generatedAt": generated_at,
        "receipt": receipt,
        "files": files,
        "zip": ({"path": str(source_zip.resolve()), "bytes": source_zip.stat().st_size,
                 "sha256": sha256(source_zip)} if source_zip else None),
        "s3Backup": (json.loads(backup_manifest.read_text(encoding="utf-8-sig"))
                     if backup_manifest else None),
    }
    summary = {
        "gameRecordCount": len(normalized_games),
        "matchedCatalogRecordCount": len(matched_ids),
        "unmatchedGameRecordCount": len(unmatched),
        "filesEnumerated": integer(receipt.get("filesEnumerated")),
        "logicalFileBytes": integer(receipt.get("logicalFileBytes")),
        "assetContainerCandidateCount": len(candidate_rows),
        "scanErrorCount": len(error_rows),
        "payloadBytesRead": integer(receipt.get("payloadBytesRead")),
        "contentHashesComputed": integer(receipt.get("contentHashesComputed")),
        "elapsedSeconds": receipt.get("elapsedSeconds"),
        "entriesPerSecond": receipt.get("entriesPerSecond"),
    }
    base_index["containerInventory"] = {
        "schema": "ggd-windows-asset-container-inventory-summary@1",
        "generatedAt": generated_at,
        "status": "metadata-only-container-inventory",
        "doesNotMean": ["payload-extracted", "asset-identity-verified", "converted", "accepted",
                        "registered", "switchable", "deployed"],
        "source": source,
        "summary": summary,
        "matchedCatalogRecordIds": matched_ids,
        "unmatchedGames": unmatched,
    }
    base_index.setdefault("summary", {}).update({
        "containerGameRecordCount": len(normalized_games),
        "containerMatchedCatalogRecordCount": len(matched_ids),
        "assetContainerCandidateCount": len(candidate_rows),
    })
    detail = {
        "schema": "ggd-windows-asset-container-inventory-detail@1",
        "generatedAt": generated_at,
        "source": source,
        "summary": summary,
        "games": normalized_games,
        "candidateFiles": [normalize_candidate(row) for row in candidate_rows],
        "scanErrors": error_rows,
    }
    return base_index, detail


def write_jsonl_gzip(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("wb") as raw_handle:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw_handle, mtime=0) as gzip_handle:
            with io.TextIOWrapper(gzip_handle, encoding="utf-8", newline="\n") as text_handle:
                for row in rows:
                    text_handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-json", type=Path, required=True)
    parser.add_argument("--scan-dir", type=Path, required=True)
    parser.add_argument("--source-zip", type=Path)
    parser.add_argument("--backup-manifest", type=Path)
    parser.add_argument("--local-output", type=Path, required=True)
    parser.add_argument("--git-json", type=Path, required=True)
    parser.add_argument("--git-markdown", type=Path, required=True)
    args = parser.parse_args()

    base_index = json.loads(args.base_json.read_text(encoding="utf-8"))
    merged, detail = merge(
        base_index,
        args.scan_dir.resolve(),
        args.source_zip.resolve() if args.source_zip else None,
        args.backup_manifest.resolve() if args.backup_manifest else None,
    )
    args.local_output.mkdir(parents=True, exist_ok=True)
    args.git_json.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
    args.git_json.write_text(payload, encoding="utf-8")
    args.git_markdown.write_text(markdown(merged), encoding="utf-8")
    (args.local_output / "game-library-index.json").write_text(payload, encoding="utf-8")
    detail_without_files = {key: value for key, value in detail.items() if key != "candidateFiles"}
    (args.local_output / "asset-container-index.json").write_text(
        json.dumps(detail_without_files, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_jsonl_gzip(args.local_output / "asset-container-files.jsonl.gz", detail["candidateFiles"])
    print(json.dumps(detail["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
