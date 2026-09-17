#!/usr/bin/env python3
"""Build a source-fidelity PlayStation platform inventory from local evidence."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import wave
import zipfile
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
LIBRARY = WORKSPACE / "GGD-Asset-Library"
BASE = ROOT / "materials/hero-model-library"
OUTPUT_DIR = BASE / "source-inventories/playstation-platform-sources-v1"
JSON_OUTPUT = OUTPUT_DIR / "inventory.json"
MD_OUTPUT = OUTPUT_DIR / "README.md"
POLICY_AUDIT = OUTPUT_DIR / "cloud-policy-audit.json"
WINDOWS_ZIP = LIBRARY / "intake/remote-game-libraries/windows-scan-20260912-030625/source/GGD-Game-Inventory-20260912-030625.zip"

PLATFORM_PREFIXES = {
    "PlayStation": "模擬器\\PSX",
    "PlayStation 2": "模擬器\\PS2",
    "PlayStation 3": "模擬器\\PS3",
    "PSP": "模擬器\\PSP",
}
EXPECTED_ROWS = {"PlayStation": 18, "PSP": 64, "PlayStation 2": 1, "PlayStation 3": 2, "PS Vita": 0}
ACQUIRED_SOURCE_IDS = (
    "github-neztypezero-psp-gmo-loader-f346daec",
    "psp-cloud-native-motion-batch4",
    "gamebanana-cloud-english-voice",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def pin(path: Path, location: str, *, external: bool = False) -> dict:
    result = {"location": location, "bytes": path.stat().st_size, "sha256": sha256(path)}
    if external:
        result["absolutePath"] = str(path)
    return result


def selected_source_pin(path: Path, records: list[dict], source_ids: tuple[str, ...]) -> dict:
    selected = [row for row in records if row.get("id") in source_ids]
    selected.sort(key=lambda row: row["id"])
    if [row["id"] for row in selected] != sorted(source_ids):
        raise ValueError(f"Missing selected records in {path}: {source_ids!r}")
    payload = json.dumps(selected, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "location": str(path.relative_to(ROOT)),
        "selectedSourceIds": sorted(source_ids),
        "selectedRecordsSha256": hashlib.sha256(payload).hexdigest(),
        "note": "Only task-relevant records are pinned; unrelated source additions do not stale this platform inventory.",
    }


def slug(text: str) -> str:
    value = re.sub(r"\s*\([^)]*\)", "", text.lower().replace("_", "-"))
    value = re.sub(r"-(jpn|usa|eur|psn|psp|bahamut|pspking|playasia|wrg|googlecus|caravan|ind)(?:-.*)?$", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "unresolved"


def logical_game(row: dict) -> tuple[str, str, str]:
    name = row["FileName"]
    lower = name.lower()
    known = (
        ("dissidia-012-duodecim-final-fantasy", "Dissidia 012 Duodecim Final Fantasy", ("dissidia_012", "ulus-10566")),
        ("heroes-phantasia", "Heroes Phantasia", ("heroes_phantasia", "heroes phantasia", "pa-hp.")),
        ("patapon-3", "Patapon 3", ("patapon_3",)),
        ("taiko-no-tatsujin-portable-dx", "Taiko no Tatsujin Portable DX", ("portable_dx", "portable dx", "b-taikodx")),
        ("zero-chou-aniki", "Zero Chou Aniki", ("zero chou aniki",)),
        ("dragons-crown", "Dragon's Crown", ("dragon's crown", "dragons crown")),
    )
    for key, title, needles in known:
        if any(needle in lower for needle in needles):
            return key, title, "title-or-release-group"
    stem = Path(name).stem
    key = slug(stem)
    opaque = bool(re.fullmatch(r"(?:[a-z]{2,5}-)?[a-z0-9]{3,12}(?:\.part\d+)?", stem.lower()))
    return key, stem, "opaque-release-name-unresolved" if opaque else "filename-title-unverified"


def is_fate_uc(row: dict) -> bool:
    return re.search(r"fate[- _]+unlimited[- _]+codes", row["Name"], re.I) is not None


def windows_rows() -> tuple[dict, list[dict], list[dict]]:
    with zipfile.ZipFile(WINDOWS_ZIP) as archive:
        rows = list(csv.DictReader(io.TextIOWrapper(archive.open("rom-files.csv"), "utf-8-sig", newline="")))
    grouped = {}
    excluded_fate = []
    ignored = []
    for platform, prefix in PLATFORM_PREFIXES.items():
        selected = []
        for row in rows:
            if not row["RelativePath"].startswith(prefix):
                continue
            if row["Extension"] == ".md":
                ignored.append({"platform": platform, "fileName": row["FileName"], "relativePath": row["RelativePath"], "reason": "documentation-not-game-container"})
                continue
            if is_fate_uc(row):
                excluded_fate.append({"platform": platform, "fileName": row["FileName"], "relativePath": row["RelativePath"], "reason": "handled-by-fate-unlimited-codes-platform-workflow"})
                continue
            if row["ContentRead"] != "False" or row["Sha256"] or row["Status"] != "inventory-only":
                raise ValueError(f"Windows source status changed; inspect before accepting: {row!r}")
            key, title, identity = logical_game(row)
            selected.append(
                {
                    "sourceId": f"windows-game-inventory:{slug(platform)}:{key}",
                    "gameLabel": title,
                    "identityStatus": identity,
                    "platform": platform,
                    "versionLabel": row["Name"],
                    "fileName": row["FileName"],
                    "extension": row["Extension"],
                    "windowsPath": row["FullPath"],
                    "relativePath": row["RelativePath"],
                    "bytesReportedByWindows": int(row["SizeBytes"]),
                    "lastWriteTimeUtc": row["LastWriteTimeUtc"],
                    "contentRead": False,
                    "sha256": None,
                    "acquisitionStatus": "inventory-metadata-only",
                    "assetAvailability": {kind: "unknown-no-payload" for kind in ("model", "texture", "skeleton", "animation", "vfx", "soundEffect", "voice")},
                    "extractionStatus": "not-started-no-readable-payload",
                    "conversionStatus": "not-started-no-readable-payload",
                }
            )
        selected.sort(key=lambda item: (item["sourceId"], item["fileName"]))
        grouped[platform] = selected

    # Rows classified as PSP only because they were under an RPG Maker picture
    # folder are not game containers in the requested emulator library.
    for row in rows:
        if row["Platform"] == "Sony PSP" and not row["RelativePath"].startswith(PLATFORM_PREFIXES["PSP"]):
            ignored.append({"platform": "PSP", "fileName": row["FileName"], "relativePath": row["RelativePath"], "reason": "outside-emulator-game-library-asset-archive"})
    grouped["PS Vita"] = []
    actual = {key: len(value) for key, value in grouped.items()}
    if actual != EXPECTED_ROWS:
        raise ValueError(f"PlayStation metadata counts changed: {actual!r}")
    if len(excluded_fate) != 2 or len(ignored) != 10:
        raise ValueError(f"Unexpected exclusions: Fate={len(excluded_fate)} ignored={len(ignored)}")
    return grouped, excluded_fate, sorted(ignored, key=lambda item: item["relativePath"])


def verify_public_source(source: dict, archive: dict) -> dict:
    if not archive.get("readbackVerified") or not source.get("backup", {}).get("readbackVerified"):
        raise ValueError(f"S3 readback not verified: {source['id']}")
    backup = source["backup"]
    for key in ("bytes", "sha256", "s3Uri"):
        if archive.get(key) != backup.get(key):
            raise ValueError(f"S3 receipt mismatch for {source['id']}: {key}")
    root = WORKSPACE / source["localPath"]
    extensions = Counter()
    wav_files = 0
    wav_seconds = 0.0
    for item in archive["files"]:
        path = root / item["path"]
        if not path.is_file() or path.stat().st_size != item["bytes"] or sha256(path) != item["sha256"]:
            raise ValueError(f"Missing or changed source member: {path}")
        extensions[Path(item["path"]).suffix.lower() or "(none)"] += 1
        if path.suffix.lower() == ".wav":
            with wave.open(str(path), "rb") as audio:
                frames = audio.getnframes()
                rate = audio.getframerate()
                payload = audio.readframes(frames)
                expected = frames * audio.getnchannels() * audio.getsampwidth()
            if len(payload) != expected:
                raise ValueError(f"PCM payload mismatch: {path}")
            wav_files += 1
            wav_seconds += frames / rate
    return {
        "sourceId": source["id"],
        "sourceGame": source.get("sourceGame"),
        "platform": source.get("platform"),
        "sourceUrl": source.get("url"),
        "author": source.get("uploader"),
        "sourceCommit": source.get("sourceCommit"),
        "localRoot": str(root),
        "acquisitionStatus": source.get("acquisitionStatus"),
        "readiness": source.get("readiness"),
        "assetKinds": source.get("assetKinds", []),
        "heroIds": source.get("heroIds", []),
        "verifiedMemberFiles": len(archive["files"]),
        "verifiedMemberBytes": sum(item["bytes"] for item in archive["files"]),
        "extensionCounts": dict(sorted(extensions.items())),
        "wavFiles": wav_files,
        "wavSeconds": round(wav_seconds, 6),
        "perFileSha256Manifest": "materials/hero-model-library/public-source-files.json",
        "s3Uri": archive["s3Uri"],
        "s3ArchiveBytes": archive["bytes"],
        "s3ArchiveSha256": archive["sha256"],
        "s3ReadbackVerified": True,
        "runtimeReady": False,
        "productionDeployed": False,
    }


def build() -> dict:
    download_path = BASE / "download-sources.json"
    files_path = BASE / "public-source-files.json"
    downloads = read_json(download_path)
    public_files = read_json(files_path)
    policy = read_json(POLICY_AUDIT)
    source_by_id = {row["id"]: row for row in downloads["publicSources"]}
    archive_by_id = {row["id"]: row for row in public_files["sources"] if row.get("id")}
    acquired = {source_id: verify_public_source(source_by_id[source_id], archive_by_id[source_id]) for source_id in ACQUIRED_SOURCE_IDS}

    gmo = source_by_id["github-neztypezero-psp-gmo-loader-f346daec"]
    candidates = gmo["modelCandidates"]
    gmo_root = WORKSPACE / gmo["localPath"]
    header_verified = 0
    for candidate in candidates:
        model = gmo_root / candidate["nativeModel"]
        if model.read_bytes()[:11] != b"OMG.00.1PSP":
            raise ValueError(f"Not a PSP GMO header: {model}")
        if sha256(model) != candidate["nativeModelSha256"]:
            raise ValueError(f"Changed GMO model: {model}")
        header_verified += 1
    if (len(candidates), sum(row["nativeMotionCount"] for row in candidates), sum(row["nativeTextureCount"] for row in candidates)) != (21, 258, 116):
        raise ValueError("PSP GMO candidate totals changed")

    cloud = source_by_id["psp-cloud-native-motion-batch4"]["modelCandidates"][0]
    if policy.get("schema") != "ggd.playstation-cloud-policy-audit@1" or policy.get("sha256") != cloud["model"]["sha256"]:
        raise ValueError("Cloud current-policy audit is missing or stale")
    if policy["metrics"]["clips"] != 13 or policy["readiness"]["runtimeReady"] is not False:
        raise ValueError("Cloud audit animation/readiness state changed")

    grouped, excluded_fate, ignored = windows_rows()
    platform_summary = {}
    for platform, rows in grouped.items():
        platform_summary[platform] = {
            "metadataRows": len(rows),
            "logicalSourceIds": len({row["sourceId"] for row in rows}),
            "reportedBytes": sum(row["bytesReportedByWindows"] for row in rows),
            "payloadFilesRead": 0,
            "payloadSha256Recorded": 0,
            "extractedFiles": 0,
            "convertedFiles": 0,
            "status": "inventory-metadata-only" if rows else "no-source-found-in-current-local-evidence",
        }

    return {
        "schema": "ggd.playstation-platform-source-inventory@1",
        "sourceId": "playstation-platform-sources-v1",
        "asOfDate": "2026-09-14",
        "scope": {
            "includedPlatforms": ["PlayStation", "PSP", "PS Vita", "PlayStation 2", "PlayStation 3", "PlayStation 4"],
            "excludedCompletedWorkflows": ["Fate/unlimited codes platform batch", "J-Stars native container batch", "Smash legacy source batch"],
            "policy": "A remote filename, directory, reported byte size or title is metadata until payload bytes are locally readable and hashed.",
        },
        "inputs": [
            selected_source_pin(download_path, downloads["publicSources"], ACQUIRED_SOURCE_IDS),
            selected_source_pin(files_path, public_files["sources"], ACQUIRED_SOURCE_IDS),
            pin(WINDOWS_ZIP, "GGD-Asset-Library/intake/remote-game-libraries/windows-scan-20260912-030625/source/GGD-Game-Inventory-20260912-030625.zip", external=True),
            pin(POLICY_AUDIT, str(POLICY_AUDIT.relative_to(ROOT))),
        ],
        "platformSummary": platform_summary,
        "windowsInventoryRows": grouped,
        "windowsInventoryExclusions": {
            "fateUnlimitedCodes": excluded_fate,
            "nonGameOrOutsideRequestedLibrary": ignored,
        },
        "acquiredSources": {
            "pspNativeGmoAuthorSnapshot": {
                **acquired["github-neztypezero-psp-gmo-loader-f346daec"],
                "sourceGameStatus": "unknown; Dissidia series is filename hint only",
                "nativeGmoFiles": 21,
                "nativeGmoHeadersVerified": header_verified,
                "nativeMotionBlocks": 258,
                "nativeTexturePayloads": 116,
                "standardGlbCandidates": 3,
                "nativeAnimationPlaybackVerified": False,
            },
            "pspCloudConvertedCandidate": {
                **acquired["psp-cloud-native-motion-batch4"],
                "derivedFromSourceId": "github-neztypezero-psp-gmo-loader-f346daec",
                "candidateId": cloud["candidateId"],
                "nativeModel": cloud["nativeSource"],
                "convertedModel": cloud["model"],
                "nativeMotionClips": cloud["motionCount"],
                "sourceChannels": cloud["channelCoverage"]["source"],
                "convertedTrsChannels": cloud["channelCoverage"]["converted"],
                "preservedUnconvertedChannels": cloud["channelCoverage"]["unconverted"],
                "currentPolicyAudit": {"gitPath": str(POLICY_AUDIT.relative_to(ROOT)), "sha256": sha256(POLICY_AUDIT), "metrics": policy["metrics"], "formalAdoption": policy["formalAdoption"], "runtimeGate": policy["runtimeGate"], "readiness": policy["readiness"]},
            },
            "ps4CloudEnglishAudio": {
                **acquired["gamebanana-cloud-english-voice"],
                "sourceContainer": "NUS3AUDIO",
                "decodedWavFiles": 49,
                "eventBindingsVerified": False,
                "listeningReviewComplete": False,
                "reportedLanguage": "English",
            },
        },
        "verification": {
            "locallyVerifiedSourceIds": list(ACQUIRED_SOURCE_IDS),
            "locallyVerifiedMemberFiles": sum(acquired[source_id]["verifiedMemberFiles"] for source_id in ACQUIRED_SOURCE_IDS),
            "allLocalMemberSha256Verified": True,
            "allReferencedS3ArchivesReadbackVerified": True,
            "windowsMetadataRowsInScope": sum(len(rows) for rows in grouped.values()),
            "windowsPayloadFilesRead": 0,
            "newDownloads": 0,
            "newExtractions": 0,
            "newConversions": 0,
            "mounts": {"/Volumes/common": False, "/Volumes/game": False, "/Volumes/R": True},
        },
        "blockers": [
            "The Windows game shares are not currently mounted at /Volumes/common or /Volumes/game, so the 85 game-container rows remain metadata-only and cannot receive SHA-256 or extraction results.",
            "No PS Vita game or acquired asset source exists in the current Windows inventory, mounted volumes, central source index or GGD-Asset-Library evidence.",
            "PSP GMO author samples have exact PSP headers, but their source game/version and filename-only character identities remain unverified.",
            "Cloud has 13 converted native-ID clips, but semantic action mapping, metric scale, exact source game, four non-TRS channels and backend playback remain unresolved.",
            "PS4 Cloud audio has decoded WAV files, but clip-level speaker/language/event review remains incomplete; no runtime binding is claimed.",
        ],
    }


def render_markdown(data: dict) -> str:
    lines = [
        "# PlayStation 平台遊戲與素材來源盤點",
        "",
        "> 由 `build_inventory.py` 生成；請不要只手改本檔。Fate/unlimited codes、J-Stars 與 Smash legacy 已有獨立批次，本頁不重複計入。",
        "",
        "## Windows 遊戲容器（metadata only）",
        "",
        "| 平台 | 清單列 | 邏輯來源 ID | 報告大小 | 已讀 payload | 已轉換 |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for platform in ("PlayStation", "PSP", "PS Vita", "PlayStation 2", "PlayStation 3"):
        row = data["platformSummary"][platform]
        lines.append(f"| {platform} | {row['metadataRows']} | {row['logicalSourceIds']} | {row['reportedBytes']} | 0 | 0 |")
    lines += [
        "",
        "85 列全部為 `ContentRead=False`、SHA-256 空白。檔名、路徑與 Windows 報告大小已保留，但不視為已取得遊戲位元組。PSP 另排除 2 列 Fate/unlimited codes，交由專屬平台索引。",
        "",
        "## 本機已驗證素材",
        "",
        "| 來源 | 平台 | 已驗檔案 | 模型／動作／音訊 | 目前狀態 |",
        "|---|---|---:|---|---|",
    ]
    psp = data["acquiredSources"]["pspNativeGmoAuthorSnapshot"]
    cloud = data["acquiredSources"]["pspCloudConvertedCandidate"]
    audio = data["acquiredSources"]["ps4CloudEnglishAudio"]
    lines += [
        f"| `{psp['sourceId']}` | PSP | {psp['verifiedMemberFiles']} | 21 GMO／258 native Motion blocks／116 GIM | 原作與版本待確認 |",
        f"| `{cloud['sourceId']}` | PSP | {cloud['verifiedMemberFiles']} | Cloud GLB／13 clips | 轉換候選，runtime 尚未驗收 |",
        f"| `{audio['sourceId']}` | PS4 | {audio['verifiedMemberFiles']} | 1 NUS3AUDIO／49 WAV | 待逐段聽審與事件綁定 |",
        "",
        f"Cloud 即時量測：{cloud['currentPolicyAudit']['metrics']['triangles']} 三角面、{cloud['currentPolicyAudit']['metrics']['meshes']} meshes、貼圖最長邊 {cloud['currentPolicyAudit']['metrics']['maxTextureEdge']} px、單 clip 最大 {cloud['currentPolicyAudit']['metrics']['channelsPerFrame']} 動畫通道。執行期 gate 結果為 `{cloud['currentPolicyAudit']['runtimeGate']['worst']}`（mesh 警戒）；容量量測不等於身分、動作語意、後台播放或上線驗收。",
        "",
        "## 精確缺口",
        "",
    ]
    lines.extend(f"- {item}" for item in data["blockers"])
    lines += [
        "",
        "## 重建與查詢",
        "",
        "```bash",
        "node --import tsx tools/hero-model-library/source-workflows/playstation-platform-sources-v1/audit_cloud_candidate.mts --check",
        "python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/build_inventory.py --check",
        "python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/query.py cloud",
        "python3 -m unittest tools/hero-model-library/source-workflows/playstation-platform-sources-v1/test_inventory.py",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build()
    json_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    md_text = render_markdown(data)
    if args.check:
        if JSON_OUTPUT.read_text(encoding="utf-8") != json_text:
            raise SystemExit(f"stale: {JSON_OUTPUT}")
        if MD_OUTPUT.read_text(encoding="utf-8") != md_text:
            raise SystemExit(f"stale: {MD_OUTPUT}")
        print(f"PASS: {data['verification']['windowsMetadataRowsInScope']} metadata rows; {data['verification']['locallyVerifiedMemberFiles']} local files")
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json_text, encoding="utf-8")
    MD_OUTPUT.write_text(md_text, encoding="utf-8")
    print(f"wrote {JSON_OUTPUT.relative_to(ROOT)}")
    print(f"wrote {MD_OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
