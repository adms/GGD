#!/usr/bin/env python3
"""Admit the validated SSBU fighter/ryu c00 body as a static component."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from skinned_components import require


SOURCE_ID = "gitlab-ssbu-models"
SOURCE_CLASS = "original-game-extraction-community-repackage"
COMPONENT_ID = "ssbu-ryu-c00-static-skinned-v1"
STAGE_ID = "ssbu-ryu-c00-blender4513-v3"
BACKUP_ID = STAGE_ID + "-backup"
REJECTED_BACKUP_ID = "ssbu-ryu-c00-blender4513-v1-rejected"
FAILED_BACKUP_ID = "ssbu-ryu-c00-blender4513-v2-failed"
SOURCE_SHA256 = "5fb1670818167a6728afe1664c80e6ab7fd50ea064ae6302991fdc18a4e62042"
BLENDER_SHA256 = "d53057c01574141daf7cb017273e3d70e217376a59965150f8b98ad4891b9482"
OUTPUT_SHA256 = "57567f89b05498968977b9fde7a86aaf40dfb6a25b5e874ca393b13a85c4a8b6"
DERIVED_TEXTURES = {
    "alp_ryu_002_col.png.ggd-256.png": "c34e9aad17f7f524314dad9bdbefdb43b04ff7fcde4126c176e4a993960c7e87",
    "def_ryu_002_col.png.ggd-256.png": "803b2cc06511983e59c652edaf39ac157b503d6506c09202b032014f5fb2fee0",
    "skin_ryu_002_col.png.ggd-256.png": "116adc0b62f22c1453fc417ef7dec705ef079721f69248ad7f07bc8c1e4c61dc",
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

    require(blender.get("schema") == "ggd-ssbu-blend-component-conversion@1", "Unexpected Ryu Blender receipt")
    require(conversion.get("schema") == "ggd-ssbu-static-component-normalization@1", "Unexpected Ryu normalization receipt")
    require(blender.get("candidateId") == COMPONENT_ID == conversion.get("candidateId"), "Wrong Ryu candidate")
    require(blender.get("sourceId") == SOURCE_ID and conversion.get("sourceId") == SOURCE_ID, "Wrong Ryu source")
    require(blender.get("input", {}).get("sha256") == SOURCE_SHA256, "Changed Ryu source")
    require(blender.get("output", {}).get("sha256") == BLENDER_SHA256, "Changed Ryu Blender export")
    require(conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Changed Ryu normalized GLB")
    require(pin(final_root / "blender-export.glb")["sha256"] == BLENDER_SHA256, "Final Blender export differs")
    require(pin(rebuild_root / "blender-export.glb")["sha256"] == BLENDER_SHA256, "Rebuilt Blender export differs")
    require(pin(final_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Final Ryu GLB differs")
    require(pin(rebuild_root / "body.glb")["sha256"] == OUTPUT_SHA256, "Ryu rebuild differs")
    for name, expected in DERIVED_TEXTURES.items():
        require(pin(final_root / "derived-textures" / name)["sha256"] == expected, "Changed derived texture: " + name)
        require(pin(rebuild_root / "derived-textures" / name)["sha256"] == expected, "Changed rebuilt texture: " + name)

    require(len(analysis.get("visibleMeshes", [])) == 11, "Unexpected visible Ryu mesh count")
    require(len(analysis.get("hiddenOrNonrenderMeshes", [])) == 38, "Unexpected hidden Ryu mesh count")
    require(analysis.get("armatures", [{}])[0].get("bones") == 154, "Unexpected Ryu skeleton")
    require(analysis.get("actions") == [], "Ryu source unexpectedly contains actions")
    require(len(analysis.get("usedImages", [])) == 6, "Unexpected used Ryu image count")
    require(len(analysis.get("materialJoinAdjustments", [])) == 3, "Unexpected Ryu material join groups")
    require(blender.get("tool", {}).get("visibleMeshesJoinedByMaterial") is True, "Ryu material joins were not enabled")
    for checked in (validation, rebuild_validation):
        require(checked.get("structuralValidationPassed") is True, "Ryu structural validation failed")
        require(checked.get("finiteFloatAccessors", {}).get("passed") is True, "Ryu has non-finite accessors")
        require(checked.get("khronosIssues", {}).get("numErrors") == 0, "Ryu Khronos errors")
        require(checked.get("khronosIssues", {}).get("numWarnings") == 0, "Ryu Khronos warnings")
        require(checked.get("ggdInspection", {}).get("budget", {}).get("errors") == [], "Ryu budget errors")
        require(checked.get("ggdInspection", {}).get("clipCount") == 0, "Ryu unexpectedly contains clips")
    require(rebuild_blender.get("output", {}).get("sha256") == BLENDER_SHA256, "Ryu raw rebuild differs")
    require(rebuild_conversion.get("output", {}).get("sha256") == OUTPUT_SHA256, "Ryu normalized rebuild differs")
    require(webgl.get("schema") == "ggd.ssbu-static-webgl@1", "Unexpected Ryu WebGL proof")
    require(webgl.get("animationGroups") == 0 and webgl.get("skeletons") == 1, "Unexpected Ryu WebGL rig")
    require(len(webgl.get("geometry", [])) == 5, "Incomplete Ryu WebGL geometry")
    require(all(row.get("bones") == 154 and row.get("gpuSkinning") is True for row in webgl["geometry"]), "Ryu GPU skinning incomplete")
    require(webgl.get("worldSkinnedBounds", {}).get("extent", [None, None])[1] > 1.79, "Unexpected Ryu height")
    source_path = Path(blender["input"]["path"])
    variant_sources = []
    for index in range(8):
        variant = f"c{index:02d}"
        path = source_path.parents[1] / variant / f"ryu-{variant}.blend"
        pinned = pin(path)
        require((pinned["bytes"], pinned["sha256"]) == (9508448, SOURCE_SHA256), "Changed Ryu source variant: " + variant)
        variant_sources.append({"variant": variant, **pinned})

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
        "No GGD hero definition or skill binding exists for this exact Ryu identity.",
        "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
        "Original SSBU shader parity is incomplete; normal, PRM and game-specific shader behavior were not reconstructed.",
        "Thirty-eight hidden costume, facial and expression mesh variants remain in the original Blender source and were excluded from the visible c00 appearance.",
        "Blender emitted NumPy transform warnings; both validations checked all exported float values as finite and Babylon WebGL rendered the body intact.",
    ]
    delivery = {
        "schema": "ggd.ssbu-ryu-component-delivery@1", "deliveryId": STAGE_ID,
        "sourceId": SOURCE_ID, "sourceCommit": "df76879171b064570b4e49a608c9f98211b33edb",
        "character": {"name": "Ryu", "nameZh": "隆", "nativeId": "fighter/ryu/body/c00", "variant": "c00",
                      "sourceGame": "Super Smash Bros. Ultimate", "originalSeries": "Street Fighter"},
        "source": pin(source_path), "sourceVariants": variant_sources,
        "variantRelationship": "c00-c07 paths are retained; all eight files are byte-identical and share this one conversion",
        "finalRoot": str(final_root), "rebuildRoot": str(rebuild_root),
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
    evidence_root = repo / "materials/hero-model-library/priority-evidence/ssbu-ryu" / sha_bytes(delivery_data)
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
        "findings": ["Front, back and isometric renders show the complete visible Ryu head, eyes, torso, arms, hands, legs, feet, gi, belt and headband.",
                     "No detached body part, missing primary material, opaque facial card or obvious bind-pose collapse is visible.",
                     "Review covers the static bind pose only because source and output contain no clips."],
        "shots": shots, "webglProof": evidence("webgl-proof.json"),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    files["source-fidelity.json"] = encoded({
        "schema": "ggd.ssbu-ryu-source-fidelity@1", "sourceId": SOURCE_ID, "componentId": COMPONENT_ID,
        "sourceSha256": SOURCE_SHA256, "blenderExportSha256": BLENDER_SHA256, "outputSha256": OUTPUT_SHA256,
        "sourceBytesUnchanged": blender["sourceBytesUnchanged"], "visibleMeshCount": len(analysis["visibleMeshes"]),
        "sourceVisiblePolygonCount": sum(row["polygons"] for row in analysis["visibleMeshes"]),
        "sourceVisibleMeshCount": 11, "blenderPrimitiveCount": 5, "outputPrimitiveCount": metrics["drawPrimitives"],
        "outputTriangleCount": metrics["triangles"], "sourceBoneCount": 154, "outputJointCount": metrics["joints"][0],
        "materialJoinGroups": analysis["materialJoinAdjustments"],
        "sourceActionCount": 0, "outputClipCount": 0, "usedSourceImageCount": len(analysis["usedImages"]),
        "embeddedOutputImageCount": metrics["textureCount"], "excludedNativeParts": analysis["hiddenOrNonrenderMeshes"],
        "shaderParityVerified": False, "sourceAnalysis": evidence("source-analysis.json"), "conversionReceipt": evidence("conversion.json"),
    })
    files["source-rebuild.json"] = encoded({
        "schema": "ggd.ssbu-ryu-source-rebuild@1", "componentId": COMPONENT_ID,
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

    evidence_note = ("SSBU fighter/ryu c00 was converted with Blender 4.5.13 and GGD normalization to a 1,005,688-byte GLB. "
                     "Two builds are byte-identical; Khronos has zero errors/warnings, 11 visible source meshes were consolidated only within matching materials to 5 primitives, all are skinned "
                     "to 154 joints, and 117,948 float values are finite. Three WebGL views were accepted only as a static component; source and output have no actions.")
    candidate = {
        "id": COMPONENT_ID, "conversionCandidateId": COMPONENT_ID, "sourceId": SOURCE_ID, "sourceClass": SOURCE_CLASS,
        "selectionClass": "canonical-game", "nameZh": "隆／Ryu", "originalName": "Ryu",
        "workZh": "任天堂明星大亂鬥 特別版（原作：Street Fighter）", "sourceGame": "Super Smash Bros. Ultimate",
        "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch", "nativeId": "fighter/ryu/body/c00",
        "variant": "c00", "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture"], "absolutePath": str(final_root / "body.glb"),
        "path": str(final_root / "body.glb"), "bytes": 1005688, "sha256": OUTPUT_SHA256,
        "gitPath": "content/assets/models/community/" + OUTPUT_SHA256 + ".glb", "componentReady": True,
        "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": ["ssbu-ryu"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "triangles": metrics["triangles"], "drawPrimitives": metrics["drawPrimitives"], "skinCount": 1,
        "jointCount": 154, "textureCount": metrics["textureCount"],
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
    archive_index = load(repo / "materials/hero-model-library/public-source-files.json")
    def verified_backup(backup_id: str) -> dict:
        links = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == backup_id]
        require(len(links) == 1 and links[0].get("fullReadbackVerified") is True, "Ryu backup is not verified: " + backup_id)
        archives = [row for row in archive_index.get("sources", []) if row.get("id") == backup_id]
        require(len(archives) == 1 and archives[0].get("fullReadbackVerified") is True, "Ryu archive is missing: " + backup_id)
        return archives[0]
    archive = verified_backup(BACKUP_ID)
    rejected_archive = verified_backup(REJECTED_BACKUP_ID)
    failed_archive = verified_backup(FAILED_BACKUP_ID)
    member = [row for row in archive.get("files", []) if row.get("path") == "body.glb"]
    require(len(member) == 1 and (member[0].get("sha256"), member[0].get("bytes")) == (OUTPUT_SHA256, 1005688), "Ryu backup has wrong GLB")
    locator = {"s3Uri": archive["s3Uri"], "s3ArchiveMember": "body.glb", "s3Use": "backup-only-not-runtime-entry",
               "backupReceiptPath": archive["receiptPath"], "backupReceiptSha256": archive["receiptSha256"]}
    candidate.update(backupStatus="s3-full-readback-verified", backupLocations=[locator], **locator)
    current = [row for row in source.setdefault("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    require(len(current) <= 1, "Duplicate Ryu component")
    if current:
        for key in ("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole"):
            require(current[0].get(key) == candidate[key], "Existing Ryu component differs: " + key)
        merged = dict(current[0]); merged.update(candidate); source["componentCandidates"][source["componentCandidates"].index(current[0])] = merged
        candidate = merged
    else:
        source["componentCandidates"].append(candidate)
    attempt = {"id": STAGE_ID, "status": candidate["readiness"], "localPath": str(final_root),
               "rebuildPath": str(rebuild_root), "reportPath": str(final_root / "normalization.json"),
               "reportSha256": sha_bytes((final_root / "normalization.json").read_bytes()), "outputPath": str(final_root / "body.glb"),
               "outputSha256": OUTPUT_SHA256, "nativeAnimationCount": 0, "componentId": COMPONENT_ID,
               "runtimeReady": False, "runtimeSelectable": False, "backupStatus": candidate["backupStatus"]}
    attempt.update(locator)
    history = [
        {"id": "ssbu-ryu-c00-blender4513-v1", "status": "rejected-ggd-draw-primitive-budget",
         "localPath": str(final_root.with_name("ssbu-ryu-c00-blender4513-v1")), "outputSha256": "af1f8dba6cbc64c933da609a9c1e586cc3435792f2c367f44e6dbcf8d66cd44c",
         "drawPrimitives": 11, "budgetErrors": ["繪製網格 11 超過英雄模型上限 6。"], "accepted": False,
         "s3Uri": rejected_archive["s3Uri"], "s3ArchiveMember": "blender-export.glb", "s3Use": "backup-only-not-runtime-entry",
         "backupReceiptPath": rejected_archive["receiptPath"], "backupReceiptSha256": rejected_archive["receiptSha256"]},
        {"id": "ssbu-ryu-c00-blender4513-v2", "status": "converter-failed-after-glb-before-receipts",
         "localPath": str(final_root.with_name("ssbu-ryu-c00-blender4513-v2")), "accepted": False,
         "structuralValidationPerformed": False, "visualValidationPerformed": False,
         "error": "StructRNA of type Object has been removed while enumerating joined source objects",
         "s3Uri": failed_archive["s3Uri"], "s3ArchiveMember": "failure.json", "s3Use": "backup-only-not-runtime-entry",
         "backupReceiptPath": failed_archive["receiptPath"], "backupReceiptSha256": failed_archive["receiptSha256"]},
    ]
    all_attempts = source.setdefault("conversionAttempts", [])
    for historical in history:
        prior = [row for row in all_attempts if row.get("id") == historical["id"]]
        require(len(prior) <= 1, "Duplicate Ryu historical attempt")
        if prior:
            merged = dict(prior[0]); merged.update(historical); all_attempts[all_attempts.index(prior[0])] = merged
        else:
            all_attempts.append(historical)
    attempts = [row for row in all_attempts if row.get("id") == STAGE_ID]
    require(len(attempts) <= 1, "Duplicate Ryu conversion attempt")
    if attempts:
        require(attempts[0].get("outputSha256") == OUTPUT_SHA256, "Existing Ryu output differs")
        merged = dict(attempts[0]); merged.update(attempt); source["conversionAttempts"][source["conversionAttempts"].index(attempts[0])] = merged
    else: all_attempts.append(attempt)

    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-community.json"
    backlog = load(backlog_path)
    rows = [row for row in backlog.get("characters", []) if row.get("id") == "ssbu-ryu"]
    require(len(rows) == 1 and rows[0].get("mappedHeroIds") == [] and rows[0].get("designStatus") == "not-defined", "Ryu must remain unbound")
    row = rows[0]
    backlog_candidate = {"id": COMPONENT_ID, "sourceId": SOURCE_ID, "library": "community", "nativeId": "fighter/ryu/body/c00",
                         "path": str(final_root / "body.glb"), "gitPath": candidate["gitPath"], "existsLocal": True,
                         "bytes": candidate["bytes"], "sha256": candidate["sha256"], "format": "glTF Binary",
                         "resourceRole": candidate["resourceRole"], "readiness": candidate["readiness"], "converted": True,
                         "componentReady": True, "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
                         "runtimeSelectable": False, "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
                         "visualEvidence": candidate["visualEvidence"], "limitations": candidate["limitations"]}
    old = [item for item in row.setdefault("modelCandidates", []) if item.get("id") == COMPONENT_ID]
    require(len(old) <= 1, "Duplicate Ryu backlog component")
    if old:
        for key in ("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole"):
            require(old[0].get(key) == backlog_candidate[key], "Existing Ryu backlog differs: " + key)
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
        for target, data in writes.items(): require(target.is_file() and target.read_bytes() == data, "Refresh Ryu integration: " + str(target))
    print(json.dumps({"componentId": candidate["id"], "sha256": candidate["sha256"],
                      "evidenceRoot": evidence_root.relative_to(Path.cwd()).as_posix(), "heroBindings": 0,
                      "nativeAnimations": 0, "runtimeSelectable": False, "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
