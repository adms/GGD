#!/usr/bin/env python3
"""Admit validated Re:Zero Ram and Beatrice static skinned components."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from skinned_components import require


SOURCE_ID = "thunderstore-rezero"
BACKUP_ID = "rezero-ram-beatrice-thunderstore-0.1.1-v1-backup"
SOURCE_BUNDLE_SHA256 = "3134f5564701006542038ffe2aacdf98cef42cc30df1a0c796afec04c3e9ef88"
SOURCE_ARCHIVE_SHA256 = "e846f2bf183ae9234c9ab675debfe62025e08e3aa2d8fa6871573185f9164a27"
CONFIGS = (
    {
        "key": "ram", "name": "Ram", "nameZh": "拉姆", "nativeId": "ramPrefab",
        "componentId": "rezero-ram-thunderstore-0.1.1-static-skinned-v1",
        "sourceConversionSha256": "4750cee3eb4d38330cf83552e764d7cefdb7c04ee64c0be1cbae549283ac27e3",
        "outputSha256": "333c43b9a8a1cbaa8871072df7eec1a41307fcb1aa27af5aab63203e81221e3b",
        "outputBytes": 1180240, "triangles": 18454, "joints": 166,
        "textureSha256": "6434ca07390b3730d46405c65cc0353896c58f068031021d7322a07773bf1352",
        "finiteFloatValues": 185692,
    },
    {
        "key": "beatrice", "name": "Beatrice", "nameZh": "碧翠絲", "nativeId": "beatricePrefab",
        "componentId": "rezero-beatrice-thunderstore-0.1.1-static-skinned-v1",
        "sourceConversionSha256": "cb0ad079f60ff8c0db0a7c77e0388c4f14821f8e82041e727e9629442c1a052b",
        "outputSha256": "4ddaa0fcc4362b8caef122aebeddd349404306693bfe5ae4222cced08830e34c",
        "outputBytes": 1246640, "triangles": 20932, "joints": 228,
        "textureSha256": "203a5419ae2efee58e6ffd803edd2b845f4c8e8f740d45de770a78ea8c1e84be",
        "finiteFloatValues": 188460,
    },
)


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha_bytes(data)}


def git_pin(path: Path, data: bytes, repo: Path) -> dict:
    return {"gitPath": path.relative_to(repo).as_posix(), "bytes": len(data), "sha256": sha_bytes(data)}


def load(path: Path) -> dict:
    return json.loads(path.read_text())


def upsert(rows: list[dict], item: dict, label: str,
           immutable=("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole")) -> dict:
    matches = [row for row in rows if row.get("id") == item["id"]]
    require(len(matches) <= 1, "Duplicate " + label)
    if not matches:
        rows.append(item)
        return item
    current = matches[0]
    for key in immutable:
        if key in item:
            require(current.get(key) == item[key], f"Existing {label} differs: {key}")
    merged = dict(current)
    merged.update(item)
    rows[rows.index(current)] = merged
    return merged


def prepare_component(repo: Path, final_root: Path, rebuild_root: Path, config: dict,
                      source: dict, backlog_row: dict, archive: dict,
                      rebuild_receipt: dict) -> tuple[dict[Path, bytes], dict, Path]:
    component_id = config["componentId"]
    conversion = load(final_root.parents[1] / "source-conversion" / config["key"] / "conversion.json")
    normalization = load(final_root / "normalization.json")
    validation = load(final_root / "validation/structural.json")
    webgl = load(final_root / "render-v1/proof.json")
    replay = next(row for row in rebuild_receipt["components"] if row["character"] == config["key"])

    require(conversion.get("schema") == "ggd-unity-prefab-conversion@1", "Unexpected Unity conversion receipt")
    require(conversion.get("source", {}).get("sha256") == SOURCE_BUNDLE_SHA256, "Changed Re:Zero bundle")
    require(conversion.get("rootName") == config["nativeId"], "Wrong Re:Zero prefab root")
    require(conversion.get("sourceUpAxis") == "z", "Re:Zero source must be interpreted as Z-up")
    require(conversion.get("sourceAnimationClips") == 0 and conversion["output"]["animations"] == 0,
            "Re:Zero source unexpectedly contains AnimationClip output")
    require(conversion["output"]["sha256"] == config["sourceConversionSha256"], "Changed source conversion")
    require(normalization.get("candidateId") == component_id, "Wrong Re:Zero candidate")
    require(normalization.get("output", {}).get("sha256") == config["outputSha256"], "Changed normalized GLB")
    require((pin(final_root / "body.glb")["bytes"], pin(final_root / "body.glb")["sha256"]) ==
            (config["outputBytes"], config["outputSha256"]), "Changed final Re:Zero GLB")
    require(replay["sourceConversion"]["byteIdentical"] is True and
            replay["normalized"]["byteIdentical"] is True and
            replay["normalized"]["sha256"] == config["outputSha256"], "Re:Zero replay differs")
    require(validation.get("structuralValidationPassed") is True, "Re:Zero structural validation failed")
    require(validation.get("finiteFloatAccessors", {}).get("passed") is True and
            validation["finiteFloatAccessors"]["valueCount"] == config["finiteFloatValues"],
            "Re:Zero finite-float validation failed")
    require(validation.get("khronosIssues", {}).get("numErrors") == 0 and
            validation.get("khronosIssues", {}).get("numWarnings") == 0, "Re:Zero Khronos validation failed")
    metrics = validation["ggdInspection"]
    require(metrics["budget"]["errors"] == [] and metrics["clipCount"] == 0, "Re:Zero GGD budget or clip mismatch")
    require((metrics["triangles"], metrics["drawPrimitives"], metrics["skinCount"], metrics["joints"][0]) ==
            (config["triangles"], 1, 1, config["joints"]), "Unexpected Re:Zero geometry metrics")
    require(metrics["textures"][0]["sha256"] == config["textureSha256"], "Changed Re:Zero texture")
    require(webgl.get("animationGroups") == 0 and webgl.get("skeletons") == 1, "Unexpected WebGL rig")
    require(len(webgl.get("geometry", [])) == 1 and webgl["geometry"][0].get("gpuSkinning") is True,
            "Re:Zero GPU skinning not proven")
    require(webgl.get("worldSkinnedBounds", {}).get("extent", [0, 0])[1] > 1.79, "Unexpected Re:Zero height")
    for tool in rebuild_receipt["toolPins"]:
        require(sha(repo / tool["path"]) == tool["sha256"], "Pinned Re:Zero tool changed: " + tool["path"])

    member_path = f"conversion/final/{config['key']}/body.glb"
    member = [row for row in archive["files"] if row["path"] == member_path]
    require(len(member) == 1 and (member[0]["sha256"], member[0]["bytes"]) ==
            (config["outputSha256"], config["outputBytes"]), "S3 archive does not contain final Re:Zero GLB")
    locator = {
        "s3Uri": archive["s3Uri"], "s3ArchiveMember": member_path,
        "s3Use": "backup-only-not-runtime-entry", "backupReceiptPath": archive["receiptPath"],
        "backupReceiptSha256": archive["receiptSha256"],
    }
    gaps = [
        "Source Unity bundle contains zero AnimationClip objects; idle, run, attack, cast, hurt and death actions remain missing.",
        "No GGD hero definition or skill binding exists for this exact identity.",
        "No VFX, sound effect, dialogue or voice asset for this character was accepted from this source.",
        "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
        "Unity custom shader behavior is represented only by a portable base-color PBR material.",
        "Triangle count is above the 16,000 advisory threshold but below the 28,000 hard limit.",
    ]
    delivery = {
        "schema": "ggd.rezero-static-component-delivery@1", "deliveryId": component_id,
        "sourceId": SOURCE_ID, "sourceVersion": "0.1.1",
        "character": {"name": config["name"], "nameZh": config["nameZh"],
                      "nativeId": config["nativeId"], "sourceWork": "Re:Zero",
                      "sourcePlatform": "PC Lethal Company community mod / Unity bundle"},
        "sourceArchiveSha256": SOURCE_ARCHIVE_SHA256, "sourceBundle": conversion["source"],
        "sourceConversion": pin(final_root.parents[1] / "source-conversion" / config["key"] / "body.glb"),
        "output": pin(final_root / "body.glb"), "finalRoot": str(final_root),
        "rebuildRoot": str(rebuild_root), "rebuildReceipt": pin(Path(rebuild_receipt["outputRoot"]) / "rebuild.json"),
        "metrics": {"triangles": config["triangles"], "drawPrimitives": 1, "skinCount": 1,
                    "jointCount": config["joints"], "textureCount": 1,
                    "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
                    "worldHeightMeters": webgl["worldSkinnedBounds"]["extent"][1]},
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "ggdBudgetErrors": 0,
                       "finiteFloatValuesChecked": config["finiteFloatValues"], "webglLoadComplete": True,
                       "visualViewsReviewed": ["front", "back", "isometric"]},
        "backup": locator, "backupFileCount": archive["fileCount"],
        "status": {"downloaded": True, "extracted": True, "converted": True,
                   "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
                   "completeHero": False, "heroBound": False, "runtimeSelectable": False, "deployed": False},
        "toolPins": rebuild_receipt["toolPins"], "gaps": gaps,
    }
    delivery_data = encoded(delivery)
    evidence_root = repo / "materials/hero-model-library/priority-evidence/rezero-static" / sha_bytes(delivery_data)
    source_files = {
        "delivery.json": delivery_data,
        "unity-conversion.json": (final_root.parents[1] / "source-conversion" / config["key"] / "conversion.json").read_bytes(),
        "normalization.json": (final_root / "normalization.json").read_bytes(),
        "validation.json": (final_root / "validation/structural.json").read_bytes(),
        "webgl-proof.json": (final_root / "render-v1/proof.json").read_bytes(),
        "front.png": (final_root / "render-v1/front.png").read_bytes(),
        "back.png": (final_root / "render-v1/back.png").read_bytes(),
        "isometric.png": (final_root / "render-v1/isometric.png").read_bytes(),
        "contact-sheet.png": (final_root / "render-v1/contact-sheet.png").read_bytes(),
        "rebuild.json": encoded(rebuild_receipt),
    }

    def evidence(name: str) -> dict:
        return git_pin(evidence_root / name, source_files[name], repo)

    shots = [evidence(name) for name in ("front.png", "back.png", "isometric.png", "contact-sheet.png")]
    source_files["visual-review.json"] = encoded({
        "schema": "ggd.skinned-component-visual-review@1", "componentId": component_id,
        "modelSha256": config["outputSha256"], "accepted": True,
        "scope": "independent-static-skinned-model-component", "reviewedAt": "2026-09-12",
        "reviewedViews": ["front", "back", "isometric"],
        "findings": [
            f"Front, back and isometric renders show the complete visible {config['name']} head, torso, arms, hands, legs and feet.",
            "Hair, face and costume materials remain visible with no detached primary geometry, opaque face card or bind-pose collapse.",
            "The corrected Z-up to Y-up output stands upright at 1.8 metres; the earlier sideways assumption remains only in the S3 backup.",
            "Review covers a static bind pose because source and output contain no animation clips.",
        ],
        "shots": shots, "webglProof": evidence("webgl-proof.json"),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    source_files["source-fidelity.json"] = encoded({
        "schema": "ggd.rezero-static-component-source-fidelity@1", "sourceId": SOURCE_ID,
        "componentId": component_id, "sourceBundleSha256": SOURCE_BUNDLE_SHA256,
        "sourceConversionSha256": config["sourceConversionSha256"], "outputSha256": config["outputSha256"],
        "sourceRootName": config["nativeId"], "sourceUpAxis": "z", "outputUpAxis": "y",
        "sourceVertexCount": conversion["meshes"][0]["vertices"], "outputTriangleCount": config["triangles"],
        "sourceBoneCount": conversion["meshes"][0]["bones"], "outputJointCount": config["joints"],
        "sourceAnimationClipCount": 0, "outputClipCount": 0,
        "allAccessorBytesPreservedDuringNormalization": normalization["allAccessorBytesPreserved"],
        "sourceWeightSumMaxError": conversion["meshes"][0]["sourceWeightSumMaxError"],
        "skinPositionMaxError": conversion["meshes"][0]["skinPositionMaxError"],
        "shaderParityVerified": False, "conversionReceipt": evidence("unity-conversion.json"),
        "normalizationReceipt": evidence("normalization.json"),
    })
    source_files["source-rebuild.json"] = encoded({
        "schema": "ggd.rezero-static-component-source-rebuild@1", "componentId": component_id,
        "sourceBundleSha256": SOURCE_BUNDLE_SHA256, "outputSha256": config["outputSha256"],
        "sourceConversionByteIdentical": replay["sourceConversion"]["byteIdentical"],
        "normalizedGlbByteIdentical": replay["normalized"]["byteIdentical"],
        "toolPins": rebuild_receipt["toolPins"], "rebuildReceipt": evidence("rebuild.json"),
        "limitations": ["Receipt JSON contains run-specific absolute paths; both GLB stages are byte-identical.",
                        "Static deterministic output does not establish gameplay animation readiness."],
    })
    source_files["acceptance.json"] = encoded({
        "schema": "ggd.skinned-component-acceptance@1", "deliverySha256": sha_bytes(delivery_data),
        "acceptedAt": "2026-09-12", "components": [{"id": component_id,
            "nativeId": config["nativeId"], "sha256": config["outputSha256"], "accepted": True,
            "scope": "independent-static-skinned-model-component",
            "reviewedViews": ["front", "back", "isometric"], "limitationsAccepted": gaps}],
    })

    evidence_note = (f"Thunderstore Re:Zero 0.1.1 {config['nativeId']} was converted from Z-up Unity data to an upright "
                     f"1.8 m GGD GLB: {config['triangles']:,} triangles, one skinned primitive, {config['joints']} glTF joints, "
                     f"one 256px texture and zero clips. Two builds are byte-identical; Khronos reports zero errors/warnings, "
                     f"{config['finiteFloatValues']:,} float values are finite, and three WebGL views were accepted as a static component only.")
    candidate = {
        "id": component_id, "conversionCandidateId": component_id, "sourceId": SOURCE_ID,
        "sourceClass": source.get("sourceClass"), "selectionClass": "community-mod",
        "nameZh": config["nameZh"], "originalName": config["name"], "workZh": "Re:Zero",
        "sourceGame": "Lethal Company community model replacement", "sourceGameReleasedAt": None,
        "platform": "PC / Unity AssetBundle", "nativeId": config["nativeId"], "sourceVersion": "0.1.1",
        "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture"], "absolutePath": str(final_root / "body.glb"),
        "path": str(final_root / "body.glb"), "bytes": config["outputBytes"], "sha256": config["outputSha256"],
        "gitPath": "content/assets/models/community/" + config["outputSha256"] + ".glb",
        "componentReady": True, "converted": True, "structuralValidationPassed": True,
        "visualValidationPassed": True, "runtimeReady": False, "runtimeSelectable": False,
        "defaultEligible": False, "automaticEligible": False, "fullHeroModel": False,
        "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [], "identityIds": [config["key"]],
        "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "triangles": config["triangles"], "drawPrimitives": 1, "skinCount": 1,
        "jointCount": config["joints"], "textureCount": 1,
        "readiness": "accepted-independent-static-skinned-component-actions-missing",
        "auditEvidence": evidence_note, "limitations": gaps,
        "deliveryEvidence": evidence("delivery.json"), "acceptanceEvidence": evidence("acceptance.json"),
        "validationEvidence": evidence("validation.json"), "visualEvidence": evidence("visual-review.json"),
        "webglProofEvidence": evidence("webgl-proof.json"), "sourceFidelityEvidence": evidence("source-fidelity.json"),
        "sourceRebuildEvidence": evidence("source-rebuild.json"), "backupStatus": "s3-full-readback-verified",
        "backupLocations": [locator], **locator,
    }
    candidate = upsert(source.setdefault("componentCandidates", []), candidate, component_id)
    attempt = {
        "id": component_id + "-conversion", "status": candidate["readiness"], "localPath": str(final_root),
        "rebuildPath": str(rebuild_root), "reportPath": str(final_root / "normalization.json"),
        "reportSha256": sha(final_root / "normalization.json"), "outputPath": str(final_root / "body.glb"),
        "outputSha256": config["outputSha256"], "nativeAnimationCount": 0, "componentId": component_id,
        "runtimeReady": False, "runtimeSelectable": False, "backupStatus": candidate["backupStatus"], **locator,
    }
    upsert(source.setdefault("conversionAttempts", []), attempt, attempt["id"],
           immutable=("id", "outputSha256", "componentId"))
    backlog_candidate = {
        "id": component_id, "sourceId": SOURCE_ID, "library": "community", "nativeId": config["nativeId"],
        "path": str(final_root / "body.glb"), "gitPath": candidate["gitPath"], "existsLocal": True,
        "bytes": candidate["bytes"], "sha256": candidate["sha256"], "format": "glTF Binary",
        "resourceRole": candidate["resourceRole"], "readiness": candidate["readiness"], "converted": True,
        "componentReady": True, "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "runtimeSelectable": False, "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
        "visualEvidence": candidate["visualEvidence"], "limitations": candidate["limitations"],
    }
    upsert(backlog_row.setdefault("modelCandidates", []), backlog_candidate, component_id)
    prefix = f"Thunderstore Re:Zero 0.1.1 {config['nativeId']} "
    backlog_row["evidence"] = [note for note in backlog_row.setdefault("evidence", []) if not note.startswith(prefix)]
    backlog_row["evidence"].append(evidence_note)
    writes = {repo / candidate["gitPath"]: (final_root / "body.glb").read_bytes()}
    for name, data in source_files.items():
        writes[evidence_root / name] = data
    return writes, candidate, evidence_root


def prepare(repo: Path, conversion_root: Path, rebuild_root: Path):
    repo, conversion_root, rebuild_root = repo.resolve(), conversion_root.resolve(), rebuild_root.resolve()
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-community.json"
    downloads, backlog = load(downloads_path), load(backlog_path)
    sources = [row for row in downloads.get("publicSources", []) + downloads.get("paidSources", [])
               if row.get("id") == SOURCE_ID]
    require(len(sources) == 1, "Expected one Re:Zero source")
    source = sources[0]
    require(source.get("defaultEligible") is False, "Re:Zero source must remain non-default")
    source.setdefault("sourceClass", "community-mod")
    require(source.get("sourceClass") == "community-mod", "Unexpected Re:Zero source classification")
    links = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == BACKUP_ID]
    require(len(links) == 1 and links[0].get("fullReadbackVerified") is True, "Re:Zero backup not linked")
    archive_index = load(repo / "materials/hero-model-library/public-source-files.json")
    archives = [row for row in archive_index.get("sources", []) if row.get("id") == BACKUP_ID]
    require(len(archives) == 1 and archives[0].get("fullReadbackVerified") is True, "Re:Zero archive missing")
    archive = archives[0]
    rebuild_receipt = load(rebuild_root / "rebuild.json")
    require(rebuild_receipt.get("allSourceConversionsByteIdentical") is True and
            rebuild_receipt.get("allNormalizedModelsByteIdentical") is True, "Re:Zero rebuild failed")
    backlog_by_id = {row["id"]: row for row in backlog.get("characters", [])}
    writes: dict[Path, bytes] = {}
    results = []
    for config in CONFIGS:
        row = backlog_by_id[config["key"]]
        require(row.get("mappedHeroIds") == [] and row.get("designStatus") == "not-defined",
                config["name"] + " must remain an unbound design-backlog identity")
        part, candidate, evidence_root = prepare_component(
            repo, conversion_root / "final" / config["key"], rebuild_root / "final" / config["key"],
            config, source, row, archive, rebuild_receipt)
        require(not (set(writes) & set(part)), "Re:Zero components tried to write the same immutable file")
        writes.update(part)
        results.append({"componentId": candidate["id"], "sha256": candidate["sha256"],
                        "evidenceRoot": evidence_root.relative_to(repo).as_posix()})
    writes[downloads_path] = encoded(downloads)
    writes[backlog_path] = encoded(backlog)
    mutable = {downloads_path, backlog_path}
    for target, data in writes.items():
        if target not in mutable:
            require(not target.exists() or target.read_bytes() == data, "Refusing to overwrite: " + str(target))
    return writes, mutable, results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conversion-root", type=Path, required=True)
    parser.add_argument("--rebuild-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    writes, mutable, results = prepare(Path.cwd(), args.conversion_root, args.rebuild_root)
    if args.write:
        for target, data in writes.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            if target in mutable or not target.exists():
                target.write_bytes(data)
    else:
        for target, data in writes.items():
            require(target.is_file() and target.read_bytes() == data, "Refresh Re:Zero integration: " + str(target))
    print(json.dumps({"components": results, "heroBindings": 0, "nativeAnimations": 0,
                      "runtimeSelectable": False, "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
