#!/usr/bin/env python3
"""Admit validated Re:Zero Subaru, Rem, Emilia, and Felix components."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from skinned_components import require


SOURCE_ID = "thunderstore-rezero"
BACKUP_ID = "rezero-subaru-rem-emilia-felix-thunderstore-0.1.1-v1-backup"
SOURCE_BUNDLE_SHA256 = "3134f5564701006542038ffe2aacdf98cef42cc30df1a0c796afec04c3e9ef88"
SOURCE_ARCHIVE_SHA256 = "e846f2bf183ae9234c9ab675debfe62025e08e3aa2d8fa6871573185f9164a27"
CONFIGS = (
    {
        "key": "subaru", "name": "Natsuki Subaru", "nameZh": "菜月昴", "nativeId": "subaruPrefab",
        "componentId": "rezero-subaru-thunderstore-0.1.1-static-skinned-v1", "sourceUpAxis": "y",
        "expectedMappedHeroIds": ["community-review-22-20260907"],
        "sourceConversionSha256": "b2707681949c4c0af23156bbb33962c97d15791bf13e7f918d98779191e88777",
        "outputSha256": "782b715815b20e10aa0ea34c463d59abb9eed86990d78b5dda2e241f8edc69af",
        "outputBytes": 497032, "triangles": 8122, "drawPrimitives": 3, "skinCount": 2,
        "joints": [41, 1], "textureSha256": "97b6980610559d975a3ab55dc6f5a0866d5608d3a7067a59ce6354af0640de7c",
        "finiteFloatValues": 70968,
        "extraLimitations": [
            "The source face renderer contains no bones, bind poses, joint indices or weights; it is preserved as a one-joint hierarchy-rigid skin below the native head.",
            "The rejected Z-up conversion is retained in the S3 archive; Subaru is visually verified as Y-up.",
        ],
    },
    {
        "key": "rem", "name": "Rem", "nameZh": "蕾姆", "nativeId": "remPrefab",
        "componentId": "rezero-rem-thunderstore-0.1.1-static-skinned-v1", "sourceUpAxis": "z",
        "expectedMappedHeroIds": ["b2-rem"],
        "sourceConversionSha256": "5a10171729cbe1949b80c2507d9c513574eb525ac20407aad5f0e83365ed8758",
        "outputSha256": "5bc147726f99061f492fe5dc34700a033a46c7ac4941a3255e7ab927e6766e93",
        "outputBytes": 1173224, "triangles": 18328, "drawPrimitives": 1, "skinCount": 1,
        "joints": [151], "textureSha256": "ae97a16848697f1adcab3fd5b93ea1cd9997b19e78b3bd512fe8018d94966911",
        "finiteFloatValues": 184720, "extraLimitations": [],
    },
    {
        "key": "emilia", "name": "Emilia", "nameZh": "愛蜜莉雅", "nativeId": "emiliaPrefab",
        "componentId": "rezero-emilia-thunderstore-0.1.1-static-skinned-v1", "sourceUpAxis": "z",
        "expectedMappedHeroIds": [],
        "sourceConversionSha256": "b2791d26879151467502f2b62bacfbdc9dfb483682df8fd50e8d71c7bcce4745",
        "outputSha256": "6a848b70006cefac04ec791295aca9d89fda64028c074597f2b0925d3276d6a9",
        "outputBytes": 1037796, "triangles": 18137, "drawPrimitives": 1, "skinCount": 1,
        "joints": [171], "textureSha256": "2b65b785748b31f9bbefa92f39abd48c7637a9ed125c3efa8ccaa01f9451c4f3",
        "finiteFloatValues": 157560,
        "extraLimitations": [
            "The uploader reports an Emilia rig problem. The static bind pose passed three-view review, but motion and retargeting remain unverified and are not accepted.",
        ],
    },
    {
        "key": "felix", "name": "Felix Argyle", "nameZh": "菲利克斯／菲莉絲", "nativeId": "felixPrefab",
        "componentId": "rezero-felix-thunderstore-0.1.1-static-skinned-v1", "sourceUpAxis": "z",
        "expectedMappedHeroIds": [],
        "sourceConversionSha256": "fb4a79438505c05af73429e3d48bca8feb99aa35ad82461ef548758865cfda75",
        "outputSha256": "35e41dd3684240a99fab59e28bb6864a8c1ed8d2b071c9fc7d38bb927c4a7cc1",
        "outputBytes": 948284, "triangles": 16444, "drawPrimitives": 1, "skinCount": 1,
        "joints": [137], "textureSha256": "36f24899452a7b2d41eaf277c1e1f77f8b6f1af87f25ef4efd72f7c9185aa4db",
        "finiteFloatValues": 145040, "extraLimitations": [],
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
    require(conversion.get("sourceUpAxis") == config["sourceUpAxis"], "Wrong visually reviewed Re:Zero source axis")
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
    require((metrics["triangles"], metrics["drawPrimitives"], metrics["skinCount"], metrics["joints"]) ==
            (config["triangles"], config["drawPrimitives"], config["skinCount"], config["joints"]),
            "Unexpected Re:Zero geometry metrics")
    require(metrics["textures"][0]["sha256"] == config["textureSha256"], "Changed Re:Zero texture")
    require(webgl.get("animationGroups") == 0 and webgl.get("skeletons") == config["skinCount"],
            "Unexpected WebGL rig")
    require(len(webgl.get("geometry", [])) == config["drawPrimitives"] and
            all(row.get("gpuSkinning") is True for row in webgl["geometry"]),
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
    identity_gap = (
        "Exact identity maps to existing GGD hero definitions, but this static component remains intentionally unbound to a runtime model key."
        if backlog_row.get("mappedHeroIds") else
        "No GGD hero definition or skill binding exists for this exact identity."
    )
    gaps = [
        "Source Unity bundle contains zero AnimationClip objects; idle, run, attack, cast, hurt and death actions remain missing.",
        identity_gap,
        "No VFX, sound effect, dialogue or voice asset for this character was accepted from this source.",
        "No backend dropdown registration, runtime switching, default selection or deployment was performed.",
        "Unity custom shader behavior is represented only by a portable base-color PBR material.",
    ]
    if config["triangles"] > 16000:
        gaps.append("Triangle count is above the 16,000 advisory threshold but below the 28,000 hard limit.")
    gaps.extend(config["extraLimitations"])
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
        "metrics": {"triangles": config["triangles"], "drawPrimitives": config["drawPrimitives"],
                    "skinCount": config["skinCount"], "jointCounts": config["joints"],
                    "jointCount": sum(config["joints"]), "textureCount": 1,
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
            ("The visually verified Y-up Subaru output stands upright at 1.8 metres; the rejected Z-up horizontal output remains in the S3 backup."
             if config["key"] == "subaru" else
             "The corrected Z-up to Y-up output stands upright at 1.8 metres."),
            "Review covers a static bind pose because source and output contain no animation clips.",
        ] + (["Emilia's uploader-reported motion rig problem remains untested; this review accepts only the static bind pose."]
             if config["key"] == "emilia" else []),
        "shots": shots, "webglProof": evidence("webgl-proof.json"),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    source_files["source-fidelity.json"] = encoded({
        "schema": "ggd.rezero-static-component-source-fidelity@1", "sourceId": SOURCE_ID,
        "componentId": component_id, "sourceBundleSha256": SOURCE_BUNDLE_SHA256,
        "sourceConversionSha256": config["sourceConversionSha256"], "outputSha256": config["outputSha256"],
        "sourceRootName": config["nativeId"], "sourceUpAxis": config["sourceUpAxis"], "outputUpAxis": "y",
        "sourceVertexCount": sum(mesh["vertices"] for mesh in conversion["meshes"]),
        "outputTriangleCount": config["triangles"],
        "sourceBoneCounts": [mesh.get("sourceBoneCount", mesh["bones"]) for mesh in conversion["meshes"]],
        "outputJointCounts": config["joints"],
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

    axis_note = "Y-up" if config["sourceUpAxis"] == "y" else "Z-up"
    evidence_note = (f"Thunderstore Re:Zero 0.1.1 {config['nativeId']} was converted from {axis_note} Unity data to an upright "
                     f"1.8 m GGD GLB: {config['triangles']:,} triangles, {config['drawPrimitives']} skinned draw primitives, "
                     f"{config['joints']} glTF joints across {config['skinCount']} skin(s), "
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
        "triangles": config["triangles"], "drawPrimitives": config["drawPrimitives"],
        "skinCount": config["skinCount"], "jointCount": sum(config["joints"]),
        "jointCounts": config["joints"], "textureCount": 1,
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
    require(rebuild_receipt.get("schema") == "ggd.rezero-static-components-rebuild@2",
            "Unexpected remaining Re:Zero rebuild schema")
    require(rebuild_receipt.get("allSourceConversionsByteIdentical") is True and
            rebuild_receipt.get("allNormalizedModelsByteIdentical") is True, "Re:Zero rebuild failed")
    backlog_by_id = {row["id"]: row for row in backlog.get("characters", [])}
    writes: dict[Path, bytes] = {}
    results = []
    for config in CONFIGS:
        row = backlog_by_id[config["key"]]
        require(row.get("mappedHeroIds") == config["expectedMappedHeroIds"],
                config["name"] + " identity mapping changed")
        require(row.get("designStatus") == ("designed" if config["expectedMappedHeroIds"] else "not-defined"),
                config["name"] + " design status changed")
        part, candidate, evidence_root = prepare_component(
            repo, conversion_root / "final" / config["key"], rebuild_root / "final" / config["key"],
            config, source, row, archive, rebuild_receipt)
        require(not (set(writes) & set(part)), "Re:Zero components tried to write the same immutable file")
        writes.update(part)
        results.append({"componentId": candidate["id"], "sha256": candidate["sha256"],
                        "evidenceRoot": evidence_root.relative_to(repo).as_posix()})
    source["verification"] = (
        "已靜態擷取 Re:Zero 0.1.1 Unity bundle：8 Mesh、7 SkinnedMeshRenderer、6 Avatar、6 貼圖、0 AnimationClip。"
        "Ram、Beatrice、Subaru、Rem、Emilia、Felix 六個角色均已有獨立靜態 GLB 元件；Subaru 依三視圖核實為 Y-up，"
        "無來源蒙皮的 face renderer 以原階層一骨剛性綁定保留。Emilia 靜態姿勢通過，但作者回報的動態骨架問題仍未驗證。"
        "六者皆缺原生動作、VFX、音效與語音，未綁後台、不可切換、未部署。"
    )
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
