#!/usr/bin/env python3
"""Register the acquired Sabakan359 Vearn MMD archive and owner-review derivatives."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


SOURCE_ID = "bowlroll-sabakan359-vearn-mmd-v087"
ARCHIVE_SHA256 = "5948beb33e350ce50da0294e2ce387b6c533cd3e783b2b1759662f00dc0ed0a3"
ARCHIVE_BYTES = 8_370_775
BACKUP_SHA256 = "2db6d41ce067b580bf670fe0041e0e96790ca3b94a0ed9d180181f394590fee1"
IDENTITIES = {
    "大魔王バーン.pmx": "confirmed-elderly-pre-transformation-vearn",
    "大魔王バーン杖装備.pmx": "confirmed-elderly-pre-transformation-vearn-with-staff",
    "影バーン.pmx": "confirmed-elderly-pre-transformation-shadow-variant",
    "光魔の杖.pmx": "confirmed-vearn-staff-prop",
    "カイザーフェニックス素体.pmx": "confirmed-kaiser-phoenix-skill-helper",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    repo = Path(__file__).resolve().parents[4]
    root = workspace / "GGD-Asset-Library/intake/public-models-20260913/bowlroll-sabakan359-vearn-mmd-v087"
    acquisition_path = root / "acquisition.json"
    extraction_path = root / "extraction-files.json"
    archive = root / "original/vearn-mmd-v087.zip"
    conversion_root = workspace / "GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1"
    conversion_manifest_path = conversion_root / "conversion-manifest.json"
    validation_path = conversion_root / "khronos-validation.json"
    review_page_path = conversion_root / "index.html"
    receipt_path = workspace / "GGD-Asset-Library/backups/bowlroll-sabakan359-vearn-mmd-v087/s3-verified-receipt.json"

    acquisition = json.loads(acquisition_path.read_text())
    extraction = json.loads(extraction_path.read_text())
    if acquisition.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected acquisition source ID")
    if (archive.stat().st_size, sha256(archive)) != (ARCHIVE_BYTES, ARCHIVE_SHA256):
        raise ValueError("original BowlRoll ZIP differs")
    files = extraction.get("files", [])
    pmx = [row for row in files if row["archivePath"].lower().endswith(".pmx")]
    if len(files) != 18 or len(pmx) != 5:
        raise ValueError("expected 18 extracted files and five PMX files")
    conversion = json.loads(conversion_manifest_path.read_text())
    validation = json.loads(validation_path.read_text())
    converted_by_name = {row["displayName"]: row for row in conversion["candidates"]}
    if (
        conversion.get("sourceId") != SOURCE_ID
        or len(converted_by_name) != 5
        or validation.get("candidateCount") != 5
        or validation.get("zeroErrorCount") != 5
        or not review_page_path.is_file()
    ):
        raise ValueError("owner-review conversion evidence is incomplete")
    if acquisition["reuseTerms"] != {
        "source": "readme_必ずお読みください.txt",
        "decodedUtf8Path": str(root / "readme-utf8.txt"),
        "commercialUseAllowed": False,
        "redistributionAllowed": False,
        "modifiedRedistributionAllowed": False,
        "authorPermissionRequiredForSharedRuntimeIntegration": True,
    }:
        raise ValueError("reuse terms differ")

    backup = None
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        if (
            receipt.get("id") != SOURCE_ID
            or receipt.get("sha256") != BACKUP_SHA256
            or receipt.get("fileCount") != 24
            or receipt.get("fullGetVerified") is not True
            or receipt.get("allArchiveMembersSha256Verified") is not True
        ):
            raise ValueError("S3 readback receipt differs")
        backup = {
            "s3Uri": receipt["s3Uri"],
            "bytes": receipt["bytes"],
            "sha256": receipt["sha256"],
            "archiveFormat": "tar-gzip",
            "archiveMemberRoot": "",
            "readbackVerified": True,
            "fullReadbackVerified": True,
            "s3ReadbackVerified": True,
        }

    source = {
        "id": SOURCE_ID,
        "target": "巴恩大魔王／大魔王バーン：鯖缶359 MMD ver0.87 公開包",
        "heroIds": ["godie-ubal"],
        "url": "https://bowlroll.net/file/37061",
        "uploader": "鯖缶359",
        "originalAuthor": "鯖缶359",
        "sourceWork": "ドラゴンクエスト ダイの大冒険",
        "sourceGame": None,
        "sourceKind": "community-authored-MMD",
        "platform": "MMD",
        "version": "0.87",
        "publishedAt": "2014-05-05",
        "accessStatus": "public-download-key-accepted-through-normal-site-flow",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "static-review-converted-existing-elderly-vearn-source",
        "resourceRole": "community-model-reserve",
        "format": "ZIP containing PMX, BMP, TGA and SPH",
        "verification": "Original ZIP SHA-256 and byte count verified; traversal-safe extraction produced 18 files including five PMX payloads. All five were converted to independent static textured GLBs, passed Khronos with zero errors, and produced 15 Babylon WebGL review views. Owner identity decisions remain pending.",
        "localPath": root.relative_to(workspace).as_posix(),
        "files": [{"path": str(archive), "bytes": ARCHIVE_BYTES, "sha256": ARCHIVE_SHA256}],
        "assetKinds": ["character-model", "embedded-skeleton", "textures", "staff-accessory", "kaiser-phoenix-vfx-helper"],
        "modelCount": 5,
        "modelCandidates": [{
            "name": name,
            "format": "PMX",
            "conversionStatus": "static-review-converted",
            "reviewGlb": converted_by_name[name]["glb"],
            "triangleCount": converted_by_name[name]["triangleCount"],
            "boneCountInSource": converted_by_name[name]["boneCountInSource"],
            "identityStatus": IDENTITIES[name],
            "isNewYoungOrKiganCandidate": False,
            "nativeMotionCount": 0,
            "runtimeRegistered": False,
        } for name in sorted(converted_by_name)],
        "identity": {
            "form": "elderly-pre-transformation",
            "postTransformationYoungTrueBodyIncluded": False,
            "nativeInfinityStrashAsset": False,
            "ownerVisualReviewRequiredPerCandidate": False,
            "ownerConfirmedExistingElderlyForm": True,
        },
        "reuseTerms": "Author readme prohibits commercial use and redistribution, including modified data. Shared Git/runtime integration requires a separate author grant. A secondary Sketchfab uploader's CC label is not treated as overriding the upstream terms.",
        "publicRedistributionRightsVerified": False,
        "ownerDecision": {
            "date": "2026-09-17",
            "instruction": "巴恩大魔王相關的 3d model 都可以抓取 我來人工視覺鑑定就好",
            "acquisitionAuthorized": True,
            "privateConversionAndVisualReviewAuthorized": True,
            "identityDecisionsPending": 0,
            "followUp": "Do not request another review of these elderly-form candidates; only present new young true-body or Kigan King candidates.",
        },
        "defaultEligible": False,
        "purchaseDecision": "free-public-author-distribution-no-purchase",
        "discoveryChannel": "author-public-community-distribution",
        "audioAcquisition": {"audioCount": 0, "nativeAudioBankCount": 0, "confirmedVoiceCount": 0, "runtimeReady": False},
        "backendIntegration": {
            "required": True,
            "state": "reserve-only-existing-elderly-form-no-new-target",
            "heroIds": ["godie-ubal"],
            "registered": False,
            "selectable": False,
            "selectionVerified": False,
            "productionDeployed": False,
        },
        "gaps": [
            "No young true-body/post-transformation Vearn model.",
            "No native motion, game VFX, sound effect or voice files.",
            "Owner confirmed these are the already-reviewed elderly/pre-transformation form and related props, not the young true body or Kigan King target.",
            "Upstream readme terms are retained in provenance; shared runtime publication has not been performed.",
        ],
        "evidence": {
            "acquisitionPath": str(acquisition_path),
            "acquisitionSha256": sha256(acquisition_path),
            "extractionManifestPath": str(extraction_path),
            "extractionManifestSha256": sha256(extraction_path),
            "conversionManifestPath": str(conversion_manifest_path),
            "conversionManifestSha256": sha256(conversion_manifest_path),
            "khronosValidationPath": str(validation_path),
            "khronosValidationSha256": sha256(validation_path),
            "reviewPagePath": str(review_page_path),
            "reviewPageSha256": sha256(review_page_path),
            "webglScreenshotCount": 15,
        },
    }
    if backup:
        source["backup"] = backup
        source["publicationStatus"] = "s3-readback-verified"

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    matches = [row for row in downloads["publicSources"] if row["id"] == SOURCE_ID]
    if len(matches) > 1:
        raise ValueError("duplicate public source ID")
    if matches:
        matches[0].clear()
        matches[0].update(source)
    else:
        downloads["publicSources"].append(source)
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + "\n")

    evidence = repo / "materials/hero-model-library/priority-evidence/bowlroll-vearn-mmd-v087"
    evidence.mkdir(parents=True, exist_ok=True)
    compact = dict(acquisition)
    compact["extracted"]["manifestPath"] = "local-intake/extraction-files.json"
    compact["reuseTerms"]["decodedUtf8Path"] = "local-intake/readme-utf8.txt"
    (evidence / "acquisition.json").write_text(json.dumps(compact, ensure_ascii=False, indent=2) + "\n")
    if receipt_path.exists():
        shutil.copy2(receipt_path, evidence / "s3-backup-receipt.json")
    (evidence / "README.md").write_text(
        "# 巴恩 MMD ver0.87 取得證據\n\n"
        "- 作者：鯖缶359；來源：`https://bowlroll.net/file/37061`\n"
        f"- 原始 ZIP：`{ARCHIVE_SHA256}`（{ARCHIVE_BYTES} bytes）\n"
        "- 安全解包：18 檔，包含 5 個 PMX；原始檔全部保留。\n"
        "- 2026-09-17 五個 PMX 已分別轉為靜態貼圖 GLB，Khronos 5/5 零錯誤，Babylon WebGL 共 15 張三視圖。\n"
        "- owner 確認這是既有的年老／變身前巴恩、影版與附件，不是年輕真身或鬼眼王；不再重複請 owner 審查。\n"
        "- 未取得原生動作；後台註冊、切換驗證與正式站部署皆為 0。\n"
        "- 上游 readme 的商用與再散布條件仍完整保留在來源記錄；尚未進行共享 runtime 發布。\n"
    )
    print(json.dumps({"sourceId": SOURCE_ID, "modelFiles": len(pmx), "backupRecorded": bool(backup), "runtimeReady": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
