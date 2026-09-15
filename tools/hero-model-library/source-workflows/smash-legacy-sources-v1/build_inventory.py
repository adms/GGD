#!/usr/bin/env python3
"""Build the reproducible N64/Melee/Brawl source inventory.

The report deliberately separates inventory metadata from locally readable bytes.
Ultimate is referenced as an external boundary and is never counted as legacy.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import wave
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
LIBRARY = WORKSPACE / "GGD-Asset-Library"
BASE = ROOT / "materials/hero-model-library"
OUTPUT_DIR = BASE / "source-inventories/smash-legacy-sources-v1"
JSON_OUTPUT = OUTPUT_DIR / "inventory.json"
MD_OUTPUT = OUTPUT_DIR / "README.md"
WINDOWS_ZIP = LIBRARY / "intake/remote-game-libraries/windows-scan-20260912-030625/source/GGD-Game-Inventory-20260912-030625.zip"
FROZEN_MELEE = LIBRARY / "intake/public-models-20260910/parallel-voice-ssbm-remaining/deliveries/local-audio-delivery-20260910T124607980558Z.json"
ULTIMATE = BASE / "priority-evidence/ssbu-ultimate-nsandns2-20260914/reconciliation.json"

MELEE_SOURCE_IDS = (
    "parallel-voice-ssbm-kirby",
    "parallel-voice-ssbm-pikachu",
    "parallel-voice-ssbm-marth",
    "parallel-voice-melee-local-29",
)
BRAWL_SOURCE_IDS = ("dayjo-ssbb-zelda-audio",)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def input_pin(path: Path, *, location: str, external: bool = False) -> dict:
    result = {
        "location": location,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if external:
        result["absolutePath"] = str(path)
    return result


def is_n64_smash_row(row: dict) -> bool:
    """Accept the four SSB rows, excluding the unrelated Let's Smash title."""
    if row.get("Platform") != "Nintendo 64":
        return False
    name = row.get("Name", "")
    return name == "N64 全明星大亂鬥" or name.startswith("Super Smash Bros.")


