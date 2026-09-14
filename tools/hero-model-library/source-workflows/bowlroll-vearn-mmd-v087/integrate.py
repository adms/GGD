#!/usr/bin/env python3
"""Register the acquired Sabakan359 Vearn MMD archive without overstating reuse rights."""

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
        "readiness": "acquired-reserve-license-blocked-from-shared-runtime",
        "resourceRole": "community-model-reserve",
        "format": "ZIP containing PMX, BMP, TGA and SPH",
        "verification": "Original ZIP SHA-256 and byte count verified; traversal-safe extraction produced 18 files including five PMX models. The package contains elderly Vearn variants, staff and Kaiser Phoenix helper only. Author terms block shared runtime conversion and redistribution.",
        "localPath": root.relative_to(workspace).as_posix(),
        "files": [{"path": str(archive), "bytes": ARCHIVE_BYTES, "sha256": ARCHIVE_SHA256}],
        "assetKinds": ["character-model", "embedded-skeleton", "textures", "staff-accessory", "kaiser-phoenix-vfx-helper"],
        "modelCount": 5,
        "modelCandidates": [
            {"name": row["archivePath"].rsplit("/", 1)[-1], "format": "PMX", "conversionStatus": "not-started-license-blocked"}
            for row in pmx
        ],
        "identity": {
            "form": "elderly-pre-transformation",
            "postTransformationYoungTrueBodyIncluded": False,
            "nativeInfinityStrashAsset": False,
        },
        "reuseTerms": "Author readme prohibits commercial use and redistribution, including modified data. Shared Git/runtime integration requires a separate author grant. A secondary Sketchfab uploader's CC label is not treated as overriding the upstream terms.",
        "publicRedistributionRightsVerified": False,
        "defaultEligible": False,
        "purchaseDecision": "free-public-author-distribution-no-purchase",
        "discoveryChannel": "author-public-community-distribution",
        "audioAcquisition": {"audioCount": 0, "nativeAudioBankCount": 0, "confirmedVoiceCount": 0, "runtimeReady": False},
        "backendIntegration": {
            "required": True,
            "state": "blocked-pending-author-redistribution-and-commercial-use-grant",
            "heroIds": ["godie-ubal"],
            "registered": False,
            "selectable": False,
            "selectionVerified": False,
            "productionDeployed": False,
        },
        "gaps": [
            "No young true-body/post-transformation Vearn model.",
            "No native motion, game VFX, sound effect or voice files.",
            "No permission for commercial use or redistribution in the shared GGD runtime.",
        ],
        "evidence": {
            "acquisitionPath": str(acquisition_path),
            "acquisitionSha256": sha256(acquisition_path),
            "extractionManifestPath": str(extraction_path),
            "extractionManifestSha256": sha256(extraction_path),
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
        "- 安全解包：18 檔，包含 5 個 PMX；只有老年／變身前巴恩系列，沒有年輕真身。\n"
        "- 授權限制：作者 readme 禁止商用與任何二次散布（包含改造後）；因此只作私有備份與索引，未轉換、未註冊、不可切換、未部署。\n"
    )
    print(json.dumps({"sourceId": SOURCE_ID, "modelFiles": len(pmx), "backupRecorded": bool(backup), "runtimeReady": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
