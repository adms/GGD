#!/usr/bin/env python3
"""Freeze the validated SSBU Kirby c00 body as an independent static component.

This workflow deliberately does not bind the model to a hero or make it selectable.
It records the component in the source catalog and the generated design-backlog input.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_SHA = "8674bd9eea87d351662cf4c3090f1b18ab2a10128c96d42656b4216f2e75829b"
OUTPUT_SHA = "611c654822e717b670dfc6024ef25f9c5cd32b4e6a928d8fceb3bfc1aa93d114"
BLENDER_SHA = "7732820d43dc20847534dc2cde429947ae09519c7730be3ad07e67e3ddc48e98"
COMPONENT_ID = "ssbu-kirby-c00-static-skinned-v1"
EVIDENCE_ROOT = Path("materials/hero-model-library/priority-evidence/ssbu-kirby-c00-v1")
S3_PREFIX = "s3://ggd-390630837668-ap-east-2-an/legacy/conversions/ssbu-kirby-c00-blender4513-v1/"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def pin(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def require(value: bool, message: str):
    if not value:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--final-root", type=Path, required=True)
    parser.add_argument("--rebuild-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    final = args.final_root.resolve()
    rebuild = args.rebuild_root.resolve()
    source = Path(json.loads((final / "conversion.json").read_text())["input"]["path"])
    require(sha(source) == SOURCE_SHA, "Kirby source hash changed")
    require(sha(final / "blender-export.glb") == BLENDER_SHA, "First Blender export changed")
    require(sha(rebuild / "blender-export.glb") == BLENDER_SHA, "Blender rebuild is not identical")
    require(sha(final / "body.glb") == OUTPUT_SHA, "First normalized GLB changed")
    require(sha(rebuild / "body.glb") == OUTPUT_SHA, "Normalized rebuild is not identical")
    validation = json.loads((final / "validation.json").read_text())
    proof = json.loads((final / "render-v1/proof.json").read_text())
    require(validation["structuralValidationPassed"] is True, "Structural validation failed")
    require(validation["khronosIssues"]["numErrors"] == validation["khronosIssues"]["numWarnings"] == 0,
            "Khronos validation is not clean")
    inspect = validation["ggdInspection"]
    require(inspect["budget"]["errors"] == [], "GGD hard budget failed")
    require((inspect["triangles"], inspect["drawPrimitives"], inspect["skinCount"], inspect["joints"], inspect["clipCount"]) ==
            (5500, 2, 1, [51], 0), "Unexpected Kirby model metrics")
    require(proof.get("animationGroups") == 0 and proof.get("skeletons") == 1, "Unexpected WebGL model shape")
    require(len(proof.get("geometry", [])) == 2 and all(x.get("gpuSkinning") for x in proof["geometry"]),
            "WebGL proof does not show both skinned primitives")

    evidence = repo / EVIDENCE_ROOT
    backup_receipt_path = evidence / "s3-backup-receipt.json"
    backup = json.loads(backup_receipt_path.read_text())
    require(backup.get("schema") == "ggd-intake-backup-receipt@1", "Kirby S3 backup receipt schema mismatch")
    require(backup.get("source") == str(final), "Kirby S3 backup source mismatch")
    require(str(backup.get("s3Uri", "")).startswith(S3_PREFIX), "Kirby S3 backup prefix mismatch")
    require(backup.get("fullGetVerified") is True, "Kirby S3 full readback is not verified")
    require(backup.get("allMemberSha256Verified") is True, "Kirby S3 member hashes are not verified")
    require(backup.get("localUnchanged") is True, "Kirby local conversion changed during S3 backup")
    git_model = repo / f"content/assets/models/community/{OUTPUT_SHA}.glb"
    evidence_files = {
        "conversion.json": (final / "conversion.json").read_bytes(),
        "blender-conversion.json": (final / "blender-conversion.json").read_bytes(),
        "source-analysis.json": (final / "source-analysis.json").read_bytes(),
        "validation.json": (final / "validation.json").read_bytes(),
        "webgl-proof.json": (final / "render-v1/proof.json").read_bytes(),
        "front.png": (final / "render-v1/front.png").read_bytes(),
        "back.png": (final / "render-v1/back.png").read_bytes(),
        "isometric.png": (final / "render-v1/isometric.png").read_bytes(),
    }
    gaps = [
        "Source and output contain zero actions; idle, run, attack, cast, hurt and death remain missing.",
        "The Ultimate14 native motion payload has not been retargeted to this 51-joint body or playback accepted.",
        "This independent component is not bound to the existing Kirby hero, not registered in the backend dropdown and not deployed.",
        "Original SSBU shader parity is incomplete; only source-connected Blender materials were exported.",
    ]
    delivery = {
        "schema": "ggd.ssbu-kirby-component-delivery@1", "componentId": COMPONENT_ID,
        "sourceId": "gitlab-ssbu-models", "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
        "character": {"nameZh": "卡比", "originalName": "Kirby", "nativeId": "fighter/kirby/model/body/c00", "variant": "c00"},
        "source": pin(source), "output": pin(final / "body.glb"), "rebuild": pin(rebuild / "body.glb"),
        "metrics": {"triangles": 5500, "drawPrimitives": 2, "skinCount": 1, "jointCount": 51,
                    "textureCount": inspect["textureCount"], "nativeAnimationCount": 0},
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "budgetErrors": 0,
                       "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"],
                       "webglLoadComplete": True, "visualViewsReviewed": ["front", "back", "isometric"]},
        "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
                   "heroBound": False, "runtimeSelectable": False, "deployed": False},
        "s3Backup": {"s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"],
                     "archiveSha256": backup["archiveSha256"], "archiveBytes": backup["archiveBytes"],
                     "fileCount": backup["fileCount"], "fullGetVerified": True,
                     "allMemberSha256Verified": True, "localUnchanged": True},
        "gaps": gaps,
    }
    evidence_files["delivery.json"] = encoded(delivery)
    evidence_files["acceptance.json"] = encoded({
        "schema": "ggd.skinned-component-acceptance@1", "acceptedAt": "2026-09-14",
        "components": [{"id": COMPONENT_ID, "variant": "c00", "sha256": OUTPUT_SHA, "accepted": True,
                        "scope": "independent-static-skinned-model-component", "reviewedViews": ["front", "back", "isometric"],
                        "limitationsAccepted": gaps}],
    })
    evidence_files["visual-review.json"] = encoded({
        "schema": "ggd.skinned-component-visual-review@1", "componentId": COMPONENT_ID,
        "modelSha256": OUTPUT_SHA, "accepted": True, "scope": "independent-static-skinned-model-component",
        "reviewedAt": "2026-09-14", "reviewedViews": ["front", "back", "isometric"],
        "findings": ["Kirby body, face, eyes, hands and feet are complete in all three WebGL views.",
                     "Materials are visible with no detached primary body part or bind-pose collapse."],
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    evidence_files["source-rebuild.json"] = encoded({
        "schema": "ggd.ssbu-kirby-source-rebuild@1", "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA, "blenderExportSha256": BLENDER_SHA, "outputSha256": OUTPUT_SHA,
        "firstBuild": pin(final / "body.glb"), "secondBuild": pin(rebuild / "body.glb"),
        "byteIdenticalRebuild": True, "blenderExportByteIdenticalRebuild": True, "bothValidationsPassed": True,
    })

    def ep(name: str) -> dict:
        data = evidence_files[name]
        return {"gitPath": (EVIDENCE_ROOT / name).as_posix(), "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest()}

    candidate = {
        "id": COMPONENT_ID, "conversionCandidateId": COMPONENT_ID, "sourceId": "gitlab-ssbu-models",
        "sourceClass": "original-game-extraction-community-repackage", "selectionClass": "canonical-game",
        "nameZh": "卡比", "originalName": "Kirby", "workZh": "任天堂明星大亂鬥 特別版（原作：星之卡比）",
        "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch",
        "nativeId": "fighter/kirby/model/body/c00", "variant": "c00", "equivalentSourceVariants": [f"c0{i}" for i in range(8)],
        "resourceRole": "independent-static-skinned-model-component", "assetKinds": ["model-component", "skeleton", "texture"],
        "absolutePath": str(final / "body.glb"), "path": str(final / "body.glb"), "bytes": (final / "body.glb").stat().st_size,
        "sha256": OUTPUT_SHA, "gitPath": git_model.relative_to(repo).as_posix(), "componentReady": True, "converted": True,
        "structuralValidationPassed": True, "visualValidationPassed": True, "runtimeReady": False, "runtimeSelectable": False,
        "defaultEligible": False, "automaticEligible": False, "fullHeroModel": False, "runtimeDropdownRegistered": False,
        "heroIds": [], "relatedHeroIds": [], "identityIds": ["ssbu-kirby"],
        "nativeAnimationCount": 0, "proceduralAnimationCount": 0, "triangles": 5500, "drawPrimitives": 2,
        "skinCount": 1, "jointCount": 51, "textureCount": inspect["textureCount"],
        "readiness": "accepted-independent-static-skinned-component-actions-missing",
        "auditEvidence": "SSBU Kirby c00 was rebuilt twice byte-identically and passed GGD/Khronos/WebGL static-component checks.",
        "limitations": gaps, "deliveryEvidence": ep("delivery.json"), "acceptanceEvidence": ep("acceptance.json"),
        "validationEvidence": ep("validation.json"), "visualEvidence": ep("visual-review.json"),
        "webglProofEvidence": ep("webgl-proof.json"), "sourceRebuildEvidence": ep("source-rebuild.json"),
        "backupEvidence": {"gitPath": backup_receipt_path.relative_to(repo).as_posix(),
                           "bytes": backup_receipt_path.stat().st_size, "sha256": sha(backup_receipt_path),
                           "s3Uri": backup["s3Uri"], "fullGetVerified": True, "allMemberSha256Verified": True},
        "backupStatus": "s3-conversion-stage-full-readback-verified",
    }

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    source_row = next(x for x in downloads["publicSources"] if x["id"] == "gitlab-ssbu-models")
    current = [x for x in source_row.setdefault("componentCandidates", []) if x.get("id") == COMPONENT_ID]
    require(len(current) <= 1, "Duplicate Kirby component")
    if current:
        current[0].update(candidate)
    else:
        source_row["componentCandidates"].append(candidate)
    attempts = source_row.setdefault("conversionAttempts", [])
    attempt = {"id": "ssbu-kirby-c00-blender4513-v1", "componentId": COMPONENT_ID,
               "status": candidate["readiness"], "localPath": str(final), "rebuildPath": str(rebuild),
               "reportPath": str(final / "validation.json"), "reportSha256": sha(final / "validation.json"),
               "outputPath": str(final / "body.glb"), "outputSha256": OUTPUT_SHA,
               "nativeAnimationCount": 0, "runtimeReady": False, "runtimeSelectable": False,
               "backupStatus": "s3-conversion-stage-full-readback-verified", "s3Uri": backup["s3Uri"],
               "backupReceiptGitPath": backup_receipt_path.relative_to(repo).as_posix(),
               "fullGetVerified": True, "allMemberSha256Verified": True}
    old_attempt = [x for x in attempts if x.get("id") == attempt["id"]]
    if old_attempt: old_attempt[0].update(attempt)
    else: attempts.append(attempt)

    supplemental_path = repo / "materials/hero-model-library/design-backlog/sources-supplemental.json"
    supplemental = json.loads(supplemental_path.read_text())
    supplemental_row = {
        "id": "community:ssbu-kirby-c00-standardized-v1", "name": "卡比", "work": "Super Smash Bros. Ultimate",
        "sourceIds": ["gitlab-ssbu-models"], "aliases": ["Kirby", "fighter/kirby"],
        "modelCandidates": [{"id": COMPONENT_ID, "library": "community", "sourceId": "gitlab-ssbu-models",
            "path": str(final / "body.glb"), "gitPath": candidate["gitPath"], "bytes": candidate["bytes"], "sha256": OUTPUT_SHA,
            "format": "glTF Binary", "readiness": candidate["readiness"], "converted": True, "componentReady": True,
            "resourceRole": candidate["resourceRole"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
            "runtimeSelectable": False, "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
            "visualEvidence": candidate["visualEvidence"], "limitations": gaps}],
        "mappedHeroIds": ["community-review-06-20260907"], "identityHeroIds": ["community-review-06-20260907"],
        "designStatus": "designed", "evidence": [candidate["auditEvidence"]],
    }
    matches = [x for x in supplemental["characters"] if x.get("id") == supplemental_row["id"]]
    if matches: matches[0].update(supplemental_row)
    else: supplemental["characters"].append(supplemental_row)

    writes = {downloads_path: encoded(downloads), supplemental_path: encoded(supplemental), git_model: (final / "body.glb").read_bytes()}
    writes.update({evidence / name: data for name, data in evidence_files.items()})
    if args.write:
        for path, data in writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    else:
        for path, data in writes.items(): require(path.is_file() and path.read_bytes() == data, "Stale output: " + str(path))
    print(json.dumps({"componentId": COMPONENT_ID, "sha256": OUTPUT_SHA, "files": len(writes),
                      "converted": 1, "structurallyValidated": 1, "visuallyAccepted": 1,
                      "runtimeSelectable": 0, "nativeAnimations": 0, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
