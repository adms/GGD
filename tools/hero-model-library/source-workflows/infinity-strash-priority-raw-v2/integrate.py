#!/usr/bin/env python3
"""Register the verified Infinity Strash priority extraction without overstating readiness."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
LEAD_ID = "infinity-strash-dai-owner-source"
REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
PUBLIC_FILES = REPO / "materials/hero-model-library/public-source-files.json"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-original-raw-v2/extraction-summary.json"
S3_EVIDENCE = EVIDENCE.with_name("s3-backup-receipt.json")


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
        default="GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-priority-raw-v2",
    )
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    if not local_root.is_relative_to(workspace) or not local_root.is_dir():
        raise ValueError("verified extraction must be an existing directory inside the workspace")

    index_path = local_root / "extraction-index.json"
    index = json.loads(index_path.read_text())
    expected_counts = {"EN653": 790, "EN801": 902, "PN010": 3838}
    if index.get("schema") != "ggd-infinity-strash-priority-raw-extraction@1":
        raise ValueError("unexpected extraction schema")
    if index.get("sourceId") != SOURCE_ID or index.get("countsByIdentity") != expected_counts:
        raise ValueError("unexpected source identity or native-ID counts")
    if index["selection"] != {
        "nativeIdTokens": ["PN010", "EN801", "EN653"],
        "pakEntries": 181304,
        "selectedEntries": 5530,
    }:
        raise ValueError("the frozen selection differs from the verified extraction")
    if index.get("totalBytes") != 546039697 or len(index.get("files", [])) != 5530:
        raise ValueError("the extracted package set is incomplete")

    raw_root = local_root / "raw"
    for row in index["files"]:
        path = (raw_root / row["path"]).resolve()
        if not path.is_relative_to(raw_root) or not path.is_file():
            raise ValueError("missing extracted package: " + row["path"])
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError("extracted package changed: " + row["path"])

    source = {
        "id": SOURCE_ID,
        "target": "Infinity Strash 原作：小呆／達伊 PN010、巴恩 EN801、密斯特巴恩 EN653 原始套件",
        "heroIds": ["godie-nbbc", "godie-n01c", "godie-ubal"],
        "ownerEntryIds": [],
        "url": "https://www.square-enix.com/asia/newsportal/en/topics/infinitystrash-dragonquest-aod/post01.html",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "Unreal Engine 4.26 PAK v11 / Zlib; extracted .uasset/.uexp/.ubulk packages",
        "accessStatus": "local-installed-game-readonly-share",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "raw-packages-extracted-pending-game-specific-export",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "canonical-game-reserve",
        "localPath": local_root.relative_to(workspace).as_posix(),
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "platform": "Windows (Steam)",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": [
            "model-package", "texture-material-package", "skeleton-package", "animation-cinematic-package",
            "vfx-package", "audio-event-package", "character-configuration",
        ],
        "notAliases": ["Baran", "巴蘭", "バラン"],
        "identityRecords": [
            {"name": "小呆／達伊", "nameZh": "小呆／達伊", "originalName": "Dai", "nativeCharacterId": "PN010", "aliases": ["小呆", "達伊", "Dai"], "heroIds": ["godie-nbbc", "godie-n01c"]},
            {"name": "巴恩大魔王", "nameZh": "巴恩大魔王", "originalName": "Vearn", "nativeCharacterId": "EN801", "aliases": ["巴恩", "Vearn"], "heroIds": ["godie-ubal"]},
            {"name": "密斯特巴恩", "nameZh": "密斯特巴恩", "originalName": "MystVearn", "nativeCharacterId": "EN653", "aliases": ["密斯特巴恩", "MystVearn"], "heroIds": []},
        ],
        "publicationStatus": "local-only-awaiting-s3-upload",
        "files": [index["sourcePak"]],
        "rawPackageIndex": {
            "path": index_path.relative_to(workspace).as_posix(),
            "sha256": sha256(index_path),
            "fileCount": 5530,
            "bytes": index["totalBytes"],
            "countsByIdentity": expected_counts,
            "countsByCategory": index["countsByCategory"],
        },
        "identities": [
            {
                "nativeId": "PN010", "nameZh": "小呆／達伊", "originalName": "Dai",
                "heroIds": ["godie-nbbc", "godie-n01c"], "packageCount": 3838,
                "formState": "body-variants-present-pending-visual-classification",
            },
            {
                "nativeId": "EN801", "nameZh": "巴恩大魔王", "originalName": "Vearn",
                "heroIds": ["godie-ubal"], "packageCount": 902,
                "formState": "pre-and-post-transformation-not-yet-visually-separated",
            },
            {
                "nativeId": "EN653", "nameZh": "密斯特巴恩", "originalName": "MystVearn",
                "heroIds": [], "packageCount": 790,
                "formState": "separate-character-pending-hero-design-and-binding",
            },
        ],
        "backendIntegration": {
            "required": True,
            "state": "pending-game-specific-export-conversion-and-visual-review",
            "selectionVerified": False,
            "release": None,
        },
        "verification": (
            "pakchunk0 index is readable and unencrypted. Exact native-ID selection extracted 5,530 packages "
            "and verified every local byte count and SHA-256. pakchunk1 contains 12,254 indexed entries and "
            "zero direct PN010/EN801/EN653 path matches. This is raw package acquisition evidence only."
        ),
        "limitations": [
            "The public generic UModel build fails while serializing the Dai skeletal mesh; the public game-specific exporter is Windows-only and has not been executed on this Mac.",
            "EN801 is confirmed as Vearn, but body variants have not been visually classified as pre- or post-transformation.",
            "EN653 is MystVearn and must remain separate from Vearn. EN680 and EN681 are Baran forms and are not part of this extraction.",
            "Wwise event packages do not identify or decode the numeric Media containers by themselves.",
            "No package is converted, visually accepted, registered as a model option, backend-selectable or deployed.",
        ],
    }

    document = json.loads(DOWNLOADS.read_text())
    matches = [
        row for collection in ("publicSources", "paidSources")
        for row in document.get(collection, []) if row.get("id") == SOURCE_ID
    ]
    if matches:
        if len(matches) != 1:
            raise ValueError("source ID is duplicated across central collections")
        existing = matches[0]
        if "identityRecords" not in existing:
            existing["identityRecords"] = source["identityRecords"]
            existing["notAliases"] = source["notAliases"]
        mutable = {"publicationStatus", "pendingBackup", "backup", "verification"}
        if {k: v for k, v in existing.items() if k not in mutable} != {k: v for k, v in source.items() if k not in mutable}:
            raise ValueError("existing source differs; refusing to overwrite another workflow")
        status = "already-integrated"
    else:
        document["publicSources"].append(source)
        status = "integrated"

    leads = [row for row in document.get("publicSourceLeads", []) if row.get("id") == LEAD_ID]
    if len(leads) != 1:
        raise ValueError("expected the existing Infinity Strash source lead exactly once")
    fulfilled = leads[0].setdefault("fulfilledBySourceIds", [])
    if SOURCE_ID not in fulfilled:
        fulfilled.append(SOURCE_ID)
    leads[0]["acquisitionFollowup"] = (
        "User-owned Windows Steam PAKs became available through read-only SMB. Priority PN010/EN801/EN653 "
        "packages are extracted and SHA-indexed; Popp PN020 and Vearn form classification remain open."
    )
    DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")

    public_files = json.loads(PUBLIC_FILES.read_text())
    published = [row for row in public_files.get("sources", []) if row.get("id") == SOURCE_ID]
    s3_backup = None
    if published:
        if len(published) != 1 or published[0].get("readbackVerified") is not True:
            raise ValueError("expected one completely read-back S3 archive record")
        receipt_path = (workspace / published[0]["receiptPath"]).resolve()
        if not receipt_path.is_relative_to(workspace) or not receipt_path.is_file():
            raise ValueError("S3 receipt is missing from the workspace")
        receipt = json.loads(receipt_path.read_text())
        for key, expected in {
            "id": SOURCE_ID,
            "s3Uri": published[0]["s3Uri"],
            "bytes": published[0]["bytes"],
            "sha256": published[0]["sha256"],
            "readbackVerified": True,
        }.items():
            if receipt.get(key) != expected:
                raise ValueError("S3 receipt differs from the central archive record: " + key)
        S3_EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        S3_EVIDENCE.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        s3_backup = {
            "s3Uri": published[0]["s3Uri"],
            "archiveBytes": published[0]["bytes"],
            "archiveSha256": published[0]["sha256"],
            "archiveMembers": len(published[0]["files"]),
            "readbackVerified": True,
            "allMemberSha256Verified": published[0]["allMemberSha256Verified"],
            "receiptPath": S3_EVIDENCE.relative_to(REPO).as_posix(),
            "receiptSha256": sha256(S3_EVIDENCE),
        }

    compact = {
        "schema": "ggd-infinity-strash-priority-raw-evidence@1",
        "sourceId": SOURCE_ID,
        "sourcePak": index["sourcePak"],
        "secondaryPakProbe": {
            "path": "/Volumes/common/Strash/strash/Content/Paks/pakchunk1-WindowsClient.pak",
            "bytes": 4382548320,
            "sha256": "78edc35c624dbab88a378cf3d2b20ed48c43c05d844ec342a00a868771733095",
            "indexedEntries": 12254,
            "directNativeIdMatches": 0,
        },
        "selection": index["selection"],
        "countsByIdentity": index["countsByIdentity"],
        "countsByCategory": index["countsByCategory"],
        "totalBytes": index["totalBytes"],
        "extractionIndex": {
            "absolutePath": str(index_path),
            "sha256": sha256(index_path),
        },
        "states": index["states"],
        "limitations": source["limitations"],
    }
    if s3_backup:
        compact["s3Backup"] = s3_backup
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(compact, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": SOURCE_ID, "status": status, "files": 5530, "bytes": index["totalBytes"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
