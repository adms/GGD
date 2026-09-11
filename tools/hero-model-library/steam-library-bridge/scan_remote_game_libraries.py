#!/usr/bin/env python3
"""Build durable Steam and emulator/ROM inventories without reading ROM payloads."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "ggd-remote-game-library-index@1"
PRIORITY = re.compile(
    r"jump\s*force|jump.*大亂鬥|king\s*of\s*fighters|\bkof|"
    r"infinity\s*strash|無限神速斬|fate.?unlimited.?codes?|"
    r"super\s*smash|smash\s*bros|任天堂.*大亂鬥",
    re.I,
)
FIELD = re.compile(r'^\s*"([^"]+)"\s+"([^"]*)"\s*$')

EXTENSION_PLATFORMS: dict[str, tuple[str, ...]] = {
    ".xci": ("Nintendo Switch",),
    ".nsp": ("Nintendo Switch",),
    ".nsz": ("Nintendo Switch",),
    ".xcz": ("Nintendo Switch",),
    ".wux": ("Nintendo Wii U",),
    ".wud": ("Nintendo Wii U",),
    ".rpx": ("Nintendo Wii U",),
    ".rvz": ("Nintendo GameCube/Wii",),
    ".wbfs": ("Nintendo Wii",),
    ".wia": ("Nintendo GameCube/Wii",),
    ".gcz": ("Nintendo GameCube/Wii",),
    ".gcm": ("Nintendo GameCube",),
    ".wad": ("Nintendo Wii",),
    ".z64": ("Nintendo 64",),
    ".n64": ("Nintendo 64",),
    ".v64": ("Nintendo 64",),
    ".nds": ("Nintendo DS",),
    ".3ds": ("Nintendo 3DS",),
    ".cci": ("Nintendo 3DS",),
    ".cia": ("Nintendo 3DS",),
    ".gba": ("Game Boy Advance",),
    ".gbc": ("Game Boy Color",),
    ".gb": ("Game Boy",),
    ".nes": ("Nintendo Entertainment System",),
    ".fds": ("Famicom Disk System",),
    ".sfc": ("Super Nintendo",),
    ".smc": ("Super Nintendo",),
    ".md": ("Sega Mega Drive",),
    ".gen": ("Sega Mega Drive",),
    ".sms": ("Sega Master System",),
    ".gg": ("Sega Game Gear",),
    ".32x": ("Sega 32X",),
    ".cso": ("Sony PSP",),
    ".pbp": ("Sony PSP/PlayStation",),
    ".vpk": ("Sony PS Vita",),
    ".gdi": ("Sega Dreamcast",),
    ".cdi": ("Sega Dreamcast",),
    ".chd": ("Compressed disc image",),
    ".cue": ("Disc image",),
    ".iso": ("Disc image",),
    ".pkg": ("Console package",),
    ".zip": ("Archived ROM",),
    ".7z": ("Archived ROM",),
    ".rar": ("Archived ROM",),
}

PATH_HINTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|[/ _.-])(psp|ppsspp)([/ _.-]|$)", re.I), "Sony PSP"),
    (re.compile(r"(^|[/ _.-])(ps\s*vita|psvita|vita3k)([/ _.-]|$)", re.I), "Sony PS Vita"),
    (re.compile(r"(^|[/ _.-])(ps3|rpcs3)([/ _.-]|$)", re.I), "Sony PlayStation 3"),
    (re.compile(r"(^|[/ _.-])(ps2|pcsx2)([/ _.-]|$)", re.I), "Sony PlayStation 2"),
    (re.compile(r"(^|[/ _.-])(ps1|psx|duckstation)([/ _.-]|$)", re.I), "Sony PlayStation"),
    (re.compile(r"(^|[/ _.-])(switch|yuzu|ryujinx)([/ _.-]|$)", re.I), "Nintendo Switch"),
    (re.compile(r"(^|[/ _.-])(wii\s*u|wiiu|cemu)([/ _.-]|$)", re.I), "Nintendo Wii U"),
    (re.compile(r"(^|[/ _.-])(gamecube|dolphin|wii)([/ _.-]|$)", re.I), "Nintendo GameCube/Wii"),
    (re.compile(r"(^|[/ _.-])(3ds|citra)([/ _.-]|$)", re.I), "Nintendo 3DS"),
    (re.compile(r"(^|[/ _.-])(n64|mupen)([/ _.-]|$)", re.I), "Nintendo 64"),
    (re.compile(r"(^|[/ _.-])(dreamcast|flycast|redream)([/ _.-]|$)", re.I), "Sega Dreamcast"),
    (re.compile(r"(^|[/ _.-])(saturn|yabause)([/ _.-]|$)", re.I), "Sega Saturn"),
    (re.compile(r"(^|[/ _.-])(arcade|mame|fbneo)([/ _.-]|$)", re.I), "Arcade"),
)

SKIP_DIRECTORIES = {
    "$recycle.bin",
    "system volume information",
    ".spotlight-v100",
    ".trashes",
    "shadercache",
    "cache",
    "logs",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_title(name: str) -> str:
    stem = Path(name).stem
    stem = re.sub(r"\s*[\[(](?:usa|europe|japan|world|asia|taiwan|rev[^\])]*|disc\s*\d+)[^\])]*[\])]\s*", " ", stem, flags=re.I)
    stem = re.sub(r"[_]+", " ", stem)
    return re.sub(r"\s+", " ", stem).strip() or name


def infer_platforms(relative_path: str, suffix: str) -> tuple[list[str], str]:
    hinted = [label for pattern, label in PATH_HINTS if pattern.search(relative_path)]
    extension = list(EXTENSION_PLATFORMS.get(suffix.lower(), ()))
    values: list[str] = []
    for value in hinted + extension:
        if value not in values:
            values.append(value)
    if hinted:
        return values, "path-and-extension" if extension else "path"
    return values, "extension" if extension else "unresolved"


def parse_steam_manifest(path: Path) -> tuple[dict, int]:
    payload = path.read_bytes()
    text = payload.decode("utf-8-sig", errors="replace")
    values: dict[str, str] = {}
    for line in text.splitlines():
        match = FIELD.match(line)
        if match:
            values[match.group(1).lower()] = match.group(2)
    match = re.search(r"appmanifest_(\d+)\.acf$", path.name, re.I)
    app_id = values.get("appid") or (match.group(1) if match else None)
    install_dir = values.get("installdir", "")
    return ({
        "recordType": "steam-install",
        "title": values.get("name") or install_dir or f"Steam app {app_id or 'unknown'}",
        "appId": app_id,
        "installDir": install_dir,
        "buildId": values.get("buildid"),
        "lastUpdated": values.get("lastupdated"),
        "stateFlags": values.get("stateflags"),
        "manifestPath": str(path),
        "inventoryMethod": "steam-appmanifest",
    }, len(payload))


def locate_manifest_root(root: Path) -> Path | None:
    candidates = (root, root / "steamapps")
    for candidate in candidates:
        if candidate.is_dir() and next(candidate.glob("appmanifest_*.acf"), None):
            return candidate
    return None


def scan_steam(root: Path) -> dict:
    started = time.monotonic()
    games: list[dict] = []
    errors: list[dict] = []
    content_bytes = 0
    entries = 0
    manifest_root = locate_manifest_root(root)
    if manifest_root:
        manifests = sorted(manifest_root.glob("appmanifest_*.acf"), key=lambda path: path.name.casefold())
        for manifest in manifests:
            entries += 1
            try:
                row, read_bytes = parse_steam_manifest(manifest)
                content_bytes += read_bytes
                game_path = manifest_root / "common" / row["installDir"]
                row.update({
                    "sourceRoot": str(root),
                    "gamePath": str(game_path),
                    "gameDirectoryPresent": game_path.is_dir(),
                    "prioritySource": bool(PRIORITY.search(f"{row['title']} {row['installDir']}")),
                })
                games.append(row)
            except OSError as error:
                errors.append({"path": str(manifest), "error": str(error)})
    else:
        try:
            with os.scandir(root) as listing:
                for entry in listing:
                    entries += 1
                    try:
                        if not entry.is_dir(follow_symlinks=False):
                            continue
                        games.append({
                            "recordType": "steam-install",
                            "title": entry.name,
                            "appId": None,
                            "installDir": entry.name,
                            "buildId": None,
                            "lastUpdated": None,
                            "stateFlags": None,
                            "manifestPath": None,
                            "sourceRoot": str(root),
                            "gamePath": entry.path,
                            "gameDirectoryPresent": True,
                            "inventoryMethod": "common-directory-name",
                            "prioritySource": bool(PRIORITY.search(entry.name)),
                        })
                    except OSError as error:
                        errors.append({"path": entry.path, "error": str(error)})
        except OSError as error:
            errors.append({"path": str(root), "error": str(error)})
    games.sort(key=lambda row: (not row["prioritySource"], row["title"].casefold()))
    elapsed = time.monotonic() - started
    return {
        "schema": "ggd-remote-steam-inventory@1",
        "generatedAt": utc_now(),
        "sourceRoot": str(root),
        "games": games,
        "errors": errors,
        "metrics": {
            "elapsedSeconds": round(elapsed, 6),
            "entriesVisited": entries,
            "entriesPerSecond": round(entries / elapsed, 3) if elapsed else None,
            "actualFileContentBytesRead": content_bytes,
            "actualFileContentMiBPerSecond": round(content_bytes / 1048576 / elapsed, 3) if elapsed else None,
        },
    }


def rom_row(root: Path, path: Path, stat: os.stat_result) -> dict:
    relative = str(path.relative_to(root))
    platforms, evidence = infer_platforms(relative, path.suffix)
    return {
        "recordType": "rom-or-console-package",
        "title": clean_title(path.name),
        "fileName": path.name,
        "extension": path.suffix.lower(),
        "platformCandidates": platforms,
        "platformEvidence": evidence,
        "sourceRoot": str(root),
        "relativePath": relative,
        "absolutePath": str(path),
        "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "prioritySource": bool(PRIORITY.search(relative)),
        "contentHash": None,
        "contentReadDuringInventory": False,
    }


def scan_roms(root: Path) -> dict:
    started = time.monotonic()
    stack = [root]
    games: list[dict] = []
    errors: list[dict] = []
    entries = 0
    directories = 0
    while stack:
        directory = stack.pop()
        directories += 1
        try:
            with os.scandir(directory) as listing:
                children = sorted(list(listing), key=lambda entry: entry.name.casefold(), reverse=True)
        except OSError as error:
            errors.append({"path": str(directory), "error": str(error)})
            continue
        for entry in children:
            entries += 1
            if entries % 1000 == 0:
                elapsed_now = time.monotonic() - started
                print(
                    f"[ROM] entries={entries} directories={directories} "
                    f"candidates={len(games)} elapsed={elapsed_now:.1f}s",
                    flush=True,
                )
            try:
                if entry.is_dir(follow_symlinks=False):
                    if entry.name.casefold() not in SKIP_DIRECTORIES:
                        stack.append(Path(entry.path))
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
                path = Path(entry.path)
                if path.suffix.lower() not in EXTENSION_PLATFORMS:
                    continue
                games.append(rom_row(root, path, entry.stat(follow_symlinks=False)))
            except OSError as error:
                errors.append({"path": entry.path, "error": str(error)})
    games.sort(key=lambda row: (not row["prioritySource"], row["title"].casefold(), row["relativePath"].casefold()))
    elapsed = time.monotonic() - started
    return {
        "schema": "ggd-emulator-rom-inventory@1",
        "generatedAt": utc_now(),
        "sourceRoot": str(root),
        "games": games,
        "errors": errors,
        "metrics": {
            "elapsedSeconds": round(elapsed, 6),
            "entriesVisited": entries,
            "directoriesVisited": directories,
            "entriesPerSecond": round(entries / elapsed, 3) if elapsed else None,
            "actualFileContentBytesRead": 0,
            "actualFileContentMiBPerSecond": None,
            "note": "ROM payloads were not opened; speed is metadata traversal rate only.",
        },
    }


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv_file(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            cooked = dict(row)
            if isinstance(cooked.get("platformCandidates"), list):
                cooked["platformCandidates"] = " | ".join(cooked["platformCandidates"])
            writer.writerow(cooked)


def escape_md(value: object) -> str:
    return str(value if value is not None else "").replace("|", "\\|").replace("\n", " ")


def write_markdown(path: Path, steam: dict, roms: dict, combined: dict) -> None:
    platforms = Counter(
        platform
        for row in roms["games"]
        for platform in (row["platformCandidates"] or ["待確認平台"])
    )
    lines = [
        "# Windows 遠端遊戲庫索引",
        "",
        f"產生時間：`{combined['generatedAt']}`",
        "",
        "本文件是唯讀目錄盤點，不代表素材已擷取、轉換、驗收、登記或上架。完整機器資料見同目錄 JSON／CSV。",
        "",
        "## 摘要",
        "",
        f"- Steam 安裝目錄：**{len(steam['games'])}**",
        f"- 模擬器／ROM 候選檔：**{len(roms['games'])}**",
        f"- 優先來源命中：**{sum(1 for row in combined['games'] if row['prioritySource'])}**",
        f"- 掃描錯誤：**{len(steam['errors']) + len(roms['errors'])}**",
        "",
        "## 掃描速度",
        "",
        f"- Steam：{steam['metrics']['elapsedSeconds']} 秒，{steam['metrics']['entriesVisited']} 筆，{steam['metrics']['entriesPerSecond']} 筆／秒；實際內容讀取 {steam['metrics']['actualFileContentBytesRead']} bytes。",
        f"- ROM：{roms['metrics']['elapsedSeconds']} 秒，{roms['metrics']['entriesVisited']} 筆，{roms['metrics']['entriesPerSecond']} 筆／秒；沒有額外打開 ROM 內容。",
        "",
        "## 平台候選",
        "",
        "| 平台 | 數量 |",
        "|---|---:|",
    ]
    lines.extend(f"| {escape_md(platform)} | {count} |" for platform, count in sorted(platforms.items()))
    lines.extend([
        "",
        "## Steam 遊戲",
        "",
        "| 優先 | 名稱 | App ID | Build ID | 盤點方式 | 路徑 |",
        "|---|---|---|---|---|---|",
    ])
    for row in steam["games"]:
        lines.append("| " + " | ".join(map(escape_md, (
            "是" if row["prioritySource"] else "",
            row["title"], row["appId"], row["buildId"], row["inventoryMethod"], row["gamePath"],
        ))) + " |")
    lines.extend([
        "",
        "## 模擬器與 ROM",
        "",
        "| 優先 | 名稱 | 平台候選 | 格式 | 大小 bytes | 相對路徑 |",
        "|---|---|---|---|---:|---|",
    ])
    for row in roms["games"]:
        lines.append("| " + " | ".join(map(escape_md, (
            "是" if row["prioritySource"] else "",
            row["title"], ", ".join(row["platformCandidates"]), row["extension"], row["sizeBytes"], row["relativePath"],
        ))) + " |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_steam_markdown(path: Path, steam: dict) -> None:
    lines = [
        "# Steam 遊戲清單",
        "",
        f"產生時間：`{steam['generatedAt']}`",
        "",
        f"共 **{len(steam['games'])}** 個安裝目錄；這是取得來源盤點，不代表素材已擷取或完成整合。",
        "",
        "| 優先 | 名稱 | App ID | Build ID | 盤點方式 | 路徑 |",
        "|---|---|---|---|---|---|",
    ]
    for row in steam["games"]:
        lines.append("| " + " | ".join(map(escape_md, (
            "是" if row["prioritySource"] else "",
            row["title"], row["appId"], row["buildId"], row["inventoryMethod"], row["gamePath"],
        ))) + " |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_rom_markdown(path: Path, roms: dict) -> None:
    lines = [
        "# 模擬器與 ROM 遊戲清單",
        "",
        f"產生時間：`{roms['generatedAt']}`",
        "",
        f"共 **{len(roms['games'])}** 個候選檔；掃描未打開 ROM 內容，平台不明者保留待確認。",
        "",
        "| 優先 | 名稱 | 平台候選 | 格式 | 大小 bytes | 相對路徑 |",
        "|---|---|---|---|---:|---|",
    ]
    for row in roms["games"]:
        lines.append("| " + " | ".join(map(escape_md, (
            "是" if row["prioritySource"] else "",
            row["title"], ", ".join(row["platformCandidates"]), row["extension"], row["sizeBytes"], row["relativePath"],
        ))) + " |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steam-root", type=Path, required=True)
    parser.add_argument("--rom-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    steam_root = args.steam_root.expanduser().resolve()
    rom_root = args.rom_root.expanduser().resolve()
    output = args.output_dir.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)

    overall_started = time.monotonic()
    print(f"[Steam] scanning {steam_root}", flush=True)
    steam = scan_steam(steam_root)
    print(f"[Steam] games={len(steam['games'])} errors={len(steam['errors'])}", flush=True)
    print(f"[ROM] scanning {rom_root}", flush=True)
    roms = scan_roms(rom_root)
    generated_at = utc_now()
    combined_games = [
        {"sourceKind": "steam", **row} for row in steam["games"]
    ] + [
        {"sourceKind": "emulator-rom", **row} for row in roms["games"]
    ]
    combined = {
        "schema": SCHEMA,
        "generatedAt": generated_at,
        "statusSemantics": {
            "current": "inventory-only",
            "doesNotMean": ["extracted", "converted", "accepted", "registered", "switchable", "deployed"],
        },
        "sourceRoots": {"steam": str(steam_root), "emulatorRoms": str(rom_root)},
        "summary": {
            "steamGameCount": len(steam["games"]),
            "romCandidateCount": len(roms["games"]),
            "priorityMatchCount": sum(1 for row in combined_games if row["prioritySource"]),
            "errorCount": len(steam["errors"]) + len(roms["errors"]),
        },
        "games": combined_games,
    }
    receipt = {
        "schema": "ggd-remote-game-library-scan-receipt@1",
        "generatedAt": generated_at,
        "scanner": str(Path(__file__).resolve()),
        "overallElapsedSeconds": round(time.monotonic() - overall_started, 6),
        "extraSpeedReadPerformed": False,
        "steamMetrics": steam["metrics"],
        "romMetrics": roms["metrics"],
        "outputs": [
            "steam-games.json", "steam-games.csv", "steam-games.md",
            "emulator-rom-games.json", "emulator-rom-games.csv", "emulator-rom-games.md",
            "game-library-index.json", "game-library-index.md", "scan-receipt.json",
        ],
    }

    write_json(output / "steam-games.json", steam)
    write_json(output / "emulator-rom-games.json", roms)
    write_json(output / "game-library-index.json", combined)
    write_json(output / "scan-receipt.json", receipt)
    write_csv_file(output / "steam-games.csv", steam["games"], [
        "prioritySource", "title", "appId", "buildId", "installDir", "inventoryMethod",
        "gameDirectoryPresent", "gamePath", "manifestPath", "sourceRoot",
    ])
    write_csv_file(output / "emulator-rom-games.csv", roms["games"], [
        "prioritySource", "title", "platformCandidates", "platformEvidence", "extension",
        "sizeBytes", "modifiedAt", "relativePath", "absolutePath", "sourceRoot",
    ])
    write_steam_markdown(output / "steam-games.md", steam)
    write_rom_markdown(output / "emulator-rom-games.md", roms)
    write_markdown(output / "game-library-index.md", steam, roms, combined)
    print(json.dumps(combined["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
