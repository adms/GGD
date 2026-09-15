#!/usr/bin/env python3
"""Register the path-indexed KOF XIV Terry scope without inventing payloads."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
SOURCE_ID = "steam-kofxiv-terry-path-index-v1"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_source(repo: Path, workspace: Path) -> dict[str, object]:
    evidence = repo / "materials/hero-model-library/source-inventories/kof-xiv-terry-path-index-v1"
    inventory_path = evidence / "inventory.json"
    files_path = evidence / "files.jsonl.gz"
    document_path = evidence / "README.md"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    if inventory.get("schema") != "ggd.kofxiv-terry-path-index@1" or inventory.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected KOF XIV Terry inventory")
    summary = inventory["summary"]
    if (
        summary.get("pathIndexedFiles") != 375
        or summary.get("payloadFilesReadThisRun") != 0
        or summary.get("convertedFiles") != 0
        or summary.get("runtimeBindings") != 0
        or summary.get("backendOptions") != 0
        or summary.get("productionDeployments") != 0
    ):
        raise ValueError("Terry inventory is stale or overclaims readiness")
    if inventory["filesIndex"]["sha256"] != sha256(files_path):
        raise ValueError("Terry files index differs")
    listing = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-wad-inspection-v1/quickbms-list.log"
    if inventory["listing"]["sha256"] != sha256(listing):
        raise ValueError("cached WAD listing differs")
    candidates = json.loads(json.dumps(inventory["conversionCandidates"]))
    candidates["vfx"].pop("effectReviewCandidates")
    candidates["vfx"]["effectReviewCandidateCount"] = summary["nativeEffectReviewLabels"]
    candidates["vfx"]["detailGitPath"] = str(inventory_path.relative_to(repo))
    return {
        "id": SOURCE_ID,
        "target": "KOF XIV／Terry Bogard（泰利·柏格）／TRY 路徑級原作素材候選",
        "heroIds": [],
        "ownerEntryIds": [],
        "url": "https://store.steampowered.com/app/571260/",
        "uploader": "User-owned local Steam install; cached QuickBMS listing from prior read-only SMB access",
        "format": "AGAR WAD 1.1 path index; expected OBAC/OMIR/OSEC/OTRA/DDS/PNG/EFF/OGG payloads are not present in this batch",
        "accessStatus": "cached-path-index-source-container-not-mounted",
        "acquisitionStatus": "source-container-verified-prior-run-path-indexed-only",
        "readiness": "path-indexed-awaiting-source-remount-extraction-hashing-conversion-and-review",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "canonical-game-path-index-reserve",
        "localPath": "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-wad-inspection-v1",
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam, Release 1.26 authority from parent extraction)",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb-cached-listing",
        "assetKinds": ["model", "texture", "skeleton", "animation", "vfx", "sound-effect", "voice", "audio-metadata", "configuration"],
        "publicationStatus": "git-path-index-only; raw listing remains local; S3 backup pending",
        "identity": inventory["character"],
        "pathIndex": {
            "gitPath": str(files_path.relative_to(repo)),
            "bytes": files_path.stat().st_size,
            "sha256": sha256(files_path),
            "rowCount": summary["pathIndexedFiles"],
            "listedPayloadBytes": summary["pathIndexedBytes"],
            "payloadSha256Available": False,
        },
        "gitEvidence": [
            {"gitPath": str(inventory_path.relative_to(repo)), "bytes": inventory_path.stat().st_size, "sha256": sha256(inventory_path)},
            {"gitPath": str(files_path.relative_to(repo)), "bytes": files_path.stat().st_size, "sha256": sha256(files_path)},
            {"gitPath": str(document_path.relative_to(repo)), "bytes": document_path.stat().st_size, "sha256": sha256(document_path)},
        ],
        "pathIndexedCandidates": candidates,
        "counts": summary,
        "pendingBackup": {
            "localRoot": "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-wad-inspection-v1",
            "state": "not-uploaded-by-this-workflow",
            "requiredArtifacts": ["quickbms-list.log"],
        },
        "backendIntegration": {
            "required": True,
            "state": "blocked-until-payload-extraction-conversion-validation-and-hero-design",
            "selectionVerified": False,
        },
        "verification": "The cached 3,073,359-byte listing has exact SHA-256 and 375 safe Chara/TRY paths. Every row has offset, listed byte count and a metadata-only evidence digest. Payload read, per-file payload SHA-256, extraction, conversion, user review, binding, backend selection and deployment are all zero.",
        "limitations": inventory["limitations"],
    }


def upsert(document: dict[str, object], source: dict[str, object]) -> bool:
    rows = document.setdefault("publicSources", [])
    matches = [index for index, row in enumerate(rows) if row.get("id") == SOURCE_ID]
    if len(matches) > 1:
        raise ValueError("duplicate KOF XIV Terry source ID")
    if not matches:
        rows.append(source)
        return True
    index = matches[0]
    if rows[index] == source:
        return False
    rows[index] = source
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    document = json.loads(downloads_path.read_text(encoding="utf-8"))
    changed = upsert(document, build_source(repo, workspace))
    encoded = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if changed or downloads_path.read_text(encoding="utf-8") != encoded:
            raise ValueError("refresh KOF XIV Terry source registration")
    else:
        downloads_path.write_text(encoded, encoding="utf-8")
    print(json.dumps({"sourceId": SOURCE_ID, "changed": changed, "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
