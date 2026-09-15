#!/usr/bin/env python3
"""Freeze the validated Sonic c00 + ten Ultimate14 motions as an independent component."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


COMPONENT_ID = "ssbu-sonic-c00-ultimate14-motion-v1"
SOURCE_ID = "parallel-ns-ultimate14"
ROLE = "independent-skinned-model-motion-component"


def require(value, message: str) -> None:
    if not value:
        raise ValueError(message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha(data)}


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def git_pin(path: Path, data: bytes) -> dict:
    return {"gitPath": path.as_posix(), "bytes": len(data), "sha256": sha(data)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--backup-receipt", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo = Path.cwd().resolve()
    workspace = args.workspace.resolve()
    local = workspace / "GGD-Asset-Library/conversions/ssbu-sonic-ultimate14-motion-v1"
    first, second, visual = local / "converted-01", local / "converted-02", local / "visual-01"
    model, rebuild_model = first / "body.glb", second / "body.glb"
    model_pin, rebuild_pin = pin(model), pin(rebuild_model)
    require(model_pin["sha256"] == rebuild_pin["sha256"] and model_pin["bytes"] == rebuild_pin["bytes"], "GLB rebuild differs")

    import1 = json.loads((local / "import-01/import-receipt.json").read_text())
    import2 = json.loads((local / "import-02/import-receipt.json").read_text())
    conversion1 = json.loads((first / "conversion.json").read_text())
    conversion2 = json.loads((second / "conversion.json").read_text())
    validation1 = json.loads((first / "motion-validation.json").read_text())
    validation2 = json.loads((second / "motion-validation.json").read_text())
    proof = json.loads((visual / "proof.json").read_text())
    backup = json.loads(args.backup_receipt.read_text())
    expected_names = sorted(row["action"] for row in import1["imports"])
    require(len(expected_names) == len(set(expected_names)) == 10, "Expected ten unique Sonic motions")
    require([row["sha256"] for row in import1["imports"]] == [row["sha256"] for row in import2["imports"]], "Motion inputs differ")
    require(conversion1["output"]["sha256"] == conversion2["output"]["sha256"] == model_pin["sha256"], "Conversion output differs")
    for validation in (validation1, validation2):
        require(validation["schema"] == "ggd-ssbu-ultimate14-motion-validation@1", "Unexpected validation schema")
        require(validation["structuralValidationPassed"] is True, "Structural validation failed")
        require(validation["khronosIssues"]["numErrors"] == validation["khronosIssues"]["numWarnings"] == 0, "Khronos validation failed")
        require(validation["ggdInspection"]["budget"]["errors"] == [], "GGD hard budget failed")
        require(len(validation["animationChecks"]) == 10 and all(row["channelCount"] == 345 for row in validation["animationChecks"]), "Animation channels differ")
    require(proof["schema"] == "ggd.ssbu-ultimate14-motion-webgl@1", "Unexpected WebGL proof")
    require(len(proof["animationGroups"]) == 10 and len(proof["samples"]) == 30, "WebGL sample set incomplete")
    require(proof["skeletons"] == [{"name": "model-armature", "bones": 115}], "WebGL skeleton differs")
    require(all(all(v == v and abs(v) != float("inf") for v in row["worldSkinnedBounds"][key])
                for row in proof["samples"] for key in ("min", "max", "extent")), "Non-finite WebGL bounds")
    screenshots = sorted(visual.glob("*.png"))
    require(len(screenshots) == 30 and all(path.stat().st_size > 25_000 for path in screenshots), "Motion screenshots incomplete")
    contact_sheet = visual / "contact-sheet.jpg"
    require(contact_sheet.stat().st_size > 100_000, "Contact sheet incomplete")
    require(backup["schema"] == "ggd-intake-backup-receipt@1" and backup["fileCount"] == 67, "Unexpected backup receipt")
    require(all(backup[key] is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged")), "S3 backup not fully verified")

    tool_paths = [
        "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/import_nuanmb_actions.py",
        "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/validate_motion_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/render_motion_glb.py",
        "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/render_motion_glb.mjs",
        "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/make_contact_sheet.py",
        "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/integrate_sonic.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py",
    ]
    tool_pins = [{"path": path, "sha256": sha((repo / path).read_bytes())} for path in tool_paths]
    gaps = [
        "The ten acquired Sonic motions are an incomplete gameplay set; idle, run, hurt, death and semantic GGD state mapping are still missing.",
        "These Transform motions are native to the acquired Ultimate14 community MOD package, not verified Nintendo-original animations and not retargeted animations.",
        "The source NUANMB visibility and material tracks were deliberately not imported into this Transform-only component.",
        "Sonic has no verified GGD hero definition in this integration, so no backend dropdown option, runtime switch or deployment is claimed.",
        "The model passes hard limits at 8,980 triangles and 256px textures; 5 draw primitives and 345 channels per clip exceed the 3/300 warning thresholds and require runtime load review before adoption.",
    ]
    delivery = {
        "schema": "ggd.ssbu-sonic-ultimate14-motion-delivery@1",
        "componentId": COMPONENT_ID,
        "character": {"nameZh": "Sonic／索尼克", "originalName": "Sonic", "nativeId": "fighter/sonic/body/c00", "variant": "c00", "workZh": "任天堂明星大亂鬥 特別版（Ultimate14 社群 MOD）", "platform": "Nintendo Switch MOD"},
        "sourceIds": ["gitlab-ssbu-models", SOURCE_ID],
        "bodySource": import1["source"],
        "motionSources": import1["imports"],
        "output": model_pin,
        "metrics": {"triangles": 8980, "drawPrimitives": 5, "skinCount": 1, "jointCount": 115, "textureCount": 5, "nativeMotionCount": 10, "animationChannelCountPerClip": 345},
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "ggdHardBudgetErrors": 0, "ggdWarnings": validation1["ggdInspection"]["budget"]["warnings"], "finiteFloatValuesChecked": validation1["finiteFloatAccessors"]["valueCount"], "webglSamplesReviewed": 30, "visualPlaybackAccepted": True},
        "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True, "completeGameplayActionSet": False, "completeHero": False, "heroBound": False, "runtimeSelectable": False, "deployed": False},
        "s3Backup": {"s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"], "archiveSha256": backup["archiveSha256"], "archiveBytes": backup["archiveBytes"], "fileCount": backup["fileCount"], "fullReadbackVerified": True},
        "toolPins": tool_pins,
        "gaps": gaps,
    }
    evidence_root = Path("materials/hero-model-library/priority-evidence/ssbu-sonic-ultimate14-motion-v1")
    rebuild = {
        "schema": "ggd.ssbu-sonic-ultimate14-motion-source-rebuild@1", "componentId": COMPONENT_ID,
        "firstImport": pin(local / "import-01/import-receipt.json"), "secondImport": pin(local / "import-02/import-receipt.json"),
        "intermediateBlendByteIdentical": import1["output"]["sha256"] == import2["output"]["sha256"],
        "firstGlb": model_pin, "secondGlb": rebuild_pin, "finalGlbByteIdenticalRebuild": True,
        "outputSha256": model_pin["sha256"], "toolPins": tool_pins,
        "note": "Blender save metadata makes intermediate .blend hashes differ; the two exported GLBs are byte-identical.",
    }
    visual_review = {
        "schema": "ggd.ssbu-sonic-ultimate14-motion-visual-review@1", "componentId": COMPONENT_ID,
        "accepted": True, "reviewedAt": "2026-09-14", "scope": ROLE,
        "reviewedSamples": [{"motion": row["group"], "sample": row["label"], "frame": row["frame"], "file": row["file"]} for row in proof["samples"]],
        "findings": ["Babylon WebGL rendered all ten clips at start, middle and end for 30 visible samples.", "The sampled native spin and attack poses retain the complete body and finite skinned bounds without an opaque atlas rectangle.", "Visual acceptance is limited to this independent component and does not approve GGD event mapping or runtime load."],
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    }
    acceptance = {"schema": "ggd.animated-component-acceptance@1", "acceptedAt": "2026-09-14", "components": [{"id": COMPONENT_ID, "sha256": model_pin["sha256"], "accepted": True, "scope": ROLE, "completeGameplayActionSet": False, "reviewedMotionCount": 10, "reviewedSampleCount": 30, "limitationsAccepted": gaps}]}
    files = {
        "delivery.json": encoded(delivery), "import-receipt.json": (local / "import-01/import-receipt.json").read_bytes(),
        "conversion.json": (first / "conversion.json").read_bytes(), "validation.json": (first / "motion-validation.json").read_bytes(),
        "webgl-proof.json": (visual / "proof.json").read_bytes(), "source-rebuild.json": encoded(rebuild),
        "visual-review.json": encoded(visual_review), "acceptance.json": encoded(acceptance), "contact-sheet.jpg": contact_sheet.read_bytes(),
        "s3-backup-receipt.json": encoded(backup),
    }
    for path in screenshots:
        files[path.name] = path.read_bytes()

    def evidence(name: str) -> dict:
        return git_pin(evidence_root / name, files[name])

    candidate = {
        "id": COMPONENT_ID, "sourceId": SOURCE_ID, "sourceIds": ["gitlab-ssbu-models", SOURCE_ID],
        "sourceClass": "community-mod", "selectionClass": "community-mod", "nameZh": "Sonic／索尼克", "originalName": "Sonic",
        "workZh": "任天堂明星大亂鬥 特別版（Ultimate14 社群 MOD）", "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch MOD",
        "nativeId": "fighter/sonic/body/c00 + fighter/sonic/motion/body/c00", "variant": "c00", "resourceRole": ROLE,
        "assetKinds": ["model-component", "skeleton", "texture", "animation"], "absolutePath": str(model), "path": str(model),
        "bytes": model_pin["bytes"], "sha256": model_pin["sha256"], "gitPath": f"content/assets/models/community/{model_pin['sha256']}.glb",
        "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False, "fullHeroModel": False, "runtimeDropdownRegistered": False,
        "heroIds": [], "relatedHeroIds": [], "identityIds": ["ssbu-sonic"], "nativeAnimationCount": 10, "proceduralAnimationCount": 0,
        "animationProvenance": "community-mod-native-not-original-game", "animationNames": expected_names, "animationChannelCountPerClip": 345,
        "triangles": 8980, "drawPrimitives": 5, "skinCount": 1, "jointCount": 115, "textureCount": 5,
        "sourceAnimationCount": 10, "unconvertedAnimationCount": 0, "readiness": "accepted-independent-native-motion-ten-clips-incomplete-action-set",
        "auditEvidence": "Sonic c00 plus ten pinned Ultimate14 Transform motions; byte-identical dual GLB export, Khronos 0/0, GGD hard errors 0 and 30 WebGL samples accepted.", "limitations": gaps,
        "deliveryEvidence": evidence("delivery.json"), "acceptanceEvidence": evidence("acceptance.json"), "validationEvidence": evidence("validation.json"),
        "visualEvidence": evidence("visual-review.json"), "webglProofEvidence": evidence("webgl-proof.json"), "sourceRebuildEvidence": evidence("source-rebuild.json"),
        "s3Uri": backup["s3Uri"], "s3ArchiveMember": "converted-01/body.glb", "s3Use": "backup-only-not-runtime-entry",
        "backupReceiptPath": str(args.backup_receipt.resolve()), "backupReceiptSha256": sha(args.backup_receipt.read_bytes()), "backupStatus": "s3-full-readback-verified",
    }
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    sources = [row for row in downloads["publicSources"] if row.get("id") == SOURCE_ID]
    require(len(sources) == 1, "Expected one Ultimate14 source")
    source = sources[0]
    matches = [row for row in source.setdefault("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    require(len(matches) <= 1, "Duplicate Sonic component")
    if matches:
        require(matches[0]["sha256"] == candidate["sha256"], "Existing Sonic component differs")
        source["componentCandidates"][source["componentCandidates"].index(matches[0])] = candidate
    else:
        source["componentCandidates"].append(candidate)
    source["nativeMotionIndex"]["convertedToGgdCount"] = sum(row.get("nativeAnimationCount", 0) for row in source["componentCandidates"] if row.get("converted") is True)
    source["nativeMotionIndex"]["runtimeSelectableCount"] = sum(row.get("nativeAnimationCount", 0) for row in source["componentCandidates"] if row.get("runtimeSelectable") is True)
    source["readiness"] = "partially-standardized-independent-components-pending-semantic-mapping"
    supplemental = {
        "id": COMPONENT_ID + "-backup", "sourceId": SOURCE_ID, "resourceRole": "model-conversion-backup", "localPath": str(local.relative_to(workspace)),
        "localArchive": backup["localArchive"], "readbackPath": backup["readback"], "s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"],
        "bytes": backup["archiveBytes"], "sha256": backup["archiveSha256"], "fileCount": backup["fileCount"], "archiveFormat": "tar-gzip",
        "readbackVerified": True, "fullReadbackVerified": True, "s3ReadbackVerified": True, "localPreserved": True,
        "snapshotScope": "manifest-listed-files-only", "unlistedLocalFiles": "not-enumerated-or-claimed-backed-up", "receiptPath": str(args.backup_receipt.resolve()),
        "receiptSha256": sha(args.backup_receipt.read_bytes()), "s3Use": "backup-only-not-runtime-entry",
    }
    deliveries = source.setdefault("supplementalDeliveries", [])
    deliveries[:] = [row for row in deliveries if row.get("id") != supplemental["id"]] + [supplemental]
    writes = {downloads_path: encoded(downloads), repo / candidate["gitPath"]: model.read_bytes()}
    writes.update({repo / evidence_root / name: data for name, data in files.items()})
    if args.write:
        for path, data in writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists() and path != downloads_path:
                require(path.read_bytes() == data, "Refusing to overwrite changed file: " + str(path))
            path.write_bytes(data)
    else:
        for path, data in writes.items():
            require(path.is_file() and path.read_bytes() == data, "Refresh Sonic integration: " + str(path))
    print(json.dumps({"componentId": COMPONENT_ID, "sha256": model_pin["sha256"], "nativeMotions": 10, "visualSamples": 30, "runtimeSelectable": False, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
