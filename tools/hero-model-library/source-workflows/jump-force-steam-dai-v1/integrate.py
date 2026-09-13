#!/usr/bin/env python3
"""Upsert the verified JUMP FORCE/Dai acquisition record into the central source index."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys


SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def record(workspace: Path, index: dict, manifest: dict, manifest_path: Path, files_path: Path, existing: dict | None = None) -> dict:
    containers = []
    for row in index["containers"]:
        containers.append({
            "originPath": row["originPath"],
            "name": row["name"],
            "bytes": row["bytes"],
            "sha256": row["sha256"],
            "indexedEntries": row["entryCount"],
            "indexEncrypted": True,
            "locallyMirrored": False,
        })
    git_manifest = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/source-manifest.json"
    git_files = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/files.jsonl.gz"
    git_pak_json = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
    git_pak_md = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.md"
    git_visual = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/visual-review.json"
    git_conversion = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/conversion-receipt.json"
    git_webgl = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/webgl-proof.json"
    git_images = [workspace / f"materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/{name}.png" for name in ("front", "back", "isometric")]
    for path in (git_manifest, git_files, git_pak_json, git_pak_md, git_visual, git_conversion, git_webgl, *git_images):
        if not path.is_file():
            raise ValueError(f"missing Git evidence: {path}")
    result = {
        "id": SOURCE_ID,
        "target": "JUMP FORCE Steam 原作：小呆／達伊 chr0430 模型、貼圖、骨架、特效、音訊與技能資料",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "ownerEntryIds": [],
        "url": "https://store.steampowered.com/app/816020/JUMP_FORCE/",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "Unreal Engine 4.19 encrypted PAK; UAsset/UExp; UModel glTF and PNG evidence",
        "accessStatus": "local-installed-game-readonly-share",
        "acquisitionStatus": "priority-scope-extracted-verified",
        "readiness": "complete-body-review-glb-webgl-rendered-pending-material-parity-and-ggd-intake",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "canonical-game-model-vfx-audio-reserve",
        "localPath": "GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1",
        "sourceGame": "JUMP FORCE",
        "platform": "Windows (Steam)",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": [
            "model-package", "texture-material-package", "skeleton-package",
            "vfx-package", "audio-package", "character-configuration", "skill-configuration",
        ],
        "publicationStatus": "local-and-git-evidence-only-s3-pending",
        "containers": containers,
        "containerPreservation": {
            "state": "mounted-source-only-pending-local-mirror-and-s3-backup",
            "containerCount": index["containerCount"],
            "relationCount": index["relationCount"],
            "uniquePathCount": index["uniquePathCount"],
            "duplicateRelationCount": index["duplicateRelationCount"],
            "fullIndexPath": "GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/full-path-index.jsonl.gz",
        },
        "filesManifest": {
            "path": str(manifest_path),
            "sha256": sha256(manifest_path),
        },
        "extractedFilesIndex": {
            "path": str(files_path),
            "sha256": sha256(files_path),
            "fileCount": manifest["counts"]["allFrozenFiles"],
        },
        "gitEvidence": [
            {"gitPath": str(git_manifest.relative_to(workspace)), "bytes": git_manifest.stat().st_size, "sha256": sha256(git_manifest)},
            {"gitPath": str(git_files.relative_to(workspace)), "bytes": git_files.stat().st_size, "sha256": sha256(git_files)},
            {"gitPath": str(git_pak_json.relative_to(workspace)), "bytes": git_pak_json.stat().st_size, "sha256": sha256(git_pak_json)},
            {"gitPath": str(git_pak_md.relative_to(workspace)), "bytes": git_pak_md.stat().st_size, "sha256": sha256(git_pak_md)},
            {"gitPath": str(git_visual.relative_to(workspace)), "bytes": git_visual.stat().st_size, "sha256": sha256(git_visual)},
            {"gitPath": str(git_conversion.relative_to(workspace)), "bytes": git_conversion.stat().st_size, "sha256": sha256(git_conversion)},
            {"gitPath": str(git_webgl.relative_to(workspace)), "bytes": git_webgl.stat().st_size, "sha256": sha256(git_webgl)},
            *[{"gitPath": str(path.relative_to(workspace)), "bytes": path.stat().st_size, "sha256": sha256(path)} for path in git_images],
        ],
        "identityRecords": [{
            "name": "小呆／達伊",
            "nameZh": "小呆／達伊",
            "originalName": "Dai",
            "nativeCharacterId": "chr0430",
            "aliases": ["小呆", "達伊", "Dai"],
            "heroIds": ["godie-nbbc", "godie-n01c"],
        }],
        "modelCandidates": [{
            "candidateId": "jump-force-native-dai-chr0430-raw-v1",
            "sourceId": SOURCE_ID,
            "name": "小呆／達伊",
            "character": "小呆／達伊 / Dai",
            "nativeCharacterId": "chr0430",
            "heroIds": ["godie-nbbc", "godie-n01c"],
            "sourceGame": "JUMP FORCE",
            "platform": "Windows (Steam)",
            "selectionClass": "canonical-game",
            "assetKinds": ["model", "texture", "skeleton", "vfx", "audio", "configuration"],
            "nativePackageCount": manifest["counts"]["nativePackages"],
            "modelGltfCount": manifest["counts"]["modelGltf"],
            "texturePngCount": manifest["counts"]["texturePng"],
            "modelState": "complete-body-review-glb-webgl-rendered-pending-material-parity-and-ggd-intake",
            "animationState": "no-accepted-native-clips-in-current-export",
            "vfxState": "native-packages-extracted-pending-conversion",
            "audioState": "native-packages-extracted-pending-decode-and-listening-review",
            "defaultEligible": False,
            "backendSelectable": False,
            "deployed": False,
        }],
        "backendIntegration": {
            "required": True,
            "state": "pending-standardization-and-validation",
            "heroIds": ["godie-nbbc", "godie-n01c"],
            "registered": False,
            "selectable": False,
            "selectionVerified": False,
            "productionDeployed": False,
        },
        "verification": (
            "Six PAK indexes were decoded with the externally supplied AES key and indexed with patch relations intact. "
            "The priority Dai scope contains 1,942 extracted native packages, 11 skinned glTF components with 159 joints, "
            "and 36 exported PNG textures. These are acquisition and structural export facts, not GGD acceptance."
        ),
        "limitations": [
            "The six original PAK byte streams remain on the mounted Windows Steam library and are not yet locally mirrored or S3-backed up.",
            "The six-part complete-body composition has WebGL three-view evidence, but source-game shader parity and material correction remain pending.",
            "No native animation clips have been accepted from the current export.",
            "VFX and audio packages are not decoded or bound to GGD events.",
            "No model option is registered, selectable or deployed from this source yet.",
            "Redistribution rights for original game assets are not asserted.",
        ],
        "backup": {},
    }
    if existing:
        for key in ("pendingBackup", "backup", "supplementalDeliveries"):
            if key in existing:
                result[key] = existing[key]
        if existing.get("backup", {}).get("readbackVerified") is True:
            result["publicationStatus"] = "s3-readback-verified"
            result["verification"] += " 已完成固定 ZIP 的 S3 完整讀回與逐成員 SHA-256 驗證。"
        elif existing.get("pendingBackup"):
            result["publicationStatus"] = "local-only-awaiting-s3-upload"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--local-root", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    source_index_path = workspace / "materials/hero-model-library/download-sources.json"
    pak_index_path = workspace / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
    local_root = args.local_root.resolve()
    manifest_path = local_root / "source-manifest.json"
    files_path = local_root / "files.jsonl.gz"
    source_index = json.loads(source_index_path.read_text(encoding="utf-8"))
    pak_index = json.loads(pak_index_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    matches = [row for row in source_index["publicSources"] if row.get("id") == SOURCE_ID]
    if len(matches) > 1:
        raise ValueError(f"duplicate source id: {SOURCE_ID}")
    desired = record(workspace, pak_index, manifest, manifest_path, files_path, matches[0] if matches else None)
    if args.check:
        if matches != [desired]:
            raise ValueError(f"central source record is stale: {SOURCE_ID}")
        print(json.dumps({"sourceId": SOURCE_ID, "check": "ok"}, ensure_ascii=False))
        return 0
    if matches:
        source_index["publicSources"][source_index["publicSources"].index(matches[0])] = desired
    else:
        source_index["publicSources"].append(desired)
    source_index_path.write_text(json.dumps(source_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceId": SOURCE_ID, "action": "updated" if matches else "inserted"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
