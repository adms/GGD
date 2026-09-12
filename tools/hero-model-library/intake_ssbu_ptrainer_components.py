#!/usr/bin/env python3
"""Admit validated SSBU Pokemon Trainer male c00 and female c01 components."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from skinned_components import require


SOURCE_ID = "gitlab-ssbu-models"
SOURCE_CLASS = "original-game-extraction-community-repackage"
SOURCE_COMMIT = "df76879171b064570b4e49a608c9f98211b33edb"
BACKLOG_ID = "ssbu-ptrainer"
VARIANTS = (
    ("c00", "ptrainer-c00.blend", 5274464, "5fa83a89433458845ffed9964642f83d9a8535fce7105f7ba0019ddddf445760", "Pokémon Trainer male"),
    ("c01", "ptrainer-c01.blend", 5646396, "4825363f5edffc31ae2cee7e1aa31ddead4cb3ae715b718ac7ce1b43ecef8c19", "Pokémon Trainer female"),
    ("c02", "ptrainer-c02.blend", 5274464, "5fa83a89433458845ffed9964642f83d9a8535fce7105f7ba0019ddddf445760", "Pokémon Trainer male"),
    ("c03", "ptrainer-c03.blend", 5646396, "4825363f5edffc31ae2cee7e1aa31ddead4cb3ae715b718ac7ce1b43ecef8c19", "Pokémon Trainer female"),
    ("c04", "ptrainer-c04.blend", 5274464, "5fa83a89433458845ffed9964642f83d9a8535fce7105f7ba0019ddddf445760", "Pokémon Trainer male"),
    ("c05", "ptrainer-c05.blend", 5646396, "4825363f5edffc31ae2cee7e1aa31ddead4cb3ae715b718ac7ce1b43ecef8c19", "Pokémon Trainer female"),
    ("c06", "ptrainer-c06.blend", 5274464, "5fa83a89433458845ffed9964642f83d9a8535fce7105f7ba0019ddddf445760", "Pokémon Trainer male"),
    ("c07", "ptrainer-c07.blend", 5646396, "4825363f5edffc31ae2cee7e1aa31ddead4cb3ae715b718ac7ce1b43ecef8c19", "Pokémon Trainer female"),
)
CONFIGS = (
    {
        "key": "male", "name": "Pokémon Trainer (male)", "nameZh": "寶可夢訓練家（男）", "variant": "c00",
        "componentId": "ssbu-ptrainer-male-c00-static-skinned-v1",
        "stageId": "ssbu-ptrainer-male-c00-blender4513-v1",
        "sourceSha256": "5fa83a89433458845ffed9964642f83d9a8535fce7105f7ba0019ddddf445760",
        "blenderSha256": "25d4fb8afbc418a5156c28b674f5a417d18521b5ffd51d8e264baea2a8e6a37f",
        "outputSha256": "953251f5007b74b394a19803349de9131a47fb51cbdabe8325c80580484e5abc",
        "outputBytes": 1316992, "equivalentVariants": ["c00", "c02", "c04", "c06"],
        "visibleMeshes": 11, "hiddenMeshes": 25, "bones": 44, "images": 5,
    },
    {
        "key": "female", "name": "Pokémon Trainer (female)", "nameZh": "寶可夢訓練家（女）", "variant": "c01",
        "componentId": "ssbu-ptrainer-female-c01-static-skinned-v1",
        "stageId": "ssbu-ptrainer-female-c01-blender4513-v1",
        "sourceSha256": "4825363f5edffc31ae2cee7e1aa31ddead4cb3ae715b718ac7ce1b43ecef8c19",
        "blenderSha256": "927308cfc3307f8d9c6d8818541c5ff7cc8c3cf83926de40f8deb2cac3cad4f3",
        "outputSha256": "8377e0a694ee456f74c111271ee05711ae2b4657028a05080a646daf73b46d46",
        "outputBytes": 1373696, "equivalentVariants": ["c01", "c03", "c05", "c07"],
        "visibleMeshes": 13, "hiddenMeshes": 27, "bones": 72, "images": 6,
    },
)


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


def upsert(rows: list[dict], item: dict, label: str, immutable=("id", "sourceId", "sha256", "bytes", "gitPath", "resourceRole")) -> dict:
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


def source_variants(source_path: Path) -> list[dict]:
    rows = []
    body = source_path.parents[1]
    for variant, filename, size, digest, identity in VARIANTS:
        path = body / variant / filename
        pinned = pin(path)
        require((pinned["bytes"], pinned["sha256"]) == (size, digest), "Changed Pokemon Trainer source variant: " + variant)
        rows.append({"variant": variant, "identity": identity, **pinned})
    return rows


def prepare_component(repo: Path, final_root: Path, rebuild_root: Path, config: dict,
                      source: dict, backlog_row: dict, archive_index: dict) -> tuple[dict[Path, bytes], dict, Path]:
    component_id, stage_id = config["componentId"], config["stageId"]
    backup_id = stage_id + "-backup"
    blender = load(final_root / "conversion.json")
    normalization = load(final_root / "normalization.json")
    analysis = load(final_root / "source-analysis.json")
    validation = load(final_root / "validation/structural.json")
    metrics = validation["ggdInspection"]
    webgl = load(final_root / "render-v1/proof.json")
    rebuild_blender = load(rebuild_root / "conversion.json")
    rebuild_normalization = load(rebuild_root / "normalization.json")
    rebuild_validation = load(rebuild_root / "validation/structural.json")

    require(blender.get("schema") == "ggd-ssbu-blend-component-conversion@1", "Unexpected Pokemon Trainer Blender receipt")
    require(normalization.get("schema") == "ggd-ssbu-static-component-normalization@1", "Unexpected Pokemon Trainer normalization receipt")
    require(blender.get("candidateId") == component_id == normalization.get("candidateId"), "Wrong Pokemon Trainer candidate")
    require(blender.get("sourceId") == SOURCE_ID == normalization.get("sourceId"), "Wrong Pokemon Trainer source")
    require(blender.get("input", {}).get("sha256") == config["sourceSha256"], "Changed Pokemon Trainer source")
    require(blender.get("output", {}).get("sha256") == config["blenderSha256"], "Changed Pokemon Trainer Blender export")
    require(normalization.get("output", {}).get("sha256") == config["outputSha256"], "Changed Pokemon Trainer normalized GLB")
    require((pin(final_root / "body.glb")["bytes"], pin(final_root / "body.glb")["sha256"]) ==
            (config["outputBytes"], config["outputSha256"]), "Final Pokemon Trainer GLB differs")
    require(pin(final_root / "blender-export.glb")["sha256"] == config["blenderSha256"], "Final Blender export differs")
    require(pin(rebuild_root / "body.glb")["sha256"] == config["outputSha256"], "Pokemon Trainer rebuild differs")
    require(pin(rebuild_root / "blender-export.glb")["sha256"] == config["blenderSha256"], "Pokemon Trainer raw rebuild differs")
    require(rebuild_blender.get("output", {}).get("sha256") == config["blenderSha256"], "Pokemon Trainer Blender rebuild receipt differs")
    require(rebuild_normalization.get("output", {}).get("sha256") == config["outputSha256"], "Pokemon Trainer normalized rebuild receipt differs")
    require(len(analysis.get("visibleMeshes", [])) == config["visibleMeshes"] and
            len(analysis.get("hiddenOrNonrenderMeshes", [])) == config["hiddenMeshes"],
            "Unexpected Pokemon Trainer mesh inventory")
    require(analysis.get("armatures", [{}])[0].get("bones") == config["bones"], "Unexpected Pokemon Trainer skeleton")
    require(analysis.get("actions") == [] and len(analysis.get("usedImages", [])) == config["images"],
            "Unexpected Pokemon Trainer actions or source images")
    for checked in (validation, rebuild_validation):
        require(checked.get("structuralValidationPassed") is True, "Pokemon Trainer structural validation failed")
        require(checked.get("finiteFloatAccessors", {}).get("passed") is True, "Pokemon Trainer non-finite accessors")
        require(checked.get("khronosIssues", {}).get("numErrors") == 0, "Pokemon Trainer Khronos errors")
        require(checked.get("khronosIssues", {}).get("numWarnings") == 0, "Pokemon Trainer Khronos warnings")
        require(checked.get("ggdInspection", {}).get("budget", {}).get("errors") == [], "Pokemon Trainer budget errors")
        require(checked.get("ggdInspection", {}).get("clipCount") == 0, "Pokemon Trainer unexpectedly contains clips")
    require(webgl.get("schema") == "ggd.ssbu-static-webgl@1", "Unexpected Pokemon Trainer WebGL proof")
    require(webgl.get("animationGroups") == 0 and webgl.get("skeletons") == 1, "Unexpected Pokemon Trainer WebGL rig")
    require(len(webgl.get("geometry", [])) == metrics["drawPrimitives"], "Incomplete Pokemon Trainer WebGL geometry")
    require(all(row.get("bones") == config["bones"] and row.get("gpuSkinning") is True for row in webgl["geometry"]),
            "Pokemon Trainer GPU skinning incomplete")
    require(webgl.get("worldSkinnedBounds", {}).get("extent", [None, None])[1] > 1.79, "Unexpected Pokemon Trainer height")

    tool_paths = (
        "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/normalize_static_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.py",
        "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.mjs",
        "packages/shared/src/content/modelUpload/normalize.ts",
    )
    tool_pins = [{"path": path, "sha256": sha_bytes((repo / path).read_bytes())} for path in tool_paths]
    gaps = [
        "Source Blender contains zero actions; idle, run, attack, cast, hurt and death animations remain missing.",
        "No GGD hero definition or skill binding exists for this exact Pokemon Trainer identity.",
        "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
        "Original SSBU shader parity is incomplete; normal, PRM and game-specific shader behavior were not reconstructed.",
        f"{config['hiddenMeshes']} hidden facial or costume mesh variants remain in the original Blender source and were excluded from the visible appearance.",
        "Blender emitted NumPy transform warnings; both validations checked all exported float values as finite and Babylon WebGL rendered the body intact.",
    ]
    all_variants = source_variants(Path(blender["input"]["path"]))
    delivery = {
        "schema": f"ggd.ssbu-ptrainer-{config['key']}-source-delivery@1", "deliveryId": stage_id,
        "sourceId": SOURCE_ID, "sourceCommit": SOURCE_COMMIT,
        "character": {"name": config["name"], "nameZh": config["nameZh"],
                      "nativeId": f"fighter/ptrainer/model/ptrainer/{config['variant']}", "variant": config["variant"],
                      "sourceGame": "Super Smash Bros. Ultimate", "originalSeries": "Pokémon"},
        "source": pin(Path(blender["input"]["path"])), "allNativeBodyVariants": all_variants,
        "equivalentSourceVariants": config["equivalentVariants"],
        "variantRelationship": "Even costume slots are byte-identical male sources and odd costume slots are byte-identical female sources; one conversion is retained for each distinct body.",
        "finalRoot": str(final_root), "rebuildRoot": str(rebuild_root),
        "blenderExport": pin(final_root / "blender-export.glb"), "output": pin(final_root / "body.glb"),
        "metrics": {"triangles": metrics["triangles"], "drawPrimitives": metrics["drawPrimitives"],
                    "skinnedPrimitives": metrics["skinnedPrimitives"], "skinCount": metrics["skinCount"],
                    "jointCount": metrics["joints"][0], "textureCount": metrics["textureCount"],
                    "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
                    "worldHeightMeters": webgl["worldSkinnedBounds"]["extent"][1]},
        "normalization": normalization["officialNormalization"],
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "ggdBudgetErrors": 0,
                       "finiteFloatValuesChecked": validation["finiteFloatAccessors"]["valueCount"],
                       "webglLoadComplete": True, "visualViewsReviewed": ["front", "back", "isometric"]},
        "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
                   "completeHero": False, "heroBound": False, "runtimeSelectable": False, "deployed": False},
        "toolPins": tool_pins, "gaps": gaps,
    }
    delivery_data = encoded(delivery)
    evidence_root = repo / "materials/hero-model-library/priority-evidence/ssbu-ptrainer" / sha_bytes(delivery_data)
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
        "schema": "ggd.skinned-component-visual-review@1", "componentId": component_id,
        "modelSha256": config["outputSha256"], "accepted": True,
        "scope": "independent-static-skinned-model-component", "reviewedAt": "2026-09-12",
        "reviewedViews": ["front", "back", "isometric"],
        "findings": [f"Front, back and isometric renders show the complete visible {config['name']} head, torso, arms and legs.",
                     f"The visible face, clothing and bag match {config['name']} and remain distinct from the other Trainer identity.",
                     "No detached part, missing primary material, opaque facial card or bind-pose collapse is visible.",
                     "Review covers the static bind pose only because source and output contain no clips."],
        "shots": shots, "webglProof": evidence("webgl-proof.json"),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    files["source-fidelity.json"] = encoded({
        "schema": f"ggd.ssbu-ptrainer-{config['key']}-source-fidelity@1", "sourceId": SOURCE_ID,
        "componentId": component_id, "sourceSha256": config["sourceSha256"],
        "blenderExportSha256": config["blenderSha256"], "outputSha256": config["outputSha256"],
        "sourceBytesUnchanged": blender["sourceBytesUnchanged"], "visibleMeshCount": len(analysis["visibleMeshes"]),
        "sourceVisiblePolygonCount": sum(row["polygons"] for row in analysis["visibleMeshes"]),
        "blenderPrimitiveCount": normalization["blenderExport"]["drawPrimitives"],
        "outputPrimitiveCount": metrics["drawPrimitives"],
        "outputTriangleCount": metrics["triangles"], "sourceBoneCount": config["bones"], "outputJointCount": metrics["joints"][0],
        "sourceActionCount": 0, "outputClipCount": 0, "usedSourceImageCount": len(analysis["usedImages"]),
        "embeddedOutputImageCount": metrics["textureCount"], "excludedNativeParts": analysis["hiddenOrNonrenderMeshes"],
        "shaderParityVerified": False, "sourceAnalysis": evidence("source-analysis.json"),
        "conversionReceipt": evidence("conversion.json"),
    })
    files["source-rebuild.json"] = encoded({
        "schema": f"ggd.ssbu-ptrainer-{config['key']}-source-rebuild@1", "componentId": component_id,
        "sourceSha256": config["sourceSha256"], "outputSha256": config["outputSha256"],
        "firstBuild": pin(final_root / "body.glb"), "secondBuild": pin(rebuild_root / "body.glb"),
        "firstBlenderExport": pin(final_root / "blender-export.glb"),
        "secondBlenderExport": pin(rebuild_root / "blender-export.glb"),
        "byteIdenticalRebuild": True, "blenderExportByteIdenticalRebuild": True,
        "bothValidationsPassed": True, "toolPins": tool_pins,
        "limitations": ["Absolute paths differ; GLB bytes are identical.",
                        "Deterministic static output does not establish gameplay animation readiness."],
    })
    files["acceptance.json"] = encoded({
        "schema": "ggd.skinned-component-acceptance@1", "deliverySha256": sha_bytes(delivery_data),
        "acceptedAt": "2026-09-12", "components": [{"id": component_id, "variant": config["variant"],
            "sha256": config["outputSha256"], "accepted": True,
            "scope": "independent-static-skinned-model-component",
            "reviewedViews": ["front", "back", "isometric"], "limitationsAccepted": gaps}],
    })

    evidence_note = (f"SSBU fighter/ptrainer {config['variant']} {config['name']} was converted with Blender 4.5.13 and GGD normalization "
                     f"to a {config['outputBytes']:,}-byte GLB. Two builds are byte-identical; Khronos has zero errors/warnings, "
                     f"{metrics['drawPrimitives']} primitives are skinned to {config['bones']} joints, and {validation['finiteFloatAccessors']['valueCount']:,} float values are finite. Three WebGL views were accepted "
                     "only as a static component; source and output have no actions.")
    candidate = {
        "id": component_id, "conversionCandidateId": component_id, "sourceId": SOURCE_ID,
        "sourceClass": SOURCE_CLASS, "selectionClass": "canonical-game", "nameZh": config["nameZh"],
        "originalName": config["name"], "workZh": "任天堂明星大亂鬥 特別版（原作：寶可夢）",
        "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07",
        "platform": "Nintendo Switch", "nativeId": f"fighter/ptrainer/model/ptrainer/{config['variant']}",
        "variant": config["variant"], "equivalentSourceVariants": config["equivalentVariants"],
        "allNativeBodyVariants": [{k: row[k] for k in ("variant", "identity", "bytes", "sha256", "absolutePath")} for row in all_variants],
        "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture"], "absolutePath": str(final_root / "body.glb"),
        "path": str(final_root / "body.glb"), "bytes": config["outputBytes"], "sha256": config["outputSha256"],
        "gitPath": "content/assets/models/community/" + config["outputSha256"] + ".glb",
        "componentReady": True, "converted": True, "structuralValidationPassed": True,
        "visualValidationPassed": True, "runtimeReady": False, "runtimeSelectable": False,
        "defaultEligible": False, "automaticEligible": False, "fullHeroModel": False,
        "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [], "identityIds": [BACKLOG_ID],
        "nativeAnimationCount": 0, "proceduralAnimationCount": 0, "triangles": metrics["triangles"],
        "drawPrimitives": metrics["drawPrimitives"], "skinCount": 1, "jointCount": config["bones"],
        "textureCount": metrics["textureCount"],
        "readiness": "accepted-independent-static-skinned-component-actions-missing",
        "auditEvidence": evidence_note, "limitations": gaps, "deliveryEvidence": evidence("delivery.json"),
        "acceptanceEvidence": evidence("acceptance.json"), "validationEvidence": evidence("validation.json"),
        "visualEvidence": evidence("visual-review.json"), "webglProofEvidence": evidence("webgl-proof.json"),
        "sourceFidelityEvidence": evidence("source-fidelity.json"), "sourceRebuildEvidence": evidence("source-rebuild.json"),
    }
    links = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == backup_id]
    archives = [row for row in archive_index.get("sources", []) if row.get("id") == backup_id]
    require(len(links) == 1 and links[0].get("fullReadbackVerified") is True, "Pokemon Trainer source backup not verified")
    require(len(archives) == 1 and archives[0].get("fullReadbackVerified") is True, "Pokemon Trainer archive backup missing")
    archive = archives[0]
    member = [row for row in archive.get("files", []) if row.get("path") == "body.glb"]
    require(len(member) == 1 and (member[0].get("sha256"), member[0].get("bytes")) ==
            (config["outputSha256"], config["outputBytes"]), "Pokemon Trainer backup has wrong GLB")
    locator = {"s3Uri": archive["s3Uri"], "s3ArchiveMember": "body.glb",
               "s3Use": "backup-only-not-runtime-entry", "backupReceiptPath": archive["receiptPath"],
               "backupReceiptSha256": archive["receiptSha256"]}
    candidate.update(backupStatus="s3-full-readback-verified", backupLocations=[locator], **locator)
    candidate = upsert(source.setdefault("componentCandidates", []), candidate, component_id)
    attempt = {"id": stage_id, "status": candidate["readiness"], "localPath": str(final_root),
               "rebuildPath": str(rebuild_root), "reportPath": str(final_root / "normalization.json"),
               "reportSha256": sha_bytes((final_root / "normalization.json").read_bytes()),
               "outputPath": str(final_root / "body.glb"), "outputSha256": config["outputSha256"],
               "nativeAnimationCount": 0, "componentId": component_id, "runtimeReady": False,
               "runtimeSelectable": False, "backupStatus": candidate["backupStatus"], **locator}
    upsert(source.setdefault("conversionAttempts", []), attempt, stage_id,
           immutable=("id", "outputSha256", "componentId"))
    backlog_candidate = {
        "id": component_id, "sourceId": SOURCE_ID, "library": "community",
        "nativeId": f"fighter/ptrainer/model/ptrainer/{config['variant']}", "variantSlot": config["variant"],
        "path": str(final_root / "body.glb"), "gitPath": candidate["gitPath"], "existsLocal": True,
        "bytes": candidate["bytes"], "sha256": candidate["sha256"], "format": "glTF Binary",
        "resourceRole": candidate["resourceRole"], "readiness": candidate["readiness"], "converted": True,
        "componentReady": True, "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "runtimeSelectable": False, "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
        "visualEvidence": candidate["visualEvidence"], "equivalentSourceVariants": config["equivalentVariants"],
        "limitations": candidate["limitations"],
    }
    upsert(backlog_row.setdefault("modelCandidates", []), backlog_candidate, component_id)
    evidence_prefix = f"SSBU fighter/ptrainer {config['variant']} "
    backlog_row["evidence"] = [
        note for note in backlog_row.setdefault("evidence", [])
        if not note.startswith(evidence_prefix)
    ]
    backlog_row["evidence"].append(evidence_note)
    writes = {repo / candidate["gitPath"]: (final_root / "body.glb").read_bytes()}
    for name, data in files.items():
        writes[evidence_root / name] = data
    return writes, candidate, evidence_root


def prepare(repo: Path, final_roots: list[Path], rebuild_roots: list[Path]):
    repo = repo.resolve()
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-community.json"
    downloads, backlog = load(downloads_path), load(backlog_path)
    sources = [row for row in downloads.get("publicSources", []) + downloads.get("paidSources", []) if row.get("id") == SOURCE_ID]
    require(len(sources) == 1, "Expected one SSBU source")
    source = sources[0]
    require(source.get("heroIds") == [] and source.get("defaultEligible") is False, "SSBU reserve must remain unbound")
    backlog_rows = [row for row in backlog.get("characters", []) if row.get("id") == BACKLOG_ID]
    require(len(backlog_rows) == 1 and backlog_rows[0].get("mappedHeroIds") == [] and
            backlog_rows[0].get("designStatus") == "not-defined", "Pokemon Trainer must remain unbound")
    archive_index = load(repo / "materials/hero-model-library/public-source-files.json")
    writes: dict[Path, bytes] = {}
    results = []
    for config, final_root, rebuild_root in zip(CONFIGS, final_roots, rebuild_roots, strict=True):
        part, candidate, evidence_root = prepare_component(repo, final_root.resolve(), rebuild_root.resolve(),
                                                            config, source, backlog_rows[0], archive_index)
        require(not (set(writes) & set(part)), "Pokemon Trainer components tried to write the same immutable file")
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
    parser.add_argument("--male-final-root", type=Path, required=True)
    parser.add_argument("--male-rebuild-root", type=Path, required=True)
    parser.add_argument("--female-final-root", type=Path, required=True)
    parser.add_argument("--female-rebuild-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    writes, mutable, results = prepare(Path.cwd(), [args.male_final_root, args.female_final_root],
                                       [args.male_rebuild_root, args.female_rebuild_root])
    if args.write:
        for target, data in writes.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            if target in mutable or not target.exists():
                target.write_bytes(data)
    else:
        for target, data in writes.items():
            require(target.is_file() and target.read_bytes() == data, "Refresh Pokemon Trainer integration: " + str(target))
    print(json.dumps({"components": results, "heroBindings": 0, "nativeAnimations": 0,
                      "runtimeSelectable": False, "files": len(writes), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
