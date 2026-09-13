#!/usr/bin/env python3
"""Register the verified Infinity Strash priority extraction without overstating readiness."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tarfile
from pathlib import Path

from PIL import Image, ImageDraw


SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
LEAD_ID = "infinity-strash-dai-owner-source"
REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
PUBLIC_FILES = REPO / "materials/hero-model-library/public-source-files.json"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-original-raw-v2/extraction-summary.json"
S3_EVIDENCE = EVIDENCE.with_name("s3-backup-receipt.json")
MAC_EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-original-raw-v2/macos-native-export"
BACKUP_STAGES = {
    "umodelTool": ("umodel-tool", "infinity-strash-umodel-macos-v1"),
    "meshComponents": ("mesh-components", "infinity-strash-priority-mesh-components-v1"),
    "textures": ("textures", "infinity-strash-priority-textures-v1"),
    "nativeAnimations": ("native-animations", "infinity-strash-priority-native-animations-v1"),
    "preparedComponents": ("prepared-components", "infinity-strash-prepared-components-v1"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_manifest(path: Path) -> tuple[dict, Path]:
    manifest = json.loads(path.read_text())
    root = path.parent
    for row in manifest.get("files", []):
        file_path = (root / row["path"]).resolve()
        if not file_path.is_relative_to(root.resolve()) or not file_path.is_file():
            raise ValueError("missing conversion output: " + row["path"])
        if file_path.stat().st_size != row["bytes"] or sha256(file_path) != row["sha256"]:
            raise ValueError("changed conversion output: " + row["path"])
    return manifest, root


def validate_scoped_backup(root: Path, source_id: str) -> dict:
    manifest_path = root / "scoped-manifest.json"
    receipt_path = root / "s3-verified-receipt.json"
    manifest = json.loads(manifest_path.read_text())
    receipt = json.loads(receipt_path.read_text())
    expected_uri = manifest["plannedS3Uri"]
    if not expected_uri.startswith(
        "s3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/"
    ):
        raise ValueError("conversion backup is outside the authorized legacy prefix")
    expected = {
        "id": source_id,
        "s3Uri": expected_uri,
        "sha256": manifest["sha256"],
        "bytes": manifest["bytes"],
        "fileCount": manifest["fileCount"],
        "manifestSha256": sha256(manifest_path),
        "profile": "vibe-coding",
        "region": "ap-east-2",
        "readbackVerified": True,
        "fullGetVerified": True,
        "allArchiveMembersSha256Verified": True,
        "localPreserved": True,
    }
    for key, value in expected.items():
        if receipt.get(key) != value:
            raise ValueError(f"conversion backup receipt differs for {source_id}: {key}")
    local_archive = Path(receipt["localArchive"])
    local_readback = Path(receipt["localReadback"])
    for path in (local_archive, local_readback):
        if path.stat().st_size != manifest["bytes"] or sha256(path) != manifest["sha256"]:
            raise ValueError("conversion backup local or readback archive changed: " + str(path))
    rows = []
    with tarfile.open(local_readback, "r:gz") as archive:
        for entry in archive:
            if not entry.isfile():
                raise ValueError("non-file member in conversion backup: " + entry.name)
            digest = hashlib.sha256()
            size = 0
            with archive.extractfile(entry) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
                    size += len(block)
            rows.append({"path": entry.name, "bytes": size, "sha256": digest.hexdigest()})
    if rows != manifest["files"]:
        raise ValueError("conversion backup member inventory differs: " + source_id)
    return {
        "sourceId": source_id,
        "s3Uri": expected_uri,
        "manifestUri": receipt["manifestUri"],
        "archiveBytes": manifest["bytes"],
        "archiveSha256": manifest["sha256"],
        "fileCount": manifest["fileCount"],
        "manifestSha256": receipt["manifestSha256"],
        "readbackVerified": True,
        "allArchiveMembersSha256Verified": True,
    }


def build_contact_sheet(prepared_root: Path, destination: Path) -> list[dict]:
    rows = []
    for directory in sorted(prepared_root.glob("dai-pn010-*")):
        receipt_path = directory / "receipt.json"
        front = directory / "front.png"
        if receipt_path.is_file() and front.is_file():
            receipt = json.loads(receipt_path.read_text())
            rows.append({"id": receipt["candidateId"], "path": front, "receipt": receipt_path})
    if len(rows) != 8:
        raise ValueError(f"expected eight Dai body variant previews, found {len(rows)}")
    canvas = Image.new("RGB", (1200, 680), (12, 15, 22))
    draw = ImageDraw.Draw(canvas)
    for index, row in enumerate(rows):
        image = Image.open(row["path"]).convert("RGB")
        image.thumbnail((290, 290))
        x = index % 4 * 300 + (300 - image.width) // 2
        y = index // 4 * 340
        canvas.paste(image, (x, y))
        draw.text((index % 4 * 300 + 8, y + 294), row["id"], fill=(240, 240, 240))
    canvas.save(destination)
    return [{"candidateId": row["id"], "receiptAbsolutePath": str(row["receipt"]), "receiptSha256": sha256(row["receipt"])} for row in rows]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument(
        "--local-root",
        default="GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-priority-raw-v2",
    )
    parser.add_argument(
        "--tool-root",
        default="GGD-Asset-Library/tools/UEViewer/specific-infinity-strash-macos-v1-texture-export-fix",
    )
    parser.add_argument(
        "--conversion-root",
        default="GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1",
    )
    parser.add_argument(
        "--backup-root",
        default="GGD-Asset-Library/backups/infinity-strash-macos-native-export-v1",
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

    tool_root = (workspace / args.tool_root).resolve()
    conversion_root = (workspace / args.conversion_root).resolve()
    backup_root = (workspace / args.backup_root).resolve()
    if not all(path.is_relative_to(workspace) for path in (tool_root, conversion_root, backup_root)):
        raise ValueError("tool, conversion and backup roots must stay inside the workspace")
    tool_manifest, _ = validate_manifest(tool_root / "manifest.json")
    mesh_manifest, mesh_root = validate_manifest(conversion_root / "priority-mesh-components-v1/export-manifest.json")
    texture_manifest, texture_root = validate_manifest(conversion_root / "priority-textures-v1/export-manifest.json")
    animation_manifest, animation_root = validate_manifest(conversion_root / "priority-native-animations-v1/export-manifest.json")
    mesh_count = sum(row["path"].endswith(".gltf") for row in mesh_manifest["files"])
    texture_count = sum(row["path"].endswith(".png") for row in texture_manifest["files"])
    animation_count = sum(row["path"].endswith(".psa") for row in animation_manifest["files"])
    if (mesh_count, texture_count, animation_count) != (29, 97, 12):
        raise ValueError(f"unexpected converted output counts: {(mesh_count, texture_count, animation_count)}")

    conversion_backups = []
    for role, (directory, source_id) in BACKUP_STAGES.items():
        conversion_backups.append({"role": role, **validate_scoped_backup(backup_root / directory, source_id)})

    prepared_root = conversion_root / "prepared-components-v1"
    vearn_receipt_path = prepared_root / "vearn-en801-pre-transformation-body/receipt.json"
    vearn_receipt = json.loads(vearn_receipt_path.read_text())
    if vearn_receipt.get("candidateId") != "vearn-en801-pre-transformation-body":
        raise ValueError("unexpected Vearn visual review receipt")
    for row in vearn_receipt["files"]:
        path = vearn_receipt_path.parent / row["path"]
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError("changed Vearn prepared component: " + row["path"])

    MAC_EVIDENCE.mkdir(parents=True, exist_ok=True)
    for name in ("front.png", "isometric.png"):
        shutil.copy2(vearn_receipt_path.parent / name, MAC_EVIDENCE / ("vearn-en801-" + name))
    dai_variants = build_contact_sheet(prepared_root, MAC_EVIDENCE / "dai-pn010-body-variants.png")
    conversion_evidence = {
        "schema": "ggd.infinity-strash-macos-native-export-summary@1",
        "sourceId": SOURCE_ID,
        "tool": {
            "sourceId": tool_manifest["sourceId"],
            "upstreamCommit": tool_manifest["upstreamCommit"],
            "absolutePath": str(tool_root),
            "manifestSha256": sha256(tool_root / "manifest.json"),
            "binarySha256": next(row["sha256"] for row in tool_manifest["files"] if row["path"] == "umodel"),
        },
        "outputs": {
            "skeletalMeshGltf": mesh_count,
            "losslessPngTextures": texture_count,
            "nativePsaAnimations": animation_count,
            "meshManifestAbsolutePath": str(mesh_root / "export-manifest.json"),
            "meshManifestSha256": sha256(mesh_root / "export-manifest.json"),
            "textureManifestAbsolutePath": str(texture_root / "export-manifest.json"),
            "textureManifestSha256": sha256(texture_root / "export-manifest.json"),
            "animationManifestAbsolutePath": str(animation_root / "export-manifest.json"),
            "animationManifestSha256": sha256(animation_root / "export-manifest.json"),
        },
        "identities": [
            {"nativeId": "PN010", "nameZh": "小呆／達伊", "bodyVariantsReviewed": 8, "state": "native-components-converted-pending-textured-multipart-animation-assembly"},
            {"nativeId": "EN801", "nameZh": "巴恩大魔王", "form": "pre-transformation-old-vearn", "state": "native-components-converted-pending-textured-multipart-animation-assembly"},
            {"nativeId": "EN653", "nameZh": "密斯特巴恩", "state": "native-components-converted-and-kept-separate-pending-review"},
        ],
        "daiVariantReceipts": dai_variants,
        "vearnReceiptAbsolutePath": str(vearn_receipt_path),
        "vearnReceiptSha256": sha256(vearn_receipt_path),
        "visualEvidence": [
            {"gitPath": str((MAC_EVIDENCE / "dai-pn010-body-variants.png").relative_to(REPO)), "sha256": sha256(MAC_EVIDENCE / "dai-pn010-body-variants.png")},
            {"gitPath": str((MAC_EVIDENCE / "vearn-en801-front.png").relative_to(REPO)), "sha256": sha256(MAC_EVIDENCE / "vearn-en801-front.png")},
            {"gitPath": str((MAC_EVIDENCE / "vearn-en801-isometric.png").relative_to(REPO)), "sha256": sha256(MAC_EVIDENCE / "vearn-en801-isometric.png")},
        ],
        "legacyBackups": conversion_backups,
        "readiness": "converted-components-pending-final-ggd-assembly-and-validation",
        "postTransformationVearnLocated": False,
        "runtimeDropdownRegistered": False,
        "deploymentVerified": False,
    }
    conversion_summary_path = MAC_EVIDENCE / "conversion-summary.json"
    conversion_summary_path.write_text(json.dumps(conversion_evidence, ensure_ascii=False, indent=2) + "\n")

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
        "readiness": "native-model-texture-animation-components-converted-pending-final-assembly",
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
                "formState": "eight-body-variants-exported-and-geometry-reviewed-pending-final-textured-selection",
            },
            {
                "nativeId": "EN801", "nameZh": "巴恩大魔王", "originalName": "Vearn",
                "heroIds": ["godie-ubal"], "packageCount": 902,
                "formState": "pre-transformation-old-vearn-visually-confirmed-post-transformation-not-located",
            },
            {
                "nativeId": "EN653", "nameZh": "密斯特巴恩", "originalName": "MystVearn",
                "heroIds": [], "packageCount": 790,
                "formState": "separate-character-pending-hero-design-and-binding",
            },
        ],
        "backendIntegration": {
            "required": True,
            "state": "converted-components-pending-textured-multipart-animation-assembly-and-ggd-validation",
            "selectionVerified": False,
            "release": None,
        },
        "conversionEvidence": {
            "gitPath": str(conversion_summary_path.relative_to(REPO)),
            "sha256": sha256(conversion_summary_path),
            "meshGltfCount": mesh_count,
            "texturePngCount": texture_count,
            "nativePsaAnimationCount": animation_count,
        },
        "verification": (
            "pakchunk0 index is readable and unencrypted. Exact native-ID selection extracted 5,530 packages "
            "and verified every local byte count and SHA-256. pakchunk1 contains 12,254 indexed entries and "
            "zero direct PN010/EN801/EN653 path matches. A pinned patched macOS UEViewer build now exports "
            "skeletal meshes, lossless textures and native PSA animations with SHA-256 manifests."
        ),
        "limitations": [
            "The stock public UModel build misreads Infinity Strash skeletal section data; this workflow uses a pinned source patch that consumes the game's additional uint64 base-vertex field.",
            "EN801 is visually confirmed as old, pre-transformation Vearn. No separate post-transformation Vearn mesh was located in either primary PAK index.",
            "EN653 is MystVearn and must remain separate from Vearn. EN680 and EN681 are Baran forms and are not part of this extraction.",
            "Wwise event packages do not identify or decode the numeric Media containers by themselves.",
            "Converted GLB bodies are untextured skeletal components; multipart assembly, texture binding, animation conversion into the final GLB and GGD contract validation remain open.",
            "No component is registered as a model option, backend-selectable or deployed.",
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
        mutable = {"publicationStatus", "pendingBackup", "backup", "readiness", "identities", "backendIntegration", "conversionEvidence", "verification", "limitations"}
        if {k: v for k, v in existing.items() if k not in mutable} != {k: v for k, v in source.items() if k not in mutable}:
            raise ValueError("existing source differs; refusing to overwrite another workflow")
        for key in ("readiness", "identities", "backendIntegration", "conversionEvidence", "verification", "limitations"):
            existing[key] = source[key]
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
        "conversionEvidence": source["conversionEvidence"],
    }
    if s3_backup:
        compact["s3Backup"] = s3_backup
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(compact, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": SOURCE_ID, "status": status, "files": 5530, "bytes": index["totalBytes"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
