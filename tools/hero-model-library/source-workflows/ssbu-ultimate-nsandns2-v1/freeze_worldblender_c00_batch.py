#!/usr/bin/env python3
"""Freeze the validated Worldblender c00 batch without editing global indexes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys


HELPER_ROOT = Path(__file__).resolve().parents[1] / "ssbu-models-v1"
sys.path.insert(0, str(HELPER_ROOT))
from glb_material_alpha import audit_opaque_material_texture_alpha  # noqa: E402


CONFIG = {
    "mario": {
        "nameZh": "瑪利歐", "originalName": "Mario", "nativeId": "fighter/mario/model/body/c00",
        "sourceSha256": "8af85d9accb3f13b2bc920553da2a9545cbdb980182bba15d59f23274a03c44d",
        "outputSha256": "87f172896c929c486dfcefd7f905e7bac5c1b0c5b5349cd0a047f744da997257",
        "componentId": "ssbu-mario-c00-static-skinned-v2",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-mario-full-v2",
        "metrics": (7189, 6, 98, 6, 101330),
    },
    "link": {
        "nameZh": "林克", "originalName": "Link", "nativeId": "fighter/link/model/body/c00",
        "sourceSha256": "1291da62c7075a847d48841d087f350cc5bc62119661acda9cd00099b85f1506",
        "outputSha256": "ab6b618b3db1c3d085648bc6a75ea27903595d864756d97efa96f53aa1ae1754",
        "componentId": "ssbu-link-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-link-full-v2",
        "metrics": (7897, 6, 145, 5, 95736),
    },
    "sonic": {
        "nameZh": "索尼克", "originalName": "Sonic", "nativeId": "fighter/sonic/model/body/c00",
        "sourceSha256": "670fcfa00a5fedf91344c3a9dac599130f51c44c0bc655ca710efe75e054cfc5",
        "outputSha256": "9c05c3efbb080e8182ff32a2429c2b07a47b01842fe38bbfe1d7414748e56c2a",
        "componentId": "ssbu-sonic-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-sonic-full-v2",
        "metrics": (8980, 5, 115, 5, 130032),
    },
}
EVIDENCE_ROOT = Path("materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch-v1")
CONVERSION_DIR = "ssbu-worldblender-c00-alpha-fixed-batch1-v2"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def encode(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def evidence_ref(path: Path, data: bytes) -> dict:
    return {"gitPath": path.as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    conversion_root = asset_root / "conversions" / CONVERSION_DIR
    writes: dict[Path, bytes] = {}
    batch_candidates = []
    for character, config in CONFIG.items():
        source = asset_root / "intake/public-models-20260910/gitlab-ssbu-models/source-repository/fighter" / character / "model/body/c00" / f"{character}-c00.blend"
        root = conversion_root / character
        first = root / "first"
        rebuild = root / "rebuild"
        output = first / "body.glb"
        validation_path = first / "validation.json"
        proof_path = first / "render-v1/proof.json"
        assert sha(source) == config["sourceSha256"]
        assert sha(output) == config["outputSha256"]
        assert output.read_bytes() == (rebuild / "body.glb").read_bytes()
        rebuild_pin = pin(rebuild / "body.glb")
        validation = json.loads(validation_path.read_text())
        proof = json.loads(proof_path.read_text())
        backup_path = asset_root / "backups" / config["backupDir"] / "latest-receipt.json"
        backup = json.loads(backup_path.read_text())
        assert backup["schema"] == "ggd-intake-backup-receipt@1"
        assert Path(backup["source"]).resolve() == root.resolve()
        assert backup["fullGetVerified"] and backup["allMemberSha256Verified"] and backup["localUnchanged"]
        assert backup["s3Uri"].startswith(
            f"s3://ggd-390630837668-ap-east-2-an/legacy/conversion-stages/{config['backupDir']}/"
        )
        triangles, draws, joints, textures, finite = config["metrics"]
        inspect = validation["ggdInspection"]
        assert validation["khronosIssues"]["numErrors"] == validation["khronosIssues"]["numWarnings"] == 0
        assert inspect["budget"]["errors"] == []
        assert (inspect["triangles"], inspect["drawPrimitives"], inspect["joints"], inspect["textureCount"], validation["finiteFloatAccessors"]["valueCount"]) == (triangles, draws, [joints], textures, finite)
        assert inspect["clipCount"] == proof["animationGroups"] == 0
        assert proof["skeletons"] == 1 and len(proof["geometry"]) == draws
        assert all(item["gpuSkinning"] for item in proof["geometry"])
        alpha_rows = [audit_opaque_material_texture_alpha(output), audit_opaque_material_texture_alpha(rebuild / "body.glb")]
        alpha_audit = {
            "schema": "ggd-worldblender-material-alpha-audit@1",
            "files": alpha_rows,
            "passed": all(row["passed"] for row in alpha_rows),
            "opaqueTransparentBlockers": sum(len(row["opaqueTransparentBlockers"]) for row in alpha_rows),
        }
        assert alpha_audit["passed"] and alpha_audit["opaqueTransparentBlockers"] == 0
        evidence = repo / EVIDENCE_ROOT / character
        git_model = repo / f"content/assets/models/community/{config['outputSha256']}.glb"
        gaps = [
            "Black-background artifacts were repaired by preserving real transparency and baking opaque mixed-eye materials; the alpha audit reports zero OPAQUE-material transparent-texture blockers in both builds.",
            "Source and output contain zero actions; idle, run, attack, cast, hurt and death remain missing.",
            "No hero binding, backend dropdown registration, runtime switching or deployment was performed in this static-component batch.",
            "Original-game shader parity is incomplete; only source-connected Blender materials are represented.",
        ]
        if character == "link":
            gaps.append("Link uses the source low LOD, a 7,900-triangle reduction target, and a two-atlas 256px layout measured at 0.40 atlas quality; the retained source and all conversion stages remain local for later A/B review.")
        if character == "sonic":
            gaps.append("Sonic remains at 8,980 triangles, above the 8,000-triangle formal-adoption target; further visual A/B decimation is required before hero adoption.")
        delivery = {
            "schema": "ggd-worldblender-c00-component-delivery@1",
            "componentId": config["componentId"], "label": f"{config['nameZh']} SSBU Ultimate c00 黑底修復版", "sourceId": "gitlab-ssbu-models",
            "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
            "character": {"nameZh": config["nameZh"], "originalName": config["originalName"], "nativeId": config["nativeId"], "variant": "c00"},
            "source": pin(source), "output": pin(output), "rebuild": rebuild_pin,
            "metrics": {"triangles": triangles, "drawPrimitives": draws, "skinCount": 1, "jointCount": joints, "textureCount": textures, "nativeAnimationCount": 0, "proceduralAnimationCount": 0},
            "validation": {"khronosErrors": 0, "khronosWarnings": 0, "budgetErrors": 0, "finiteFloatValuesChecked": finite, "webglLoadComplete": True, "visualViewsReviewed": ["front", "back", "isometric"]},
            "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True, "heroBound": False, "runtimeSelectable": False, "deployed": False},
            "s3Backup": {"s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"], "archiveSha256": backup["archiveSha256"], "archiveBytes": backup["archiveBytes"], "fileCount": backup["fileCount"], "fullGetVerified": True, "allMemberSha256Verified": True},
            "gaps": gaps,
        }
        candidate = {
            "id": config["componentId"], "label": f"{config['nameZh']} SSBU Ultimate c00 黑底修復版", "conversionCandidateId": config["componentId"], "sourceId": "gitlab-ssbu-models",
            "sourceClass": "original-game-extraction-community-repackage", "selectionClass": "canonical-game",
            "nameZh": config["nameZh"], "originalName": config["originalName"], "workZh": "任天堂明星大亂鬥 特別版",
            "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch",
            "nativeId": config["nativeId"], "variant": "c00", "resourceRole": "independent-static-skinned-model-component",
            "assetKinds": ["model-component", "skeleton", "texture"], "absolutePath": str(output.resolve()), "path": str(output.resolve()),
            "bytes": output.stat().st_size, "sha256": config["outputSha256"], "gitPath": git_model.relative_to(repo).as_posix(),
            "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
            "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
            "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
            "identityIds": [f"ssbu-{character}"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
            "triangles": triangles, "drawPrimitives": draws, "skinCount": 1, "jointCount": joints, "textureCount": textures,
            "readiness": "accepted-independent-static-skinned-component-actions-missing",
            "auditEvidence": f"{config['originalName']} c00 alpha-fixed rebuilds are byte-identical; black-background repair, alpha safety, GGD budget, Khronos, finite-accessor and WebGL three-view checks passed. Source and output have zero actions.",
            "limitations": gaps, "s3BackupStatus": "uploaded-and-readback-verified",
            "s3Uri": backup["s3Uri"], "s3ManifestUri": backup["manifestUri"],
        }
        visual = {
            "schema": "ggd-worldblender-c00-visual-review@1", "componentId": config["componentId"],
            "modelSha256": config["outputSha256"], "accepted": True,
            "scope": "independent-static-skinned-model-component", "reviewedAt": "2026-09-14",
            "reviewedViews": ["front", "back", "isometric"],
            "findings": [f"{config['originalName']} identity and primary body silhouette are complete in all three WebGL views.", "The alpha-corrected material bake removes the prior black-background artifact; no black frame or missing base-colour material was observed."],
            "runtimeSelectionVerified": False, "deploymentVerified": False,
        }
        source_rebuild = {
            "schema": "ggd-worldblender-c00-source-rebuild@1", "componentId": config["componentId"],
            "sourceSha256": config["sourceSha256"], "outputSha256": config["outputSha256"],
            "firstBuild": pin(output), "secondBuild": rebuild_pin, "byteIdenticalRebuild": True,
            "bothStructuralValidationsPassed": True, "bothValidationsPassed": True,
        }
        acceptance = {
            "schema": "ggd-worldblender-c00-component-acceptance@1",
            "components": [{
                "id": config["componentId"], "sha256": config["outputSha256"],
                "accepted": True, "scope": "independent-static-skinned-model-component",
                "heroBound": False, "runtimeSelectable": False, "deploymentVerified": False,
            }],
        }
        evidence_files = {
            "delivery.json": encode(delivery), "candidate.json": encode(candidate), "visual-review.json": encode(visual),
            "source-rebuild.json": encode(source_rebuild), "validation.json": validation_path.read_bytes(),
            "acceptance.json": encode(acceptance),
            "webgl-proof.json": proof_path.read_bytes(), "alpha-audit.json": encode(alpha_audit),
            "material-bake-receipt.json": (first / "blender-conversion.json").read_bytes(),
            "front.png": (first / "render-v1/front.png").read_bytes(),
            "back.png": (first / "render-v1/back.png").read_bytes(), "isometric.png": (first / "render-v1/isometric.png").read_bytes(),
            "s3-backup-receipt.json": backup_path.read_bytes(),
        }
        finalization = first / "alpha-atlas-finalization.json"
        if finalization.is_file():
            evidence_files["alpha-atlas-finalization.json"] = finalization.read_bytes()
        for name, data in evidence_files.items():
            writes[evidence / name] = data
        writes[git_model] = output.read_bytes()
        for key, name in (
            ("deliveryEvidence", "delivery.json"), ("validationEvidence", "validation.json"),
            ("acceptanceEvidence", "acceptance.json"), ("visualEvidence", "visual-review.json"),
            ("webglProofEvidence", "webgl-proof.json"), ("sourceRebuildEvidence", "source-rebuild.json"),
            ("s3BackupEvidence", "s3-backup-receipt.json"), ("alphaAuditEvidence", "alpha-audit.json"),
            ("materialBakeEvidence", "material-bake-receipt.json"),
        ):
            candidate[key] = evidence_ref(EVIDENCE_ROOT / character / name, evidence_files[name])
        if "alpha-atlas-finalization.json" in evidence_files:
            candidate["alphaAtlasFinalizationEvidence"] = evidence_ref(EVIDENCE_ROOT / character / "alpha-atlas-finalization.json", evidence_files["alpha-atlas-finalization.json"])
        batch_candidates.append(candidate)
    writes[repo / EVIDENCE_ROOT / "candidate-rows.json"] = encode({"schema": "ggd-worldblender-c00-candidate-rows@1", "candidates": batch_candidates})
    writes[repo / EVIDENCE_ROOT / "batch-receipt.json"] = (conversion_root / "batch-receipt.json").read_bytes()
    if (conversion_root / "alpha-check.json").is_file():
        writes[repo / EVIDENCE_ROOT / "alpha-check.json"] = (conversion_root / "alpha-check.json").read_bytes()
    if args.write:
        for path, data in writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    else:
        for path, data in writes.items():
            assert path.is_file() and path.read_bytes() == data, f"stale frozen output: {path}"
    print(json.dumps({"characters": list(CONFIG), "contentGlbs": 3, "candidateRows": len(batch_candidates), "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
