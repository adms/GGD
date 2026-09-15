#!/usr/bin/env python3
"""Register the J-Stars comparison sample without promoting raw members to models."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[4])
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--intake", required=True, type=Path)
    parser.add_argument("--analysis", required=True, type=Path)
    args = parser.parse_args()
    repo, workspace, intake, analysis_path = map(Path.resolve, (args.repo, args.workspace, args.intake, args.analysis))
    if not intake.is_relative_to(workspace):
        raise ValueError("intake is outside workspace")
    analysis = json.loads(analysis_path.read_text())
    if analysis.get("schema") != "ggd.jstars-stpk-research@1" or analysis.get("sourceId") != "zenhax-jstars-pak-stpk-comparison-v1":
        raise ValueError("unexpected analysis")
    expected_ids = ["000", "013", "014", "018"]
    if [row["nativeCharacterId"] for row in analysis["characters"]] != expected_ids:
        raise ValueError("unexpected native character set")
    if analysis["summary"] != {
        "nativeCharacters": 4, "pakStpkPairs": 12, "stpkContainersSplit": 12,
        "standardizedModels": 0, "nativeAnimations": 0, "vfx": 0, "decodedAudio": 0,
        "blockedCmpPairs": 12,
    }:
        raise ValueError("analysis acceptance counts changed")
    original = intake / "original/j-stars_samples.7z"
    evidence_dir = analysis_path.parent
    backup_receipts = []
    for name, role in (("source-s3-backup-receipt.json", "source-intake"), ("conversion-s3-backup-receipt.json", "split-conversion")):
        receipt_path = evidence_dir / name
        if not receipt_path.is_file():
            raise FileNotFoundError("missing Git backup receipt: " + str(receipt_path))
        receipt = json.loads(receipt_path.read_text())
        if receipt.get("schema") != "ggd-intake-backup-receipt@1" or not all(receipt.get(key) is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged")):
            raise ValueError("unverified Git backup receipt: " + name)
        backup_receipts.append({"role": role, "gitPath": receipt_path.relative_to(repo).as_posix(), "sha256": sha(receipt_path), "s3Uri": receipt["s3Uri"], "manifestUri": receipt["manifestUri"]})
    entry = {
        "id": "zenhax-jstars-pak-stpk-comparison-v1",
        "target": "J-Stars 原生角色 000／013／014／018 PAK-STPK 對照研究樣本",
        "heroIds": [], "ownerEntryIds": [],
        "url": "https://zenhax.com/viewtopic.php@t=13160.html",
        "downloadUrl": "https://www.mediafire.com/file/zy163k5xwr1aaz0/j-stars_samples.7z/file",
        "uploader": "josou_kitsune", "format": "7z／12 × $CMP PAK + 12 × RAM-dumped STPK",
        "checkedAt": "2026-09-14", "accessStatus": "public-direct-download",
        "acquisitionStatus": "downloaded-verified", "readiness": "native-stpk-split-pending-standardization",
        "purchaseDecision": "free-research-sample-acquired-continue-owner-rom-extraction",
        "defaultEligible": False, "resourceRole": "native-container-research-supplement",
        "localPath": intake.relative_to(workspace).as_posix(),
        "reuseTerms": "Public research post and archive retained; redistribution/runtime use terms were not explicitly established.",
        "usage": "research and conversion intake only; no automatic runtime selection",
        "backendIntegration": {"required": True, "state": "pending-standardization-and-character-mapping", "heroIds": [], "selectionVerified": False},
        "sourceGame": "J-Stars Victory VS+", "platform": "PS3 research sample; owner PSV copies tracked separately",
        "characterIdentities": [
            {"nativeCharacterId": row["nativeCharacterId"], "name": row["name"], "nameOriginal": row["nameOriginal"], "status": row["identityStatus"]}
            for row in analysis["characters"]
        ],
        "assetKinds": ["native-container", "model-source-member", "texture-source-member", "resource-reference"],
        "verification": "Original archive and 24 extracted PAK/STPK inputs have per-file SHA-256. Twelve STPK tables passed bounds checks and their 66 non-empty members were split and hashed. Outputs remain PS3 SRD/SRDI/SRDV source members; no GLB, decoded texture, verified skeleton, native motion, VFX or audio was produced.",
        "files": [{"path": "original/j-stars_samples.7z", "bytes": original.stat().st_size, "sha256": sha(original)}],
        "nativeCharacterCount": 4, "nativeContainerPairCount": 12, "modelCount": 0,
        "characterIdentityVerified": False,
        "analysis": {
            "gitPath": analysis_path.relative_to(repo).as_posix(), "sha256": sha(analysis_path),
            "localConversionPath": "GGD-Asset-Library/conversions/jstars-stpk-research-v1",
            "stpkContainersSplit": 12, "standardizedModel": False, "visualValidation": False,
            "backendRegistered": False, "runtimeSelectable": False,
        },
        "gitBackupReceipts": backup_receipts,
        "missing": ["$CH0 decode", "PS3 geometry conversion", "PS3 texture unswizzle", "skeleton and skin validation", "native animations", "VFX", "audio", "visual validation", "GGD character mapping and dropdown registration"],
        "publicationStatus": "local-intake-s3-backup-registration-pending",
        "backup": {"status": "not-uploaded", "readbackVerified": False},
    }
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    document = json.loads(sources_path.read_text())
    rows = document.setdefault("publicSources", [])
    matches = [row for row in rows if row.get("id") == entry["id"]]
    if matches:
        changed = False
        for key, value in entry.items():
            if key in {"publicationStatus", "backup"}:
                continue
            if key not in matches[0]:
                matches[0][key] = value
                changed = True
            elif matches[0].get(key) != value:
                raise ValueError(f"existing source differs at {key}")
        if changed:
            sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"sourceId": entry["id"], "new": False, "enriched": changed}))
        return
    rows.append(entry)
    sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": entry["id"], "new": True}))


if __name__ == "__main__":
    main()
