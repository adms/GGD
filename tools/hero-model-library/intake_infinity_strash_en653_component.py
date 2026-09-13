#!/usr/bin/env python3
"""Admit MystVearn EN653/01 as an unbound static skinned component."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

from skinned_components import require


SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
COMPONENT_ID = "infinity-strash-mystvearn-en653-01-static-skinned-v1"
OUTPUT_SHA256 = "f76a9108bca1da1934eb3a823b6a9ff6f6ce5311715dd6959ab91ed16390df65"
OUTPUT_BYTES = 1_342_948
ARCHIVE_MEMBER = "stages/normalized-v3/component-ggd-normalized.glb"


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
    return json.loads(path.read_text(encoding="utf-8"))


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
    merged = dict(current); merged.update(item)
    rows[rows.index(current)] = merged
    return merged


def decode_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    require(data[:4] == b"glTF" and struct.unpack_from("<I", data, 4)[0] == 2, "Expected GLB v2")
    json_size, json_type = struct.unpack_from("<I4s", data, 12)
    require(json_type == b"JSON", "Missing GLB JSON chunk")
    document = json.loads(data[20:20 + json_size])
    offset = 20 + json_size
    bin_size, bin_type = struct.unpack_from("<I4s", data, offset)
    require(bin_type == b"BIN\0", "Missing GLB BIN chunk")
    return document, data[offset + 8:offset + 8 + bin_size]


def validate_float_accessors(document: dict, binary: bytes) -> tuple[int, int]:
    dimensions = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    count = values = 0
    for accessor in document.get("accessors", []):
        if accessor.get("componentType") != 5126:
            continue
        require("sparse" not in accessor, "Sparse float accessor not supported by EN653 verifier")
        view = document["bufferViews"][accessor["bufferView"]]
        width = dimensions[accessor["type"]] * 4
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", width))
        for row in range(accessor["count"]):
            unpacked = struct.unpack_from("<" + "f" * dimensions[accessor["type"]], binary, start + row * stride)
            require(all(math.isfinite(value) for value in unpacked), "Non-finite EN653 float accessor")
            values += len(unpacked)
        count += 1
    return count, values


def prepare(repo: Path, delivery_root: Path, backup_root: Path):
    repo, delivery_root, backup_root = repo.resolve(), delivery_root.resolve(), backup_root.resolve()
    delivery = load(delivery_root / "delivery.json")
    final_root = Path(delivery["output"]["absolutePath"]).resolve().parent
    conversion_root = final_root.parent / "component-portable-v2"
    rebuild_root = final_root.parent / "normalized-v4"
    conversion = load(conversion_root / "conversion.json")
    upload = load(final_root / "ggd-upload.json")
    replay = load(rebuild_root / "ggd-upload.json")
    nullengine = load(final_root / "babylon-nullengine.json")
    webgl = load(final_root / "render-v4/proof.json")
    archive = load(backup_root / "scoped-manifest.json")
    s3_receipt = load(backup_root / "s3-verified-receipt.json")
    require(delivery["deliveryId"] == conversion["candidateId"] == COMPONENT_ID, "Wrong EN653 component identity")
    require(delivery["identity"]["notVearnPostTransformation"] is True and delivery["identity"]["notBaran"] is True,
            "EN653 identity separation missing")
    glb_path = final_root / "component-ggd-normalized.glb"
    require((pin(glb_path)["sha256"], pin(glb_path)["bytes"]) == (OUTPUT_SHA256, OUTPUT_BYTES), "Changed EN653 GLB")
    require(delivery["rebuild"]["conversionByteIdentical"] is True and delivery["rebuild"]["normalizedByteIdentical"] is True,
            "EN653 rebuild proof failed")
    require(replay["output"]["sha256"] == OUTPUT_SHA256 and pin(rebuild_root / "component-ggd-normalized.glb")["sha256"] == OUTPUT_SHA256,
            "EN653 normalized replay differs")
    require(s3_receipt["fullGetVerified"] is True and s3_receipt["allArchiveMembersSha256Verified"] is True,
            "EN653 S3 readback is not verified")
    member = [row for row in archive["files"] if row["path"] == ARCHIVE_MEMBER]
    require(len(member) == 1 and (member[0]["sha256"], member[0]["bytes"]) == (OUTPUT_SHA256, OUTPUT_BYTES),
            "EN653 S3 archive contains wrong final GLB")
    document, binary = decode_glb(glb_path)
    primitives = [primitive for mesh in document["meshes"] for primitive in mesh["primitives"]]
    skinned = [primitive for primitive in primitives if {"JOINTS_0", "WEIGHTS_0"} <= set(primitive.get("attributes", {}))]
    require(len(primitives) == len(skinned) == 3, "Every normalized EN653 primitive must be skinned")
    require(len(document.get("skins", [])) == 1 and len(document["skins"][0]["joints"]) == 175, "Unexpected EN653 skin")
    require(not document.get("animations"), "EN653 static component unexpectedly has clips")
    float_accessors, float_values = validate_float_accessors(document, binary)
    issues = upload["outputInspection"]["report"]["issues"]
    require(issues["numErrors"] == 0 and issues["numWarnings"] == 0 and issues["truncated"] is False,
            "EN653 GGD/Khronos validation failed")
    require(upload["heroBudget"] == {"errors": [], "warnings": []}, "EN653 exceeds GGD hero model budget")
    require(nullengine["finiteRestPosePositions"] is True and nullengine["skeletonBoneCounts"] == [175],
            "EN653 Babylon structural validation failed")
    require(webgl["schema"] == "ggd.infinity-strash-babylon-webgl-static@1" and webgl["nativeMotion"] is False,
            "Unexpected EN653 WebGL proof")
    require([row["view"] for row in webgl["shots"]] == ["front", "back", "isometric"] and
            all(row["finite"] and row["vertexCount"] == 11851 for row in webgl["shots"]),
            "EN653 WebGL review is incomplete")

    locator = {
        "s3Uri": s3_receipt["s3Uri"], "manifestUri": s3_receipt["manifestUri"],
        "s3ArchiveMember": ARCHIVE_MEMBER, "s3Use": "backup-only-not-runtime-entry",
        "backupReceiptPath": str((backup_root / "s3-verified-receipt.json").resolve()),
        "backupReceiptSha256": sha_bytes((backup_root / "s3-verified-receipt.json").read_bytes()),
    }
    gaps = [
        "The source component export contains zero native animation clips; idle, run, attack, cast, hurt and death remain missing.",
        "No GGD hero definition or skill binding exists for MystVearn EN653/01.",
        "No VFX, sound effect, dialogue or voice asset is accepted as part of this model component.",
        "Original Unreal toon shader, shade, bundle and filter behavior is not reproduced by the portable base-colour PBR material.",
        "No backend dropdown registration, runtime switching, default selection or production deployment is claimed.",
        "This component is MystVearn; it cannot satisfy the separate post-transformation Vearn gap and cannot be identified as Baran.",
    ]
    evidence_note = (
        "Infinity Strash EN653/01 MystVearn is accepted as an independent static skinned component: "
        "13,128 triangles, three normalized skinned draw primitives, 175 joints, two 256px textures and zero clips. "
        "Two conversions and two GGD normalizations are byte-identical; Khronos/GGD report zero errors or warnings, "
        f"{float_values:,} float values are finite, and front/back/isometric Babylon WebGL views were reviewed."
    )
    evidence_root = repo / "materials/hero-model-library/priority-evidence/infinity-strash-en653-01-static-v1" / OUTPUT_SHA256[:16]
    copied = {
        "delivery.json": (delivery_root / "delivery.json").read_bytes(),
        "conversion.json": (conversion_root / "conversion.json").read_bytes(),
        "ggd-upload.json": (final_root / "ggd-upload.json").read_bytes(),
        "khronos-input.json": (final_root / "khronos-input.json").read_bytes(),
        "babylon-nullengine.json": (final_root / "babylon-nullengine.json").read_bytes(),
        "webgl-proof.json": (final_root / "render-v4/proof.json").read_bytes(),
        "front.png": (final_root / "render-v4/front.png").read_bytes(),
        "back.png": (final_root / "render-v4/back.png").read_bytes(),
        "isometric.png": (final_root / "render-v4/isometric.png").read_bytes(),
        "contact-sheet.png": (final_root / "render-v4/contact-sheet.png").read_bytes(),
        "s3-scoped-manifest.json": (backup_root / "scoped-manifest.json").read_bytes(),
        "s3-conversion-receipt.json": (backup_root / "s3-verified-receipt.json").read_bytes(),
    }

    def evidence(name: str) -> dict:
        return git_pin(evidence_root / name, copied[name], repo)

    tool_paths = [
        "tools/hero-model-library/source-workflows/infinity-strash-umodel-macos-v1/prepare_en653_component.py",
        "tools/hero-model-library/source-workflows/infinity-strash-umodel-macos-v1/normalize_validate_candidate.mts",
        "tools/hero-model-library/source-workflows/infinity-strash-umodel-macos-v1/render_babylon.py",
        "tools/hero-model-library/source-workflows/infinity-strash-umodel-macos-v1/render_babylon.mjs",
        "tools/hero-model-library/source-workflows/infinity-strash-umodel-macos-v1/collect_en653_delivery.py",
        "tools/hero-model-library/intake_infinity_strash_en653_component.py",
        "tools/hero-model-library/skinned_components.py",
    ]
    contract_pins = [{"path": path, "sha256": sha_bytes((repo / path).read_bytes())} for path in tool_paths]
    copied["validation.json"] = encoded({
        "schema": "ggd.infinity-strash-en653-static-component-validation@1",
        "componentId": COMPONENT_ID,
        "glb": pin(glb_path),
        "ggdInspection": {
            "triangles": upload["outputInspection"]["triangles"], "drawPrimitives": len(primitives),
            "skinnedPrimitives": len(skinned), "skinCount": 1, "joints": [175],
            "textureCount": len(upload["outputInspection"]["textures"]),
            "textures": upload["outputInspection"]["textures"], "clipCount": 0, "clips": [],
            "budget": upload["heroBudget"], "uploadReport": upload["outputInspection"]["report"],
        },
        "khronosIssues": issues,
        "finiteFloatAccessors": {"passed": True, "accessorCount": float_accessors, "valueCount": float_values},
        "babylon": {"nullEngine": nullengine, "webgl": evidence("webgl-proof.json")},
        "deterministicRebuild": {"conversionByteIdentical": True, "normalizedGlbByteIdentical": True},
        "contractPins": contract_pins,
        "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False,
        "limitations": gaps,
    })
    shot_pins = [evidence(name) for name in ("front.png", "back.png", "isometric.png", "contact-sheet.png")]
    copied["visual-review.json"] = encoded({
        "schema": "ggd.skinned-component-visual-review@1", "componentId": COMPONENT_ID,
        "modelSha256": OUTPUT_SHA256, "accepted": True,
        "scope": "independent-static-skinned-model-component", "reviewedAt": "2026-09-13",
        "reviewedViews": ["front", "back", "isometric"],
        "findings": [
            "Front, back and isometric WebGL renders show the complete hooded head, torso, arms, hands, legs, feet, robe and necklace.",
            "No exploded skin, detached primary geometry, bind-pose collapse or opaque face card is visible.",
            "Portable base-colour PBR makes the source palette visible but does not reproduce the Unreal toon shader.",
            "Review covers only the bind pose because this component export contains zero animation clips.",
        ],
        "shots": shot_pins, "webglProof": evidence("webgl-proof.json"),
        "runtimeSelectionVerified": False, "deploymentVerified": False,
    })
    copied["source-fidelity.json"] = encoded({
        "schema": "ggd.infinity-strash-en653-source-fidelity@1", "componentId": COMPONENT_ID,
        "identity": conversion["identity"], "source": conversion["source"],
        "sourceContractRepair": conversion["sourceContractRepair"], "materialMapping": conversion["materialMapping"],
        "sourceConversionSha256": conversion["output"]["sha256"], "normalizedSha256": OUTPUT_SHA256,
        "meshSkinUvAccessorBytesPreservedBySourcePackaging": True,
        "shaderParityVerified": False, "conversionReceipt": evidence("conversion.json"),
        "normalizationReceipt": evidence("ggd-upload.json"),
    })
    copied["source-rebuild.json"] = encoded({
        "schema": "ggd.infinity-strash-en653-source-rebuild@1", "componentId": COMPONENT_ID,
        "outputSha256": OUTPUT_SHA256, "conversionByteIdentical": True,
        "normalizedGlbByteIdentical": True, "bothValidationsPassed": True,
        "toolPins": contract_pins, "s3Backup": locator,
    })
    copied["acceptance.json"] = encoded({
        "schema": "ggd.skinned-component-acceptance@1", "componentId": COMPONENT_ID,
        "acceptedAt": "2026-09-13", "components": [{
            "id": COMPONENT_ID, "nativeId": "EN653/01", "sha256": OUTPUT_SHA256, "accepted": True,
            "scope": "independent-static-skinned-model-component", "reviewedViews": ["front", "back", "isometric"],
            "limitationsAccepted": gaps,
        }],
    })

    candidate = {
        "id": COMPONENT_ID, "conversionCandidateId": COMPONENT_ID, "sourceId": SOURCE_ID,
        "sourceClass": "canonical-game-direct-extraction", "selectionClass": "canonical-game",
        "nameZh": "密斯特巴恩", "originalName": "MystVearn",
        "workZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai", "sourceGameReleasedAt": "2023-09-28",
        "platform": "Windows (Steam)", "nativeId": "EN653/01", "sourceVersion": "Steam build local 2024-03-28",
        "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture"],
        "absolutePath": str(glb_path), "path": str(glb_path), "bytes": OUTPUT_BYTES, "sha256": OUTPUT_SHA256,
        "gitPath": "content/assets/models/community/" + OUTPUT_SHA256 + ".glb",
        "componentReady": True, "converted": True, "structuralValidationPassed": True,
        "visualValidationPassed": True, "runtimeReady": False, "runtimeSelectable": False,
        "defaultEligible": False, "automaticEligible": False, "fullHeroModel": False,
        "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": ["infinity-strash:EN653/01"], "nativeAnimationCount": 0,
        "proceduralAnimationCount": 0, "triangles": 13128, "drawPrimitives": 3,
        "skinCount": 1, "jointCount": 175, "textureCount": 2,
        "readiness": "accepted-independent-static-skinned-component-actions-missing",
        "auditEvidence": evidence_note, "limitations": gaps,
        "deliveryEvidence": evidence("delivery.json"), "acceptanceEvidence": evidence("acceptance.json"),
        "validationEvidence": evidence("validation.json"), "visualEvidence": evidence("visual-review.json"),
        "webglProofEvidence": evidence("webgl-proof.json"), "sourceFidelityEvidence": evidence("source-fidelity.json"),
        "sourceRebuildEvidence": evidence("source-rebuild.json"), "backupStatus": "s3-full-readback-verified",
        "backupLocations": [locator], **locator,
    }

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = load(downloads_path)
    matches = [row for row in downloads["publicSources"] if row.get("id") == SOURCE_ID]
    require(len(matches) == 1, "Expected one Infinity Strash source")
    source = matches[0]
    source["sourceClass"] = "canonical-game-direct-extraction"
    candidate = upsert(source.setdefault("componentCandidates", []), candidate, COMPONENT_ID)
    en653 = [row for row in source["identities"] if row.get("nativeId") == "EN653"]
    require(len(en653) == 1 and en653[0].get("heroIds") == [], "MystVearn must remain unbound")
    en653[0]["formState"] = "EN653-01-static-skinned-component-accepted-actions-and-hero-binding-missing"
    note = "EN653/01 MystVearn static skinned component passed deterministic conversion, current GGD/Khronos checks and three-view WebGL review; it remains separate from Vearn and Baran."
    if note not in source.setdefault("limitations", []): source["limitations"].append(note)
    attempt = {
        "id": COMPONENT_ID + "-conversion", "componentId": COMPONENT_ID, "status": candidate["readiness"],
        "localPath": str(final_root), "rebuildPath": str(rebuild_root),
        "reportPath": str(final_root / "ggd-upload.json"), "reportSha256": sha_bytes((final_root / "ggd-upload.json").read_bytes()),
        "outputPath": str(glb_path), "outputSha256": OUTPUT_SHA256, "nativeAnimationCount": 0,
        "runtimeReady": False, "runtimeSelectable": False, "backupStatus": "s3-full-readback-verified", **locator,
    }
    upsert(source.setdefault("conversionAttempts", []), attempt, attempt["id"],
           immutable=("id", "componentId", "outputSha256"))

    backlog_path = repo / "materials/hero-model-library/design-backlog/sources-supplemental.json"
    backlog = load(backlog_path)
    backlog_candidate = {
        "id": COMPONENT_ID, "sourceId": SOURCE_ID, "library": "community", "nativeId": "EN653/01",
        "path": str(glb_path), "gitPath": candidate["gitPath"], "existsLocal": True,
        "bytes": OUTPUT_BYTES, "sha256": OUTPUT_SHA256, "format": "glTF Binary",
        "resourceRole": candidate["resourceRole"], "readiness": candidate["readiness"],
        "converted": True, "componentReady": True, "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "runtimeSelectable": False, "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
        "visualEvidence": candidate["visualEvidence"], "backup": locator, "limitations": gaps,
    }
    backlog_row = {
        "id": "infinity-strash:mystvearn-en653-01", "name": "密斯特巴恩／MystVearn",
        "work": "Infinity Strash 勇者鬥惡龍 達伊的大冒險", "sourceIds": [SOURCE_ID],
        "aliases": ["密斯特巴恩", "MystVearn", "EN653", "EN653/01"],
        "modelCandidates": [backlog_candidate], "mappedHeroIds": [], "identityHeroIds": [],
        "proxyUseHeroIds": [], "possibleIdentityHeroIds": [], "designStatus": "not-defined",
        "noDesignReason": "原作 EN653/01 身份已確認為密斯特巴恩；目前沒有對應 GGD 英雄定義，保留原生 ID 並待設計、待綁定，未杜撰英雄 ID。",
        "evidence": [evidence_note], "limitations": gaps,
    }
    backlog_row = upsert(backlog["characters"], backlog_row, backlog_row["id"],
                         immutable=("id", "name", "work"))
    require(backlog_row["mappedHeroIds"] == [] and backlog_row["identityHeroIds"] == [],
            "MystVearn backlog row cannot bind a hero")

    mutable = {downloads_path, backlog_path}
    writes = {
        downloads_path: encoded(downloads), backlog_path: encoded(backlog),
        repo / candidate["gitPath"]: glb_path.read_bytes(),
    }
    for name, data in copied.items(): writes[evidence_root / name] = data
    for target, data in writes.items():
        if target not in mutable:
            require(not target.exists() or target.read_bytes() == data, "Refusing to overwrite: " + str(target))
    return writes, mutable, candidate, evidence_root


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--delivery-root", type=Path, required=True)
    parser.add_argument("--backup-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    writes, mutable, candidate, evidence_root = prepare(Path.cwd(), args.delivery_root, args.backup_root)
    if args.write:
        for target, data in writes.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            if target in mutable or not target.exists(): target.write_bytes(data)
    else:
        for target, data in writes.items(): require(target.is_file() and target.read_bytes() == data, "Refresh EN653 integration: " + str(target))
    print(json.dumps({"componentId": candidate["id"], "sha256": candidate["sha256"],
                      "evidenceRoot": evidence_root.relative_to(Path.cwd()).as_posix(), "heroBindings": 0,
                      "nativeAnimations": 0, "runtimeSelectable": False, "files": len(writes), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
