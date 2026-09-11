#!/usr/bin/env python3
"""Admit the validated SSBU assist/zero body as an independent component."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path

from skinned_components import require


SOURCE_ID = "gitlab-ssbu-models"
COMPONENT_ID = "ssbu-zero-c00-static-skinned-v1"
CONVERSION_ID = "ssbu-zero-c00-blender4513-v4"
SOURCE_CLASS = "original-game-extraction-community-repackage"
SOURCE_SHA256 = "e9ef80e0f910453a09c43d7b42282a65bbe9ecd45a9dae76be0a0c07dae26a21"
OUTPUT_SHA256 = "3804d9bf6fb53514ec7ed8d6684d5e515ac12e24aca980d6daaf5d125d44edf1"
DERIVED_TEXTURE_SHA256 = "0f2660975e4a04352a5627cf43c6db4f5b1a27f56cbf1977e3d06aef37867316"


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
    repo = repo.resolve()
    final_root = final_root.resolve()
    rebuild_root = rebuild_root.resolve()
    conversion = load(final_root / "conversion.json")
    analysis = load(final_root / "source-analysis.json")
    validation = load(final_root / "validation/structural.json")
    webgl = load(final_root / "render-v1/proof.json")
    rebuild_conversion = load(rebuild_root / "conversion.json")
    rebuild_validation = load(rebuild_root / "validation/structural.json")

    require(conversion.get("schema") == "ggd-ssbu-blend-component-conversion@1", "Unexpected conversion receipt")
    require(conversion.get("candidateId") == CONVERSION_ID and conversion.get("sourceId") == SOURCE_ID, "Wrong conversion candidate")
    require(conversion.get("input", {}).get("sha256") == SOURCE_SHA256, "Changed SSBU Zero source")
    require(conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Changed final SSBU Zero GLB")
    require(pin(final_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Final GLB does not match receipt")
    require(pin(rebuild_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Rebuild is not byte-identical")
    require(
        pin(final_root / "derived-textures/asf_zero_body_col.png.ggd-256.png")["sha256"]
        == pin(rebuild_root / "derived-textures/asf_zero_body_col.png.ggd-256.png")["sha256"]
        == DERIVED_TEXTURE_SHA256,
        "Derived texture rebuild is not byte-identical",
    )
    require(validation.get("structuralValidationPassed") is True, "Final structural validation failed")
    require(rebuild_validation.get("structuralValidationPassed") is True, "Rebuild structural validation failed")
    for checked in (validation, rebuild_validation):
        require(checked.get("finiteFloatAccessors", {}).get("passed") is True, "Non-finite accessor found")
        require(checked.get("khronosIssues", {}).get("numErrors") == 0, "Khronos errors found")
        require(checked.get("khronosIssues", {}).get("numWarnings") == 0, "Khronos warnings found")
        require(checked.get("ggdInspection", {}).get("budget", {}).get("errors") == [], "GGD budget errors found")
        require(checked.get("ggdInspection", {}).get("clipCount") == 0, "Unexpected source animation")
    require(webgl.get("modelSha256") == OUTPUT_SHA256 and webgl.get("animationGroups") == [], "Wrong WebGL proof")
    require(webgl.get("worldSkinnedBounds", {}).get("extent", [None, None])[1] > 1.79, "Unexpected rendered height")
    require(len(webgl.get("geometry", [])) == 6 and webgl.get("skeletons", [{}])[0].get("bones") == 75, "Incomplete WebGL model")

    tool_pins = []
    for rel in (
        "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts",
    ):
        data = (repo / rel).read_bytes()
        tool_pins.append({"path": rel, "sha256": sha_bytes(data)})

    delivery = {
        "schema": "ggd.ssbu-zero-component-delivery@1",
        "deliveryId": "ssbu-zero-blender4513-v4",
        "sourceId": SOURCE_ID,
        "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
        "character": {
            "name": "Zero",
            "nameZh": "Zero／傑洛",
            "nativeId": "assist/zero",
            "variant": "c00",
            "sourceGame": "Super Smash Bros. Ultimate",
            "originalSeries": "Mega Man X / Mega Man Zero",
        },
        "source": pin(Path(conversion["input"]["path"])),
        "finalRoot": str(final_root),
        "rebuildRoot": str(rebuild_root),
        "output": pin(final_root / "body.glb"),
        "derivedTexture": pin(final_root / "derived-textures/asf_zero_body_col.png.ggd-256.png"),
        "metrics": {
            "triangles": 5276,
            "drawPrimitives": 6,
            "skinnedPrimitives": 6,
            "skinCount": 1,
            "jointCount": 75,
            "textureCount": 4,
            "nativeAnimationCount": 0,
            "proceduralAnimationCount": 0,
            "worldHeightMeters": webgl["worldSkinnedBounds"]["extent"][1],
        },
        "validation": {
            "khronosErrors": 0,
            "khronosWarnings": 0,
            "ggdBudgetErrors": 0,
            "ggdBudgetWarnings": validation["ggdInspection"]["budget"]["warnings"],
            "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"],
            "webglLoadComplete": True,
            "visualViewsReviewed": ["front", "back", "isometric"],
        },
        "status": {
            "converted": True,
            "structurallyValidated": True,
            "visuallyAcceptedIndependentComponent": True,
            "completeHero": False,
            "heroBound": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "toolPins": tool_pins,
        "gaps": [
            "Source Blender contains zero actions; attack, death, locomotion and idle animation remain missing.",
            "No GGD hero definition or skill binding exists for this exact Zero identity.",
            "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
            "Original SSBU shader parity is incomplete; only source-connected Blender materials were exported.",
            "Hidden damage mesh remains preserved only in the original Blender source and is excluded from c00 visible appearance.",
            "Exporter emitted NumPy overflow/divide warnings for one mesh transform; all 64,788 exported float values were finite in both validations and the WebGL render was visually intact.",
        ],
    }
    delivery_data = encoded(delivery)
    delivery_sha = sha_bytes(delivery_data)
    evidence_root = Path("materials/hero-model-library/priority-evidence/ssbu-zero") / delivery_sha

    files: dict[str, bytes] = {
        "delivery.json": delivery_data,
        "conversion.json": (final_root / "conversion.json").read_bytes(),
        "source-analysis.json": (final_root / "source-analysis.json").read_bytes(),
        "validation.json": (final_root / "validation/structural.json").read_bytes(),
        "webgl-proof.json": (final_root / "render-v1/proof.json").read_bytes(),
        "front.png": (final_root / "render-v1/front.png").read_bytes(),
        "back.png": (final_root / "render-v1/back.png").read_bytes(),
        "isometric.png": (final_root / "render-v1/isometric.png").read_bytes(),
    }

    shot_pins = [git_pin((evidence_root / name).as_posix(), files[name]) for name in ("front.png", "back.png", "isometric.png")]
    visual_review = {
        "schema": "ggd.skinned-component-visual-review@1",
        "componentId": COMPONENT_ID,
        "modelSha256": OUTPUT_SHA256,
        "accepted": True,
        "scope": "independent-static-skinned-model-component",
        "reviewedAt": "2026-09-12",
        "reviewedViews": ["front", "back", "isometric"],
        "findings": [
            "Front, back and isometric renders show the complete visible c00 Zero body, helmet, face, hair, armor, hands, boots and integrated beam saber.",
            "No detached body part, missing material, opaque alpha card or obvious skinning collapse is visible in the reviewed static bind pose.",
            "This review does not cover animation playback because the source contains no actions.",
        ],
        "shots": shot_pins,
        "webglProof": git_pin((evidence_root / "webgl-proof.json").as_posix(), files["webgl-proof.json"]),
        "runtimeSelectionVerified": False,
        "deploymentVerified": False,
    }
    files["visual-review.json"] = encoded(visual_review)

    source_fidelity = {
        "schema": "ggd.ssbu-zero-source-fidelity@1",
        "sourceId": SOURCE_ID,
        "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256,
        "outputSha256": OUTPUT_SHA256,
        "sourceBytesUnchanged": conversion["sourceBytesUnchanged"],
        "visibleMeshCount": len(analysis["visibleMeshes"]),
        "outputPrimitiveCount": validation["ggdInspection"]["drawPrimitives"],
        "sourceVisiblePolygonCount": sum(row["polygons"] for row in analysis["visibleMeshes"]),
        "outputTriangleCount": validation["ggdInspection"]["triangles"],
        "sourceBoneCount": analysis["armatures"][0]["bones"],
        "outputJointCount": validation["ggdInspection"]["joints"][0],
        "sourceActionCount": len(analysis["actions"]),
        "outputClipCount": validation["ggdInspection"]["clipCount"],
        "usedSourceImageCount": len(analysis["usedImages"]),
        "embeddedOutputImageCount": validation["ggdInspection"]["textureCount"],
        "compatibilityAdjustments": {
            "material": conversion["materialCompatibilityAdjustments"],
            "texture": conversion["textureCompatibilityAdjustments"],
            "hierarchy": conversion["hierarchyCompatibilityAdjustments"],
        },
        "excludedNativeParts": analysis["hiddenOrNonrenderMeshes"],
        "shaderParityVerified": False,
        "sourceAnalysis": git_pin((evidence_root / "source-analysis.json").as_posix(), files["source-analysis.json"]),
        "conversionReceipt": git_pin((evidence_root / "conversion.json").as_posix(), files["conversion.json"]),
    }
    files["source-fidelity.json"] = encoded(source_fidelity)

    source_rebuild = {
        "schema": "ggd.ssbu-zero-source-rebuild@1",
        "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256,
        "outputSha256": OUTPUT_SHA256,
        "firstBuild": pin(final_root / "body.glb"),
        "secondBuild": pin(rebuild_root / "body.glb"),
        "firstDerivedTexture": pin(final_root / "derived-textures/asf_zero_body_col.png.ggd-256.png"),
        "secondDerivedTexture": pin(rebuild_root / "derived-textures/asf_zero_body_col.png.ggd-256.png"),
        "byteIdenticalRebuild": True,
        "derivedTextureByteIdenticalRebuild": True,
        "bothValidationsPassed": True,
        "toolPins": tool_pins,
        "limitations": [
            "Absolute paths and candidate labels differ between receipts; delivered GLB and derived texture bytes are identical.",
            "Source contains no actions, so deterministic output does not establish gameplay animation readiness.",
        ],
    }
    files["source-rebuild.json"] = encoded(source_rebuild)

    acceptance = {
        "schema": "ggd.skinned-component-acceptance@1",
        "deliverySha256": delivery_sha,
        "acceptedAt": "2026-09-12",
        "components": [{
            "id": COMPONENT_ID,
            "variant": "c00",
            "sha256": OUTPUT_SHA256,
            "accepted": True,
            "scope": "independent-static-skinned-model-component",
            "reviewedViews": ["front", "back", "isometric"],
            "limitationsAccepted": delivery["gaps"],
        }],
    }
    files["acceptance.json"] = encoded(acceptance)

    def evidence(name: str) -> dict:
        return git_pin((evidence_root / name).as_posix(), files[name])

    glb_path = final_root / "body.glb"
    candidate = {
        "id": COMPONENT_ID,
        "conversionCandidateId": CONVERSION_ID,
        "sourceId": SOURCE_ID,
        "sourceClass": SOURCE_CLASS,
        "selectionClass": "canonical-game",
        "nameZh": "Zero／傑洛",
        "originalName": "Zero",
        "workZh": "任天堂明星大亂鬥 特別版（原作：洛克人 X／Zero 系列）",
        "sourceGame": "Super Smash Bros. Ultimate",
        "sourceGameReleasedAt": "2018-12-07",
        "platform": "Nintendo Switch",
        "nativeId": "assist/zero",
        "variant": "c00",
        "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture", "integrated-weapon"],
        "absolutePath": str(glb_path),
        "path": str(glb_path),
        "bytes": 596332,
        "sha256": OUTPUT_SHA256,
        "gitPath": f"content/assets/models/community/{OUTPUT_SHA256}.glb",
        "componentReady": True,
        "converted": True,
        "structuralValidationPassed": True,
        "visualValidationPassed": True,
        "runtimeReady": False,
        "runtimeSelectable": False,
        "defaultEligible": False,
        "automaticEligible": False,
        "fullHeroModel": False,
        "runtimeDropdownRegistered": False,
        "heroIds": [],
        "relatedHeroIds": [],
        "identityIds": ["zero-megaman"],
        "nativeAnimationCount": 0,
        "proceduralAnimationCount": 0,
        "triangles": 5276,
        "drawPrimitives": 6,
        "skinCount": 1,
        "jointCount": 75,
        "textureCount": 4,
        "readiness": "accepted-independent-static-skinned-component-actions-missing",
        "limitations": delivery["gaps"],
        "deliveryEvidence": evidence("delivery.json"),
        "acceptanceEvidence": evidence("acceptance.json"),
        "validationEvidence": evidence("validation.json"),
        "visualEvidence": evidence("visual-review.json"),
        "webglProofEvidence": evidence("webgl-proof.json"),
        "sourceFidelityEvidence": evidence("source-fidelity.json"),
        "sourceRebuildEvidence": evidence("source-rebuild.json"),
        "backupStatus": "pending-s3-conversion-stage-backup",
    }

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = load(downloads_path)
    sources = [s for s in downloads.get("publicSources", []) + downloads.get("paidSources", []) if s.get("id") == SOURCE_ID]
    require(len(sources) == 1, "Expected one SSBU source")
    source = sources[0]
    require(source.get("heroIds") == [] and source.get("defaultEligible") is False, "Whole SSBU reserve must remain unmapped")
    if source.get("sourceClass") is None:
        source["sourceClass"] = SOURCE_CLASS
    require(source.get("sourceClass") == SOURCE_CLASS, "SSBU source class differs")
    backup_id = "ssbu-zero-blender4513-v1-v5-backup"
    linked_backups = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == backup_id]
    archive_index = None
    if linked_backups:
        require(len(linked_backups) == 1 and linked_backups[0].get("fullReadbackVerified") is True, "SSBU Zero backup is not fully verified")
        archive_index = load(repo / "materials/hero-model-library/public-source-files.json")
        archive_rows = [row for row in archive_index.get("sources", []) if row.get("id") == backup_id]
        require(len(archive_rows) == 1 and archive_rows[0].get("allMemberSha256Verified", archive_rows[0].get("fullReadbackVerified")) is True,
                "SSBU Zero backup file manifest is not verified")
        archive = archive_rows[0]
        member = "stages/v4-final/body.glb"
        members = [row for row in archive.get("files", []) if row.get("path") == member]
        require(len(members) == 1 and (members[0].get("sha256"), members[0].get("bytes")) == (OUTPUT_SHA256, candidate["bytes"]),
                "SSBU Zero archive does not contain the accepted GLB")
        locator = {
            "s3Uri": archive["s3Uri"],
            "s3ArchiveMember": member,
            "s3Use": "backup-only-not-runtime-entry",
            "backupReceiptPath": archive["receiptPath"],
            "backupReceiptSha256": archive["receiptSha256"],
        }
        candidate.update(
            backupStatus="s3-full-readback-verified",
            backupLocations=[locator],
            **locator,
        )
    dependency_id = "dependency-blender-4.5.13-macos-arm64"
    dependency_links = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == dependency_id]
    if dependency_links:
        require(len(dependency_links) == 1 and dependency_links[0].get("fullReadbackVerified") is True,
                "Blender dependency backup is not fully verified")
        if archive_index is None:
            archive_index = load(repo / "materials/hero-model-library/public-source-files.json")
        dependency_rows = [row for row in archive_index.get("sources", []) if row.get("id") == dependency_id]
        require(len(dependency_rows) == 1, "Blender dependency archive is missing from the central file index")
        dependency_archive = dependency_rows[0]
        dmg = [row for row in dependency_archive.get("files", []) if row.get("path") == "blender-4.5.13-macos-arm64.dmg"]
        require(len(dmg) == 1 and dmg[0].get("sha256") == "663ce944257c61ff1d6aa09e15c8f57bbd8d59023adb2fa7edde33a9ed960b53",
                "Blender dependency archive contains the wrong DMG")
        candidate["toolchainBackup"] = {
            "name": "Blender 4.5.13 LTS macOS arm64",
            "s3Uri": dependency_archive["s3Uri"],
            "s3ArchiveMember": "blender-4.5.13-macos-arm64.dmg",
            "sha256": dmg[0]["sha256"],
            "bytes": dmg[0]["bytes"],
            "s3Use": "backup-only-not-runtime-entry",
            "backupReceiptPath": dependency_archive["receiptPath"],
            "backupReceiptSha256": dependency_archive["receiptSha256"],
        }
    existing = [row for row in source.setdefault("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    require(len(existing) <= 1, "Duplicate SSBU Zero component")
    if existing:
        require((existing[0].get("sourceId"), existing[0].get("sha256"), existing[0].get("gitPath"))
                == (candidate["sourceId"], candidate["sha256"], candidate["gitPath"]), "Existing SSBU Zero component identity differs")
        merged = dict(existing[0])
        merged.update(candidate)
        source["componentCandidates"][source["componentCandidates"].index(existing[0])] = merged
        candidate = merged
    else:
        source["componentCandidates"].append(candidate)
    conversion_attempt = {
        "id": "ssbu-zero-blender4513-v4",
        "status": "accepted-independent-static-skinned-component-actions-missing",
        "localPath": str(final_root),
        "rebuildPath": str(rebuild_root),
        "reportPath": str(final_root / "conversion.json"),
        "reportSha256": sha_bytes((final_root / "conversion.json").read_bytes()),
        "outputPath": str(glb_path),
        "outputSha256": OUTPUT_SHA256,
        "nativeAnimationCount": 0,
        "componentId": COMPONENT_ID,
        "runtimeReady": False,
        "runtimeSelectable": False,
        "backupStatus": "pending-s3-conversion-stage-backup",
    }
    if linked_backups:
        conversion_attempt.update(
            backupStatus="s3-full-readback-verified",
            s3Uri=archive["s3Uri"],
            s3ArchiveMember="stages/v4-final/body.glb",
            s3Use="backup-only-not-runtime-entry",
            backupReceiptPath=archive["receiptPath"],
            backupReceiptSha256=archive["receiptSha256"],
        )
    supplemental = source.setdefault("supplementalDeliveries", [])
    misplaced = [row for row in supplemental if row.get("id") == conversion_attempt["id"] and "sha256" not in row]
    require(len(misplaced) <= 1, "Duplicate pending SSBU Zero conversion row")
    if misplaced:
        supplemental[:] = [row for row in supplemental if row is not misplaced[0]]
    existing_attempt = [row for row in source.setdefault("conversionAttempts", []) if row.get("id") == conversion_attempt["id"]]
    require(len(existing_attempt) <= 1, "Duplicate SSBU Zero conversion attempt")
    if existing_attempt:
        require(existing_attempt[0].get("outputSha256") == OUTPUT_SHA256, "Existing SSBU Zero conversion output differs")
        merged_attempt = dict(existing_attempt[0])
        merged_attempt.update(conversion_attempt)
        source["conversionAttempts"][source["conversionAttempts"].index(existing_attempt[0])] = merged_attempt
    else:
        source["conversionAttempts"].append(conversion_attempt)

    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-community.json"
    backlog = load(backlog_path)
    rows = [row for row in backlog.get("characters", []) if row.get("id") == "zero-megaman"]
    require(len(rows) == 1, "Expected one Zero design-backlog identity")
    row = rows[0]
    require(row.get("mappedHeroIds") == [] and row.get("designStatus") == "not-defined", "Zero must remain unbound")
    backlog_candidate = {
        "id": COMPONENT_ID,
        "sourceId": SOURCE_ID,
        "library": "community",
        "nativeId": "assist/zero",
        "path": str(glb_path),
        "gitPath": candidate["gitPath"],
        "existsLocal": True,
        "bytes": candidate["bytes"],
        "sha256": candidate["sha256"],
        "format": "glTF Binary",
        "resourceRole": candidate["resourceRole"],
        "readiness": candidate["readiness"],
        "converted": True,
        "componentReady": True,
        "nativeAnimationCount": 0,
        "proceduralAnimationCount": 0,
        "runtimeSelectable": False,
        "defaultEligible": False,
        "validationEvidence": candidate["validationEvidence"],
        "visualEvidence": candidate["visualEvidence"],
        "limitations": candidate["limitations"],
    }
    existing_backlog = [item for item in row.setdefault("modelCandidates", []) if item.get("id") == COMPONENT_ID]
    require(len(existing_backlog) <= 1, "Duplicate Zero backlog component")
    if existing_backlog:
        require(existing_backlog[0] == backlog_candidate, "Existing Zero backlog component differs")
    else:
        row["modelCandidates"].append(backlog_candidate)
    evidence_note = (
        "SSBU assist/zero c00 was converted with Blender 4.5.13 to a 596,332-byte GLB; two rebuilds are byte-identical. "
        "Khronos validation has 0 errors and 0 warnings; all 6 primitives are skinned to a 75-joint skeleton, 64,788 float values are finite, "
        "and front/back/isometric WebGL views were accepted only as an independent static component. Source and output contain no actions."
    )
    if evidence_note not in row.setdefault("evidence", []):
        row["evidence"].append(evidence_note)

    mutable_paths = {downloads_path, backlog_path}
    writes: dict[Path, bytes] = {
        downloads_path: encoded(downloads),
        backlog_path: encoded(backlog),
        repo / candidate["gitPath"]: glb_path.read_bytes(),
    }
    for name, data in files.items():
        writes[repo / evidence_root / name] = data
    for dst, data in writes.items():
        if dst in mutable_paths:
            continue
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
    repo = Path.cwd()
    writes, mutable_paths, candidate, evidence_root = prepare(repo, args.final_root, args.rebuild_root)
    if args.write:
        for dst, data in writes.items():
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst in mutable_paths or not dst.exists():
                dst.write_bytes(data)
    else:
        for dst, data in writes.items():
            require(dst.is_file() and dst.read_bytes() == data, "Refresh SSBU Zero integration: " + str(dst))
    print(json.dumps({
        "componentId": candidate["id"],
        "sha256": candidate["sha256"],
        "evidenceRoot": evidence_root.as_posix(),
        "heroBindings": 0,
        "nativeAnimations": 0,
        "runtimeSelectable": False,
        "files": len(writes),
        "written": args.write,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
