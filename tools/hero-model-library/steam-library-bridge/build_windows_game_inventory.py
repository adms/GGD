#!/usr/bin/env python3
"""Normalize a Windows Steam/ROM scan into durable GGD source inventory files."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


PRIORITY_PATTERNS = (
    ("infinity-strash", re.compile(r"infinity\s*strash|\\strash(?:\\|$)|無限神速斬", re.I)),
    ("jump-force", re.compile(r"jump\s*force", re.I)),
    ("jump-crossover", re.compile(r"jump\s*force|j-?stars(?:\s+victory)?", re.I)),
    ("kof", re.compile(r"king[\s_-]*of[\s_-]*fighters|(?:^|[^a-z])kof", re.I)),
    ("kof-3d", re.compile(r"king[\s_-]*of[\s_-]*fighters.{0,20}(?:xiv|xv|maximum\s*impact)|kof(?:xiv|xv)|maximum\s*impact", re.I)),
    ("fate-unlimited-codes", re.compile(r"fate.{0,24}unlimited|unlimited.{0,12}codes", re.I)),
    ("fate-series", re.compile(r"(?:^|[\\ /])fate(?:[/\\_-]|\s*/)|fatal.?fake|tiger.?colosseum", re.I)),
    ("smash-bros", re.compile(r"super.?smash|全明星大亂鬥|任天堂.*大亂鬥", re.I)),
    ("magical-battle-arena", re.compile(r"magical\s*battle\s*arena|魔法少女武鬥祭", re.I)),
    ("300-heroes", re.compile(r"300\s*(?:heroes|英雄)", re.I)),
    ("palworld", re.compile(r"palworld|\\Palworld(?:\\|$)|\\PalServer(?:\\|$)|幻獸帕魯", re.I)),
)

PLATFORM_PATH_HINTS = (
    (re.compile(r"(?:^|\\)PSP(?:\\|$)|ppsspp", re.I), "Sony PSP"),
    (re.compile(r"(?:^|\\)(?:PSV|PSVita|Vita3K)(?:\\|$)", re.I), "Sony PS Vita"),
    (re.compile(r"(?:^|\\)(?:PS3|RPCS3)(?:\\|$)", re.I), "Sony PlayStation 3"),
    (re.compile(r"(?:^|\\)(?:PS2|PCSX2)(?:\\|$)", re.I), "Sony PlayStation 2"),
    (re.compile(r"(?:^|\\)(?:PSX|PS1|DuckStation)(?:\\|$)", re.I), "Sony PlayStation"),
    (re.compile(r"(?:^|\\)(?:NSandNS2|Switch|Yuzu|Ryujinx)(?:\\|$)", re.I), "Nintendo Switch"),
    (re.compile(r"(?:^|\\)(?:WiiU|Cemu)(?:\\|$)", re.I), "Nintendo Wii U"),
    (re.compile(r"(?:^|\\)(?:Wii|GameCube|Dolphin)(?:\\|$)", re.I), "Nintendo GameCube/Wii"),
    (re.compile(r"(?:^|\\)(?:N64|Mupen)(?:\\|$)", re.I), "Nintendo 64"),
    (re.compile(r"(?:^|\\)SFC(?:\\|$)", re.I), "Super Nintendo"),
    (re.compile(r"(?:^|\\)GBC(?:\\|$)", re.I), "Game Boy Color"),
    (re.compile(r"(?:^|\\)Sega Game Gear(?:\\|$)", re.I), "Sega Game Gear"),
    (re.compile(r"(?:^|\\)SS(?:\\|$)", re.I), "Sega Saturn"),
    (re.compile(r"(?:^|\\)Geo Pocket Color(?:\\|$)", re.I), "Neo Geo Pocket Color"),
    (re.compile(r"NeoRAGEx|(?:^|\\)NEO GEO(?:\\|$)", re.I), "Neo Geo/Arcade"),
    (re.compile(r"mame|(?:^|\\)街機(?:\\|$)", re.I), "Arcade"),
    (re.compile(r"Dreamcast|Flycast|Redream", re.I), "Sega Dreamcast"),
)

EXTENSION_PLATFORMS = {
    ".xci": "Nintendo Switch",
    ".nsp": "Nintendo Switch",
    ".nsz": "Nintendo Switch",
    ".xcz": "Nintendo Switch",
    ".wux": "Nintendo Wii U",
    ".wud": "Nintendo Wii U",
    ".rpx": "Nintendo Wii U",
    ".rvz": "Nintendo GameCube/Wii",
    ".wbfs": "Nintendo Wii",
    ".wia": "Nintendo GameCube/Wii",
    ".gcz": "Nintendo GameCube/Wii",
    ".gcm": "Nintendo GameCube",
    ".z64": "Nintendo 64",
    ".n64": "Nintendo 64",
    ".v64": "Nintendo 64",
    ".nds": "Nintendo DS",
    ".3ds": "Nintendo 3DS",
    ".cci": "Nintendo 3DS",
    ".cia": "Nintendo 3DS",
    ".gba": "Game Boy Advance",
    ".gbc": "Game Boy Color",
    ".gb": "Game Boy",
    ".nes": "Nintendo Entertainment System",
    ".fds": "Famicom Disk System",
    ".sfc": "Super Nintendo",
    ".smc": "Super Nintendo",
    ".md": "Sega Mega Drive",
    ".gen": "Sega Mega Drive",
    ".sms": "Sega Master System",
    ".gg": "Sega Game Gear",
    ".32x": "Sega 32X",
    ".cso": "Sony PSP",
    ".vpk": "Sony PS Vita",
    ".gdi": "Sega Dreamcast",
    ".cdi": "Sega Dreamcast",
}

ARCHIVE_EXTENSIONS = {".zip", ".7z", ".rar"}

STEAM_APP_NOTES = {
    "1623730": {
        "catalogRole": "game-asset-source",
        "sourceWork": "Palworld / 幻獸帕魯",
        "priorityCharacters": ["空渦龍 / Jetragon", "枯星龍 / Astralym", "搗蛋貓 / Cattiva"],
        "expectedContainerKinds": ["Unreal pak", "Unreal IoStore", "Wwise audio bank"],
        "containerInventoryStatus": "not-scanned-inside-install",
        "note": "遊戲本體安裝已建檔；尚未取得安裝目錄內逐檔清單，不能宣稱已擷取角色素材。",
    },
    "2394010": {
        "catalogRole": "dedicated-server",
        "sourceWork": "Palworld Dedicated Server",
        "priorityCharacters": [],
        "expectedContainerKinds": [],
        "containerInventoryStatus": "not-required-for-character-assets",
        "note": "專用伺服器與遊戲本體分開記錄；不把伺服器安裝誤列為角色素材來源。",
    },
}


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bool_value(value: object) -> bool:
    return str(value).strip().casefold() in {"true", "1", "yes"}


def int_value(value: object) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def slug(value: str) -> str:
    cooked = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return cooked or hashlib.sha256(value.encode()).hexdigest()[:16]


def display_title(raw_title: str | None, install_directory: str | None) -> tuple[str, str | None]:
    """Prefer a legible directory name when a VDF title was decoded incorrectly."""
    raw_title = (raw_title or "").strip()
    install_directory = (install_directory or "").strip()
    suspicious = "�" in raw_title or raw_title.count("?") >= 2
    if suspicious and install_directory:
        return install_directory, raw_title
    return raw_title or install_directory or "未知 Steam 遊戲", None


def tags(text: str) -> list[str]:
    return [name for name, pattern in PRIORITY_PATTERNS if pattern.search(text)]


def platform_for(row: dict[str, str]) -> tuple[str, list[str]]:
    relative = row.get("RelativePath", "")
    extension = row.get("Extension", "").casefold()
    evidence: list[str] = []
    platform = None
    if extension in EXTENSION_PLATFORMS:
        platform = EXTENSION_PLATFORMS[extension]
        evidence.append(f"extension:{extension}")
    for pattern, candidate in PLATFORM_PATH_HINTS:
        if pattern.search(relative):
            if platform is None or extension in {".iso", ".zip", ".7z", ".rar", ".pkg", ".cue", ".chd"}:
                platform = candidate
            evidence.append(f"path:{candidate}")
            break
    return platform or "待確認", evidence


def classify_rom(row: dict[str, str], platform: str) -> tuple[str, str | None]:
    extension = row.get("Extension", "").casefold()
    relative = row.get("RelativePath", "")
    filename = row.get("FileName", "")
    if extension == ".md" and (filename.casefold() in {"readme.md", "license.md"} or "\\ROM\\" not in relative.upper()):
        return "excluded-non-rom", "Markdown document, not a verified Mega Drive ROM"
    under_emulator = relative.startswith("模擬器\\")
    if extension in EXTENSION_PLATFORMS:
        return "rom-high-confidence", None
    if under_emulator and platform != "待確認":
        return "rom-high-confidence", None
    if under_emulator:
        return "rom-candidate", "Archive or disc image under emulator library; payload not inspected"
    if extension in ARCHIVE_EXTENSIONS:
        return "archive-unverified", "Archive outside emulator library; may be a game, tool, or asset pack"
    return "rom-candidate", "Platform or payload remains unverified"


def normalize(scan_dir: Path, source_zip: Path | None, backup_manifest: Path | None = None) -> dict:
    receipt = json.loads((scan_dir / "scan-receipt.json").read_text(encoding="utf-8-sig"))
    steam_dirs = load_csv(scan_dir / "steam-games.csv")
    manifests = load_csv(scan_dir / "steam-manifests.csv")
    raw_roms = load_csv(scan_dir / "rom-files.csv")
    raw_directories = load_csv(scan_dir / "game-directories.csv")
    manifest_by_dir = {row.get("InstallDir", "").casefold(): row for row in manifests if row.get("InstallDir")}

    steam_games = []
    matched_manifests: set[str] = set()
    for row in steam_dirs:
        manifest = manifest_by_dir.get(row.get("Name", "").casefold())
        if manifest:
            matched_manifests.add(manifest.get("Manifest", ""))
        title, raw_manifest_title = display_title((manifest or {}).get("Name"), row.get("Name"))
        combined_text = " ".join(filter(None, (title, row.get("Name"), row.get("FullPath"))))
        app_id = (manifest or {}).get("AppId") or None
        app_notes = STEAM_APP_NOTES.get(app_id or "", {})
        steam_games.append({
            "id": f"steam:{app_id}" if app_id else f"steam-dir:{slug(row.get('Name', 'unknown'))}",
            "sourceKind": "steam-install",
            "title": title,
            "installDirectory": row.get("Name"),
            "appId": app_id,
            "buildId": (manifest or {}).get("BuildId") or None,
            "platform": "Windows (Steam)",
            "sourcePath": row.get("FullPath"),
            "manifestPath": (manifest or {}).get("Manifest") or None,
            "manifestMatched": bool(manifest),
            "rawManifestTitle": raw_manifest_title,
            "lastWriteTimeUtc": row.get("LastWriteTimeUtc"),
            "priorityTags": tags(combined_text),
            **app_notes,
            "inventoryStatus": "inventory-only",
            "extractionStatus": "not-started",
            "conversionStatus": "not-started",
            "integrationStatus": "not-registered",
        })

    orphan_manifests = []
    for row in manifests:
        if row.get("Manifest", "") in matched_manifests:
            continue
        app_id = row.get("AppId") or None
        title, raw_manifest_title = display_title(row.get("Name"), row.get("InstallDir"))
        app_notes = STEAM_APP_NOTES.get(app_id or "", {})
        orphan_manifests.append({
            "id": f"steam-manifest:{app_id}" if app_id else f"steam-manifest:{slug(row.get('Manifest', 'unknown'))}",
            "sourceKind": "steam-manifest-only",
            "title": title,
            "installDirectory": row.get("InstallDir") or None,
            "appId": app_id,
            "buildId": row.get("BuildId") or None,
            "platform": "Windows (Steam)",
            "sourcePath": None,
            "manifestPath": row.get("Manifest") or None,
            "manifestMatched": False,
            "rawManifestTitle": raw_manifest_title,
            "priorityTags": tags(" ".join(row.values())),
            **app_notes,
            "inventoryStatus": "manifest-only-install-directory-not-observed",
            "extractionStatus": "not-started",
            "conversionStatus": "not-started",
            "integrationStatus": "not-registered",
        })
    directory_collections = []
    for row in raw_directories:
        relative = row.get("RelativePath", "")
        parts = relative.split("\\") if relative else []
        if len(parts) == 1:
            kind = "game-root-child"
        elif len(parts) == 2 and parts[0] == "模擬器":
            kind = "emulator-platform-container"
        else:
            continue
        directory_collections.append({
            "id": f"windows-game-directory:{slug(relative)}",
            "sourceKind": "windows-game-directory",
            "title": row.get("Name"),
            "sourcePath": row.get("FullPath"),
            "relativePath": relative,
            "collectionKind": kind,
            "lastWriteTimeUtc": row.get("LastWriteTimeUtc"),
            "priorityTags": tags(" ".join(row.values())),
            "inventoryStatus": "directory-collection-only",
            "contentInspected": False,
        })
    rom_candidates = []
    excluded = []
    for index, row in enumerate(raw_roms, 1):
        platform, evidence = platform_for(row)
        classification, reason = classify_rom(row, platform)
        normalized = {
            "id": f"windows-rom-scan:{index:04d}",
            "sourceKind": "rom-or-game-archive",
            "title": row.get("Name") or row.get("FileName"),
            "fileName": row.get("FileName"),
            "extension": row.get("Extension", "").casefold(),
            "platform": platform,
            "platformEvidence": evidence,
            "sizeBytes": int_value(row.get("SizeBytes")),
            "sourcePath": row.get("FullPath"),
            "relativePath": row.get("RelativePath"),
            "lastWriteTimeUtc": row.get("LastWriteTimeUtc"),
            "priorityTags": tags(" ".join(row.values())),
            "classification": classification,
            "classificationNote": reason,
            "contentHash": None,
            "contentInspected": False,
            "inventoryStatus": "inventory-only",
            "extractionStatus": "not-started",
            "conversionStatus": "not-started",
            "integrationStatus": "not-registered",
        }
        (excluded if classification == "excluded-non-rom" else rom_candidates).append(normalized)

    all_rows = steam_games + orphan_manifests + rom_candidates + directory_collections
    priority_views = {
        tag: [row["id"] for row in all_rows if tag in row["priorityTags"]]
        for tag, _ in PRIORITY_PATTERNS
    }
    platform_counts = Counter(row["platform"] for row in rom_candidates)
    classification_counts = Counter(row["classification"] for row in rom_candidates)
    source_files = []
    for path in sorted(scan_dir.iterdir()):
        if path.is_file():
            source_files.append({"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)})

    observed_steam_roots = list(receipt.get("steamRoots") or [])
    if receipt.get("steamRoot") and receipt["steamRoot"] not in observed_steam_roots:
        observed_steam_roots.append(receipt["steamRoot"])
    observed_game_roots = list(receipt.get("gameRoots") or [])
    if receipt.get("gameRoot") and receipt["gameRoot"] not in observed_game_roots:
        observed_game_roots.append(receipt["gameRoot"])

    return {
        "schema": "ggd-windows-game-source-inventory@1",
        "generatedAt": receipt.get("generatedAt") or datetime.now(timezone.utc).isoformat(),
        "sourceScan": {
            "receipt": receipt,
            "zip": ({"path": str(source_zip), "bytes": source_zip.stat().st_size, "sha256": sha256(source_zip)}
                    if source_zip else None),
            "files": source_files,
            "s3Backup": (json.loads(backup_manifest.read_text(encoding="utf-8-sig"))
                         if backup_manifest else None),
        },
        "statusSemantics": {
            "current": "inventory-only",
            "doesNotMean": ["downloaded-to-mac", "extracted", "converted", "accepted", "registered", "switchable", "deployed"],
        },
        "sourceCoverage": {
            "observedSteamRoots": observed_steam_roots,
            "observedGameRoots": observed_game_roots,
            "coverageStatus": "receipt-roots-only",
            "note": "Only roots named by the source scan receipt are proven enumerated. Other disks or shares require a scan receipt of their own.",
        },
        "summary": {
            "steamInstallCount": len(steam_games),
            "steamManifestCount": len(manifests),
            "steamManifestWithoutDirectoryMatchCount": len(orphan_manifests),
            "steamDirectoryWithoutManifestCount": sum(not row["manifestMatched"] for row in steam_games),
            "rawRomCandidateCount": len(raw_roms),
            "rawDirectoryCount": len(raw_directories),
            "directoryCollectionCount": len(directory_collections),
            "normalizedRomCandidateCount": len(rom_candidates),
            "excludedFalsePositiveCount": len(excluded),
            "priorityRecordCount": sum(bool(row["priorityTags"]) for row in all_rows),
            "catalogRecordCount": len(steam_games) + len(orphan_manifests) + len(rom_candidates) + len(directory_collections),
            "platformCounts": dict(sorted(platform_counts.items())),
            "classificationCounts": dict(sorted(classification_counts.items())),
        },
        "priorityViews": priority_views,
        "steamGames": steam_games,
        "romCandidates": rom_candidates,
        "directoryCollections": directory_collections,
        "excludedCandidates": excluded,
        "orphanSteamManifests": orphan_manifests,
    }


def markdown(index: dict) -> str:
    summary = index["summary"]
    receipt = index.get("sourceScan", {}).get("receipt", {})
    lines = [
        "# Windows 遊戲來源盤點索引",
        "",
        f"產生時間：`{index['generatedAt']}`",
        "",
        "> 本索引只證明 Windows 遊戲庫中有對應安裝目錄或 ROM／封裝候選。尚未擷取、轉換、驗收、登記、切換或部署。",
        "",
        "## 摘要",
        "",
        f"- Steam 安裝：**{summary['steamInstallCount']}**",
        f"- Steam manifest：**{summary['steamManifestCount']}**",
        f"- 完整可查記錄：**{summary['catalogRecordCount']}**（Steam 目錄、manifest-only、ROM／封裝候選與入口集合）",
        f"- 原始 ROM／封裝候選：**{summary['rawRomCandidateCount']}**",
        f"- 原始目錄列：**{summary['rawDirectoryCount']}**；保留為入口集合：**{summary['directoryCollectionCount']}**",
        f"- 正規化候選：**{summary['normalizedRomCandidateCount']}**",
        f"- 排除明確假陽性：**{summary['excludedFalsePositiveCount']}**",
        f"- 優先來源命中記錄：**{summary['priorityRecordCount']}**",
        f"- 實際列舉：**{receipt.get('gameEntriesVisited', 0)}** entries；**{receipt.get('gameEntriesPerSecond', 0)} entries/s**",
        f"- 已證明掃描的 Steam root：**{len(index.get('sourceCoverage', {}).get('observedSteamRoots', []))}**",
        "",
        "> 掃描範圍以收據列出的 root 為準；未列入收據的其他硬碟或分享仍須補掃，不能由本表推定已涵蓋。",
        "",
        "### 已掃描根目錄",
        "",
    ]
    for root in index.get("sourceCoverage", {}).get("observedSteamRoots", []):
        lines.append(f"- Steam：`{root}`")
    for root in index.get("sourceCoverage", {}).get("observedGameRoots", []):
        lines.append(f"- 遊戲／模擬器：`{root}`")
    lines.extend([
        "",
        "## 優先來源",
        "",
        "| 群組 | 類型 | 名稱 | 平台 | 版本／大小 | Windows 路徑 |",
        "|---|---|---|---|---|---|",
    ])
    by_id = {
        row["id"]: row
        for row in index["steamGames"] + index["orphanSteamManifests"]
        + index["romCandidates"] + index.get("directoryCollections", [])
    }
    for tag, ids in index["priorityViews"].items():
        for row_id in ids:
            row = by_id[row_id]
            version = row.get("buildId") or row.get("sizeBytes") or ""
            source_path = row.get("sourcePath") or row.get("manifestPath") or ""
            platform = row.get("platform") or row.get("collectionKind") or ""
            lines.append(f"| {tag} | {row['sourceKind']} | {row['title']} | {platform} | {version} | `{source_path}` |")
    palworld_rows = [row for row in index["steamGames"] if "palworld" in row["priorityTags"]]
    container_inventory = index.get("containerInventory")
    if container_inventory:
        container_summary = container_inventory["summary"]
        lines.extend([
            "",
            "## 素材容器盤點",
            "",
            f"- 逐檔掃描遊戲：**{container_summary['gameRecordCount']}**",
            f"- 對應既有目錄：**{container_summary['matchedCatalogRecordCount']}**",
            f"- 素材容器／模型／音訊候選：**{container_summary['assetContainerCandidateCount']}**",
            f"- 掃描錯誤：**{container_summary['scanErrorCount']}**",
            f"- 實際讀取容器內容：**{container_summary['payloadBytesRead']} bytes**",
            "",
            "> 這一層只列出容器與素材候選的路徑、大小及引擎線索，尚未解包或確認角色身分。",
        ])
    palworld_scanned = any(
        row.get("catalogRole") == "game-asset-source"
        and row.get("containerInventoryStatus") == "metadata-only-files-enumerated"
        for row in palworld_rows
    )
    palworld_status_note = (
        "本體已完成安裝目錄逐檔 metadata 盤點；尚未解包 PAK、IoStore 或音訊容器。"
        if palworld_scanned
        else "目前尚未掃描安裝目錄內的 PAK、IoStore 或音訊容器。"
    )
    lines.extend([
        "",
        "## Palworld／幻獸帕魯",
        "",
        f"> 本體與 Dedicated Server 分開建檔。只有本體列為角色素材來源；{palworld_status_note}",
        "",
        "| 名稱 | App ID | Build ID | 用途 | 容器盤點 | 指定角色 | 路徑 |",
        "|---|---|---|---|---|---|---|",
    ])
    for row in palworld_rows:
        lines.append(
            f"| {row['title']} | {row['appId'] or ''} | {row['buildId'] or ''} | "
            f"{row.get('catalogRole', '')} | {row.get('containerInventoryStatus', '')} | "
            f"{', '.join(row.get('priorityCharacters', []))} | `{row['sourcePath']}` |"
        )
    lines.extend(["", "## 平台統計", "", "| 平台 | 候選數 |", "|---|---:|"])
    lines.extend(f"| {name} | {count} |" for name, count in summary["platformCounts"].items())
    lines.extend([
        "",
        "## Steam 安裝",
        "",
        f"安裝目錄缺 manifest：**{summary['steamDirectoryWithoutManifestCount']}**；只有 manifest、未觀察到安裝目錄：**{summary['steamManifestWithoutDirectoryMatchCount']}**。兩者均保留，不能以其中一方推定已完整安裝。",
        "",
        "| 名稱 | App ID | Build ID | manifest | 優先群組 | 路徑 |",
        "|---|---|---|---|---|---|",
    ])
    for row in index["steamGames"]:
        lines.append(f"| {row['title']} | {row['appId'] or ''} | {row['buildId'] or ''} | {'matched' if row['manifestMatched'] else 'missing'} | {', '.join(row['priorityTags'])} | `{row['sourcePath']}` |")
    lines.extend(["", "## Steam manifest-only 記錄", "", "| 名稱 | App ID | Build ID | 狀態 | manifest |", "|---|---|---|---|---|"])
    for row in index["orphanSteamManifests"]:
        lines.append(f"| {row['title']} | {row['appId'] or ''} | {row['buildId'] or ''} | {row['inventoryStatus']} | `{row['manifestPath'] or ''}` |")
    lines.extend(["", "## ROM／封裝候選", "", "| 名稱 | 平台 | 分類 | 大小 bytes | 優先群組 | 路徑 |", "|---|---|---|---:|---|---|"])
    for row in index["romCandidates"]:
        lines.append(f"| {row['title']} | {row['platform']} | {row['classification']} | {row['sizeBytes'] or ''} | {', '.join(row['priorityTags'])} | `{row['sourcePath']}` |")
    lines.extend(["", "## 遊戲庫入口集合", "", "| 名稱 | 類型 | 路徑 |", "|---|---|---|"])
    for row in index["directoryCollections"]:
        lines.append(f"| {row['title']} | {row['collectionKind']} | `{row['sourcePath']}` |")
    return "\n".join(lines) + "\n"


def write_csv(path: Path, rows: list[dict]) -> None:
    fields = sorted({key for row in rows for key in row if not isinstance(row[key], (list, dict))})
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan-dir", type=Path, required=True)
    parser.add_argument("--source-zip", type=Path)
    parser.add_argument("--backup-manifest", type=Path)
    parser.add_argument("--local-output", type=Path, required=True)
    parser.add_argument("--git-json", type=Path, required=True)
    parser.add_argument("--git-markdown", type=Path, required=True)
    args = parser.parse_args()
    index = normalize(
        args.scan_dir.resolve(),
        args.source_zip.resolve() if args.source_zip else None,
        args.backup_manifest.resolve() if args.backup_manifest else None,
    )
    args.local_output.mkdir(parents=True, exist_ok=True)
    args.git_json.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(index, ensure_ascii=False, indent=2) + "\n"
    args.git_json.write_text(payload, encoding="utf-8")
    args.git_markdown.write_text(markdown(index), encoding="utf-8")
    (args.local_output / "game-library-index.json").write_text(payload, encoding="utf-8")
    (args.local_output / "game-library-index.md").write_text(markdown(index), encoding="utf-8")
    write_csv(args.local_output / "steam-games.normalized.csv", index["steamGames"])
    write_csv(args.local_output / "steam-manifests-only.normalized.csv", index["orphanSteamManifests"])
    write_csv(args.local_output / "rom-candidates.normalized.csv", index["romCandidates"])
    (args.local_output / "latest.json").write_text(json.dumps({
        "schema": "ggd-windows-game-source-inventory-pointer@1",
        "generatedAt": index["generatedAt"],
        "index": str((args.local_output / "game-library-index.json").resolve()),
        "sourceScanGeneratedAt": index["sourceScan"]["receipt"].get("generatedAt"),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(index["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
