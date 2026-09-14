#!/usr/bin/env python3
"""Build the FUC platform index from checked inventory and conversion receipts."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
DEFAULT_ASSET_ROOT = REPO.parent / "GGD-Asset-Library"
OUTPUT_DIR = REPO / "materials/hero-model-library/priority-evidence/fate-unlimited-codes-platforms-v1"


def read_json(path: Path) -> dict[str, Any]:
    payload = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json.loads(payload.decode("utf-8-sig"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_evidence(path: Path, base: Path | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(path.relative_to(base)) if base and path.is_relative_to(base) else str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    return result


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def verify_file_manifest(root: Path, manifest: dict[str, Any], source_id: str) -> dict[str, Any]:
    """Read every declared file and verify its size and SHA-256."""
    require(manifest.get("schema") == "ggd.source-files.intake@1",
            "Unexpected file-manifest schema: " + source_id)
    rows = manifest.get("files")
    require(isinstance(rows, list) and rows, "Empty file manifest: " + source_id)
    verified_bytes = 0
    audio_files = 0
    for row in rows:
        declared = row.get("path")
        require(isinstance(declared, str) and declared, "Invalid manifest path: " + source_id)
        relative = Path(declared)
        require(not relative.is_absolute() and ".." not in relative.parts,
                "Unsafe manifest path: " + source_id + ":" + declared)
        path = root / relative
        require(path.is_file(), "Manifest file absent: " + str(path))
        require(path.stat().st_size == row.get("bytes"), "Manifest byte count changed: " + str(path))
        require(sha256(path) == row.get("sha256"), "Manifest SHA-256 changed: " + str(path))
        verified_bytes += path.stat().st_size
        if path.suffix.casefold() == ".wav":
            audio_files += 1
    return {
        "manifestFileCount": len(rows),
        "manifestBytes": verified_bytes,
        "audioManifestFileCount": audio_files,
        "allMemberSha256Verified": True,
    }


def resolve_asset_path(asset_root: Path, declared: str) -> Path:
    """Re-root recorded GGD-Asset-Library paths when the workspace moves."""
    path = Path(declared)
    if path.exists():
        return path
    parts = path.parts
    if "GGD-Asset-Library" in parts:
        offset = parts.index("GGD-Asset-Library")
        return asset_root.joinpath(*parts[offset + 1:])
    return path if path.is_absolute() else asset_root / path


def all_public_sources(download_sources: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for source in download_sources.get("publicSources", []):
        text = " ".join(str(source.get(key, "")) for key in ("target", "sourceGame"))
        if "fate/unlimited codes" in text.casefold():
            result.append(source)
    return result


def build(repo: Path = REPO, asset_root: Path = DEFAULT_ASSET_ROOT) -> dict[str, Any]:
    config_path = repo / "tools/hero-model-library/source-workflows/fate-unlimited-codes/platform-intake-v1/platform-config.json"
    local_scan_path = repo / "materials/hero-model-library/priority-evidence/fate-unlimited-codes-platforms-v1/local-payload-scan.json"
    config = read_json(config_path)
    local_scan = read_json(local_scan_path)
    require(config.get("schema") == "ggd-fuc-platform-intake-config@1", "Unexpected platform config schema")
    require(local_scan.get("schema") == "ggd-fuc-local-payload-scan@1", "Unexpected local payload scan schema")
    require(local_scan.get("scope", {}).get("readOnly") is True, "Local payload scan must remain read-only")
    require(local_scan.get("summary", {}).get("expectedPayloads") == len(config["inventoryCandidates"]),
            "Local payload scan candidate count changed")

    inventory_path = repo / "materials/hero-model-library/source-inventories/windows-game-library.json.gz"
    inventory = read_json(inventory_path)
    require(inventory.get("schema") == "ggd-windows-game-source-inventory@1", "Unexpected Windows inventory schema")
    roms = {row["id"]: row for row in inventory.get("romCandidates", [])}

    scan_zip = inventory["sourceScan"]["zip"]
    scan_zip_path = resolve_asset_path(asset_root, scan_zip["path"])
    require(scan_zip_path.is_file(), "Windows inventory ZIP is absent: " + str(scan_zip_path))
    require(scan_zip_path.stat().st_size == scan_zip["bytes"], "Windows inventory ZIP byte count changed")
    require(sha256(scan_zip_path) == scan_zip["sha256"], "Windows inventory ZIP SHA-256 changed")
    receipt = inventory["sourceScan"]["receipt"]
    require(receipt.get("romPayloadBytesRead") == 0, "Inventory evidence semantics changed; review payload claims")

    platform_versions = []
    for spec in config["inventoryCandidates"]:
        row = roms.get(spec["inventoryId"])
        require(row is not None, "Missing inventory candidate: " + spec["inventoryId"])
        require(row.get("platform") == spec["releasePlatform"], "Platform mismatch: " + spec["inventoryId"])
        require(row.get("extension", "").lstrip(".").casefold() == spec["container"].casefold(),
                "Container mismatch: " + spec["inventoryId"])
        payload_path = spec.get("payloadLocalPath")
        payload = resolve_asset_path(asset_root, payload_path) if payload_path else None
        payload_present = bool(payload and payload.is_file())
        asset_readiness = {
            kind: {
                "acquisitionStatus": "payload-present-uninspected" if payload_present else "inventory-metadata-only",
                "extractionStatus": "not-started",
                "conversionStatus": "not-started",
                "validationStatus": "not-started",
            }
            for kind in ("model", "texture", "skeleton", "motion", "vfx", "sfx", "voice")
        }
        platform_versions.append({
            "sourceId": spec["sourceId"],
            "inventoryId": spec["inventoryId"],
            "game": config["game"],
            "releasePlatform": spec["releasePlatform"],
            "region": spec["region"],
            "edition": spec["edition"],
            "container": spec["container"],
            "sourcePath": row["sourcePath"],
            "inventoryRecordedBytes": row["sizeBytes"],
            "inventoryRecordedAt": receipt["generatedAt"],
            "payloadLocalPath": str(payload) if payload else None,
            "payloadExistsLocal": payload_present,
            "payloadBytesRead": payload.stat().st_size if payload_present else 0,
            "payloadSha256": sha256(payload) if payload_present else None,
            "contentInspected": False,
            "nativeCharacterIds": [],
            "identityStatus": "payload-uninspected-native-character-ids-not-invented",
            "assetReadiness": asset_readiness,
            "acquisitionStatus": "payload-present-uninspected" if payload_present else "inventory-metadata-only",
            "extractionStatus": "not-started",
            "conversionStatus": "not-started",
            "validationStatus": "not-started",
            "registrationStatus": "not-registered",
            "runtimeSelectable": False,
            "productionDeploymentVerified": False,
        })

    download_sources_path = repo / "materials/hero-model-library/download-sources.json"
    download_sources = read_json(download_sources_path)
    public_by_id = {source["id"]: source for source in download_sources.get("publicSources", [])}
    ps2_audio_sources = []
    for source_id in config["ps2AudioSourceIds"]:
        source = public_by_id.get(source_id)
        require(source is not None, "Missing central PS2 audio source: " + source_id)
        require(source.get("platform") == "PS2", "PS2 source platform changed: " + source_id)
        local_root = resolve_asset_path(asset_root, source["localPath"])
        audio_index_path = local_root / "audioFileIndex.json"
        files_manifest_path = local_root / "files.sha256.json"
        require(local_root.is_dir(), "PS2 source root absent: " + str(local_root))
        require(audio_index_path.is_file() and files_manifest_path.is_file(), "PS2 source index absent: " + source_id)
        audio_index = read_json(audio_index_path)
        files_manifest = read_json(files_manifest_path)
        require(audio_index.get("sourceId") == source_id, "PS2 audio source ID mismatch: " + source_id)
        manifest_verification = verify_file_manifest(local_root, files_manifest, source_id)
        require(manifest_verification["audioManifestFileCount"] == audio_index["fileCount"],
                "PS2 audio index and file manifest disagree: " + source_id)
        ps2_audio_sources.append({
            "sourceId": source_id,
            "releasePlatform": "Sony PlayStation 2",
            "sourceType": "public-extracted-audio-set",
            "sourceUrl": source["url"],
            "localRoot": str(local_root),
            "assetKinds": source["assetKinds"],
            "audioFiles": audio_index["fileCount"],
            "audioSeconds": audio_index["totalSeconds"],
            "audioIndex": file_evidence(audio_index_path, repo.parent),
            "fileManifest": file_evidence(files_manifest_path, repo.parent),
            "fileManifestVerification": manifest_verification,
            "acquisitionStatus": "acquired-local-files-indexed",
            "extractionStatus": "extracted-and-decoded",
            "conversionStatus": "pcm-audio-produced",
            "identityReviewStatus": "source-labels-only-pending-human-listening-review",
            "modelRigMotionVfxStatus": "not-provided-by-this-source",
            "runtimeSelectable": False,
            "productionDeploymentVerified": False,
        })

    native_path = repo / "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2.json"
    native = read_json(native_path)
    related_id = config["relatedCommunitySourceId"]
    require(native.get("sourceId") == related_id, "FateUBW source relationship changed")
    require(native.get("summary", {}).get("servants") == 14, "FateUBW servant count changed")
    require(native.get("summary", {}).get("convertedNativeClips") == 127, "FateUBW converted clip count changed")
    require(native.get("summary", {}).get("sourceClips") == 132, "FateUBW source clip count changed")
    require(len(native.get("candidates", [])) == 14, "FateUBW candidate rows changed")
    require(sum(row["convertedNativeClipCount"] for row in native["candidates"]) == 127,
            "FateUBW per-candidate converted clip count changed")

    fuc_public_sources = []
    for source in all_public_sources(download_sources):
        local_root = resolve_asset_path(asset_root, source["localPath"])
        fuc_public_sources.append({
            "sourceId": source["id"],
            "platform": source.get("platform", "unknown"),
            "sourceUrl": source.get("url"),
            "localPath": source["localPath"],
            "localRootExists": local_root.is_dir(),
            "assetKinds": source.get("assetKinds", []),
            "heroIds": source.get("heroIds", []),
            "relationship": "supplemental-public-source-not-proof-of-original-game-payload",
        })

    related_community = {
        "sourceId": related_id,
        "sourceGame": native["sourceGame"],
        "platform": native["platform"],
        "relationshipToFuc": "separate-community-minecraft-source-with-overlapping-servants",
        "servants": 14,
        "sourceClips": 132,
        "convertedNativeClips": 127,
        "retainedNoDurationSourcePoses": 5,
        "conversionEvidence": file_evidence(native_path, repo),
        "status": native["status"],
        "runtimeSelectable": False,
        "productionDeploymentVerified": False,
        "candidateIds": [row["candidateId"] for row in native["candidates"]],
    }

    native_reference_spec = config["nativeFormatReference"]
    native_reference_root = resolve_asset_path(asset_root, native_reference_spec["localPath"])
    native_reference_manifest_path = native_reference_root / "source-manifest.json"
    native_reference_summary_path = native_reference_root / "analysis/native-index-summary.json"
    native_reference_validation_path = native_reference_root / "validation.json"
    require(native_reference_root.is_dir(), "PSP GMO format reference root absent")
    native_reference_manifest = read_json(native_reference_manifest_path)
    native_reference_summary = read_json(native_reference_summary_path)
    native_reference_validation = read_json(native_reference_validation_path)
    require(native_reference_manifest.get("sourceId") == native_reference_spec["sourceId"],
            "PSP GMO format reference source ID changed")
    require(native_reference_manifest.get("sourceGame") == "unknown",
            "PSP GMO format reference game identity changed; review before assigning")
    require(native_reference_summary.get("fucNativePackages") == 0,
            "PSP GMO reference unexpectedly claims FUC packages")
    require(native_reference_validation.get("fucNativePackages") == 0,
            "PSP GMO validation unexpectedly claims FUC packages")
    native_format_reference = {
        "sourceId": native_reference_spec["sourceId"],
        "localRoot": str(native_reference_root),
        "sourcePlatform": "Sony PSP",
        "sourceGame": "unknown",
        "sourceGameHint": "Dissidia Final Fantasy naming is present; exact title/version is unverified.",
        "relationshipToFuc": "format-and-parser-reference-only-not-fuc-game-payload",
        "nativeGmoFiles": native_reference_summary["nativeModels"],
        "nativeMotionBlocks": native_reference_summary["nativeMotionRecords"],
        "nativeGimPayloads": native_reference_summary["embeddedImagePayloads"],
        "fucNativePackages": 0,
        "sourceManifest": file_evidence(native_reference_manifest_path, repo.parent),
        "summaryEvidence": file_evidence(native_reference_summary_path, repo.parent),
        "validationEvidence": file_evidence(native_reference_validation_path, repo.parent),
        "usableForToolValidation": True,
        "usableAsFucCharacterAsset": False,
        "runtimeSelectable": False,
        "productionDeploymentVerified": False,
    }

    missing = list(config["missingOriginalReleases"])
    missing.append({
        "sourceId": "fuc-psp-native-assets-from-lv99",
        "status": "blocked-payload-not-present-locally",
        "need": "Copy or mount the two inventoried PSP payloads read-only, then run extract_disc_payload.py into new output directories.",
    })
    missing.append({
        "sourceId": "fuc-native-gmo-conversion",
        "status": "pending-real-native-sample",
        "need": "Inspect extracted FPK/GMO/GIM bytes before selecting or extending the existing GMO conversion tools; current FPK parser has synthetic-fixture coverage only.",
    })

    return {
        "schema": "ggd-fuc-platform-source-index@1",
        "game": config["game"],
        "generatedFrom": {
            "config": file_evidence(config_path, repo),
            "localPayloadScan": file_evidence(local_scan_path, repo),
            "windowsInventory": file_evidence(inventory_path, repo),
            "windowsInventoryZip": file_evidence(scan_zip_path, repo.parent),
            "downloadSources": file_evidence(download_sources_path, repo),
            "fateUbwNativeMotion": file_evidence(native_path, repo),
        },
        "statusSemantics": {
            "inventory-metadata-only": "A remote file name and recorded size exist; no payload byte was read and no content hash is available.",
            "acquired-local-files-indexed": "Local files and indexes exist; this does not imply runtime registration or production deployment.",
        },
        "localPayloadSearch": local_scan,
        "originalGamePlatformVersions": platform_versions,
        "otherPlatformSources": {
            "ps2PublicAudio": ps2_audio_sources,
            "missingOriginalReleases": config["missingOriginalReleases"],
        },
        "supplementalPublicSources": fuc_public_sources,
        "nonFucPspNativeFormatReference": native_format_reference,
        "relatedCommunityReserve": related_community,
        "gaps": missing,
        "summary": {
            "originalGameInventoryRows": len(platform_versions),
            "originalGamePayloadsPresentLocal": sum(row["payloadExistsLocal"] for row in platform_versions),
            "localSearchRootsRead": local_scan["summary"]["rootsReadable"],
            "localSearchFilesVisited": local_scan["summary"]["filesVisited"],
            "localSearchPermissionErrors": local_scan["summary"]["permissionErrors"],
            "localSearchExactPayloadMatches": local_scan["summary"]["exactPayloadMatches"],
            "originalGamePayloadBytesRead": sum(row["payloadBytesRead"] for row in platform_versions),
            "originalGamePayloadsExtracted": 0,
            "originalGameNativeModelsConverted": 0,
            "originalGameNativeAnimationsConverted": 0,
            "originalGameNativeVfxConverted": 0,
            "originalGameNativeAudioConverted": 0,
            "originalGameModelPolicyCandidates": 0,
            "originalGameModelPolicyPass": 0,
            "ps2PublicAudioSourcesAcquired": len(ps2_audio_sources),
            "ps2PublicAudioFiles": sum(row["audioFiles"] for row in ps2_audio_sources),
            "ps2PublicManifestFilesVerified": sum(
                row["fileManifestVerification"]["manifestFileCount"] for row in ps2_audio_sources),
            "ps2PublicManifestBytesVerified": sum(
                row["fileManifestVerification"]["manifestBytes"] for row in ps2_audio_sources),
            "nonFucPspReferenceGmoFiles": native_format_reference["nativeGmoFiles"],
            "nonFucPspReferenceMotionBlocks": native_format_reference["nativeMotionBlocks"],
            "supplementalPublicSources": len(fuc_public_sources),
            "fateUbwServants": 14,
            "fateUbwConvertedNativeClips": 127,
            "runtimeSelectableSources": 0,
            "productionDeployedSources": 0,
        },
    }


def render_markdown(index: dict[str, Any]) -> str:
    lines = [
        "# Fate/unlimited codes 平台來源與轉換狀態",
        "",
        "> 本文件由 `build_source_index.py` 依 Windows 清單、中央來源表與驗證收據產生；請勿只手改數字。",
        "",
        "## 原作遊戲映像",
        "",
        "| 來源 ID | 平台／區域 | 容器 | 清單大小 | 實檔狀態 | 擷取／轉換／註冊 |",
        "| --- | --- | --- | ---: | --- | --- |",
    ]
    for row in index["originalGamePlatformVersions"]:
        lines.append(
            f"| `{row['sourceId']}` | {row['releasePlatform']}／{row['region']} | {row['container']} | "
            f"{row['inventoryRecordedBytes']} | {row['acquisitionStatus']} | "
            f"{row['extractionStatus']}／{row['conversionStatus']}／{row['registrationStatus']} |"
        )
    lines += [
        "",
        f"兩筆目前都只是 LV99 Windows 清單 metadata：另以唯讀掃描器巡覽 {index['summary']['localSearchRootsRead']} 個本機根目錄／{index['summary']['localSearchFilesVisited']} 個檔案，精確檔名＋大小匹配 {index['summary']['localSearchExactPayloadMatches']}，權限錯誤 {index['summary']['localSearchPermissionErrors']}；payload 讀取仍為 0 bytes，沒有內容 SHA-256。",
        "",
        "## 其他平台與社群來源",
        "",
        f"- PS2 公開音訊來源：{index['summary']['ps2PublicAudioSourcesAcquired']} 組，"
        f"共 {index['summary']['ps2PublicAudioFiles']} 個 WAV；已逐檔讀取並核對 "
        f"{index['summary']['ps2PublicManifestFilesVerified']} 筆／"
        f"{index['summary']['ps2PublicManifestBytesVerified']} bytes 的大小與 SHA-256，"
        "角色／事件仍待逐段聽審。",
        "- PS2 原作光碟與 Arcade 原始資料：尚未找到實檔。",
        f"- PSP GMO 工具參考樣本：{index['summary']['nonFucPspReferenceGmoFiles']} 個 GMO／"
        f"{index['summary']['nonFucPspReferenceMotionBlocks']} 個動作區塊；來源遊戲未核，"
        "檔名指向 Dissidia 系列，且驗證收據明列 FUC 原生包為 0，只能測格式工具。",
        f"- FateUBW Minecraft：獨立社群來源，14 名英靈、132 個來源片段、"
        f"127 個已轉換原生時長片段；5 個無時長來源姿勢另列衍生處理，不冒充原作 FUC 素材。",
        "- 所有項目目前都未因本索引而成為後台可切換選項，也未證明正式站部署。",
        "",
        "## 下一步",
        "",
        "1. 以唯讀掛載或複製方式提供日版 ZIP 與美版 ISO 實檔，為每個版本建立獨立 intake 目錄。",
        "2. 用 `extract_disc_payload.py` 先做成員清單、路徑安全檢查、來源 SHA-256，再解到全新目錄。",
        "3. 對擷取出的 FPK 使用既有 `first-batch/extract_fate_fpk.py`；其真實 FUC 樣本驗證仍為缺口。",
        "4. 依 GMO／GIM／音訊容器實際結果選擇轉換器，逐角色驗證後才能註冊模型選項。",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--asset-root", type=Path, default=DEFAULT_ASSET_ROOT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    index = build(args.repo.resolve(), args.asset_root.resolve())
    output_dir = args.repo / "materials/hero-model-library/priority-evidence/fate-unlimited-codes-platforms-v1"
    json_path = output_dir / "source-index.json"
    markdown_path = output_dir / "source-index.md"
    encoded_json = json.dumps(index, ensure_ascii=False, indent=2) + "\n"
    encoded_markdown = render_markdown(index)
    if args.check:
        require(json_path.read_text() == encoded_json, "Refresh generated FUC source index JSON")
        require(markdown_path.read_text() == encoded_markdown, "Refresh generated FUC source index Markdown")
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path.write_text(encoded_json)
        markdown_path.write_text(encoded_markdown)
    print(json.dumps(index["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
