#!/usr/bin/env python3
"""Register S3-backed Ash XV budget candidates in the fixed central indexes."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof3d_inventory", HERE / "build_inventory.py")
BUILD = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(BUILD)


def source_record(ash: dict[str, Any]) -> dict[str, Any]:
    candidates = []
    for row in ash["candidates"]:
        metrics = row["metrics"]
        candidates.append({
            "candidateId": row["candidateId"],
            "sourceId": ash["sourceId"],
            "character": "Ash Crimson",
            "heroIds": [],
            "sourceGame": "The King of Fighters XV",
            "sourcePlatform": "unknown-original-platform",
            "platformEvidence": "Upstream author identifies KOF XV; the original game installation platform and patch are not specified.",
            "sourceUrl": "https://open3dlab.com/project/21f68f68-b705-46ab-9a72-88b68a9fa246/",
            "author": "Anthony; original XPS model credited to MichiFreddy35",
            "sourceClass": "mod-community-port-derived-budget-candidate",
            "derivedFromSourceId": row["derivedFromSourceId"],
            "variant": row["variant"],
            "model": f"{row['variant']}/body.glb",
            "bytes": row["bytes"],
            "sha256": row["sha256"],
            "readyStage": row["state"],
            "triangles": metrics["triangles"],
            "drawCalls": metrics["drawCalls"],
            "meshCount": metrics["meshCount"],
            "skinCount": metrics["skinCount"],
            "jointCounts": [metrics["maxSkinJoints"]],
            "animationCount": metrics["animationCount"],
            "textureCount": metrics["imageCount"],
            "maxTextureDimension": metrics["maxTextureDimension"],
            "rigSurvivalVerified": row["rigSurvival"]["ok"],
            "triangleBudgetPassed": row["triangleBudgetPassed"],
            "textureDimensionPassed": row["textureDimensionPassed"],
            "jointBudgetPassed": row["jointBudgetPassed"],
            "drawCallBudgetPassed": row["drawCallBudgetPassed"],
            "visualReviewPassed": row["visualReviewPassed"],
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "defaultChanged": False,
            "candidateMustBeRetained": True,
            "originalBytesPreserved": True,
            "limitations": ash["limitations"],
        })
    receipt = ash["s3BackupReceipt"]
    return {
        "id": ash["sourceId"],
        "target": "KOF XV／Ash Crimson／左右髮材質修訂版的 GGD 預算候選",
        "heroIds": [],
        "ownerEntryIds": [],
        "url": "https://open3dlab.com/project/21f68f68-b705-46ab-9a72-88b68a9fa246/",
        "uploader": "Anthony; original XPS model credited to MichiFreddy35",
        "format": "2 GLB / embedded 256px PNG / skin-preserving meshoptimizer derivation",
        "accessStatus": "derived-from-acquired-public-source",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "converted-partial-budget-pending-drawcall-and-visual-review",
        "purchaseDecision": "no-purchase-existing-public-source",
        "defaultEligible": False,
        "resourceRole": "character-model-budget-candidate",
        "localPath": "GGD-Asset-Library/conversions/kof-xv-ash-material-v2-budget-v2",
        "sourceGame": "The King of Fighters XV",
        "platform": "unknown-original-platform; derived offline on macOS",
        "selectionClass": "community-mod",
        "discoveryChannel": "model-sharing-community-public-free-mirror",
        "derivedFromSourceId": "kof-open3dlab-ash-xv-material-repair-v2",
        "assetKinds": ["model", "texture", "skeleton"],
        "publicationStatus": "s3-legacy-readback-verified",
        "modelCandidates": candidates,
        "verification": "Both derivatives preserve one 258-joint skin and all 18 skinned primitives, reduce 94,274 triangles to 7,869/7,868, resize all 15 embedded images from 2,048 to 256, pass the Babylon loader, and have exact local SHA-256. They remain non-runtime candidates because draw calls are 18 (>3), the project atlas step rejected the primitive/transform layout, and no source-versus-decimated visual review or gameplay animation exists.",
        "backendIntegration": {
            "required": True,
            "state": "pending-drawcall-reduction-visual-review-action-and-binding",
            "selectionVerified": False,
        },
        "backup": {
            "s3Uri": receipt["s3Uri"],
            "manifestUri": receipt["manifestUri"],
            "bytes": receipt["archiveBytes"],
            "sha256": receipt["archiveSha256"],
            "archiveFormat": "tar-gzip",
            "fileCount": receipt["fileCount"],
            "readbackVerified": receipt["fullGetVerified"],
            "fullReadbackVerified": receipt["fullGetVerified"],
            "allMemberSha256Verified": receipt["allMemberSha256Verified"],
            "usage": "manual-only legacy conversion backup; not runtime-ready",
        },
    }


def upsert(data: dict[str, Any], source: dict[str, Any]) -> bool:
    rows = data.setdefault("publicSources", [])
    matches = [index for index, row in enumerate(rows) if row.get("id") == source["id"]]
    if len(matches) > 1:
        raise ValueError(f"duplicate source id: {source['id']}")
    if not matches:
        rows.append(source)
        return True
    index = matches[0]
    # The universal-atlas component workflow is the authority for its Git
    # evidence and S3 receipt.  This older budget-candidate refresh only owns
    # the two 18-draw predecessor rows, so it must not erase the newer
    # independently reusable components when rebuilding the shared source.
    for key in ("componentCandidates", "conversionAttempts"):
        if key in rows[index] and key not in source:
            source[key] = rows[index][key]
    for key in ("sourceClass", "publicationStatus"):
        if key in rows[index] and key not in source:
            source[key] = rows[index][key]
    if rows[index] == source:
        return False
    rows[index] = source
    return True


def integrate_xiv_source(data: dict[str, Any], textures: dict[str, Any], probe: dict[str, Any]) -> bool:
    rows = [row for row in data.get("publicSources", []) if row.get("id") == BUILD.KOF_XIV_SOURCE_ID]
    if len(rows) != 1:
        raise ValueError(f"expected one KOF XIV source, found {len(rows)}")
    row = rows[0]
    before = json.dumps(row, ensure_ascii=False, sort_keys=True)
    row["readiness"] = "textures-decoded-review-candidates-model-motion-vfx-blocked"
    row["conversion"] = {
        "probeSourceId": probe["sourceId"],
        "nativeRepresentativeFiles": len(probe["kofXiv"]["nativeFiles"]),
        "assimpAcceptedFiles": probe["kofXiv"]["assimpAcceptedFiles"],
        "modelAndSkeleton": probe["kofXiv"]["conversionState"]["modelAndSkeleton"],
        "nativeAnimation": probe["kofXiv"]["conversionState"]["nativeAnimation"],
        "vfx": probe["kofXiv"]["conversionState"]["vfx"],
        "textureCandidates": textures["summary"],
        "runtimeReady": False,
        "backendSelectionVerified": False,
    }
    row["componentCandidates"] = [{
        "id": f"kof-xiv-{item['nativeCharacterId'].lower()}-{Path(item['outputAbsolutePath']).stem.lower()}-texture-v1",
        "nativeCharacterId": item["nativeCharacterId"],
        "assetKind": "texture",
        "absoluteLocalPath": item["outputAbsolutePath"],
        "bytes": item["outputBytes"],
        "sha256": item["outputSha256"],
        "width": item["width"], "height": item["height"], "channels": item["channels"],
        "readiness": item["state"], "runtimeReady": False, "backendSelectionVerified": False,
    } for item in textures["files"]]
    row["conversionBackup"] = textures.get("backup")
    return before != json.dumps(row, ensure_ascii=False, sort_keys=True)


def backlog_candidate(candidate: dict[str, Any], source: dict[str, Any], workspace: Path) -> dict[str, Any]:
    path = workspace / source["localPath"] / candidate["model"]
    raw = path.read_bytes()
    if len(raw) < 12 or raw[:4] != b"glTF":
        raise ValueError(f"not a GLB candidate: {path}")
    actual = BUILD.sha256(path)
    if len(raw) != candidate["bytes"] or actual != candidate["sha256"]:
        raise ValueError(f"changed Ash candidate: {path}")
    return {
        "path": str(path.resolve()),
        "existsLocal": True,
        "bytes": len(raw),
        "sha256": actual,
        "sha256Status": "exact-local-sha256-verified",
        "magicHex": raw[:12].hex(),
        "modelProof": {
            "format": "glTF2-binary",
            "meshes": candidate["meshCount"],
            "primitives": candidate["drawCalls"],
            "skins": candidate["skinCount"],
            "animationEntries": candidate["animationCount"],
        },
        "id": candidate["candidateId"],
        "library": "community",
        "sourceId": source["id"],
        "sourceUrl": source["url"],
        "readiness": candidate["readyStage"],
        "converted": True,
        "limitations": candidate["limitations"],
        "identityReviewRequired": False,
        "recordedBytes": len(raw),
        "sizeMatchesManifest": True,
        "absolutePath": str(path.resolve()),
        "localSizeMatches": True,
    }


def integrate_backlog(data: dict[str, Any], source: dict[str, Any], workspace: Path) -> bool:
    matches = [row for row in data.get("characters", []) if row.get("id") == "ash-crimson"]
    if len(matches) != 1:
        raise ValueError(f"expected one ash-crimson backlog row, found {len(matches)}")
    row = matches[0]
    before = json.dumps(row, ensure_ascii=False, sort_keys=True)
    if source["id"] not in row["sourceIds"]:
        row["sourceIds"].append(source["id"])
    by_id = {candidate.get("id"): index for index, candidate in enumerate(row["modelCandidates"])}
    new_candidates = [backlog_candidate(candidate, source, workspace) for candidate in source["modelCandidates"]]
    for candidate in new_candidates:
        index = by_id.get(candidate["id"])
        if index is None:
            row["modelCandidates"].append(candidate)
        else:
            row["modelCandidates"][index] = candidate
    for component in source.get("componentCandidates", []):
        if component.get("resourceRole") != "independent-static-skinned-model-component":
            continue
        path = Path(component["absolutePath"])
        raw = path.read_bytes()
        if len(raw) != component["bytes"] or BUILD.sha256(path) != component["sha256"]:
            raise ValueError("changed Ash universal-atlas component: " + str(path))
        candidate = {
            "path": str(path.resolve()), "existsLocal": True, "bytes": len(raw), "sha256": component["sha256"],
            "sha256Status": "exact-local-sha256-verified", "magicHex": raw[:12].hex(),
            "modelProof": {"format": "glTF2-binary", "meshes": 2, "primitives": component["drawPrimitives"],
                           "skins": component["skinCount"], "animationEntries": 0},
            "id": component["id"], "library": "community", "sourceId": source["id"],
            "sourceUrl": source["url"], "readiness": component["readiness"], "converted": True,
            "limitations": component["limitations"], "identityReviewRequired": False,
            "recordedBytes": len(raw), "sizeMatchesManifest": True, "absolutePath": str(path.resolve()),
            "localSizeMatches": True, "resourceRole": component["resourceRole"], "gitPath": component["gitPath"],
            "componentReady": True, "runtimeSelectable": False, "finalVisualAcceptance": False,
        }
        index = by_id.get(candidate["id"])
        if index is None:
            row["modelCandidates"].append(candidate)
        else:
            row["modelCandidates"][index] = candidate
    row["resources"]["motion"] = "原作可播放動作0；3個單幀pose不算動作。8GLB皆0動畫；兩個 5 draw 靜態骨架元件已通過結構驗收，最終視覺重渲染、英雄綁定與動作仍缺。"
    counts = row["resources"].setdefault("motionCandidateCounts", [])
    counts_by_id = {item.get("candidateId"): index for index, item in enumerate(counts)}
    for candidate in source["modelCandidates"]:
        item = {
            "candidateId": candidate["candidateId"],
            "count": candidate["animationCount"],
            "sourceCount": None,
            "unconvertedCount": None,
            "provenance": "meshoptimizer-derived-from-material-repair-v2",
            "readiness": candidate["readyStage"],
            "evidence": "exact local SHA-256, GLB metrics and S3 readback receipt; not runtime acceptance",
        }
        index = counts_by_id.get(item["candidateId"])
        if index is None:
            counts.append(item)
        else:
            counts[index] = item
    for component in source.get("componentCandidates", []):
        if component.get("resourceRole") != "independent-static-skinned-model-component":
            continue
        item = {"candidateId": component["id"], "count": 0, "sourceCount": 0, "unconvertedCount": 0,
                "provenance": "universal-multi-channel-atlas-derived-from-material-v2-budget",
                "readiness": component["readiness"],
                "evidence": "Git GLB, S3 full readback, structural validation and byte-identical rebuild; no hero or motion acceptance"}
        index = counts_by_id.get(item["candidateId"])
        if index is None:
            counts.append(item)
        else:
            counts[index] = item
    return before != json.dumps(row, ensure_ascii=False, sort_keys=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve() if args.workspace else repo.parent
    path = repo / "materials/hero-model-library/download-sources.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    ash = BUILD.build_ash_budget_candidates(workspace)
    source = source_record(ash)
    source_changed = upsert(data, source)
    texture_path = repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/texture-candidates.json"
    probe_path = repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/conversion-probe.json"
    xiv_changed = integrate_xiv_source(data, json.loads(texture_path.read_text(encoding="utf-8")), json.loads(probe_path.read_text(encoding="utf-8")))
    backlog_path = repo / "materials/hero-model-library/已取得模型待設計英雄.json"
    backlog = json.loads(backlog_path.read_text(encoding="utf-8"))
    backlog_changed = integrate_backlog(backlog, source, workspace)
    changed = source_changed or xiv_changed or backlog_changed
    if args.check:
        if changed:
            raise SystemExit("KOF Ash budget central indexes are stale")
    else:
        if source_changed or xiv_changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if backlog_changed:
            backlog_path.write_text(json.dumps(backlog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceId": ash["sourceId"], "sourceChanged": source_changed, "xivChanged": xiv_changed,
        "backlogChanged": backlog_changed, "changed": changed, "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
