#!/usr/bin/env python3
"""Create a Windows-compatible container inventory for selected mounted games."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ASSET_EXTENSIONS = {
    ".pak", ".utoc", ".ucas", ".uasset", ".uexp", ".ubulk",
    ".bnk", ".wem", ".bank", ".fsb", ".pck", ".awb", ".acb", ".cpk",
    ".assets", ".ress", ".resource", ".bundle", ".unity3d",
    ".glb", ".gltf", ".fbx", ".obj", ".dae", ".pmx", ".pmd",
    ".mdl", ".mesh", ".skel", ".anim", ".hkx", ".wad", ".dat",
}

GAME_FIELDS = (
    "SourceKind", "SteamRoot", "AppId", "BuildId", "Title", "InstallDirectory",
    "FullPath", "FileCount", "TotalBytes", "AssetContainerCandidateCount", "EngineHints",
    "TopExtensionsJson", "ManifestMatched", "InventoryStatus", "ContentInspected",
    "PayloadBytesRead",
)
ASSET_FIELDS = (
    "SourceKind", "SteamRoot", "AppId", "BuildId", "GameTitle", "InstallDirectory",
    "AssetKind", "Extension", "SizeBytes", "RelativePath", "FullPath", "LastWriteTimeUtc",
    "Sha256", "ContentRead", "Status",
)
ERROR_FIELDS = ("Scope", "Path", "Error")


def load_catalog(path: Path) -> list[dict]:
    payload = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    data = json.loads(payload.decode("utf-8"))
    return data.get("steamGames", [])


def catalog_by_directory(rows: list[dict]) -> dict[str, dict]:
    result = {}
    for row in rows:
        directory = row.get("installDirectory") or row.get("installDir")
        if directory:
            result[str(directory).casefold()] = row
    return result


def asset_kind(extension: str) -> str:
    if extension in {".pak", ".utoc", ".ucas", ".uasset", ".uexp", ".ubulk"}:
        return "unreal-container-or-asset"
    if extension in {".bnk", ".wem"}:
        return "wwise-audio"
    if extension in {".bank", ".fsb"}:
        return "fmod-audio"
    if extension in {".cpk", ".awb", ".acb"}:
        return "criware-container-or-audio"
    if extension in {".assets", ".ress", ".resource", ".bundle", ".unity3d"}:
        return "unity-container-or-resource"
    if extension in {".wad", ".dat", ".pck"}:
        return "generic-game-container"
    return "model-animation-candidate"


def engine_hints(counts: Counter[str]) -> list[str]:
    result = []
    if any(counts[x] for x in (".pak", ".utoc", ".ucas", ".uasset")):
        result.append("Unreal Engine")
    if any(counts[x] for x in (".assets", ".ress", ".resource", ".bundle", ".unity3d")):
        result.append("Unity")
    if any(counts[x] for x in (".bnk", ".wem")):
        result.append("Wwise")
    if any(counts[x] for x in (".bank", ".fsb")):
        result.append("FMOD")
    if any(counts[x] for x in (".cpk", ".awb", ".acb")):
        result.append("CRIWARE")
    return result


def iso_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()


def iter_files(root: Path):
    """Yield path/stat pairs with one SMB metadata lookup per entry."""
    pending = [root]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                if entry.is_dir(follow_symlinks=False):
                    pending.append(Path(entry.path))
                elif entry.is_file(follow_symlinks=False):
                    yield Path(entry.path), entry.stat(follow_symlinks=False)


def write_csv(path: Path, fields: tuple[str, ...], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def scan(mount: Path, selected: list[str], catalog: list[dict]) -> tuple[list[dict], list[dict], list[dict], dict]:
    started = time.monotonic()
    mount = mount.resolve()
    catalog_rows = catalog_by_directory(catalog)
    games, assets, errors = [], [], []
    total_files = 0
    total_bytes = 0
    for directory_name in selected:
        game = mount / directory_name
        record = catalog_rows.get(directory_name.casefold(), {})
        if not game.is_dir():
            errors.append({"Scope": "steam-game", "Path": str(game), "Error": "path-not-found"})
            continue
        counts: Counter[str] = Counter()
        file_count = byte_count = 0
        game_assets = []
        try:
            for path, stat in iter_files(game):
                extension = path.suffix.casefold()
                counts[extension] += 1
                file_count += 1
                byte_count += stat.st_size
                if extension not in ASSET_EXTENSIONS:
                    continue
                game_assets.append({
                    "SourceKind": "steam-install",
                    "SteamRoot": str(mount),
                    "AppId": record.get("appId") or "",
                    "BuildId": record.get("buildId") or "",
                    "GameTitle": record.get("title") or directory_name,
                    "InstallDirectory": directory_name,
                    "AssetKind": asset_kind(extension),
                    "Extension": extension,
                    "SizeBytes": stat.st_size,
                    "RelativePath": str(path.relative_to(game)),
                    "FullPath": str(path),
                    "LastWriteTimeUtc": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                    "Sha256": "",
                    "ContentRead": False,
                    "Status": "metadata-only-container-candidate",
                })
        except OSError as error:
            errors.append({"Scope": "steam-game", "Path": str(game), "Error": str(error)})
            continue
        top = [{"extension": extension, "count": count} for extension, count in counts.most_common(25)]
        games.append({
            "SourceKind": "steam-install",
            "SteamRoot": str(mount),
            "AppId": record.get("appId") or "",
            "BuildId": record.get("buildId") or "",
            "Title": record.get("title") or directory_name,
            "InstallDirectory": directory_name,
            "FullPath": str(game),
            "FileCount": file_count,
            "TotalBytes": byte_count,
            "AssetContainerCandidateCount": len(game_assets),
            "EngineHints": "; ".join(engine_hints(counts)),
            "TopExtensionsJson": json.dumps(top, ensure_ascii=False, separators=(",", ":")),
            "ManifestMatched": bool(record),
            "InventoryStatus": "metadata-only-files-enumerated",
            "ContentInspected": False,
            "PayloadBytesRead": 0,
        })
        assets.extend(game_assets)
        total_files += file_count
        total_bytes += byte_count
    elapsed = time.monotonic() - started
    receipt = {
        "schema": "ggd-windows-asset-container-inventory-receipt@1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "computerName": "mounted-smb-source",
        "roots": [str(mount)],
        "selectedInstallDirectories": selected,
        "gameRecordCount": len(games),
        "filesEnumerated": total_files,
        "logicalFileBytes": total_bytes,
        "assetContainerCandidateCount": len(assets),
        "elapsedSeconds": round(elapsed, 3),
        "entriesPerSecond": round(total_files / elapsed, 2) if elapsed else None,
        "scanErrorCount": len(errors),
        "payloadBytesRead": 0,
        "contentHashesComputed": 0,
        "currentStatus": "metadata-only-container-inventory",
        "doesNotMean": ["payload-extracted", "asset-identity-verified", "converted", "accepted", "registered", "switchable", "deployed"],
    }
    return games, assets, errors, receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mount", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--include-dir", action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    games, assets, errors, receipt = scan(args.mount, args.include_dir, load_catalog(args.catalog))
    args.output.mkdir(parents=True, exist_ok=True)
    write_csv(args.output / "game-file-summaries.csv", GAME_FIELDS, games)
    write_csv(args.output / "asset-container-files.csv", ASSET_FIELDS, assets)
    write_csv(args.output / "scan-errors.csv", ERROR_FIELDS, errors)
    (args.output / "scan-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
