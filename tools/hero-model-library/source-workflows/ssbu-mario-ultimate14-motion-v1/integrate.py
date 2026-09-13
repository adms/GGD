#!/usr/bin/env python3
"""Admit the validated Mario body plus five Ultimate14 motions as one component."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "parallel-ns-ultimate14"
COMPONENT_ID = "ssbu-mario-c00-ultimate14-motion-v1"
ROLE = "independent-skinned-model-motion-component"
OUTPUT_SHA256 = "bdb557c348f155e1c931ce226c5a6bbb37aaefb68717df266ab1ed698ca2c526"
OUTPUT_BYTES = 1_148_100


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha(data)}


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def git_pin(path: str, data: bytes) -> dict:
    return {"gitPath": path, "bytes": len(data), "sha256": sha(data)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first-root", type=Path, required=True)
    parser.add_argument("--rebuild-root", type=Path, required=True)
    parser.add_argument("--visual-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    repo = Path.cwd().resolve()
    first = args.first_root.resolve()
    rebuild = args.rebuild_root.resolve()
    visual = args.visual_root.resolve()
    import1 = json.loads((first / "import-01/import-receipt.json").read_text())
    convert1 = json.loads((first / "converted-01/conversion.json").read_text())
    normalize1 = json.loads((first / "normalized-01/normalization.json").read_text())
    validation = json.loads((first / "normalized-01/validation.json").read_text())
    import2 = json.loads((rebuild / "import-02/import-receipt.json").read_text())
    convert2 = json.loads((rebuild / "converted-02/conversion.json").read_text())
    normalize2 = json.loads((rebuild / "normalized-02/normalization.json").read_text())
    proof = json.loads((visual / "proof.json").read_text())
    model = first / "normalized-01/component.glb"
    model2 = rebuild / "normalized-02/component.glb"

    require(pin(model)["sha256"] == pin(model2)["sha256"] == OUTPUT_SHA256, "Final GLB rebuild differs")
    require(pin(model)["bytes"] == pin(model2)["bytes"] == OUTPUT_BYTES, "Unexpected final GLB size")
    require(convert1["output"]["sha256"] == convert2["output"]["sha256"] == normalize1["source"]["sha256"],
            "Blender export is not byte-identical")
    require(normalize1["output"]["sha256"] == normalize2["output"]["sha256"] == OUTPUT_SHA256,
            "Material normalization is not deterministic")
    require(import1["source"]["sha256"] == import2["source"]["sha256"] ==
            "8af85d9accb3f13b2bc920553da2a9545cbdb980182bba15d59f23274a03c44d", "Changed Mario body source")
    require([row["sha256"] for row in import1["imports"]] == [row["sha256"] for row in import2["imports"]],
            "Changed Ultimate14 motion inputs")
    expected_names = ["d01specialairsdash", "d01specialairsend", "d01specialairsjump", "d01specialsdash", "d01specialsend"]
    require(sorted(row["action"] for row in import1["imports"]) == expected_names, "Unexpected imported motions")
    require(validation["structuralValidationPassed"] is True and validation["khronosIssues"]["numErrors"] == 0 and
            validation["khronosIssues"]["numWarnings"] == 0 and validation["ggdInspection"]["budget"]["errors"] == [],
            "Structural validation did not pass")
    require(len(validation["ggdInspection"]["clips"]) == 5 and
            all(row["channelCount"] == 294 and row["targetedJointCount"] == 98 for row in validation["animationChecks"]),
            "Motion tracks are incomplete")
    require(proof["schema"] == "ggd.ssbu-mario-ultimate14-motion-webgl@1" and
            len(proof["animationGroups"]) == len(proof["samples"]) // 3 == 5 and proof["skeletons"][0]["bones"] == 98,
            "WebGL playback proof is incomplete")
    screenshots = sorted(visual.glob("*.png"))
    require(len(screenshots) == 15 and all(path.stat().st_size > 50_000 for path in screenshots),
            "Expected 15 non-empty motion screenshots")

    tool_paths = [
        "tools/hero-model-library/source-workflows/ssbu-mario-ultimate14-motion-v1/integrate.py",
        "tools/hero-model-library/source-workflows/ssbu-mario-ultimate14-motion-v1/import_nuanmb_actions.py",
        "tools/hero-model-library/source-workflows/ssbu-mario-ultimate14-motion-v1/normalize_materials.py",
        "tools/hero-model-library/source-workflows/ssbu-mario-ultimate14-motion-v1/validate_motion_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-mario-ultimate14-motion-v1/render_motion_glb.py",
        "tools/hero-model-library/source-workflows/ssbu-mario-ultimate14-motion-v1/render_motion_glb.mjs",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py",
        "tools/w3x-import/repair_alpha_backdrops.py",
    ]
    tool_pins = [{"path": path, "sha256": sha((repo / path).read_bytes())} for path in tool_paths]
    gaps = [
        "Only five Ultimate14 community MOD body motions are present; idle, walk/run, normal attacks, hurt, death and the remaining gameplay action set are missing.",
        "The motions are native to the acquired Ultimate14 MOD package, not verified original Nintendo game animations and not procedural or retargeted animations.",
        "Visibility and material animation tracks remain in the original NUANMB sources and were not imported into this Transform-only body component.",
        "Mario has no GGD hero definition or skill mapping, so this independent component is not registered in a backend dropdown and cannot be selected at runtime.",
        "Source-game shader parity and semantic action-event mapping remain unverified; six draw primitives pass the hard budget but exceed the warning threshold of three.",
    ]
    rebuild_evidence = {
        "schema": "ggd.ssbu-mario-ultimate14-motion-source-rebuild@1",
        "componentId": COMPONENT_ID,
        "firstImport": pin(first / "import-01/import-receipt.json"),
        "secondImport": pin(rebuild / "import-02/import-receipt.json"),
        "intermediateBlendByteIdentical": import1["output"]["sha256"] == import2["output"]["sha256"],
        "intermediateBlendBytes": [import1["output"]["bytes"], import2["output"]["bytes"]],
        "firstBlenderGlb": pin(first / "converted-01/body.glb"),
        "secondBlenderGlb": pin(rebuild / "converted-02/body.glb"),
        "blenderGlbByteIdenticalRebuild": True,
        "firstFinalGlb": pin(model),
        "secondFinalGlb": pin(model2),
        "finalGlbByteIdenticalRebuild": True,
        "outputSha256": OUTPUT_SHA256,
        "note": "Blender save metadata makes the two intermediate .blend hashes differ; both Blender GLB exports and both normalized final GLBs are byte-identical.",
        "toolPins": tool_pins,
    }
    delivery = {
        "schema": "ggd.ssbu-mario-ultimate14-motion-delivery@1",
        "deliveryId": "ssbu-mario-ultimate14-motion-v1",
        "sourceIds": ["gitlab-ssbu-models", SOURCE_ID],
        "character": {"name": "Mario", "nameZh": "Mario／瑪利歐", "nativeId": "fighter/mario/body/c00", "variant": "c00",
                      "workZh": "任天堂明星大亂鬥 特別版（Ultimate14 社群 MOD）", "platform": "Nintendo Switch MOD"},
        "bodySource": import1["source"],
        "motionSources": import1["imports"],
        "dependency": import1["tool"],
        "output": pin(model),
        "metrics": {"triangles": 7189, "drawPrimitives": 6, "skinCount": 1, "jointCount": 98,
                    "textureCount": 5, "sourceNativeMotionCount": 5, "proceduralMotionCount": 0,
                    "retargetedMotionCount": 0, "animationChannelCountPerClip": 294},
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "ggdBudgetErrors": 0,
                       "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"],
                       "webglSamplesReviewed": 15, "visualPlaybackAccepted": True},
        "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
                   "completeGameplayActionSet": False, "completeHero": False, "heroBound": False,
                   "runtimeSelectable": False, "deployed": False},
        "toolPins": tool_pins,
        "gaps": gaps,
    }
    delivery_data = encoded(delivery)
    evidence_root = Path("materials/hero-model-library/priority-evidence/ssbu-mario-motion") / sha(delivery_data)
    files = {
        "delivery.json": delivery_data,
        "import-receipt.json": (first / "import-01/import-receipt.json").read_bytes(),
        "conversion.json": (first / "converted-01/conversion.json").read_bytes(),
        "normalization.json": (first / "normalized-01/normalization.json").read_bytes(),
        "validation.json": (first / "normalized-01/validation.json").read_bytes(),
        "webgl-proof.json": (visual / "proof.json").read_bytes(),
        "source-rebuild.json": encoded(rebuild_evidence),
    }
    for path in screenshots:
        files[path.name] = path.read_bytes()
    shot_pins = [git_pin((evidence_root / path.name).as_posix(), files[path.name]) for path in screenshots]
    visual_review = {
        "schema": "ggd.ssbu-mario-ultimate14-motion-visual-review@1",
        "componentId": COMPONENT_ID,
        "modelSha256": OUTPUT_SHA256,
        "accepted": True,
        "reviewedAt": "2026-09-12",
        "scope": ROLE,
        "reviewedSamples": [{"motion": row["group"], "sample": row["label"], "frame": row["frame"], "file": row["file"]}
                            for row in proof["samples"]],
        "findings": [
            "All five animation groups were rendered through Babylon WebGL at start, middle and end for 15 visible samples.",
            "The reviewed samples show the complete Mario body without detached limbs, collapsed skinning, transparent eye-card rectangles or non-finite deformation.",
            "Root-motion bounds are preserved; the front-axis review camera follows depth so dash middle/end samples remain visible.",
            "Visual acceptance applies only to this independent five-motion component and does not establish gameplay event mapping or complete hero readiness.",
        ],
        "screenshots": shot_pins,
        "runtimeSelectionVerified": False,
        "deploymentVerified": False,
    }
    files["visual-review.json"] = encoded(visual_review)
    acceptance = {
        "schema": "ggd.animated-component-acceptance@1",
        "acceptedAt": "2026-09-12",
        "components": [{"id": COMPONENT_ID, "sha256": OUTPUT_SHA256, "accepted": True, "scope": ROLE,
                        "completeGameplayActionSet": False, "reviewedMotionCount": 5, "reviewedSampleCount": 15,
                        "limitationsAccepted": gaps}],
    }
    files["acceptance.json"] = encoded(acceptance)

    def evidence(name: str) -> dict:
        return git_pin((evidence_root / name).as_posix(), files[name])

    note = ("Mario c00 combines the validated SSBU body with five distinct Transform motions from Ultimate14. "
            "All clips target 98 skin joints with 294 TRS channels, Khronos reports 0 errors/0 warnings, and 15 WebGL samples were visually accepted. "
            "The five motions are community-MOD-native and incomplete; no GGD hero ID, gameplay mapping, dropdown registration or deployment exists.")
    candidate = {
        "id": COMPONENT_ID,
        "sourceId": SOURCE_ID,
        "sourceIds": ["gitlab-ssbu-models", SOURCE_ID],
        "sourceClass": "community-mod",
        "selectionClass": "community-mod",
        "nameZh": "Mario／瑪利歐",
        "originalName": "Mario",
        "workZh": "任天堂明星大亂鬥 特別版（Ultimate14 社群 MOD）",
        "sourceGame": "Super Smash Bros. Ultimate",
        "sourceGameReleasedAt": "2018-12-07",
        "platform": "Nintendo Switch MOD",
        "nativeId": "fighter/mario/body/c00 + fighter/mario/motion/body/c00/d01special*",
        "variant": "c00",
        "resourceRole": ROLE,
        "assetKinds": ["model-component", "skeleton", "texture", "animation"],
        "absolutePath": str(model), "path": str(model), "bytes": OUTPUT_BYTES, "sha256": OUTPUT_SHA256,
        "gitPath": f"content/assets/models/community/{OUTPUT_SHA256}.glb",
        "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": ["ssbu-mario"], "nativeAnimationCount": 5, "proceduralAnimationCount": 0,
        "animationProvenance": "community-mod-native-not-original-game",
        "animationNames": expected_names,
        "triangles": 7189, "drawPrimitives": 6, "skinCount": 1, "jointCount": 98, "textureCount": 5,
        "sourceAnimationCount": 5, "unconvertedAnimationCount": 0,
        "readiness": "accepted-independent-native-motion-five-clips-incomplete-action-set",
        "auditEvidence": note, "limitations": gaps,
        "deliveryEvidence": evidence("delivery.json"), "acceptanceEvidence": evidence("acceptance.json"),
        "validationEvidence": evidence("validation.json"), "visualEvidence": evidence("visual-review.json"),
        "webglProofEvidence": evidence("webgl-proof.json"), "sourceRebuildEvidence": evidence("source-rebuild.json"),
        "backupStatus": "pending-s3-conversion-stage-backup",
    }
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    sources = [row for row in downloads["publicSources"] if row.get("id") == SOURCE_ID]
    require(len(sources) == 1, "Expected one Ultimate14 source")
    source = sources[0]
    if "sourceClass" in source:
        require(source["sourceClass"] == "community-mod", "Ultimate14 source classification differs")
    else:
        source["sourceClass"] = "community-mod"
    matches = [row for row in source.setdefault("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    require(len(matches) <= 1, "Duplicate Mario motion component")
    if matches:
        require(matches[0].get("sha256") == OUTPUT_SHA256, "Existing Mario motion component differs")
        verified_backup = {
            key: matches[0][key]
            for key in ("s3Uri", "s3ArchiveMember", "s3Use", "backupReceiptPath",
                        "backupReceiptSha256", "backupLocations")
            if key in matches[0]
        }
        merged = dict(matches[0]); merged.update(candidate); merged.update(verified_backup)
        if verified_backup.get("s3Uri"):
            merged["backupStatus"] = "s3-full-readback-verified"
        source["componentCandidates"][source["componentCandidates"].index(matches[0])] = merged
        candidate = merged
    else:
        source["componentCandidates"].append(candidate)

    mutable = {downloads_path}
    writes = {downloads_path: encoded(downloads), repo / candidate["gitPath"]: model.read_bytes()}
    for name, data in files.items():
        writes[repo / evidence_root / name] = data
    if args.write:
        for path, data in writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            if path in mutable or not path.exists():
                path.write_bytes(data)
            else:
                require(path.read_bytes() == data, "Refusing to overwrite different file: " + str(path))
    else:
        for path, data in writes.items():
            require(path.is_file() and path.read_bytes() == data, "Refresh Mario motion integration: " + str(path))
    print(json.dumps({"componentId": COMPONENT_ID, "sha256": OUTPUT_SHA256, "nativeMotions": 5,
                      "visualSamples": 15, "completeGameplayActionSet": False, "runtimeSelectable": False,
                      "evidenceRoot": evidence_root.as_posix(), "files": len(writes), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
