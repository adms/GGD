#!/usr/bin/env python3
"""Verify and classify local Fate/unlimited codes material without merging platforms."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
WORKSPACE = REPO.parent
DEFAULT_ASSET_ROOT = WORKSPACE / "GGD-Asset-Library"
OUT = REPO / "materials/hero-model-library/priority-evidence/fate-unlimited-codes-platforms-v1"


def read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path, base: Path | None = None) -> dict[str, Any]:
    return {
        "path": path.relative_to(base).as_posix() if base and path.is_relative_to(base) else str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def resolve_asset_path(asset_root: Path, declared: str) -> Path:
    path = Path(declared)
    if path.exists():
        return path
    if "GGD-Asset-Library" in path.parts:
        offset = path.parts.index("GGD-Asset-Library")
        return asset_root.joinpath(*path.parts[offset + 1:])
    return path if path.is_absolute() else asset_root / path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def locate_manifest(root: Path) -> tuple[Path, Path, list[dict[str, Any]]]:
    candidates = [root / "files.sha256.json", root / "source-file-manifest.json", root.parent / "files.sha256.json"]
    accepted = {"ggd.source-files.intake@1", "ggd.file-sha256-manifest@1", "ggd.source-files@1"}
    for path in candidates:
        if not path.is_file():
            continue
        payload = read(path)
        if payload.get("schema") not in accepted or not isinstance(payload.get("files"), list):
            continue
        rows = payload["files"]
        base = path.parent
        if base == root.parent and path.name == "files.sha256.json":
            prefix = root.name + "/"
            rows = [row for row in rows if row.get("path", "").startswith(prefix)]
        if rows:
            return path, base, rows
    raise ValueError("No usable source file manifest for " + str(root))


def verify_manifest(root: Path) -> dict[str, Any]:
    manifest_path, base, rows = locate_manifest(root)
    verified_bytes = 0
    for row in rows:
        relative = Path(row["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "Unsafe manifest path: " + row["path"])
        path = base / relative
        require(path.is_file(), "Missing source file: " + str(path))
        require(path.stat().st_size == row["bytes"], "Source file size changed: " + str(path))
        require(sha256(path) == row["sha256"], "Source file SHA-256 changed: " + str(path))
        verified_bytes += row["bytes"]
    return {
        "manifest": pin(manifest_path, WORKSPACE),
        "verifiedFiles": len(rows),
        "verifiedBytes": verified_bytes,
        "allMemberSha256Verified": True,
    }


def recursive_integer(payload: Any, key: str) -> int:
    if isinstance(payload, dict):
        own = payload.get(key)
        values = [own] if isinstance(own, int) and not isinstance(own, bool) else []
        values.extend(recursive_integer(value, key) for value in payload.values())
        return max(values, default=0)
    if isinstance(payload, list):
        return max((recursive_integer(value, key) for value in payload), default=0)
    return 0


def audit_source(source: dict[str, Any], asset_root: Path) -> dict[str, Any]:
    root = resolve_asset_path(asset_root, source["localPath"])
    require(root.is_dir(), "FUC source root is absent: " + str(root))
    file_receipt = verify_manifest(root)

    candidate_path = root / "candidate-manifest.json"
    candidates = read(candidate_path).get("candidates", []) if candidate_path.is_file() else []
    verified_candidates = []
    for candidate in candidates:
        model = candidate.get("model")
        if not model:
            continue
        path = root / model
        require(path.is_file(), "Candidate GLB is absent: " + str(path))
        require(sha256(path) == candidate["sha256"], "Candidate GLB SHA-256 changed: " + str(path))
        if candidate.get("bytes") is not None:
            require(path.stat().st_size == candidate["bytes"], "Candidate GLB size changed: " + str(path))
        hero_ids = sorted(set(source.get("heroIds", [])) | set(candidate.get("heroIds", [])))
        verified_candidates.append({
            "candidateId": candidate["candidateId"],
            "character": candidate.get("character", "identity-pending"),
            "heroIds": hero_ids,
            "variant": candidate.get("variant"),
            "absolutePath": str(path),
            "bytes": path.stat().st_size,
            "sha256": candidate["sha256"],
            "sourcePlatform": candidate.get("sourcePlatform", source.get("platform", "unknown")),
            "sourceSkeleton": candidate.get("sourceSkeleton"),
            "skeletonCandidate": bool(
                candidate.get("sourceSkeleton")
                or candidate.get("skinCount", 0)
                or candidate.get("jointCount", 0)
                or candidate.get("jointCounts")
            ),
            "animationEntries": candidate.get("animationEntryCount", candidate.get("animationCount", 0)),
            "textureReferences": candidate.get("textureCount", 0),
            "conversionStatus": candidate.get("readyStage", "candidate-recorded"),
            "runtimeReady": bool(candidate.get("runtimeReady", False)),
            "backendSelectionVerified": bool(candidate.get("backendSelectionVerified", False)),
        })

    audio_path = root / "audioFileIndex.json"
    audio = read(audio_path) if audio_path.is_file() else {}
    audio_files = audio.get("fileCount")
    if not isinstance(audio_files, int):
        audio_files = len(audio.get("files", []))
    voice_files = audio.get("voiceFiles")
    if not isinstance(voice_files, int):
        voice_files = None

    texture_path = root / "texture-index.json"
    textures = read(texture_path) if texture_path.is_file() else {}
    texture_files = textures.get("fileCount", 0)

    motion_path = root / "motion-index.json"
    motion = read(motion_path) if motion_path.is_file() else {}
    motion_entries = motion.get("glbAnimationEntries", 0)
    native_motion_entries = motion.get("fateOriginalMotionCount", 0)

    validation_path = root / "validation.json"
    validation = read(validation_path) if validation_path.is_file() else {}
    native_motion_entries = max(native_motion_entries, validation.get("nativeOriginalAnimations", 0))
    native_vfx = max(
        validation.get("nativeOriginalVFX", 0),
        validation.get("sourceParticleSystems", 0),
        validation.get("vfxCount", 0),
    )
    source_manifest_path = root / "source-manifest.json"
    source_manifest = read(source_manifest_path) if source_manifest_path.is_file() else {}
    native_packages = max(
        recursive_integer(source_manifest, "nativeFucPackages"),
        recursive_integer(source_manifest, "nativeFucAcquisitionCount"),
        recursive_integer(validation, "nativeFucPackages"),
    )
    platform = source.get("platform", "unknown")
    source_class = "confirmed-psp-supplemental" if platform == "PSP" else (
        "confirmed-ps2-supplemental" if platform == "PS2" else "platform-unverified-community-supplemental"
    )
    target_text = str(source.get("target", "")).casefold()
    audio_role = "music-not-voice" if "音樂" in target_text or voice_files == 0 and audio_files else "unclassified-audio-pending-listening"
    return {
        "sourceId": source["id"],
        "target": source.get("target"),
        "sourceUrl": source.get("url"),
        "sourceGame": source.get("sourceGame"),
        "platform": platform,
        "platformClass": source_class,
        "platformBoundary": "A source label or MOD port does not prove PSP/PS2 native origin.",
        "assetKindsDeclared": source.get("assetKinds", []),
        "heroIds": source.get("heroIds", []),
        "localRoot": str(root),
        "fileVerification": file_receipt,
        "modelCandidates": verified_candidates,
        "modelCandidateCount": len(verified_candidates),
        "skeletonCandidateCount": sum(row["skeletonCandidate"] for row in verified_candidates),
        "candidateTextureReferences": sum(row["textureReferences"] for row in verified_candidates),
        "communityReplacementTextureFiles": texture_files,
        "motionEntries": motion_entries,
        "nativeFucMotionEntries": native_motion_entries,
        "nativeFucVfxEntries": native_vfx,
        "nativeFucPackages": native_packages,
        "audioFiles": audio_files,
        "audioRole": audio_role,
        "voiceIdentityStatus": "pending-listening-review" if audio_files else "no-audio-in-source-index",
        "backup": source.get("backup"),
        "s3ReadbackVerified": bool(source.get("backup", {}).get("readbackVerified")),
        "runtimeSelectable": False,
        "productionDeploymentVerified": False,
    }


def render_markdown(data: dict[str, Any]) -> str:
    s = data["summary"]
    lines = [
        "# Fate/unlimited codes PSP 素材來源盤點",
        "",
        "> 本文件由 `build_psp_asset_audit.py` 逐檔讀取本機 manifest、SHA-256 與候選收據生成。PSP、PS2、平台未核社群 MOD 永久分列；取得或標準 GLB 候選不等於後台可切換或正式站上架。",
        "",
        "## 結果",
        "",
        f"- PSP 原作映像：Windows 清單 {s['originalPspInventoryRows']} 筆；本機 payload {s['originalPspPayloadsPresent']}、已解包 {s['originalPspPayloadsExtracted']}、原生模型／動作／VFX／音訊轉換均為 0。",
        f"- PSP 已核平台的社群補充：{s['confirmedPspSupplementalSources']} 組，{s['pspCommunityReplacementTextures']} 張替換 PNG；其中 FUC 原生 FPK/GMO 包 {s['nativeFucPackages']}。",
        f"- 平台未核社群 MOD：{s['unknownPlatformSources']} 組；標準 GLB 候選 {s['standardGlbCandidates']} 顆（SHA 驗證 {s['standardGlbCandidatesVerified']}），骨架候選 {s['skeletonCandidates']}，MOD 動作項 {s['communityMotionEntries']}，FUC 原生動作證據 {s['nativeFucMotionEntries']}。",
        f"- 音訊：PS2 公開 WAV {s['ps2AudioFiles']}；平台未核角色音訊 {s['unknownPlatformCharacterAudioFiles']}；另有音樂 {s['musicFiles']}，不列入語音。所有說話者、語言與事件仍待聽審。",
        f"- 本機逐檔 SHA：{s['sourceFilesShaVerified']} 檔／{s['sourceBytesShaVerified']} bytes；S3 讀回收據 {s['s3ReadbackVerifiedSources']}/{s['centralFucSources']} 組。",
        "",
        "## 來源分流",
        "",
        "| 來源 ID | 平台證據 | 模型／骨架 | 動作（原生 FUC） | 替換貼圖 | 音訊 | 狀態 |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in data["sources"]:
        lines.append(
            f"| `{row['sourceId']}` | {row['platformClass']} | {row['modelCandidateCount']}／{row['skeletonCandidateCount']} | "
            f"{row['motionEntries']}（{row['nativeFucMotionEntries']}） | {row['communityReplacementTextureFiles']} | "
            f"{row['audioFiles']} | acquired/indexed；runtimeSelectable=false |"
        )
    lines += [
        "",
        "## 原作 PSP 缺口",
        "",
        "日版 ZIP 與美版 ISO 目前仍只有 `E:\\Game\\單機遊戲` 的 Windows 清單紀錄；這台 Mac 沒有可讀 payload，因此沒有內容 SHA、FPK/GMO/GIM 成員清單或角色 ID。取得唯讀掛載後先跑 `scan_local_payloads.py`，再用 `extract_disc_payload.py` 建獨立版本 intake。",
        "",
        "Kirei 的 349 個動作項來自 Sven/GoldSrc MOD；其 `fateOriginalMotionCount=0`。13 顆 GLB 是五名角色的社群 MOD 轉換候選，來源平台未核，不能寫成 PSP 原生模型。103 張 PNG 是 PPSSPP 替換貼圖／介面素材，沒有模型、骨架、原生動作或 VFX。",
        "",
    ]
    return "\n".join(lines)


def build(repo: Path = REPO, asset_root: Path = DEFAULT_ASSET_ROOT) -> dict[str, Any]:
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    platform_path = repo / "materials/hero-model-library/priority-evidence/fate-unlimited-codes-platforms-v1/source-index.json"
    downloads = read(downloads_path)
    platform = read(platform_path)
    sources = []
    for source in downloads.get("publicSources", []):
        text = " ".join(str(source.get(key, "")) for key in ("target", "sourceGame"))
        if "fate/unlimited codes" in text.casefold():
            sources.append(audit_source(source, asset_root))
    require(len(sources) == platform["summary"]["supplementalPublicSources"], "FUC central source count changed")

    ps2 = [row for row in sources if row["platformClass"] == "confirmed-ps2-supplemental"]
    psp = [row for row in sources if row["platformClass"] == "confirmed-psp-supplemental"]
    unknown = [row for row in sources if row["platformClass"] == "platform-unverified-community-supplemental"]
    all_candidates = [candidate for row in sources for candidate in row["modelCandidates"]]
    character_audio = sum(row["audioFiles"] for row in unknown if row["audioRole"] != "music-not-voice")
    music_files = sum(row["audioFiles"] for row in sources if row["audioRole"] == "music-not-voice")
    summary = {
        "originalPspInventoryRows": platform["summary"]["originalGameInventoryRows"],
        "originalPspPayloadsPresent": platform["summary"]["originalGamePayloadsPresentLocal"],
        "originalPspPayloadBytesRead": platform["summary"]["originalGamePayloadBytesRead"],
        "originalPspPayloadsExtracted": platform["summary"]["originalGamePayloadsExtracted"],
        "originalPspNativeModelsConverted": platform["summary"]["originalGameNativeModelsConverted"],
        "originalPspNativeAnimationsConverted": platform["summary"]["originalGameNativeAnimationsConverted"],
        "originalPspNativeVfxConverted": platform["summary"]["originalGameNativeVfxConverted"],
        "originalPspNativeAudioConverted": platform["summary"]["originalGameNativeAudioConverted"],
        "centralFucSources": len(sources),
        "confirmedPspSupplementalSources": len(psp),
        "confirmedPs2SupplementalSources": len(ps2),
        "unknownPlatformSources": len(unknown),
        "pspCommunityReplacementTextures": sum(row["communityReplacementTextureFiles"] for row in psp),
        "standardGlbCandidates": len(all_candidates),
        "standardGlbCandidatesVerified": len(all_candidates),
        "skeletonCandidates": sum(row["skeletonCandidateCount"] for row in sources),
        "communityMotionEntries": sum(row["motionEntries"] for row in sources),
        "nativeFucMotionEntries": sum(row["nativeFucMotionEntries"] for row in sources),
        "nativeFucVfxEntries": sum(row["nativeFucVfxEntries"] for row in sources),
        "nativeFucPackages": sum(row["nativeFucPackages"] for row in sources),
        "ps2AudioFiles": sum(row["audioFiles"] for row in ps2),
        "unknownPlatformCharacterAudioFiles": character_audio,
        "musicFiles": music_files,
        "sourceFilesShaVerified": sum(row["fileVerification"]["verifiedFiles"] for row in sources),
        "sourceBytesShaVerified": sum(row["fileVerification"]["verifiedBytes"] for row in sources),
        "s3ReadbackVerifiedSources": sum(row["s3ReadbackVerified"] for row in sources),
        "runtimeSelectableSources": 0,
        "productionDeployedSources": 0,
    }
    return {
        "schema": "ggd-fuc-psp-asset-audit@1",
        "scope": {
            "pspPs2AndUnknownSeparated": True,
            "sourceFilesReadOnly": True,
            "inventoryMetadataIsNotPayload": True,
            "communityPortIsNotNativePsp": True,
            "conversionCandidateIsNotRuntimeRegistration": True,
        },
        "generatedFrom": {
            "downloadSources": pin(downloads_path, repo),
            "platformIndex": pin(platform_path, repo),
            "generator": pin(Path(__file__).resolve(), repo),
        },
        "originalPsp": platform["originalGamePlatformVersions"],
        "sources": sorted(sources, key=lambda row: (row["platformClass"], row["sourceId"])),
        "summary": summary,
        "gaps": [
            "Original Japan ZIP and USA ISO payloads are not locally readable on this Mac.",
            "No original FUC FPK/GMO/GIM member list or native character identity has been inspected.",
            "No FUC-native skeleton, motion, VFX, SFX or voice event map is verified.",
            "Community model/audio candidates require platform provenance and human visual/listening review.",
            "No backend option, runtime selection or production deployment was performed.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--asset-root", type=Path, default=DEFAULT_ASSET_ROOT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build(args.repo.resolve(), args.asset_root.resolve())
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    document = render_markdown(data)
    json_path, md_path = OUT / "psp-asset-audit.json", OUT / "psp-asset-audit.md"
    if args.check:
        require(json_path.read_text() == encoded, "Refresh generated FUC PSP asset audit JSON")
        require(md_path.read_text() == document, "Refresh generated FUC PSP asset audit Markdown")
    else:
        json_path.write_text(encoded)
        md_path.write_text(document)
    print(json.dumps(data["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
