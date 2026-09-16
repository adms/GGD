#!/usr/bin/env python3
"""Register the local post-transformation Vearn audit in canonical indexes."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


SOURCE_ID = "infinity-strash-vearn-post-form-local-audit-v2"
SCHEMA = "ggd.infinity-strash-vearn-post-form-audit@2"
PRIMARY_SOURCE_ID = "steam-infinity-strash-primary-paks-build-local-20240328"
REQUIRED_IDENTITIES = {
    "EN801": ("Vearn", "target-pre-transformation-form"),
    "EN653": ("MystVearn", "separate-character-not-post-transformation-vearn"),
    "EN680": ("Baran", "separate-character-not-vearn"),
    "EN681": ("Ryu Baran / Baran_ma", "separate-baran-form-not-vearn"),
}
BACKUP_ARCHIVE_SHA256 = "4ce21f4f4598f00edd1a6e360dec9a485a06f967a8e8826c971ff406eb3469c5"
BACKUP_ARCHIVE_BYTES = 15_547_376


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate(local_root: Path) -> tuple[dict, dict]:
    report_path = local_root / "report.json"
    manifest_path = local_root / "files.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if report.get("schema") != SCHEMA or report.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected Vearn post-form report identity")
    if report["scope"]["uniqueIndexedEntries"] != 193_558:
        raise ValueError("full PAK index scope changed")
    if report["scope"]["en8xxBodyAssets"] != [
        "strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body.uasset"
    ]:
        raise ValueError("EN8xx body set changed and needs review")
    if report["scope"]["postTransformationNameHits"]:
        raise ValueError("explicit post-form path requires review")
    result = report["result"]
    if result != {
        "preTransformationOldVearnNativeBodyLocated": True,
        "postTransformationYoungTrueBodyLocated": False,
        "convertedPostTransformationModelCount": 0,
        "postTransformationRuntimeOptionCount": 0,
        "status": "identity-separated-source-gap-confirmed",
        "nextAction": "retain post-transformation Vearn as not-located and acquire an explicitly identified licensed source",
    }:
        raise ValueError("post-form result changed")
    for native_id, (name, relationship) in REQUIRED_IDENTITIES.items():
        identity = report["identities"][native_id]
        if identity["originalName"] != name or identity["relationship"] != relationship:
            raise ValueError(f"identity boundary changed: {native_id}")
        if len(identity["criticalProbeFiles"]) != 4:
            raise ValueError(f"expected four body/blueprint probes for {native_id}")
    if report["criticalProbeSummary"] != {
        "files": 16,
        "bytes": 36_453_566,
        "allFilesSha256Recorded": True,
    }:
        raise ValueError("critical probe receipt changed")
    if report["identities"]["EN801"]["alreadyExtractedFilesRehashed"] != 902:
        raise ValueError("EN801 rehash count changed")
    if report["identities"]["EN653"]["alreadyExtractedFilesRehashed"] != 790:
        raise ValueError("EN653 rehash count changed")
    if manifest.get("sourceId") != SOURCE_ID or manifest.get("fileCount") != 16:
        raise ValueError("local probe manifest changed")
    for row in manifest["files"]:
        path = Path(row["absolutePath"])
        if (path.stat().st_size, sha256(path)) != (row["bytes"], row["sha256"]):
            raise ValueError(f"probe differs: {path}")
    return report, manifest


def source_record(
    local_root: Path,
    report: dict,
    report_path: Path,
    manifest_path: Path,
    backup: dict | None,
) -> dict:
    identities = report["identities"]
    record = {
        "id": SOURCE_ID,
        "target": "Infinity Strash 巴恩變身後／年輕真身來源鑑別（EN801、EN653、EN680、EN681 嚴格分離）",
        "heroIds": ["godie-ubal"],
        "ownerEntryIds": [],
        "url": "local://user-owned-infinity-strash-primary-paks",
        "uploader": "User-owned local Steam install preserved in the GGD asset library",
        "format": "derived PAK index audit plus serialized body/blueprint probes",
        "accessStatus": "local-preserved-user-owned-source",
        "acquisitionStatus": "source-gap-audited-no-post-transformation-payload-located",
        "readiness": "identity-separated-post-transformation-model-not-located",
        "purchaseDecision": "no-purchase-local-source-audit",
        "defaultEligible": False,
        "resourceRole": "identity-and-source-gap-evidence",
        "localPath": str(local_root),
        "sourceGame": report["sourceGame"],
        "platform": report["platform"],
        "selectionClass": "canonical-game-source-audit",
        "discoveryChannel": "local-preserved-primary-paks",
        "assetKinds": ["source-index", "model-probe", "configuration-probe"],
        "publicationStatus": "s3-readback-verified" if backup else "git-evidence-recorded-s3-pending",
        "files": [
            {
                "path": str(report_path),
                "absolutePath": str((local_root / "report.json").resolve()),
                "bytes": (local_root / "report.json").stat().st_size,
                "sha256": sha256(local_root / "report.json"),
            },
            {
                "path": str(manifest_path),
                "absolutePath": str((local_root / "files.json").resolve()),
                "bytes": (local_root / "files.json").stat().st_size,
                "sha256": sha256(local_root / "files.json"),
            },
        ],
        "sourceContainers": report["sourceContainers"],
        "indexedEntries": report["scope"]["uniqueIndexedEntries"],
        "criticalProbeFiles": report["criticalProbeSummary"]["files"],
        "criticalProbeBytes": report["criticalProbeSummary"]["bytes"],
        "rehash": {
            "EN801": {
                "files": identities["EN801"]["alreadyExtractedFilesRehashed"],
                "bytes": identities["EN801"]["alreadyExtractedBytesRehashed"],
            },
            "EN653": {
                "files": identities["EN653"]["alreadyExtractedFilesRehashed"],
                "bytes": identities["EN653"]["alreadyExtractedBytesRehashed"],
            },
        },
        "identityRecords": [
            {
                "nameZh": identities[native_id]["nameZh"],
                "originalName": identities[native_id]["originalName"],
                "nativeCharacterId": native_id,
                "relationship": identities[native_id]["relationship"],
                "identityEvidencePath": identities[native_id]["identityPath"],
                "indexedPathCount": identities[native_id]["indexedPathCount"],
                "categoryCounts": identities[native_id]["indexedCategoryCounts"],
            }
            for native_id in ("EN801", "EN653", "EN680", "EN681")
        ],
        "result": report["result"],
        "acquiredAssetPayloadCount": 0,
        "modelCandidates": [],
        "backendIntegration": {
            "required": True,
            "state": "blocked-post-transformation-source-not-located",
            "registered": False,
            "selectable": False,
            "selectionVerified": False,
            "productionDeployed": False,
        },
        "verification": (
            "Both complete PAKs were rehashed, all 193,558 indexed paths were searched, 1,692 existing EN801/EN653 raw packages "
            "were rehashed, and 16 EN801/EN653/EN680/EN681 body/blueprint probe files were extracted with per-file SHA-256. "
            "Only EN801/00 exists in the EN8xx body set; no explicitly named young/true/post-transformation Vearn package was found."
        ),
        "gaps": [
            "Post-transformation/young true-body Vearn model, textures, skeleton and native motions were not located.",
            "No post-transformation VFX, audio or voice payload can be assigned without an explicit identity source.",
        ],
        "limitations": report["limitations"],
        "notAliases": ["MystVearn", "密斯特巴恩", "Baran", "巴蘭", "RyuBaran", "龍魔人巴蘭"],
    }
    if backup:
        record["backup"] = {
            "s3Uri": backup["s3Uri"],
            "manifestUri": backup["manifestUri"],
            "bytes": backup["archiveBytes"],
            "sha256": backup["archiveSha256"],
            "fileCount": backup["fileCount"],
            "archiveFormat": "tar-gzip",
            "archiveMemberRoot": "",
            "readbackVerified": True,
            "fullReadbackVerified": True,
            "allMemberSha256Verified": True,
            "s3ReadbackVerified": True,
            "localUnchanged": True,
            "s3Use": "backup-only-not-runtime-entry",
        }
    else:
        record["gaps"].append("S3 backup of this new compact audit/probe set is pending integration-lane upload.")
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--local-root", type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    workspace = args.workspace.resolve()
    local_root = args.local_root.resolve()
    report, _manifest = validate(local_root)
    receipt_path = (
        workspace
        / "GGD-Asset-Library/backups/infinity-strash-vearn-post-form-local-audit-v2/latest-receipt.json"
    )
    backup = None
    if receipt_path.is_file():
        backup = json.loads(receipt_path.read_text(encoding="utf-8"))
        expected_prefix = (
            "s3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/"
            "infinity-strash-vearn-post-form-local-audit-v2/"
        )
        if (
            not backup.get("s3Uri", "").startswith(expected_prefix)
            or backup.get("archiveSha256") != BACKUP_ARCHIVE_SHA256
            or backup.get("archiveBytes") != BACKUP_ARCHIVE_BYTES
            or backup.get("fileCount") != 18
            or backup.get("fullGetVerified") is not True
            or backup.get("allMemberSha256Verified") is not True
            or backup.get("localUnchanged") is not True
            or Path(backup.get("source", "")).resolve() != local_root
        ):
            raise ValueError("S3 receipt differs from the verified Vearn audit")

    evidence = repo / "materials/hero-model-library/priority-evidence/infinity-strash-vearn-post-form-v2"
    evidence.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_root / "report.json", evidence / "report.json")
    shutil.copy2(local_root / "files.json", evidence / "files.json")
    if backup:
        shutil.copy2(receipt_path, evidence / "s3-backup-receipt.json")
    (evidence / "README.md").write_text(
        "# Infinity Strash 巴恩變身後來源鑑別 v2\n\n"
        "- 完整主 PAK：2 個，實際重算大小與 SHA-256。\n"
        "- 完整索引：193,558 路徑；怪物身體 54 個；EN8xx 身體只有 EN801/00 一個。\n"
        "- 已解包重算：EN801 902 檔、EN653 790 檔。\n"
        "- 身份探針：EN801／EN653／EN680／EN681 各 4 檔，共 16 檔、36,453,566 bytes，逐檔 SHA-256。\n"
        "- 結論：EN801 是已驗收的老年／變身前巴恩；EN653 是密斯特巴恩；EN680／EN681 是巴蘭。"
        "變身後／年輕真身巴恩仍未找到，轉換、下拉選項與部署皆為 0。\n\n"
        "這是本機來源與身份缺口證據；完整封包已完成 S3 GET 讀回與逐成員 SHA-256 驗證。\n",
        encoding="utf-8",
    )

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text(encoding="utf-8"))
    primary = [row for row in downloads["publicSources"] if row.get("id") == PRIMARY_SOURCE_ID]
    if len(primary) != 1:
        raise ValueError("expected one primary Infinity Strash source")
    derived = primary[0].setdefault("derivedSourceIds", [])
    if SOURCE_ID not in derived:
        derived.append(SOURCE_ID)

    record = source_record(
        local_root,
        report,
        Path("materials/hero-model-library/priority-evidence/infinity-strash-vearn-post-form-v2/report.json"),
        Path("materials/hero-model-library/priority-evidence/infinity-strash-vearn-post-form-v2/files.json"),
        backup,
    )
    matches = [row for row in downloads["publicSources"] if row.get("id") == SOURCE_ID]
    if len(matches) > 1:
        raise ValueError("duplicate Vearn post-form audit source")
    if matches:
        matches[0].clear()
        matches[0].update(record)
    else:
        downloads["publicSources"].append(record)
    downloads_path.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "sourceId": SOURCE_ID,
        "workspace": str(workspace),
        "postTransformationModelLocated": False,
        "identityProbeFiles": 16,
        "s3ReadbackVerified": bool(backup),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
