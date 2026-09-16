#!/usr/bin/env python3
"""Freeze batch-2 SSBU c00 model components without editing global indexes."""
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
    "chrom": {
        "nameZh": "庫洛姆", "originalName": "Chrom", "nativeId": "fighter/chrom/model/body/c00",
        "sourceSha256": "315b422197357a96d5d3bc71532a4902f4a0e58d2f3287871e8e36e9764b83ad",
        "outputSha256": "fb2db67a3741b78e16fd5d5ed09911a8cf7382011896e16bd976701de06e7587",
        "componentId": "ssbu-chrom-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-chrom-full-v3",
        "motion": {"nuanmbPaths": 9, "bodyMotionPaths": 9, "uniqueTransformPayloads": 9},
    },
    "ganon": {
        "nameZh": "加儂多夫", "originalName": "Ganondorf", "nativeId": "fighter/ganon/model/body/c00",
        "sourceSha256": "cefa74a20064364df875275345b06ef399182c9f98aec816ad7bc27143283613",
        "outputSha256": "46ba09bc4e5bc1eba60479c55136c43cd8c59594690b98618e783ff21183b65b",
        "componentId": "ssbu-ganondorf-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-ganon-full-v3",
        "motion": {"nuanmbPaths": 10, "bodyMotionPaths": 10, "uniqueTransformPayloads": 10},
    },
    "lucina": {
        "nameZh": "露琪娜", "originalName": "Lucina", "nativeId": "fighter/lucina/model/body/c00",
        "sourceSha256": "b3cf288dade295275686cccee97824945347b430c8d91fa5a0ee2c103cc51e69",
        "outputSha256": "44b065ca0a0a3191ba9a859c9a30d7f4579f62297f6facc3e9f933c1cdc9e170",
        "componentId": "ssbu-lucina-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-lucina-full-v3",
        "motion": {"nuanmbPaths": 105, "bodyMotionPaths": 41, "uniqueTransformPayloads": 19},
    },
}
EVIDENCE_ROOT = Path("materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch2-v1")
CONVERSION_DIR = "ssbu-worldblender-c00-alpha-fixed-batch2-v3"


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
    candidates = []
    for character, config in CONFIG.items():
        source = asset_root / "intake/public-models-20260910/gitlab-ssbu-models/source-repository/fighter" / character / "model/body/c00" / f"{character}-c00.blend"
        first = conversion_root / character / "first"
        rebuild = conversion_root / character / "rebuild"
        output = first / "body.glb"
        validation_path = first / "validation.json"
        proof_path = first / "render-v1/proof.json"
        assert sha(source) == config["sourceSha256"]
        assert sha(output) == config["outputSha256"]
        assert output.read_bytes() == (rebuild / "body.glb").read_bytes()
        validation = json.loads(validation_path.read_text())
        rebuild_validation = json.loads((rebuild / "validation.json").read_text())
        proof = json.loads(proof_path.read_text())
        inspect = validation["ggdInspection"]
        assert validation["structuralValidationPassed"] and rebuild_validation["structuralValidationPassed"]
        assert validation["khronosIssues"]["numErrors"] == validation["khronosIssues"]["numWarnings"] == 0
        assert inspect["budget"]["errors"] == [] and inspect["clipCount"] == 0
        assert proof["animationGroups"] == 0 and proof["skeletons"] == 1
        assert len(proof["geometry"]) == inspect["drawPrimitives"]
        assert all(item["gpuSkinning"] for item in proof["geometry"])
        alpha_rows = [audit_opaque_material_texture_alpha(output), audit_opaque_material_texture_alpha(rebuild / "body.glb")]
        alpha_audit = {
            "schema": "ggd-worldblender-material-alpha-audit@1",
            "files": alpha_rows,
            "passed": all(row["passed"] for row in alpha_rows),
            "opaqueTransparentBlockers": sum(len(row["opaqueTransparentBlockers"]) for row in alpha_rows),
        }
        assert alpha_audit["passed"] and alpha_audit["opaqueTransparentBlockers"] == 0
        evidence = EVIDENCE_ROOT / character
        git_model = Path(f"content/assets/models/community/{config['outputSha256']}.glb")
        motion = {
            "sourceId": "parallel-ns-ultimate14",
            **config["motion"],
            "status": "source-indexed-not-converted-not-rig-tested-not-merged",
            "sixStateCoverageClaimed": False,
        }
        atlas = json.loads((first / "atlas.json").read_text()) if (first / "atlas.json").is_file() else None
        limitations = [
            "Black-background artifacts were repaired by preserving real transparency and baking opaque mixed-eye materials; the alpha audit reports zero OPAQUE-material transparent-texture blockers in both builds.",
            "Source and output contain zero actions; idle, run, attack, cast, hurt and death remain missing.",
            "Ultimate14 transform files are indexed as a separate motion candidate, but are not converted, rig-tested or merged here and do not prove six gameplay states.",
            "No hero binding, backend dropdown registration, runtime switching or deployment was performed in this static-component batch.",
            "Original-game shader parity is incomplete; only source-connected Blender materials are represented.",
        ]
        limitations.extend(config.get("extraLimitations", []))
        if atlas and atlas.get("quality", 1) < 0.45:
            limitations.append(f"The two-atlas 256px layout used measured quality {atlas['quality']:.3f}; WebGL views were reviewed after conversion.")
        s3_plan = {
            "schema": "ggd-s3-backup-plan@1",
            "status": "pending",
            "profile": "vibe-coding",
            "region": "ap-east-2",
            "bucket": "ggd-390630837668-ap-east-2-an",
            "plannedPrefix": f"s3://ggd-390630837668-ap-east-2-an/legacy/conversion-stages/{config['backupDir']}/",
            "identityRequirement": "assumed-role/vibe-coding-s3-role/",
            "readbackVerificationRequired": True,
            "uploaded": False,
        }
        backup_path = asset_root / "backups" / config["backupDir"] / "latest-receipt.json"
        backup = json.loads(backup_path.read_text())
        assert backup["schema"] == "ggd-intake-backup-receipt@1"
        assert Path(backup["source"]).resolve() == (conversion_root / character).resolve()
        assert backup["fullGetVerified"] and backup["allMemberSha256Verified"] and backup["localUnchanged"]
        assert backup["s3Uri"].startswith(
            f"s3://ggd-390630837668-ap-east-2-an/legacy/conversion-stages/{config['backupDir']}/"
        )
        s3_plan.update({
            "status": "fulfilled", "uploaded": True,
            "actualUri": backup["s3Uri"], "actualManifestUri": backup["manifestUri"],
        })
        s3_backup = {
            "status": "uploaded-and-readback-verified",
            "s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"],
            "archiveSha256": backup["archiveSha256"], "archiveBytes": backup["archiveBytes"],
            "fileCount": backup["fileCount"], "fullGetVerified": True,
            "allMemberSha256Verified": True, "localUnchanged": True,
        }
        delivery = {
            "schema": "ggd-worldblender-c00-component-delivery@1",
            "componentId": config["componentId"], "label": f"{config['nameZh']} SSBU Ultimate c00 黑底修復版", "sourceId": "gitlab-ssbu-models",
            "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
            "character": {"nameZh": config["nameZh"], "originalName": config["originalName"], "nativeId": config["nativeId"], "variant": "c00"},
            "source": pin(source), "output": pin(output), "rebuild": pin(rebuild / "body.glb"),
            "metrics": {"triangles": inspect["triangles"], "drawPrimitives": inspect["drawPrimitives"], "skinCount": inspect["skinCount"], "jointCount": inspect["joints"][0], "textureCount": inspect["textureCount"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0},
            "validation": {"khronosErrors": 0, "khronosWarnings": 0, "budgetErrors": 0, "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"], "webglLoadComplete": True, "visualViewsReviewed": ["front", "back", "isometric"]},
            "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True, "heroBound": False, "runtimeSelectable": False, "deployed": False},
            "ultimate14MotionCandidate": motion,
            "s3Backup": s3_backup,
            "gaps": limitations,
        }
        candidate = {
            "id": config["componentId"], "label": f"{config['nameZh']} SSBU Ultimate c00 黑底修復版", "conversionCandidateId": config["componentId"], "sourceId": "gitlab-ssbu-models",
            "sourceClass": "original-game-extraction-community-repackage", "selectionClass": "canonical-game",
            "nameZh": config["nameZh"], "originalName": config["originalName"], "workZh": "任天堂明星大亂鬥 特別版",
            "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch",
            "nativeId": config["nativeId"], "variant": "c00", "resourceRole": "independent-static-skinned-model-component",
            "assetKinds": ["model-component", "skeleton", "texture"], "absolutePath": str(output.resolve()), "path": str(output.resolve()),
            "bytes": output.stat().st_size, "sha256": config["outputSha256"], "gitPath": git_model.as_posix(),
            "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
            "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
            "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
            "identityIds": [f"ssbu-{character}"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
            "triangles": inspect["triangles"], "drawPrimitives": inspect["drawPrimitives"], "skinCount": inspect["skinCount"],
            "jointCount": inspect["joints"][0], "textureCount": inspect["textureCount"],
            "readiness": "accepted-independent-static-skinned-component-actions-missing",
            "auditEvidence": f"{config['originalName']} c00 alpha-fixed rebuilds are byte-identical; black-background repair, alpha safety, GGD budget, Khronos, finite-accessor and WebGL three-view checks passed. Source and output have zero actions.",
            "ultimate14MotionCandidate": motion, "limitations": limitations,
            "s3BackupStatus": "uploaded-and-readback-verified", "s3Uri": backup["s3Uri"], "s3ManifestUri": backup["manifestUri"],
            "s3PlannedPrefix": s3_plan["plannedPrefix"],
        }
        visible_details = config.get("visualFinding") or (
            f"{config['originalName']} identity, body silhouette, costume and sheathed sword are visible in all three WebGL views."
            if character in {"chrom", "lucina"}
            else "Ganondorf identity, body silhouette, armour and cape are visible in all three WebGL views."
        )
        visual = {
            "schema": "ggd-worldblender-c00-visual-review@1", "componentId": config["componentId"],
            "modelSha256": config["outputSha256"], "accepted": True,
            "scope": "independent-static-skinned-model-component", "reviewedAt": "2026-09-14",
            "reviewedViews": ["front", "back", "isometric"],
            "findings": [visible_details, "The alpha-corrected material bake removes the prior black-background artifact; no black frame or missing base-colour material was observed."],
            "runtimeSelectionVerified": False, "deploymentVerified": False,
        }
        source_rebuild = {
            "schema": "ggd-worldblender-c00-source-rebuild@1", "componentId": config["componentId"],
            "sourceSha256": config["sourceSha256"], "outputSha256": config["outputSha256"],
            "firstBuild": pin(output), "secondBuild": pin(rebuild / "body.glb"), "byteIdenticalRebuild": True,
            "bothStructuralValidationsPassed": True, "bothValidationsPassed": True,
        }
        acceptance = {
            "schema": "ggd-worldblender-c00-component-acceptance@1",
            "components": [{"id": config["componentId"], "sha256": config["outputSha256"], "accepted": True, "scope": "independent-static-skinned-model-component", "heroBound": False, "runtimeSelectable": False, "deploymentVerified": False}],
        }
        evidence_files = {
            "delivery.json": encode(delivery), "candidate.json": encode(candidate), "visual-review.json": encode(visual),
            "source-rebuild.json": encode(source_rebuild), "validation.json": validation_path.read_bytes(),
            "acceptance.json": encode(acceptance), "webgl-proof.json": proof_path.read_bytes(),
            "standardization.json": (first / "standardization.json").read_bytes(), "s3-backup-plan.json": encode(s3_plan),
            "alpha-audit.json": encode(alpha_audit),
            "alpha-atlas-finalization.json": (first / "alpha-atlas-finalization.json").read_bytes(),
            "material-bake-receipt.json": (first / "blender-conversion.json").read_bytes(),
            "s3-backup-receipt.json": backup_path.read_bytes(),
            "front.png": (first / "render-v1/front.png").read_bytes(), "back.png": (first / "render-v1/back.png").read_bytes(),
            "isometric.png": (first / "render-v1/isometric.png").read_bytes(),
        }
        near_duplicate = first / "near-duplicate-material-finalization.json"
        if near_duplicate.is_file():
            evidence_files["near-duplicate-material-finalization.json"] = near_duplicate.read_bytes()
        for name, data in evidence_files.items():
            writes[repo / evidence / name] = data
        writes[repo / git_model] = output.read_bytes()
        for key, name in (
            ("deliveryEvidence", "delivery.json"), ("validationEvidence", "validation.json"),
            ("acceptanceEvidence", "acceptance.json"), ("visualEvidence", "visual-review.json"),
            ("webglProofEvidence", "webgl-proof.json"), ("sourceRebuildEvidence", "source-rebuild.json"),
            ("standardizationEvidence", "standardization.json"), ("s3BackupPlanEvidence", "s3-backup-plan.json"),
            ("s3BackupEvidence", "s3-backup-receipt.json"),
            ("alphaAuditEvidence", "alpha-audit.json"),
            ("alphaAtlasFinalizationEvidence", "alpha-atlas-finalization.json"),
            ("materialBakeEvidence", "material-bake-receipt.json"),
        ):
            candidate[key] = evidence_ref(evidence / name, evidence_files[name])
        if "near-duplicate-material-finalization.json" in evidence_files:
            candidate["nearDuplicateMaterialFinalizationEvidence"] = evidence_ref(
                evidence / "near-duplicate-material-finalization.json",
                evidence_files["near-duplicate-material-finalization.json"],
            )
        candidates.append(candidate)
    writes[repo / EVIDENCE_ROOT / "candidate-rows.json"] = encode({"schema": "ggd-worldblender-c00-candidate-rows@1", "candidates": candidates})
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
    print(json.dumps({"characters": list(CONFIG), "contentGlbs": 3, "candidateRows": len(candidates), "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
