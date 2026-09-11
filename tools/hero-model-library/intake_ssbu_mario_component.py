#!/usr/bin/env python3
"""Admit the validated SSBU fighter/mario c00 body as an independent component."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from skinned_components import require


SOURCE_ID = "gitlab-ssbu-models"
COMPONENT_ID = "ssbu-mario-c00-static-skinned-v1"
CONVERSION_ID = "ssbu-mario-c00-static-skinned-v2"
DELIVERY_ID = "ssbu-mario-c00-blender4513-v2"
BACKUP_ID = "ssbu-mario-c00-blender4513-v2-backup"
REJECTED_BACKUP_ID = "ssbu-mario-c00-blender4513-v1-backup"
SOURCE_CLASS = "original-game-extraction-community-repackage"
SOURCE_SHA256 = "8af85d9accb3f13b2bc920553da2a9545cbdb980182bba15d59f23274a03c44d"
BLENDER_EXPORT_SHA256 = "c6375f099d5958e500a692e1512966f253773a1b7022e5ea12c102d2df7cb355"
OUTPUT_SHA256 = "2ecf39cd1711245a4dc2d5fb8a70363dc48048479fe47ed610f34a8296aed881"
DERIVED_TEXTURES = {
    "alp_mario_001_col.png.ggd-256.png": "42e1d7ecf7c85836f4c2ddb6b91e5ad950c0bfedf146694b0bf713021636d02e",
    "def_mario_001_col.png.ggd-256.png": "309b7883590e7dd566e355a2475d80a91d6ebc0329e96a8d65105d2891b69023",
    "skin_mario_001_col.png.ggd-256.png": "bd07efe7e054b52dfdc10f23605d0243c2ec15262b13c133d1082ee86f0c8db7",
}


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha_bytes(data)}


def git_pin(path: str, data: bytes) -> dict:
    return {"gitPath": path, "bytes": len(data), "sha256": sha_bytes(data)}


def load(path: Path) -> dict:
    return json.loads(path.read_text())


def prepare(repo: Path, final_root: Path, rebuild_root: Path):
    repo, final_root, rebuild_root = repo.resolve(), final_root.resolve(), rebuild_root.resolve()
    conversion = load(final_root / "conversion.json")
    blender_conversion = load(final_root / "blender-conversion.json")
    analysis = load(final_root / "source-analysis.json")
    validation = load(final_root / "validation/structural.json")
    webgl = load(final_root / "render-v1/proof.json")
    rebuild_conversion = load(rebuild_root / "conversion.json")
    rebuild_validation = load(rebuild_root / "validation/structural.json")

    require(conversion.get("schema") == "ggd-ssbu-static-component-normalization@1", "Unexpected Mario normalization receipt")
    require(conversion.get("candidateId") == CONVERSION_ID and conversion.get("sourceId") == SOURCE_ID, "Wrong Mario conversion candidate")
    require(conversion.get("input", {}).get("sha256") == SOURCE_SHA256, "Changed SSBU Mario source")
    require(blender_conversion.get("input", {}).get("sha256") == SOURCE_SHA256, "Changed Blender source receipt")
    require(blender_conversion.get("output", {}).get("sha256") == BLENDER_EXPORT_SHA256, "Changed Blender export")
    require(conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Changed final SSBU Mario GLB")
    require(conversion.get("officialNormalization", {}).get("drawCalls") == {"before": 9, "after": 6}, "Unexpected Mario draw-call normalization")
    require(pin(final_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Final GLB does not match receipt")
    require(pin(rebuild_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Mario rebuild is not byte-identical")
    require(pin(final_root / "blender-export.glb")["sha256"] == BLENDER_EXPORT_SHA256, "Final Blender export changed")
    require(pin(rebuild_root / "blender-export.glb")["sha256"] == BLENDER_EXPORT_SHA256, "Rebuilt Blender export differs")
    for name, expected in DERIVED_TEXTURES.items():
        require(pin(final_root / "derived-textures" / name)["sha256"] == expected, "Final derived texture changed: " + name)
        require(pin(rebuild_root / "derived-textures" / name)["sha256"] == expected, "Rebuilt derived texture changed: " + name)
    require(len(analysis.get("visibleMeshes", [])) == 9, "Unexpected visible Mario source mesh count")
    require(len(analysis.get("hiddenOrNonrenderMeshes", [])) == 53, "Unexpected hidden Mario source mesh count")
    require(analysis.get("armatures", [{}])[0].get("bones") == 98, "Unexpected Mario source skeleton")
    require(analysis.get("actions") == [], "Mario source unexpectedly contains actions")
    for checked in (validation, rebuild_validation):
        require(checked.get("structuralValidationPassed") is True, "Mario structural validation failed")
        require(checked.get("finiteFloatAccessors", {}).get("passed") is True, "Non-finite Mario accessor found")
        require(checked.get("khronosIssues", {}).get("numErrors") == 0, "Khronos errors found")
        require(checked.get("khronosIssues", {}).get("numWarnings") == 0, "Khronos warnings found")
        require(checked.get("ggdInspection", {}).get("budget", {}).get("errors") == [], "GGD budget errors found")
        require(checked.get("ggdInspection", {}).get("clipCount") == 0, "Unexpected Mario animation")
    require(rebuild_conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Rebuild receipt differs")
    require(webgl.get("schema") == "ggd.ssbu-static-webgl@1", "Wrong WebGL proof schema")
    require(webgl.get("animationGroups") == 0 and webgl.get("skeletons") == 1, "Wrong Mario WebGL rig inventory")
    require(webgl.get("worldSkinnedBounds", {}).get("extent", [None, None])[1] > 1.79, "Unexpected rendered Mario height")
    require(len(webgl.get("geometry", [])) == 6, "Incomplete WebGL Mario geometry")
    require(all(row.get("bones") == 98 and row.get("gpuSkinning") is True for row in webgl["geometry"]), "Mario WebGL skinning incomplete")

    tool_paths = (
        "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/normalize_static_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.mjs",
        "packages/shared/src/content/modelUpload/normalize.ts",
    )
    tool_pins = [{"path": rel, "sha256": sha_bytes((repo / rel).read_bytes())} for rel in tool_paths]
    derived = [pin(final_root / "derived-textures" / name) for name in sorted(DERIVED_TEXTURES)]
    gaps = [
        "Source Blender contains zero actions; idle, run, attack, cast, hurt and death animations remain missing.",
        "No GGD hero definition or skill binding exists for this exact Mario identity.",
        "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
        "Original SSBU shader parity is incomplete; only source-connected Blender materials were exported.",
        "Fifty-three hidden facial and source mesh variants remain preserved only in the original Blender source and were excluded from the visible c00 appearance.",
        "Blender emitted NumPy transform warnings; both validations checked 101,330 exported float values as finite and Babylon WebGL rendered the connected body intact.",
    ]
    delivery = {
        "schema": "ggd.ssbu-mario-component-delivery@1",
        "deliveryId": DELIVERY_ID,
        "sourceId": SOURCE_ID,
        "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
        "character": {
            "name": "Mario", "nameZh": "Mario／瑪利歐", "nativeId": "fighter/mario/body/c00",
            "variant": "c00", "sourceGame": "Super Smash Bros. Ultimate", "originalSeries": "Super Mario",
        },
        "source": pin(Path(conversion["input"]["path"])),
        "finalRoot": str(final_root), "rebuildRoot": str(rebuild_root),
        "blenderExport": pin(final_root / "blender-export.glb"), "output": pin(final_root / "body.glb"),
        "derivedTextures": derived,
        "metrics": {
            "triangles": 7189, "drawPrimitives": 6, "skinnedPrimitives": 6,
            "skinCount": 1, "jointCount": 98, "textureCount": 5,
            "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
            "worldHeightMeters": webgl["worldSkinnedBounds"]["extent"][1],
        },
        "normalization": conversion["officialNormalization"],
        "validation": {
            "khronosErrors": 0, "khronosWarnings": 0, "ggdBudgetErrors": 0,
            "ggdBudgetWarnings": validation["ggdInspection"]["budget"]["warnings"],
            "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"],
            "webglLoadComplete": True, "visualViewsReviewed": ["front", "back", "isometric"],
        },
        "status": {
            "converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
            "completeHero": False, "heroBound": False, "runtimeSelectable": False, "deployed": False,
        },
        "toolPins": tool_pins, "gaps": gaps,
    }
    delivery_data = encoded(delivery)
    delivery_sha = sha_bytes(delivery_data)
    evidence_root = Path("materials/hero-model-library/priority-evidence/ssbu-mario") / delivery_sha
    files = {
        "delivery.json": delivery_data,
        "conversion.json": (final_root / "conversion.json").read_bytes(),
        "blender-conversion.json": (final_root / "blender-conversion.json").read_bytes(),
        "source-analysis.json": (final_root / "source-analysis.json").read_bytes(),
        "validation.json": (final_root / "validation/structural.json").read_bytes(),
        "webgl-proof.json": (final_root / "render-v1/proof.json").read_bytes(),
        "front.png": (final_root / "render-v1/front.png").read_bytes(),
        "back.png": (final_root / "render-v1/back.png").read_bytes(),
        "isometric.png": (final_root / "render-v1/isometric.png").read_bytes(),
        "contact-sheet.png": (final_root / "render-v1/contact-sheet.png").read_bytes(),
    }
    shot_pins = [git_pin((evidence_root / name).as_posix(), files[name]) for name in ("front.png", "back.png", "isometric.png", "contact-sheet.png")]
    visual_review = {
        "schema": "ggd.skinned-component-visual-review@1", "componentId": COMPONENT_ID,
        "modelSha256": OUTPUT_SHA256, "accepted": True,
        "scope": "independent-static-skinned-model-component", "reviewedAt": "2026-09-12",
        "reviewedViews": ["front", "back", "isometric"],
        "findings": [
            "Front, back and isometric renders show the complete visible Mario c00 head, hat, face, eyes, moustache, torso, overalls, hands and shoes.",
            "No detached body part, missing primary material, opaque facial alpha card or obvious bind-pose collapse is visible.",
            "This review covers the static bind pose only because source and output contain no animation clips.",
        ],
        "shots": shot_pins,
        "webglProof": git_pin((evidence_root / "webgl-proof.json").as_posix(), files["webgl-proof.json"]),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    }
    files["visual-review.json"] = encoded(visual_review)
    source_fidelity = {
        "schema": "ggd.ssbu-mario-source-fidelity@1", "sourceId": SOURCE_ID, "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256, "blenderExportSha256": BLENDER_EXPORT_SHA256, "outputSha256": OUTPUT_SHA256,
        "sourceBytesUnchanged": conversion["sourceBytesUnchanged"], "visibleMeshCount": len(analysis["visibleMeshes"]),
        "sourceVisiblePolygonCount": sum(row["polygons"] for row in analysis["visibleMeshes"]),
        "blenderPrimitiveCount": 9, "outputPrimitiveCount": validation["ggdInspection"]["drawPrimitives"],
        "outputTriangleCount": validation["ggdInspection"]["triangles"], "sourceBoneCount": 98,
        "outputJointCount": validation["ggdInspection"]["joints"][0], "sourceActionCount": 0, "outputClipCount": 0,
        "usedSourceImageCount": len(analysis["usedImages"]), "embeddedOutputImageCount": validation["ggdInspection"]["textureCount"],
        "compatibilityAdjustments": {
            "material": blender_conversion["materialCompatibilityAdjustments"],
            "texture": blender_conversion["textureCompatibilityAdjustments"],
            "hierarchy": blender_conversion["hierarchyCompatibilityAdjustments"],
            "drawCalls": conversion["officialNormalization"]["drawCalls"],
        },
        "excludedNativeParts": analysis["hiddenOrNonrenderMeshes"], "shaderParityVerified": False,
        "sourceAnalysis": git_pin((evidence_root / "source-analysis.json").as_posix(), files["source-analysis.json"]),
        "conversionReceipt": git_pin((evidence_root / "conversion.json").as_posix(), files["conversion.json"]),
    }
    files["source-fidelity.json"] = encoded(source_fidelity)
    source_rebuild = {
        "schema": "ggd.ssbu-mario-source-rebuild@1", "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256, "outputSha256": OUTPUT_SHA256,
        "firstBuild": pin(final_root / "body.glb"), "secondBuild": pin(rebuild_root / "body.glb"),
        "firstBlenderExport": pin(final_root / "blender-export.glb"), "secondBlenderExport": pin(rebuild_root / "blender-export.glb"),
        "derivedTextures": [
            {"name": name, "first": pin(final_root / "derived-textures" / name), "second": pin(rebuild_root / "derived-textures" / name)}
            for name in sorted(DERIVED_TEXTURES)
        ],
        "byteIdenticalRebuild": True, "blenderExportByteIdenticalRebuild": True,
        "derivedTexturesByteIdenticalRebuild": True, "bothValidationsPassed": True,
        "toolPins": tool_pins,
        "limitations": ["Absolute paths differ between receipts; delivered GLB and all derived texture bytes are identical.",
                        "Deterministic static output does not establish gameplay animation readiness."],
    }
    files["source-rebuild.json"] = encoded(source_rebuild)
    acceptance = {
        "schema": "ggd.skinned-component-acceptance@1", "deliverySha256": delivery_sha, "acceptedAt": "2026-09-12",
        "components": [{"id": COMPONENT_ID, "variant": "c00", "sha256": OUTPUT_SHA256, "accepted": True,
                        "scope": "independent-static-skinned-model-component", "reviewedViews": ["front", "back", "isometric"],
                        "limitationsAccepted": gaps}],
    }
    files["acceptance.json"] = encoded(acceptance)

    def evidence(name: str) -> dict:
        return git_pin((evidence_root / name).as_posix(), files[name])

    glb_path = final_root / "body.glb"
    evidence_note = (
        "SSBU fighter/mario c00 was converted with Blender 4.5.13 and GGD's official normalizer to an 817,900-byte GLB; "
        "two rebuilds are byte-identical. Khronos has 0 errors and 0 warnings; 9 source primitives were safely combined to "
        "6 draw primitives, all skinned to 98 joints, and 101,330 float values are finite. Three WebGL views were accepted only "
        "as an independent static component. Source and output contain no actions."
    )
    candidate = {
        "id": COMPONENT_ID, "conversionCandidateId": CONVERSION_ID, "sourceId": SOURCE_ID,
        "sourceClass": SOURCE_CLASS, "selectionClass": "canonical-game", "nameZh": "Mario／瑪利歐",
        "originalName": "Mario", "workZh": "任天堂明星大亂鬥 特別版（原作：超級瑪利歐系列）",
        "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07",
        "platform": "Nintendo Switch", "nativeId": "fighter/mario/body/c00", "variant": "c00",
        "resourceRole": "independent-static-skinned-model-component", "assetKinds": ["model-component", "skeleton", "texture"],
        "absolutePath": str(glb_path), "path": str(glb_path), "bytes": 817900, "sha256": OUTPUT_SHA256,
        "gitPath": f"content/assets/models/community/{OUTPUT_SHA256}.glb",
        "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": ["ssbu-mario"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "triangles": 7189, "drawPrimitives": 6, "skinCount": 1, "jointCount": 98, "textureCount": 5,
        "readiness": "accepted-independent-static-skinned-component-actions-missing", "auditEvidence": evidence_note,
        "limitations": gaps, "deliveryEvidence": evidence("delivery.json"), "acceptanceEvidence": evidence("acceptance.json"),
        "validationEvidence": evidence("validation.json"), "visualEvidence": evidence("visual-review.json"),
        "webglProofEvidence": evidence("webgl-proof.json"), "sourceFidelityEvidence": evidence("source-fidelity.json"),
        "sourceRebuildEvidence": evidence("source-rebuild.json"), "backupStatus": "pending-s3-conversion-stage-backup",
    }

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = load(downloads_path)
    sources = [row for row in downloads.get("publicSources", []) + downloads.get("paidSources", []) if row.get("id") == SOURCE_ID]
    require(len(sources) == 1, "Expected one SSBU source")
    source = sources[0]
    require(source.get("heroIds") == [] and source.get("defaultEligible") is False, "Whole SSBU reserve must remain unmapped")
    source.setdefault("sourceClass", SOURCE_CLASS)
    require(source.get("sourceClass") == SOURCE_CLASS, "SSBU source class differs")
    linked = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == BACKUP_ID]
    archive_index = None
    if linked:
        require(len(linked) == 1 and linked[0].get("fullReadbackVerified") is True, "Mario backup is not fully verified")
        archive_index = load(repo / "materials/hero-model-library/public-source-files.json")
        archives = [row for row in archive_index.get("sources", []) if row.get("id") == BACKUP_ID]
        require(len(archives) == 1 and archives[0].get("allMemberSha256Verified", archives[0].get("fullReadbackVerified")) is True,
                "Mario archive is not fully verified")
        archive = archives[0]
        members = [row for row in archive.get("files", []) if row.get("path") == "body.glb"]
        require(len(members) == 1 and (members[0].get("sha256"), members[0].get("bytes")) == (OUTPUT_SHA256, 817900),
                "Mario archive does not contain the accepted GLB")
        locator = {"s3Uri": archive["s3Uri"], "s3ArchiveMember": "body.glb", "s3Use": "backup-only-not-runtime-entry",
                   "backupReceiptPath": archive["receiptPath"], "backupReceiptSha256": archive["receiptSha256"]}
        candidate.update(backupStatus="s3-full-readback-verified", backupLocations=[locator], **locator)
    dependency_id = "dependency-blender-4.5.13-macos-arm64"
    dependency_links = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == dependency_id]
    if dependency_links:
        require(len(dependency_links) == 1 and dependency_links[0].get("fullReadbackVerified") is True, "Blender backup is not verified")
        archive_index = archive_index or load(repo / "materials/hero-model-library/public-source-files.json")
        dependency = [row for row in archive_index.get("sources", []) if row.get("id") == dependency_id]
        require(len(dependency) == 1, "Blender dependency archive missing")
        dmg = [row for row in dependency[0].get("files", []) if row.get("path") == "blender-4.5.13-macos-arm64.dmg"]
        require(len(dmg) == 1 and dmg[0].get("sha256") == "663ce944257c61ff1d6aa09e15c8f57bbd8d59023adb2fa7edde33a9ed960b53",
                "Wrong Blender dependency DMG")
        candidate["toolchainBackup"] = {
            "name": "Blender 4.5.13 LTS macOS arm64", "s3Uri": dependency[0]["s3Uri"],
            "s3ArchiveMember": dmg[0]["path"], "sha256": dmg[0]["sha256"], "bytes": dmg[0]["bytes"],
            "s3Use": "backup-only-not-runtime-entry", "backupReceiptPath": dependency[0]["receiptPath"],
            "backupReceiptSha256": dependency[0]["receiptSha256"],
        }
    current = [row for row in source.setdefault("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    require(len(current) <= 1, "Duplicate Mario component")
    if current:
        require((current[0].get("sourceId"), current[0].get("sha256"), current[0].get("gitPath")) ==
                (candidate["sourceId"], candidate["sha256"], candidate["gitPath"]), "Existing Mario component differs")
        merged = dict(current[0]); merged.update(candidate)
        source["componentCandidates"][source["componentCandidates"].index(current[0])] = merged
        candidate = merged
    else:
        source["componentCandidates"].append(candidate)
    rejected_validation = final_root.with_name("ssbu-mario-c00-blender4513-v1") / "validation/structural.json"
    require(rejected_validation.is_file(), "Missing preserved Mario v1 rejection receipt")
    rejected = load(rejected_validation)
    require(rejected.get("structuralValidationPassed") is False and rejected.get("ggdInspection", {}).get("budget", {}).get("errors") ==
            ["繪製網格 9 超過英雄模型上限 6。"], "Unexpected Mario v1 rejection")
    attempts = [
        {"id": "ssbu-mario-c00-blender4513-v1", "status": "rejected-ggd-draw-primitive-limit-9-over-6",
         "localPath": str(rejected_validation.parents[1]), "reportPath": str(rejected_validation),
         "reportSha256": sha_bytes(rejected_validation.read_bytes()), "outputPath": str(rejected_validation.parents[1] / "body.glb"),
         "outputSha256": BLENDER_EXPORT_SHA256, "nativeAnimationCount": 0, "runtimeReady": False,
         "runtimeSelectable": False, "backupStatus": "pending-s3-conversion-stage-backup"},
        {"id": DELIVERY_ID, "status": "accepted-independent-static-skinned-component-actions-missing",
         "localPath": str(final_root), "rebuildPath": str(rebuild_root), "reportPath": str(final_root / "conversion.json"),
         "reportSha256": sha_bytes((final_root / "conversion.json").read_bytes()), "outputPath": str(glb_path),
         "outputSha256": OUTPUT_SHA256, "nativeAnimationCount": 0, "componentId": COMPONENT_ID,
         "runtimeReady": False, "runtimeSelectable": False, "backupStatus": candidate["backupStatus"]},
    ]
    rejected_links = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == REJECTED_BACKUP_ID]
    if rejected_links:
        require(len(rejected_links) == 1 and rejected_links[0].get("fullReadbackVerified") is True,
                "Mario rejected-stage backup is not fully verified")
        archive_index = archive_index or load(repo / "materials/hero-model-library/public-source-files.json")
        rejected_archives = [row for row in archive_index.get("sources", []) if row.get("id") == REJECTED_BACKUP_ID]
        require(len(rejected_archives) == 1 and rejected_archives[0].get("allMemberSha256Verified", rejected_archives[0].get("fullReadbackVerified")) is True,
                "Mario rejected-stage archive is not fully verified")
        rejected_archive = rejected_archives[0]
        rejected_members = [row for row in rejected_archive.get("files", []) if row.get("path") == "body.glb"]
        require(len(rejected_members) == 1 and rejected_members[0].get("sha256") == BLENDER_EXPORT_SHA256,
                "Mario rejected-stage archive contains the wrong GLB")
        attempts[0].update(
            backupStatus="s3-full-readback-verified", s3Uri=rejected_archive["s3Uri"],
            s3ArchiveMember="body.glb", s3Use="backup-only-not-runtime-entry",
            backupReceiptPath=rejected_archive["receiptPath"], backupReceiptSha256=rejected_archive["receiptSha256"],
        )
    if linked:
        attempts[1].update(s3Uri=archive["s3Uri"], s3ArchiveMember="body.glb", s3Use="backup-only-not-runtime-entry",
                           backupReceiptPath=archive["receiptPath"], backupReceiptSha256=archive["receiptSha256"])
    for attempt in attempts:
        existing = [row for row in source.setdefault("conversionAttempts", []) if row.get("id") == attempt["id"]]
        require(len(existing) <= 1, "Duplicate Mario conversion attempt")
        if existing:
            require(existing[0].get("outputSha256") == attempt["outputSha256"], "Existing Mario conversion output differs")
            merged = dict(existing[0]); merged.update(attempt)
            source["conversionAttempts"][source["conversionAttempts"].index(existing[0])] = merged
        else:
            source["conversionAttempts"].append(attempt)

    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-community.json"
    backlog = load(backlog_path)
    rows = [row for row in backlog.get("characters", []) if row.get("id") == "ssbu-mario"]
    require(len(rows) == 1, "Expected one Mario design-backlog identity")
    row = rows[0]
    require(row.get("mappedHeroIds") == [] and row.get("designStatus") == "not-defined", "Mario must remain unbound")
    backlog_candidate = {
        "id": COMPONENT_ID, "sourceId": SOURCE_ID, "library": "community", "nativeId": "fighter/mario/body/c00",
        "path": str(glb_path), "gitPath": candidate["gitPath"], "existsLocal": True, "bytes": candidate["bytes"],
        "sha256": candidate["sha256"], "format": "glTF Binary", "resourceRole": candidate["resourceRole"],
        "readiness": candidate["readiness"], "converted": True, "componentReady": True,
        "nativeAnimationCount": 0, "proceduralAnimationCount": 0, "runtimeSelectable": False, "defaultEligible": False,
        "validationEvidence": candidate["validationEvidence"], "visualEvidence": candidate["visualEvidence"],
        "limitations": candidate["limitations"],
    }
    existing = [item for item in row.setdefault("modelCandidates", []) if item.get("id") == COMPONENT_ID]
    require(len(existing) <= 1, "Duplicate Mario backlog component")
    if existing:
        for key in ("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole"):
            require(existing[0].get(key) == backlog_candidate[key], "Existing Mario backlog component differs: " + key)
        merged = dict(existing[0]); merged.update(backlog_candidate)
        row["modelCandidates"][row["modelCandidates"].index(existing[0])] = merged
    else:
        row["modelCandidates"].append(backlog_candidate)
    if evidence_note not in row.setdefault("evidence", []):
        row["evidence"].append(evidence_note)

    mutable_paths = {downloads_path, backlog_path}
    writes = {downloads_path: encoded(downloads), backlog_path: encoded(backlog),
              repo / candidate["gitPath"]: glb_path.read_bytes()}
    for name, data in files.items():
        writes[repo / evidence_root / name] = data
    for dst, data in writes.items():
        if dst not in mutable_paths:
            require(not dst.exists() or dst.read_bytes() == data, "Refusing to overwrite different file: " + str(dst))
    return writes, mutable_paths, candidate, evidence_root


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--final-root", type=Path, required=True)
    parser.add_argument("--rebuild-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    writes, mutable_paths, candidate, evidence_root = prepare(Path.cwd(), args.final_root, args.rebuild_root)
    if args.write:
        for dst, data in writes.items():
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst in mutable_paths or not dst.exists():
                dst.write_bytes(data)
    else:
        for dst, data in writes.items():
            require(dst.is_file() and dst.read_bytes() == data, "Refresh SSBU Mario integration: " + str(dst))
    print(json.dumps({"componentId": candidate["id"], "sha256": candidate["sha256"],
                      "evidenceRoot": evidence_root.as_posix(), "heroBindings": 0, "nativeAnimations": 0,
                      "runtimeSelectable": False, "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
