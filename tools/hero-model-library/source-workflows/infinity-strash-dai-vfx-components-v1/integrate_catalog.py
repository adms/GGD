#!/usr/bin/env python3
"""Register Dai PN010 VFX support components and their verified S3 snapshots."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
BASE = REPO / "materials/hero-model-library"
REPORT = BASE / "priority-evidence/infinity-strash-dai-vfx-components-v1/candidates.json"
DOWNLOADS = BASE / "download-sources.json"
PUBLIC = BASE / "public-source-files.json"
SOURCE_ID = "steam-infinity-strash-dai-vfx-component-candidates-build-local-20240328"
SOURCE_BACKUP_ID = "infinity-strash-dai-vfx-components-v1-source-backup"
CONVERSION_BACKUP_ID = "infinity-strash-dai-vfx-components-v1-conversion-backup"
SOURCE_RECEIPT = BASE / "priority-evidence/infinity-strash-dai-vfx-components-v1/source-s3-backup-receipt.json"
CONVERSION_RECEIPT = BASE / "priority-evidence/infinity-strash-dai-vfx-components-v1/conversion-s3-backup-receipt.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def slim_backup(row: dict) -> dict:
    return {key: row[key] for key in (
        "id", "sourceId", "resourceRole", "localPath", "localArchive", "readbackPath",
        "s3Uri", "manifestUri", "bytes", "sha256", "fileCount", "archiveFormat",
        "archiveMemberRoot", "readbackVerified", "fullReadbackVerified",
        "s3ReadbackVerified", "localPreserved", "snapshotScope", "receiptPath",
        "receiptSha256", "manifestSha256", "s3Use",
    )}


def component_backup_fields(local: dict, backup: dict) -> dict:
    root = (REPO.parent / backup["localPath"]).resolve()
    path = Path(local["absolutePath"]).resolve()
    member = path.relative_to(root).as_posix()
    rows = [row for row in backup["files"] if row["path"] == member]
    if len(rows) != 1 or (rows[0]["bytes"], rows[0]["sha256"]) != (local["bytes"], local["sha256"]):
        raise ValueError(f"conversion backup does not cover component: {member}")
    locator = {
        "s3Uri": backup["s3Uri"], "s3ArchiveMember": member,
        "s3Use": "backup-only-not-runtime-entry",
        "backupReceiptPath": backup["receiptPath"], "backupReceiptSha256": backup["receiptSha256"],
    }
    return {**locator, "backupLocations": [locator]}


def build(allow_unlinked: bool = False) -> dict[Path, bytes]:
    report = json.loads(REPORT.read_text())
    downloads = json.loads(DOWNLOADS.read_text())
    public = json.loads(PUBLIC.read_text())
    backups = {row["id"]: row for row in public["sources"] if row.get("id") in {SOURCE_BACKUP_ID, CONVERSION_BACKUP_ID}}
    if set(backups) != {SOURCE_BACKUP_ID, CONVERSION_BACKUP_ID}:
        raise ValueError("Dai VFX source and conversion backups are not both registered")
    receipt_paths = {SOURCE_BACKUP_ID: SOURCE_RECEIPT, CONVERSION_BACKUP_ID: CONVERSION_RECEIPT}
    for backup_id, row in backups.items():
        if not all(row.get(key) is True for key in ("fullReadbackVerified", "s3ReadbackVerified", "localPreserved")):
            raise ValueError(f"backup is not fully verified: {backup_id}")
        receipt = receipt_paths[backup_id]
        if not receipt.is_file() or sha(receipt) != row["receiptSha256"]:
            raise ValueError(f"Git backup receipt differs: {backup_id}")
        if not allow_unlinked and row.get("sourceId") != SOURCE_ID:
            raise ValueError(f"backup is not attached to Dai VFX source: {backup_id}")
    components = []
    conversion_backup = backups[CONVERSION_BACKUP_ID]
    for row in report["textureComponents"]:
        local = row["normalizedLocal"]
        components.append({
            "id": row["componentId"], "sourceId": SOURCE_ID, "resourceRole": "vfx-texture-support",
            "nativeId": row["reference"], "heroIds": report["character"]["heroIds"],
            "absolutePath": local["absolutePath"], "bytes": local["bytes"], "sha256": local["sha256"],
            "gitPath": row["gitPath"], "componentEligible": row["componentEligible"],
            "classification": row["classification"], "metrics": row["metrics"]["output"],
            "converted": True, "structuralValidationPassed": row["componentEligible"],
            "visualValidationPassed": False, "runtimeReady": False, "runtimeSelectable": False,
            "defaultEligible": False, "readiness": "policy-pass-support-component-owner-review-pending" if row["componentEligible"] else "engine-utility-retained-locally",
            **component_backup_fields(local, conversion_backup),
        })
    for row in report["meshComponents"]:
        local = row["converted"]
        components.append({
            "id": row["componentId"], "sourceId": SOURCE_ID, "resourceRole": "vfx-static-mesh-support",
            "nativeId": row["reference"], "heroIds": report["character"]["heroIds"],
            "absolutePath": local["absolutePath"], "bytes": local["bytes"], "sha256": local["sha256"],
            "gitPath": row["gitPath"], "componentEligible": True, "metrics": row["metrics"],
            "converted": True, "structuralValidationPassed": True, "visualValidationPassed": False,
            "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False,
            "readiness": "policy-pass-support-component-owner-review-pending",
            **component_backup_fields(local, conversion_backup),
        })
    deliveries = [{key: value for key, value in backups[backup_id].items() if key != "files"}
                  for backup_id in (SOURCE_BACKUP_ID, CONVERSION_BACKUP_ID)]
    source = {
        "id": SOURCE_ID,
        "target": "Infinity Strash PN010 小呆／達伊：六組原作 Niagara 來源的貼圖與靜態網格支援元件",
        "heroIds": report["character"]["heroIds"], "ownerEntryIds": [],
        "url": "smb://lv99/common/Strash", "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "Unreal Engine 4.26 cooked packages; UModel TGA/glTF; normalized PNG/GLB support components",
        "accessStatus": "local-installed-game-readonly-share", "acquisitionStatus": "downloaded-verified",
        "readiness": "support-components-converted-policy-pass-owner-review-and-niagara-reconstruction-pending",
        "purchaseDecision": "no-purchase-user-owned-install", "defaultEligible": False,
        "resourceRole": "canonical-game-vfx-support-component-reserve",
        "localPath": "GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-dai-vfx-components-v1",
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai", "platform": "Windows (Steam)",
        "selectionClass": "canonical-game", "discoveryChannel": "local-readonly-smb",
        "assetKinds": ["vfx-package", "vfx-texture", "vfx-static-mesh"],
        "publicationStatus": "s3-readback-verified", "files": [],
        "filesManifest": report["inputs"]["closure"],
        "nativeAssetCounts": report["summary"], "componentCandidates": components,
        "backendIntegration": {
            "required": True,
            "state": "owner-review-and-runtime-reconstruction-pending",
            "heroIds": report["character"]["heroIds"],
            "selectionVerified": False,
            "runtimeBindings": 0,
            "productionDeploymentVerified": False,
            "release": None,
        },
        "verification": "Six PN010 Niagara roots close over 94 packages. Eighteen PNG and eight GLB support components pass the live vfx-model gate; both source and conversion snapshots passed full S3 readback and per-member SHA-256 verification.",
        "limitations": report["blockers"], "backup": slim_backup(backups[SOURCE_BACKUP_ID]),
        "supplementalDeliveries": [] if allow_unlinked else deliveries,
        "notAliases": ["EN801 Vearn", "EN653 Mystvearn", "EN680 Baran", "EN681 Baran"],
    }
    rows = downloads["publicSources"]
    previous = [row for row in rows if row.get("id") == SOURCE_ID]
    if previous:
        previous[0].clear(); previous[0].update(source)
    else:
        rows.append(source)
    return {DOWNLOADS: encoded(downloads)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--bootstrap", action="store_true", help="Create the source row before attaching existing unlinked receipts.")
    args = parser.parse_args()
    if args.bootstrap and not args.write:
        raise ValueError("--bootstrap requires --write")
    writes = build(args.bootstrap)
    for path, value in writes.items():
        if args.write:
            path.write_bytes(value)
        elif not path.is_file() or path.read_bytes() != value:
            raise ValueError(f"stale generated catalog: {path}")
    print(json.dumps({"sourceId": SOURCE_ID, "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
