#!/usr/bin/env python3
"""Register the verified KOF XIV MAI/IOR/KYO native extraction."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


SOURCE_ID = "steam-kofxiv-priority-mai-ior-kyo-build-local-v126"
REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
GIT_EVIDENCE = REPO / "materials/hero-model-library/source-inventories/kof-xiv-priority-v1"
SUPPLEMENTAL = REPO / "materials/hero-model-library/design-backlog/sources-supplemental.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument(
        "--local-root",
        default="GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1",
    )
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    manifest_path = local_root / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "ggd-kofxiv-priority-extraction@1" or manifest.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected KOF XIV extraction manifest")
    if manifest["wadIndex"] != {"totalEntries": 39889, "pathSafetyVerified": True, "priorityEntries": 1088}:
        raise ValueError("KOF XIV extraction scope changed")
    expected_names = {row["nativeCharacterId"]: row for row in manifest["characters"]}
    if set(expected_names) != {"MAI", "IOR", "KYO"} or expected_names["KYO"]["heroIds"]:
        raise ValueError("native character mapping changed")
    for index_key in ("filesIndex", "audioFilesIndex", "audioFileIndex"):
        row = manifest[index_key]
        if sha256(local_root / row["path"]) != row["sha256"]:
            raise ValueError("frozen extraction index changed: " + row["path"])
    audio_analysis_path = local_root / "audio-analysis-v2.json"
    audio_analysis = json.loads(audio_analysis_path.read_text(encoding="utf-8"))
    if (
        audio_analysis.get("schema") != "ggd-kofxiv-audio-analysis@2"
        or audio_analysis.get("fileCount") != 474
        or audio_analysis.get("decodeToNullPassed") is not True
        or audio_analysis.get("sourceCategoryCounts") != {"sfx": 82, "voice": 392}
    ):
        raise ValueError("KOF XIV audio analysis differs")

    GIT_EVIDENCE.mkdir(parents=True, exist_ok=True)
    copied = []
    for name in ("source-manifest.json", "files.jsonl.gz", "audio-files.jsonl.gz", "audio-file-index.json", "audio-analysis-v2.json"):
        source_path = local_root / name
        target_path = GIT_EVIDENCE / name
        shutil.copyfile(source_path, target_path)
        copied.append({
            "gitPath": target_path.relative_to(REPO).as_posix(),
            "bytes": target_path.stat().st_size,
            "sha256": sha256(target_path),
        })

    candidates = []
    for native_id in ("MAI", "IOR", "KYO"):
        row = expected_names[native_id]
        candidates.append({
            "candidateId": f"kof-xiv-native-{native_id.lower()}-raw-v1",
            "sourceId": SOURCE_ID,
            "name": row["nameZh"],
            "character": f"{row['nameZh']} / {row['originalName']}",
            "nativeCharacterId": native_id,
            "heroIds": row["heroIds"],
            "sourceGame": "THE KING OF FIGHTERS XIV",
            "platform": "Windows (Steam, Release 1.26 marker)",
            "selectionClass": "canonical-game",
            "assetKinds": sorted(key for key, count in row["assetKindCounts"].items() if count),
            "fileCount": row["fileCount"],
            "bytes": row["bytes"],
            "modelState": "native-obac-extracted-pending-conversion",
            "animationState": "native-otra-extracted-pending-conversion",
            "vfxState": "native-effect-records-extracted-pending-conversion",
            "audioState": "ogg-decoded-source-directory-role-classified-pending-listening-and-event-review",
            "designStatus": row["designStatus"],
            "defaultEligible": False,
            "backendSelectable": False,
            "deployed": False,
        })

    kyo_body = local_root / "extracted/Chara/KYO/KYO.obac"
    kyo = expected_names["KYO"]
    supplemental_record = {
        "id": "community:kof-xiv-kyo-native-v1",
        "name": "草薙京",
        "work": "THE KING OF FIGHTERS XIV",
        "sourceIds": [SOURCE_ID],
        "aliases": ["草薙京", "Kyo Kusanagi", "KYO"],
        "modelCandidates": [{
            "id": "kof-xiv-native-kyo-body-obac-v1",
            "sourceCandidateId": "kof-xiv-native-kyo-raw-v1",
            "sourceId": SOURCE_ID,
            "library": "community",
            "path": str(kyo_body),
            "bytes": kyo_body.stat().st_size,
            "sha256": sha256(kyo_body),
            "format": "kofxiv-obac",
            "versionStage": "native-extracted-v1",
            "readiness": "native-character-body-extracted-pending-proprietary-format-conversion",
            "existsLocal": True,
            "resourceRole": "character-body",
            "sourceClass": "canonical-game-direct-extraction",
            "modelSourceUrl": "https://store.steampowered.com/app/571260/",
            "sourceGame": "THE KING OF FIGHTERS XIV",
            "sourcePlatform": "Windows (Steam, Release 1.26 marker)",
            "nativeAnimationCount": kyo["assetKindCounts"]["animation"],
            "textureCount": kyo["assetKindCounts"]["texture"],
            "skeletonFileCount": kyo["assetKindCounts"]["skeleton"],
            "audioCount": kyo["assetKindCounts"]["audio"],
            "nativeEffectRecordCount": kyo["assetKindCounts"]["vfx"],
            "defaultEligible": False,
            "runtimeSelectable": False,
        }],
        "mappedHeroIds": [],
        "identityHeroIds": [],
        "proxyUseHeroIds": [],
        "possibleIdentityHeroIds": [],
        "designStatus": "not-defined",
        "noDesignReason": "KOF XIV 原生 KYO 目錄與 KYO.obac 已驗證；目前沒有草薙京的 GGD 英雄定義，因此保留作品、來源 ID 與原生角色 ID，未杜撰英雄 ID。",
        "evidence": {
            "nativeCharacterId": "KYO",
            "identityConfidence": "native-character-directory-exact",
            "sourceManifestGitPath": copied[0]["gitPath"],
            "sourceManifestSha256": copied[0]["sha256"],
        },
    }
    supplemental = json.loads(SUPPLEMENTAL.read_text(encoding="utf-8"))
    supplemental_match_indexes = [
        index for index, row in enumerate(supplemental["characters"])
        if row.get("id") == supplemental_record["id"]
    ]
    if len(supplemental_match_indexes) > 1:
        raise ValueError("KYO supplemental design record is duplicated")
    if supplemental_match_indexes:
        index = supplemental_match_indexes[0]
        existing_record = supplemental["characters"][index]
        existing_stable = json.loads(json.dumps(existing_record))
        expected_stable = json.loads(json.dumps(supplemental_record))
        existing_stable["evidence"].pop("sourceManifestSha256", None)
        expected_stable["evidence"].pop("sourceManifestSha256", None)
        if existing_stable != expected_stable:
            raise ValueError("existing KYO supplemental design record differs outside regenerated manifest hash")
        supplemental["characters"][index] = supplemental_record
        SUPPLEMENTAL.write_text(json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        supplemental["characters"].append(supplemental_record)
        SUPPLEMENTAL.write_text(json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    source = {
        "id": SOURCE_ID,
        "target": "KOF XIV 原作素材／不知火舞、八神庵、草薙京",
        "heroIds": ["community-review-02-20260907", "community-review-03-20260907"],
        "ownerEntryIds": [],
        "url": "https://store.steampowered.com/app/571260/",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "AGAR WAD 1.1 / OBAC, OMIR, OSEC, OTRA, DDS, PNG, OGG and effect/config records",
        "accessStatus": "local-installed-game-readonly-share",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "native-assets-extracted-pending-proprietary-format-conversion",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "canonical-game-model-animation-vfx-audio-reserve",
        "localPath": local_root.relative_to(workspace).as_posix(),
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam, Release 1.26 marker)",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": ["model", "texture", "skeleton", "animation", "vfx", "audio", "configuration"],
        "publicationStatus": "local-only-awaiting-s3-upload",
        "files": [],
        "filesManifest": {"path": "source-manifest.json", "sha256": sha256(manifest_path)},
        "extractedFilesIndex": manifest["filesIndex"],
        "audioFileIndex": {
            "reportPath": manifest["audioFileIndex"]["path"],
            "reportSha256": manifest["audioFileIndex"]["sha256"],
        },
        "audioCount": manifest["audioFileIndex"]["fileCount"],
        "primaryAudioFormats": [".ogg"],
        "audioGroups": audio_analysis["audioGroups"],
        "audioAnalysis": {
            "gitPath": copied[-1]["gitPath"],
            "sha256": copied[-1]["sha256"],
            "fileCount": audio_analysis["fileCount"],
            "totalDurationSeconds": audio_analysis["totalDurationSeconds"],
            "sourceCategoryCounts": audio_analysis["sourceCategoryCounts"],
            "decodeToNullPassed": audio_analysis["decodeToNullPassed"],
            "classificationEvidence": audio_analysis["classificationEvidence"],
        },
        "gitEvidence": copied,
        "modelCandidates": candidates,
        "unboundNativeCharacters": [{
            "nativeCharacterId": "KYO",
            "nameZh": "草薙京",
            "originalName": "Kyo Kusanagi",
            "state": "acquired-model-awaiting-hero-design",
            "reason": "No verified GGD hero definition was found; no hero ID was invented.",
        }],
        "backendIntegration": {"required": True, "state": "pending-conversion-validation-and-binding", "selectionVerified": False},
        "verification": "QuickBMS 0.12.0 with the pinned official kofxiv.bms 0.2 script listed 39,889 safe WAD paths and extracted the exact 1,088 MAI/IOR/KYO entries. Every extracted file has an absolute path, byte count and SHA-256 in the frozen index. All 474 OGG files pass full FFmpeg decode; native Sound/voice and Sound/se directory labels are retained without asserting language, speaker, transcript or skill event. 已完成固定 ZIP 的 S3 完整讀回與逐成員 SHA-256 驗證。",
        "limitations": manifest["limitations"],
    }
    document = json.loads(DOWNLOADS.read_text(encoding="utf-8"))
    matches = [row for collection in ("publicSources", "paidSources") for row in document.get(collection, []) if row.get("id") == SOURCE_ID]
    if matches:
        if len(matches) != 1:
            raise ValueError("source ID is duplicated")
        regenerated = {
            "publicationStatus", "pendingBackup", "backup", "verification", "filesManifest",
            "audioFileIndex", "audioGroups", "audioAnalysis", "gitEvidence", "limitations", "modelCandidates",
        }
        existing = matches[0]
        # One pre-publication schema correction from the same workflow renamed
        # candidates and normalized acquisitionStatus to the central contract.
        if "candidates" in existing and "modelCandidates" not in existing:
            existing["modelCandidates"] = existing.pop("candidates")
        if existing.get("acquisitionStatus") == "downloaded-extracted-verified":
            existing["acquisitionStatus"] = "downloaded-verified"
        if {k: v for k, v in existing.items() if k not in regenerated} != {k: v for k, v in source.items() if k not in regenerated}:
            raise ValueError("existing source differs; refusing to overwrite another workflow")
        preserved = {
            key: existing[key]
            for key in ("publicationStatus", "pendingBackup", "backup")
            if key in existing
        }
        existing.clear()
        existing.update(source)
        existing.update(preserved)
        DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"sourceId": SOURCE_ID, "status": "already-integrated", "schemaNormalized": True}))
        return 0
    document["publicSources"].append(source)
    DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceId": SOURCE_ID, "status": "integrated", "candidates": len(candidates), "files": 1088}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