def windows_n64_rows(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        with archive.open("rom-files.csv") as raw:
            rows = list(csv.DictReader(io.TextIOWrapper(raw, "utf-8-sig", newline="")))
    result = []
    for row in rows:
        if not is_n64_smash_row(row):
            continue
        if row.get("ContentRead") != "False" or row.get("Sha256") or row.get("Status") != "inventory-only":
            raise ValueError(f"N64 inventory status changed; inspect before accepting: {row!r}")
        result.append(
            {
                "sourceId": "windows-inventory-n64-super-smash-bros",
                "sourceGame": "Super Smash Bros.",
                "platform": "Nintendo 64",
                "versionLabel": row["Name"],
                "fileName": row["FileName"],
                "windowsPath": row["FullPath"],
                "bytesReportedByWindows": int(row["SizeBytes"]),
                "lastWriteTimeUtc": row["LastWriteTimeUtc"],
                "contentRead": False,
                "sha256": None,
                "acquisitionStatus": "inventory-metadata-only",
                "extractionStatus": "not-started-no-readable-payload",
                "conversionStatus": "not-started-no-readable-payload",
            }
        )
    result.sort(key=lambda item: item["fileName"])
    if len(result) != 4:
        raise ValueError(f"Expected four N64 Smash inventory rows, got {len(result)}")
    return result


def wav_info(path: Path) -> dict:
    with wave.open(str(path), "rb") as source:
        frames = source.getnframes()
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        pcm = source.readframes(frames)
    expected = frames * channels * sample_width
    if len(pcm) != expected:
        raise ValueError(f"PCM payload length mismatch: {path}")
    return {
        "frames": frames,
        "channels": channels,
        "sampleWidth": sample_width,
        "sampleRate": sample_rate,
        "seconds": frames / sample_rate,
        "pcmPayloadBytes": expected,
    }


def local_root(source: dict) -> Path:
    return WORKSPACE / source["localPath"]


def classify(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix == ".wav":
        return "audio-pcm-wav"
    if suffix in {".zip", ".7z"}:
        return "source-archive"
    return "source-metadata-or-receipt"


def verify_source(source: dict, archive: dict) -> tuple[dict, list[dict]]:
    source_id = source["id"]
    if not archive.get("readbackVerified"):
        raise ValueError(f"S3 readback is not verified: {source_id}")
    backup = source.get("backup", {})
    for key in ("s3Uri", "sha256", "bytes"):
        if backup.get(key) != archive.get(key):
            raise ValueError(f"Backup/public-source mismatch for {source_id}: {key}")
    if not backup.get("readbackVerified"):
        raise ValueError(f"Source backup lacks readback verification: {source_id}")

    root = local_root(source)
    rows = []
    wav_count = 0
    seconds = 0.0
    for entry in archive["files"]:
        path = root / entry["path"]
        if not path.is_file():
            raise FileNotFoundError(path)
        actual_size = path.stat().st_size
        actual_sha = sha256(path)
        if actual_size != entry["bytes"] or actual_sha != entry["sha256"]:
            raise ValueError(f"Changed local source member: {path}")
        row = {
            "sourceId": source_id,
            "sourceGame": source["sourceGame"],
            "platform": source["platform"],
            "relativePath": entry["path"],
            "absolutePath": str(path),
            "bytes": actual_size,
            "sha256": actual_sha,
            "assetKind": classify(entry["path"]),
            "localSizeVerified": True,
            "localSha256Verified": True,
        }
        if row["assetKind"] == "audio-pcm-wav":
            audio = wav_info(path)
            row["audio"] = audio
            wav_count += 1
            seconds += audio["seconds"]
        rows.append(row)

    summary = {
        "sourceId": source_id,
        "sourceGame": source["sourceGame"],
        "platform": source["platform"],
        "sourceUrl": source.get("url"),
        "localRoot": str(root),
        "heroIdsExplicitlyMapped": source.get("heroIds", []),
        "memberFiles": len(rows),
        "wavFiles": wav_count,
        "audioSeconds": round(seconds, 6),
        "archivePackages": source.get("audioAcquisition", {}).get("completePackages", len(source.get("files", []))),
        "s3Uri": archive["s3Uri"],
        "s3ArchiveBytes": archive["bytes"],
        "s3ArchiveSha256": archive["sha256"],
        "s3ReadbackVerified": True,
        "listeningVerified": source.get("audioAcquisition", {}).get("listeningVerified", False),
        "eventBindingsVerified": source.get("audioAcquisition", {}).get("eventBindingsVerified", False),
        "runtimeReady": False,
    }
    return summary, rows


def ultimate_boundary() -> dict:
    data = read_json(ULTIMATE)
    if data.get("schema") != "ggd-ssbu-ultimate-nsandns2-compact-evidence@1":
        raise ValueError("Unexpected Ultimate reconciliation schema")
    return {
        "includedInLegacyTotals": False,
        "sourceGame": "Super Smash Bros. Ultimate",
        "platform": "Nintendo Switch",
        "gitPath": str(ULTIMATE.relative_to(ROOT)),
        "sha256": sha256(ULTIMATE),
        "sourceId": data["sourceId"],
        "status": "separate-current-generation-source; see linked reconciliation",
        "sourceStageCounts": data["sourceStageCounts"],
    }


def build() -> dict:
    downloads_path = BASE / "download-sources.json"
    public_files_path = BASE / "public-source-files.json"
    downloads = read_json(downloads_path)
    public_files = read_json(public_files_path)
    by_source = {row["id"]: row for row in downloads["publicSources"]}
    by_archive = {row["id"]: row for row in public_files["sources"] if row.get("id")}

    inputs = [
        input_pin(downloads_path, location=str(downloads_path.relative_to(ROOT))),
        input_pin(public_files_path, location=str(public_files_path.relative_to(ROOT))),
        input_pin(WINDOWS_ZIP, location="GGD-Asset-Library/intake/remote-game-libraries/windows-scan-20260912-030625/source/GGD-Game-Inventory-20260912-030625.zip", external=True),
        input_pin(FROZEN_MELEE, location="GGD-Asset-Library/intake/public-models-20260910/parallel-voice-ssbm-remaining/deliveries/local-audio-delivery-20260910T124607980558Z.json", external=True),
        input_pin(ULTIMATE, location=str(ULTIMATE.relative_to(ROOT))),
    ]

    frozen = read_json(FROZEN_MELEE)
    if not frozen.get("deliveryFrozen") or frozen.get("totals", {}).get("completePackages") != 48 or frozen.get("totals", {}).get("pcmWavCount") != 1584:
        raise ValueError("Melee frozen delivery is absent or changed")

    summaries = {}
    files = []
    for source_id in MELEE_SOURCE_IDS + BRAWL_SOURCE_IDS:
        summary, rows = verify_source(by_source[source_id], by_archive[source_id])
        summaries[source_id] = summary
        files.extend(rows)

    melee_sources = [summaries[source_id] for source_id in MELEE_SOURCE_IDS]
    brawl_sources = [summaries[source_id] for source_id in BRAWL_SOURCE_IDS]
    melee = {
        "sourceGame": "Super Smash Bros. Melee",
        "platform": "GameCube",
        "sourceIds": list(MELEE_SOURCE_IDS),
        "sources": melee_sources,
        "archivePackages": sum(item["archivePackages"] for item in melee_sources),
        "memberFiles": sum(item["memberFiles"] for item in melee_sources),
        "wavFiles": sum(item["wavFiles"] for item in melee_sources),
        "audioSeconds": round(sum(item["audioSeconds"] for item in melee_sources), 6),
        "modelFiles": 0,
        "skeletonFiles": 0,
        "nativeMotionFiles": 0,
        "vfxFiles": 0,
        "convertedFiles": 0,
        "backendBindingsVerified": 0,
        "status": "audio-source-bytes-acquired-and-sha-verified; model-motion-vfx-source-not-acquired",
    }
    brawl = {
        "sourceGame": "Super Smash Bros. Brawl",
        "platform": "Wii",
        "sourceIds": list(BRAWL_SOURCE_IDS),
        "sources": brawl_sources,
        "archivePackages": sum(item["archivePackages"] for item in brawl_sources),
        "memberFiles": sum(item["memberFiles"] for item in brawl_sources),
        "wavFiles": sum(item["wavFiles"] for item in brawl_sources),
        "audioSeconds": round(sum(item["audioSeconds"] for item in brawl_sources), 6),
        "modelFiles": 0,
        "skeletonFiles": 0,
        "nativeMotionFiles": 0,
        "vfxFiles": 0,
        "convertedFiles": 0,
        "backendBindingsVerified": 0,
        "status": "audio-source-bytes-acquired-and-sha-verified; model-motion-vfx-source-not-acquired",
    }
    if (melee["archivePackages"], melee["memberFiles"], melee["wavFiles"]) != (51, 2011, 1766):
        raise ValueError(f"Unexpected Melee totals: {melee}")
    if (brawl["archivePackages"], brawl["memberFiles"], brawl["wavFiles"]) != (12, 462, 448):
        raise ValueError(f"Unexpected Brawl totals: {brawl}")

    n64_rows = windows_n64_rows(WINDOWS_ZIP)
    return {
        "schema": "ggd.smash-legacy-source-inventory@1",
        "sourceId": "smash-legacy-sources-v1",
        "asOfDate": "2026-09-14",
        "scope": {
            "included": ["Super Smash Bros. / Nintendo 64", "Super Smash Bros. Melee / GameCube", "Super Smash Bros. Brawl / Wii"],
            "excluded": ["Super Smash Bros. Ultimate / Nintendo Switch"],
            "policy": "A ROM/game name or inventory row is metadata only until payload bytes are locally readable and hashed.",
        },
        "inputs": inputs,
        "nintendo64": {
            "sourceGame": "Super Smash Bros.",
            "platform": "Nintendo 64",
            "sourceId": "windows-inventory-n64-super-smash-bros",
            "rows": n64_rows,
            "inventoryRows": len(n64_rows),
            "payloadFilesRead": 0,
            "payloadSha256Recorded": 0,
            "extractedFiles": 0,
            "convertedFiles": 0,
            "status": "inventory-metadata-only; source bytes unavailable on current mounts",
        },
        "melee": melee,
        "brawl": brawl,
        "perFileSha256Index": {
            "gitPath": "materials/hero-model-library/public-source-files.json",
            "sha256": sha256(public_files_path),
            "sourceIds": list(MELEE_SOURCE_IDS + BRAWL_SOURCE_IDS),
            "memberRecords": len(files),
            "note": "The fixed public source manifest retains every relative path, byte size and SHA-256. This inventory verifies those records without duplicating the 2,473-row authority.",
        },
        "ultimateBoundary": ultimate_boundary(),
        "verification": {
            "localMemberFilesChecked": len(files),
            "localMemberSha256Verified": len(files),
            "pcmWavPayloadsOpened": melee["wavFiles"] + brawl["wavFiles"],
            "allReferencedS3ArchivesReadbackVerified": True,
            "mountsChecked": ["/Volumes/common", "/Volumes/game", "/Volumes/R"],
            "currentReadableOriginalGamePayloads": 0,
            "safeNewModelConversionsCompleted": 0,
        },
        "blockers": [
            "N64: Windows scan has four relevant filenames and sizes, but ContentRead=False and no SHA-256; no ROM payload is currently mounted.",
            "Melee: acquired material is audio-only; no original model, texture, skeleton, native motion or VFX bytes are present in the indexed source roots.",
            "Brawl: acquired material is audio-only; no original model, texture, skeleton, native motion or VFX bytes are present in the indexed source root.",
            "No repository-backed N64/Melee/Brawl asset extractor was found, so no extraction or conversion is claimed.",
            "Audio groups mix voices and effects and have no complete listening/event review; no runtime binding is claimed.",
        ],
        "identityNotes": [
            "Existing explicit mappings are retained only: Melee Kirby -> community-review-06-20260907; Melee Pikachu -> godie-ofar; Brawl SSBB_Link coverage -> godie-h00l.",
            "Marth and the 48-package Melee reserve remain unmapped. Mario and Mewtwo names in audio groups are not model evidence.",
            "No new GGD hero ID is inferred or created by this inventory.",
        ],
    }


def render_markdown(data: dict) -> str:
    n64 = data["nintendo64"]
    melee = data["melee"]
    brawl = data["brawl"]
    lines = [
        "# 任天堂明星大亂鬥歷代來源盤點（N64／Melee／Brawl）",
        "",
        "> 由 `build_inventory.py` 產生；請不要只手改本檔。Ultimate 不計入本批統計。",
        "",
        "| 作品 | 平台 | 可讀原始內容 | 原始包 | 已驗 SHA 檔案 | PCM WAV | 模型／骨架／動作／VFX | 轉換 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
        f"| Super Smash Bros. | N64 | 0 | 0 | 0 | 0 | 0 | 0 |",
        f"| Super Smash Bros. Melee | GameCube | 是（音訊） | {melee['archivePackages']} | {melee['memberFiles']} | {melee['wavFiles']} | 0 | 0 |",
        f"| Super Smash Bros. Brawl | Wii | 是（音訊） | {brawl['archivePackages']} | {brawl['memberFiles']} | {brawl['wavFiles']} | 0 | 0 |",
        "",
        "## N64 inventory metadata",
        "",
        "這四列只是 Windows 掃描 metadata：`ContentRead=False`，沒有 SHA-256，不視為已取得原始遊戲位元組。`Let's Smash (Japan)` 是其他作品，已排除。",
        "",
        "| 版本／檔名 | 報告大小 | 狀態 |",
        "|---|---:|---|",
    ]
    for row in n64["rows"]:
        lines.append(f"| `{row['fileName']}` | {row['bytesReportedByWindows']} | {row['acquisitionStatus']} |")
    lines += [
        "",
        "## 已取得實檔",
        "",
        f"- Melee：{melee['archivePackages']} 包、{melee['wavFiles']} WAV、{melee['audioSeconds']:.6f} 秒；{melee['memberFiles']} 個完整歸檔成員已逐檔 SHA-256 驗證。",
        f"- Brawl：{brawl['archivePackages']} 包、{brawl['wavFiles']} WAV、{brawl['audioSeconds']:.6f} 秒；{brawl['memberFiles']} 個完整歸檔成員已逐檔 SHA-256 驗證。",
        "- 這些 WAV 的 PCM 載荷可解碼；說話者、語言與技能事件仍需逐項聽審，未綁定到 runtime。",
        "- S3 位置與讀回驗證保留在 JSON 的各 source 摘要；本批沒有新增大型原始檔，因此沒有新 S3 上傳。",
        "",
        "## Ultimate 邊界",
        "",
        f"Ultimate 屬 Nintendo Switch 獨立來源，不納入上表歷代總數。請查 `{data['ultimateBoundary']['gitPath']}`。",
        "",
        "## 精確缺口",
        "",
    ]
    lines.extend(f"- {item}" for item in data["blockers"])
    lines += ["", "## 身分與英雄對應", ""]
    lines.extend(f"- {item}" for item in data["identityNotes"])
    lines += [
        "",
        "## 重建與驗證",
        "",
        "```bash",
        "python3 tools/hero-model-library/source-workflows/smash-legacy-sources-v1/build_inventory.py --check",
        "python3 -m unittest tools/hero-model-library/source-workflows/smash-legacy-sources-v1/test_build_inventory.py",
        "python3 tools/hero-model-library/current_resource_index.py --check --check-git",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Rebuild in memory and require byte-for-byte generated outputs.")
    args = parser.parse_args()
    data = build()
    json_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    md_text = render_markdown(data)
    if args.check:
        if JSON_OUTPUT.read_text(encoding="utf-8") != json_text:
            raise SystemExit(f"stale generated file: {JSON_OUTPUT}")
        if MD_OUTPUT.read_text(encoding="utf-8") != md_text:
            raise SystemExit(f"stale generated file: {MD_OUTPUT}")
        print(f"PASS: {JSON_OUTPUT.relative_to(ROOT)} ({data['verification']['localMemberFilesChecked']} verified local members)")
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json_text, encoding="utf-8")
    MD_OUTPUT.write_text(md_text, encoding="utf-8")
    print(f"wrote {JSON_OUTPUT.relative_to(ROOT)}")
    print(f"wrote {MD_OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
