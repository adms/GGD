#!/usr/bin/env python3
"""Admit the validated SSBU fighter/mewtwo c00 body as a static component."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from skinned_components import require


SOURCE_ID = "gitlab-ssbu-models"
SOURCE_CLASS = "original-game-extraction-community-repackage"
COMPONENT_ID = "ssbu-mewtwo-c00-static-skinned-v1"
STAGE_ID = "ssbu-mewtwo-c00-blender4513-v1"
BACKUP_ID = STAGE_ID + "-backup"
SOURCE_SHA256 = "a75e399676876d88bcb8ae48f08d6d1efd4d6ae9e3dd224479a6e5b15a3a4a74"
BLENDER_SHA256 = "f2933958bd95bc313e0f8a9c932619f4812ac0868d9608c9910122bb3c4f9fa4"
OUTPUT_SHA256 = "cd4eac9c479678e02373f2dda182d5043d2dc2ae6aef3fbd1255157121d74dd0"
DERIVED_TEXTURES = {
    "def_mewtwo_001_col.png.ggd-256.png": "09bb4be9f0633485be8da2a65423c3e67a8ec3e72a77e2c79cd9f348cbc0e7e3",
    "eye_mewtwo_w_col.png.ggd-256.png": "a9397f157718a24d51b7ddd91ac6cfa9f6ac95f13e0f757af2703b75524b4361",
}


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha_bytes(data)}


def git_pin(path: Path, data: bytes, repo: Path) -> dict:
    return {"gitPath": path.relative_to(repo).as_posix(), "bytes": len(data), "sha256": sha_bytes(data)}


def load(path: Path) -> dict:
    return json.loads(path.read_text())


def prepare(repo: Path, final_root: Path, rebuild_root: Path):
    repo, final_root, rebuild_root = repo.resolve(), final_root.resolve(), rebuild_root.resolve()
    blender = load(final_root / "conversion.json")
    conversion = load(final_root / "normalization.json")
    analysis = load(final_root / "source-analysis.json")
    validation = load(final_root / "validation/structural.json")
    webgl = load(final_root / "render-v1/proof.json")
    rebuild_blender = load(rebuild_root / "conversion.json")
    rebuild_conversion = load(rebuild_root / "normalization.json")
    rebuild_validation = load(rebuild_root / "validation/structural.json")

    require(blender.get("schema") == "ggd-ssbu-blend-component-conversion@1", "Unexpected Mewtwo Blender receipt")
    require(conversion.get("schema") == "ggd-ssbu-static-component-normalization@1", "Unexpected Mewtwo normalization receipt")
    require(blender.get("candidateId") == COMPONENT_ID == conversion.get("candidateId"), "Wrong Mewtwo candidate")
    require(blender.get("sourceId") == SOURCE_ID and conversion.get("sourceId") == SOURCE_ID, "Wrong Mewtwo source")
    require(blender.get("input", {}).get("sha256") == SOURCE_SHA256, "Changed Mewtwo source")
    require(blender.get("output", {}).get("sha256") == BLENDER_SHA256, "Changed Mewtwo Blender export")
    require(conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Changed Mewtwo normalized GLB")
    require(pin(final_root / "blender-export.glb")["sha256"] == BLENDER_SHA256, "Final Blender export differs")
    require(pin(rebuild_root / "blender-export.glb")["sha256"] == BLENDER_SHA256, "Rebuilt Blender export differs")
    require(pin(final_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Final Mewtwo GLB differs")
    require(pin(rebuild_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Mewtwo rebuild differs")
    for name, expected in DERIVED_TEXTURES.items():
        require(pin(final_root / "derived-textures" / name)["sha256"] == expected, "Changed derived texture: " + name)
        require(pin(rebuild_root / "derived-textures" / name)["sha256"] == expected, "Changed rebuilt texture: " + name)

    require(len(analysis.get("visibleMeshes", [])) == 5, "Unexpected visible Mewtwo mesh count")
    require(len(analysis.get("hiddenOrNonrenderMeshes", [])) == 23, "Unexpected hidden Mewtwo mesh count")
    require(analysis.get("armatures", [{}])[0].get("bones") == 75, "Unexpected Mewtwo skeleton")
    require(analysis.get("actions") == [], "Mewtwo source unexpectedly contains actions")
    require(len(analysis.get("usedImages", [])) == 3, "Unexpected used Mewtwo image count")
    for checked in (validation, rebuild_validation):
        require(checked.get("structuralValidationPassed") is True, "Mewtwo structural validation failed")
        require(checked.get("finiteFloatAccessors", {}).get("passed") is True, "Mewtwo has non-finite accessors")
        require(checked.get("khronosIssues", {}).get("numErrors") == 0, "Mewtwo Khronos errors")
        require(checked.get("khronosIssues", {}).get("numWarnings") == 0, "Mewtwo Khronos warnings")
        require(checked.get("ggdInspection", {}).get("budget", {}).get("errors") == [], "Mewtwo budget errors")
        require(checked.get("ggdInspection", {}).get("clipCount") == 0, "Mewtwo unexpectedly contains clips")
    require(rebuild_blender.get("output", {}).get("sha256") == BLENDER_SHA256, "Mewtwo raw rebuild differs")
    require(rebuild_conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Mewtwo normalized rebuild differs")
    require(webgl.get("schema") == "ggd.ssbu-static-webgl@1", "Unexpected Mewtwo WebGL proof")
    require(webgl.get("animationGroups") == 0 and webgl.get("skeletons") == 1, "Unexpected Mewtwo WebGL rig")
    require(len(webgl.get("geometry", [])) == 3, "Incomplete Mewtwo WebGL geometry")
    require(all(row.get("bones") == 75 and row.get("gpuSkinning") is True for row in webgl["geometry"]), "Mewtwo GPU skinning incomplete")
    require(webgl.get("worldSkinnedBounds", {}).get("extent", [None, None])[1] > 1.79, "Unexpected Mewtwo height")

    tool_paths = (
        "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/normalize_static_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.mjs",
        "packages/shared/src/content/modelUpload/normalize.ts",
    )
    tool_pins = [{"path": path, "sha256": sha_bytes((repo / path).read_bytes())} for path in tool_paths]
    metrics = validation["ggdInspection"]
    gaps = [
        "Source Blender contains zero actions; idle, run, attack, cast, hurt and death animations remain missing.",
        "No GGD hero definition or skill binding exists for this exact Mewtwo identity.",
        "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
        "Original SSBU shader parity is incomplete; normal, PRM and game-specific shader behavior were not reconstructed.",
        "Twenty-three hidden facial/source mesh variants remain in the original Blender source and were excluded from the visible c00 appearance.",
        "Blender emitted NumPy transform warnings; both validations checked all exported float values as finite and Babylon WebGL rendered the body intact.",
    ]
    delivery = {
        "schema": "ggd.ssbu-mewtwo-component-delivery@1", "deliveryId": STAGE_ID,
        "sourceId": SOURCE_ID, "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
        "character": {"name": "Mewtwo", "nameZh": "超夢", "nativeId": "fighter/mewtwo/body/c00", "variant": "c00",
                      "sourceGame": "Super Smash Bros. Ultimate", "originalSeries": "Pokémon"},
        "source": pin(Path(blender["input"]["path"])), "finalRoot": str(final_root), "rebuildRoot": str(rebuild_root),
        "blenderExport": pin(final_root / "blender-export.glb"), "output": pin(final_root / "body.glb"),
        "derivedTextures": [pin(final_root / "derived-textures" / name) for name in sorted(DERIVED_TEXTURES)],
        "metrics": {"triangles": metrics["triangles"], "drawPrimitives": metrics["drawPrimitives"],
                    "skinnedPrimitives": metrics["skinnedPrimitives"], "skinCount": metrics["skinCount"],
                    "jointCount": metrics["joints"][0], "textureCount": metrics["textureCount"],
                    "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
                    "worldHeightMeters": webgl["worldSkinnedBounds"]["extent"][1]},
        "normalization": conversion["officialNormalization"],
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "ggdBudgetErrors": 0,
                       "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"],
                       "webglLoadComplete": True, "visualViewsReviewed": ["front", "back", "isometric"]},
        "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
                   "completeHero": False, "heroBound": False, "runtimeSelectable": False, "deployed": False},
        "toolPins": tool_pins, "gaps": gaps,
    }
    delivery_data = encoded(delivery)
    evidence_root = repo / "materials/hero-model-library/priority-evidence/ssbu-mewtwo" / sha_bytes(delivery_data)
    files = {
        "delivery.json": delivery_data,
        "blender-conversion.json": (final_root / "conversion.json").read_bytes(),
        "conversion.json": (final_root / "normalization.json").read_bytes(),
        "source-analysis.json": (final_root / "source-analysis.json").read_bytes(),
        "validation.json": (final_root / "validation/structural.json").read_bytes(),
        "webgl-proof.json": (final_root / "render-v1/proof.json").read_bytes(),
        "front.png": (final_root / "render-v1/front.png").read_bytes(),
        "back.png": (final_root / "render-v1/back.png").read_bytes(),
        "isometric.png": (final_root / "render-v1/isometric.png").read_bytes(),
        "contact-sheet.png": (final_root / "render-v1/contact-sheet.png").read_bytes(),
    }
    def evidence(name: str) -> dict:
        return git_pin(evidence_root / name, files[name], repo)
    shots = [evidence(name) for name in ("front.png", "back.png", "isometric.png", "contact-sheet.png")]
    files["visual-review.json"] = encoded({
        "schema": "ggd.skinned-component-visual-review@1", "componentId": COMPONENT_ID,
        "modelSha256": OUTPUT_SHA256, "accepted": True, "scope": "independent-static-skinned-model-component",
        "reviewedAt": "2026-09-12", "reviewedViews": ["front", "back", "isometric"],
        "findings": ["Front, back and isometric renders show the complete visible Mewtwo head, eyes, torso, arms, hands, legs, feet and tail.",
                     "No detached body part, missing primary material, opaque facial card or obvious bind-pose collapse is visible.",
                     "Review covers the static bind pose only because source and output contain no clips."],
        "shots": shots, "webglProof": evidence("webgl-proof.json"),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    files["source-fidelity.json"] = encoded({
        "schema": "ggd.ssbu-mewtwo-source-fidelity@1", "sourceId": SOURCE_ID, "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256, "blenderExportSha256": BLENDER_SHA256, "outputSha256": OUTPUT_SHA256,
        "sourceBytesUnchanged": blender["sourceBytesUnchanged"], "visibleMeshCount": len(analysis["visibleMeshes"]),
        "sourceVisiblePolygonCount": sum(row["polygons"] for row in analysis["visibleMeshes"]),
        "blenderPrimitiveCount": 5, "outputPrimitiveCount": metrics["drawPrimitives"],
        "outputTriangleCount": metrics["triangles"], "sourceBoneCount": 75, "outputJointCount": metrics["joints"][0],
        "sourceActionCount": 0, "outputClipCount": 0, "usedSourceImageCount": len(analysis["usedImages"]),
        "embeddedOutputImageCount": metrics["textureCount"], "excludedNativeParts": analysis["hiddenOrNonrenderMeshes"],
        "shaderParityVerified": False, "sourceAnalysis": evidence("source-analysis.json"), "conversionReceipt": evidence("conversion.json"),
    })
    files["source-rebuild.json"] = encoded({
        "schema": "ggd.ssbu-mewtwo-source-rebuild@1", "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256, "outputSha256": OUTPUT_SHA256,
        "firstBuild": pin(final_root / "body.glb"), "secondBuild": pin(rebuild_root / "body.glb"),
        "firstBlenderExport": pin(final_root / "blender-export.glb"), "secondBlenderExport": pin(rebuild_root / "blender-export.glb"),
        "derivedTextures": [{"name": name, "first": pin(final_root / "derived-textures" / name),
                             "second": pin(rebuild_root / "derived-textures" / name)} for name in sorted(DERIVED_TEXTURES)],
        "byteIdenticalRebuild": True, "blenderExportByteIdenticalRebuild": True,
        "derivedTexturesByteIdenticalRebuild": True, "bothValidationsPassed": True, "toolPins": tool_pins,
        "limitations": ["Absolute paths differ; GLB and derived texture bytes are identical.",
                        "Deterministic static output does not establish gameplay animation readiness."],
    })
    files["acceptance.json"] = encoded({
        "schema": "ggd.skinned-component-acceptance@1", "deliverySha256": sha_bytes(delivery_data), "acceptedAt": "2026-09-12",
        "components": [{"id": COMPONENT_ID, "variant": "c00", "sha256": OUTPUT_SHA256, "accepted": True,
                        "scope": "independent-static-skinned-model-component", "reviewedViews": ["front", "back", "isometric"],
                        "limitationsAccepted": gaps}],
    })

    evidence_note = ("SSBU fighter/mewtwo c00 was converted with Blender 4.5.13 and GGD normalization to a 667,840-byte GLB. "
                     "Two builds are byte-identical; Khronos has zero errors/warnings, 5 source primitives became 3, all are skinned "
                     "to 75 joints, and 105,456 float values are finite. Three WebGL views were accepted only as a static component; source and output have no actions.")
    candidate = {
        "id": COMPONENT_ID, "conversionCandidateId": COMPONENT_ID, "sourceId": SOURCE_ID, "sourceClass": SOURCE_CLASS,
        "selectionClass": "canonical-game", "nameZh": "超夢／Mewtwo", "originalName": "Mewtwo",
        "workZh": "任天堂明星大亂鬥 特別版（原作：寶可夢）", "sourceGame": "Super Smash Bros. Ultimate",
        "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch", "nativeId": "fighter/mewtwo/body/c00",
        "variant": "c00", "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture"], "absolutePath": str(final_root / "body.glb"),
        "path": str(final_root / "body.glb"), "bytes": 667840, "sha256": OUTPUT_SHA256,
        "gitPath": "content/assets/models/community/" + OUTPUT_SHA256 + ".glb", "componentReady": True,
        "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": ["ssbu-mewtwo"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "triangles": metrics["triangles"], "drawPrimitives": metrics["drawPrimitives"], "skinCount": 1,
        "jointCount": 75, "textureCount": metrics["textureCount"],
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
    require(source.get("heroIds") == [] and source.get("defaultEligible") is False, "SSBU reserve must remain unbound")
    backup = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == BACKUP_ID]
    if backup:
        require(len(backup) == 1 and backup[0].get("fullReadbackVerified") is True, "Mewtwo backup is not verified")
        archives = [row for row in load(repo / "materials/hero-model-library/public-source-files.json").get("sources", []) if row.get("id") == BACKUP_ID]
        require(len(archives) == 1 and archives[0].get("fullReadbackVerified") is True, "Mewtwo archive is missing")
        archive = archives[0]
        member = [row for row in archive.get("files", []) if row.get("path") == "body.glb"]
        require(len(member) == 1 and (member[0].get("sha256"), member[0].get("bytes")) == (OUTPUT_SHA256, 667840), "Mewtwo backup has wrong GLB")
        locator = {"s3Uri": archive["s3Uri"], "s3ArchiveMember": "body.glb", "s3Use": "backup-only-not-runtime-entry",
                   "backupReceiptPath": archive["receiptPath"], "backupReceiptSha256": archive["receiptSha256"]}
        candidate.update(backupStatus="s3-full-readback-verified", backupLocations=[locator], **locator)
    current = [row for row in source.setdefault("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    require(len(current) <= 1, "Duplicate Mewtwo component")
    if current:
        for key in ("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole"):
            require(current[0].get(key) == candidate[key], "Existing Mewtwo component differs: " + key)
        merged = dict(current[0]); merged.update(candidate); source["componentCandidates"][source["componentCandidates"].index(current[0])] = merged
        candidate = merged
    else:
        source["componentCandidates"].append(candidate)
    attempt = {"id": STAGE_ID, "status": candidate["readiness"], "localPath": str(final_root),
               "rebuildPath": str(rebuild_root), "reportPath": str(final_root / "normalization.json"),
               "reportSha256": sha_bytes((final_root / "normalization.json").read_bytes()), "outputPath": str(final_root / "body.glb"),
               "outputSha256": OUTPUT_SHA256, "nativeAnimationCount": 0, "componentId": COMPONENT_ID,
               "runtimeReady": False, "runtimeSelectable": False, "backupStatus": candidate["backupStatus"]}
    if backup: attempt.update(locator)
    attempts = [row for row in source.setdefault("conversionAttempts", []) if row.get("id") == STAGE_ID]
    require(len(attempts) <= 1, "Duplicate Mewtwo conversion attempt")
    if attempts:
        require(attempts[0].get("outputSha256") == OUTPUT_SHA256, "Existing Mewtwo output differs")
        merged = dict(attempts[0]); merged.update(attempt); source["conversionAttempts"][source["conversionAttempts"].index(attempts[0])] = merged
    else: source["conversionAttempts"].append(attempt)

    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-community.json"
    backlog = load(backlog_path)
    rows = [row for row in backlog.get("characters", []) if row.get("id") == "ssbu-mewtwo"]
    require(len(rows) == 1 and rows[0].get("mappedHeroIds") == [] and rows[0].get("designStatus") == "not-defined", "Mewtwo must remain unbound")
    row = rows[0]
    backlog_candidate = {"id": COMPONENT_ID, "sourceId": SOURCE_ID, "library": "community", "nativeId": "fighter/mewtwo/body/c00",
                         "path": str(final_root / "body.glb"), "gitPath": candidate["gitPath"], "existsLocal": True,
                         "bytes": candidate["bytes"], "sha256": candidate["sha256"], "format": "glTF Binary",
                         "resourceRole": candidate["resourceRole"], "readiness": candidate["readiness"], "converted": True,
                         "componentReady": True, "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
                         "runtimeSelectable": False, "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
                         "visualEvidence": candidate["visualEvidence"], "limitations": candidate["limitations"]}
    old = [item for item in row.setdefault("modelCandidates", []) if item.get("id") == COMPONENT_ID]
    require(len(old) <= 1, "Duplicate Mewtwo backlog component")
    if old:
        for key in ("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole"):
            require(old[0].get(key) == backlog_candidate[key], "Existing Mewtwo backlog differs: " + key)
        merged = dict(old[0]); merged.update(backlog_candidate); row["modelCandidates"][row["modelCandidates"].index(old[0])] = merged
    else: row["modelCandidates"].append(backlog_candidate)
    if evidence_note not in row.setdefault("evidence", []): row["evidence"].append(evidence_note)

    mutable = {downloads_path, backlog_path}
    writes = {downloads_path: encoded(downloads), backlog_path: encoded(backlog), repo / candidate["gitPath"]: (final_root / "body.glb").read_bytes()}
    for name, data in files.items(): writes[evidence_root / name] = data
    for target, data in writes.items():
        if target not in mutable: require(not target.exists() or target.read_bytes() == data, "Refusing to overwrite: " + str(target))
    return writes, mutable, candidate, evidence_root


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--final-root", type=Path, required=True)
    parser.add_argument("--rebuild-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    writes, mutable, candidate, evidence_root = prepare(Path.cwd(), args.final_root, args.rebuild_root)
    if args.write:
        for target, data in writes.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            if target in mutable or not target.exists(): target.write_bytes(data)
    else:
        for target, data in writes.items(): require(target.is_file() and target.read_bytes() == data, "Refresh Mewtwo integration: " + str(target))
    print(json.dumps({"componentId": candidate["id"], "sha256": candidate["sha256"],
                      "evidenceRoot": evidence_root.relative_to(Path.cwd()).as_posix(), "heroBindings": 0,
                      "nativeAnimations": 0, "runtimeSelectable": False, "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
