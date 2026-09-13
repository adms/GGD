#!/usr/bin/env python3
"""Register the byte-identical local mirror of both Infinity Strash primary PAKs."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


SOURCE_ID = "steam-infinity-strash-primary-paks-build-local-20240328"
DERIVED_SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
EXPECTED = {
    "pakchunk0-WindowsClient.pak": {
        "bytes": 8332792957,
        "sha256": "192069367059ef2a258c6c3f1e12908a16a05bcf5cfdb32e252cb676f766b5ee",
        "pakVersion": 11,
        "compression": "Zlib",
        "indexEncrypted": False,
        "indexedEntries": 181304,
    },
    "pakchunk1-WindowsClient.pak": {
        "bytes": 4382548320,
        "sha256": "78edc35c624dbab88a378cf3d2b20ed48c43c05d844ec342a00a868771733095",
        "pakVersion": 11,
        "compression": "Zlib",
        "indexEncrypted": False,
        "indexedEntries": 12254,
    },
}


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
        default="GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1",
    )
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    if not local_root.is_relative_to(workspace) or not local_root.is_dir():
        raise ValueError("PAK mirror must be an existing directory inside the workspace")

    rows = []
    for name, expected in EXPECTED.items():
        path = local_root / "original" / name
        if not path.is_file() or path.stat().st_size != expected["bytes"] or sha256(path) != expected["sha256"]:
            raise ValueError("local PAK mirror differs from the verified SMB source: " + name)
        rows.append({
            "path": path.relative_to(local_root).as_posix(),
            "absolutePath": str(path),
            "originPath": "/Volumes/common/Strash/strash/Content/Paks/" + name,
            **expected,
        })

    manifest = {
        "schema": "ggd-infinity-strash-primary-pak-mirror@1",
        "sourceId": SOURCE_ID,
        "sourceWork": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "sourcePlatform": "Windows Steam installation via user-authorized read-only SMB share",
        "sourceAccess": "read-only",
        "files": rows,
        "totalBytes": sum(row["bytes"] for row in rows),
        "copyVerification": "Both local files have the exact size and SHA-256 previously measured at their SMB source paths.",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "states": {
            "sourceMirroredLocally": True,
            "bothPakIndexesRead": True,
            "completeGameExtracted": False,
            "priorityPackagesExtractedInDerivedSource": True,
            "modelConverted": False,
            "backendSelectable": False,
            "deployed": False,
        },
    }
    manifest_path = local_root / "source-manifest.json"
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        manifest["createdAt"] = previous["createdAt"]
        if previous != manifest:
            raise ValueError("existing source manifest differs; preserve it and use a new source ID")
    else:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    source = {
        "id": SOURCE_ID,
        "target": "Infinity Strash Windows Steam 兩個主 PAK 完整原件",
        "heroIds": ["godie-nbbc", "godie-n01c", "b2-popp", "godie-ubal"],
        "ownerEntryIds": [],
        "url": "https://www.square-enix.com/asia/newsportal/en/topics/infinitystrash-dragonquest-aod/post01.html",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "Unreal Engine 4.26 PAK v11 / Zlib",
        "accessStatus": "local-installed-game-readonly-share",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "complete-primary-containers-mirrored-pending-full-extraction",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "complete-original-container-reserve",
        "localPath": local_root.relative_to(workspace).as_posix(),
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "platform": "Windows (Steam)",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": ["complete-game-container", "model", "texture", "skeleton", "animation", "vfx", "audio", "configuration"],
        "publicationStatus": "local-only-awaiting-s3-upload",
        "files": rows,
        "filesManifest": {"path": "source-manifest.json", "sha256": sha256(manifest_path)},
        "derivedSourceIds": [DERIVED_SOURCE_ID],
        "backendIntegration": {
            "required": True,
            "state": "complete-container-reserve-priority-export-pending",
            "selectionVerified": False,
            "release": None,
        },
        "verification": (
            "Both primary PAKs were copied from the read-only SMB share to the local asset library and independently "
            "matched by byte size and SHA-256. Their indexes are readable and unencrypted. Priority PN010/EN801/EN653 "
            "packages are tracked by the derived source; the rest of the game remains reserved and unconverted."
        ),
        "limitations": [
            "The mounted game directory does not expose Steam appmanifest build metadata, so no Steam build ID is asserted.",
            "Complete PAK preservation does not mean every contained character or resource has been extracted, classified or converted.",
            "The public game-specific UModel exporter obtained for this title is Windows-only.",
            "No model option, animation, effect, audio binding or deployment is accepted merely from these containers.",
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
        mutable = {"publicationStatus", "pendingBackup", "backup", "verification"}
        if {k: v for k, v in matches[0].items() if k not in mutable} != {k: v for k, v in source.items() if k not in mutable}:
            raise ValueError("existing source differs; refusing to overwrite another workflow")
        status = "already-integrated"
    else:
        document["publicSources"].append(source)
        DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
        status = "integrated"
    print(json.dumps({"sourceId": SOURCE_ID, "status": status, "files": len(rows), "bytes": manifest["totalBytes"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
