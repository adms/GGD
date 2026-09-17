#!/usr/bin/env python3
"""Register validated full-motion Palworld components as non-default options.

The semantic clip maps are accepted only when their animation accessor samples
are byte-identical to the already registered Palworld model for the same hero.
This keeps the existing default and semantic mapping while exposing the larger
native motion libraries in the Hero Forge model dropdown.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
FORGE_SOURCE = ROOT / "packages/shared/src/content/heroForge/communityAcquired.ts"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1"
RECEIPT = EVIDENCE / "registration.json"
COMPONENT_INTEGRATION = ROOT / "materials/hero-model-library/priority-evidence/palworld-materials/integration.json"
CURRENT_VALIDATION = EVIDENCE / "validation.json"

SPECS = (
    {
        "componentId": "opgg-palworld-jetragon.material-bound-256-v1",
        "heroId": "acquired-jetragon",
        "nameZh": "空渦龍",
        "sourceModelKey": "community.body.d5743afe53dd93c4e69d1f951702a55c1f9fe1ca04c3b9bb",
        "sourceGlb": "content/assets/models/community/deab45770b45ad209de85193fd00a9688469828975c62518e2d688d7f977615a.glb",
        "modelKey": "community.body.894e7aaa153116876a7c0159f4659374003f0f8f911c8c63",
        "glbPath": "content/assets/models/community/894e7aaa153116876a7c0159f4659374003f0f8f911c8c637a3c6b708f9f71a8.glb",
        "sha256": "894e7aaa153116876a7c0159f4659374003f0f8f911c8c637a3c6b708f9f71a8",
        "bytes": 4297580,
        "triangles": 8468,
        "meshes": 3,
        "maxTextureEdge": 256,
        "maxClipChannels": 225,
        "clipCount": 29,
        "clipMap": {"idle": "Idle", "run": "Run", "attack": "FarSkill_Action", "cast": "JumpBeam_Loop", "hurt": "Damage", "death": "Damage"},
    },
    {
        "componentId": "palworld-cattiva-opgg-materials-256-v1",
        "heroId": "acquired-cattiva",
        "nameZh": "搗蛋貓",
        "sourceModelKey": "community.body.c104c1aa6e80b7d8f09407abd06acdb19c05ac8f6248c1da",
        "sourceGlb": "content/assets/models/community/3f4f764fc828f395a25bac8fe42f7426775ff188c8fa9bef4c6db1ee3bbe4d14.glb",
        "modelKey": "community.body.b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbef",
        "glbPath": "content/assets/models/community/b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbefa311b653599dc0a5.glb",
        "sha256": "b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbefa311b653599dc0a5",
        "bytes": 2148052,
        "triangles": 5798,
        "meshes": 3,
        "maxTextureEdge": 256,
        "maxClipChannels": 129,
        "clipCount": 33,
        "clipMap": {"idle": "Idle", "run": "Run", "attack": "NekoPunch_Loop", "cast": "FarSkill_Action", "hurt": "Damage", "death": "Damage"},
    },
)

TYPE_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_glb(path: Path) -> tuple[dict, bytes]:
    payload = path.read_bytes()
    if payload[:4] != b"glTF" or struct.unpack_from("<I", payload, 4)[0] != 2:
        raise ValueError(f"Expected GLB 2.0: {path}")
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if json_type != 0x4E4F534A:
        raise ValueError(f"Missing GLB JSON chunk: {path}")
    document = json.loads(payload[20:20 + json_length].rstrip(b" \t\r\n\0"))
    offset = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<II", payload, offset)
    if bin_type != 0x004E4942:
        raise ValueError(f"Missing GLB BIN chunk: {path}")
    return document, payload[offset + 8:offset + 8 + bin_length]


def accessor_bytes(document: dict, binary: bytes, index: int) -> bytes:
    accessor = document["accessors"][index]
    if accessor.get("sparse") is not None:
        raise ValueError("Sparse animation accessors are not accepted by this equality proof")
    view = document["bufferViews"][accessor["bufferView"]]
    width = TYPE_COMPONENTS[accessor["type"]] * COMPONENT_BYTES[accessor["componentType"]]
    stride = view.get("byteStride", width)
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return b"".join(binary[offset + row * stride:offset + row * stride + width] for row in range(accessor["count"]))


def animation_signature(path: Path, name: str) -> list[tuple]:
    document, binary = parse_glb(path)
    animation = next((row for row in document.get("animations", []) if row.get("name") == name), None)
    if animation is None:
        raise ValueError(f"Missing animation {name}: {path}")
    rows = []
    for channel in animation["channels"]:
        sampler = animation["samplers"][channel["sampler"]]
        rows.append((
            channel["target"]["node"],
            channel["target"]["path"],
            sampler.get("interpolation", "LINEAR"),
            hashlib.sha256(accessor_bytes(document, binary, sampler["input"])).hexdigest(),
            hashlib.sha256(accessor_bytes(document, binary, sampler["output"])).hexdigest(),
        ))
    return sorted(rows)


def model_document(spec: dict) -> dict:
    return {
        "id": spec["modelKey"],
        "schema": "model@1",
        "glbPath": spec["glbPath"].removeprefix("content/"),
        "scale": 1,
        "collisionRadius": 0.6,
        "clipMap": spec["clipMap"],
        "yawOffsetDeg": 0,
        "heroBody": True,
    }


def update_forge_source(source: str, spec: dict) -> str:
    pattern = re.compile(rf'^(\s*"{re.escape(spec["heroId"])}":\s*\[)([^\]]*)(\],?\s*)$', re.MULTILINE)
    match = pattern.search(source)
    if not match:
        raise ValueError(f"Hero Forge option row missing: {spec['heroId']}")
    values = re.findall(r'"([^"]+)"', match.group(2))
    if spec["modelKey"] not in values:
        values.append(spec["modelKey"])
    replacement = match.group(1) + ", ".join(json.dumps(value) for value in values) + match.group(3)
    return source[:match.start()] + replacement + source[match.end():]


def build(write: bool) -> dict:
    forge = FORGE_SOURCE.read_text(encoding="utf-8")
    component_integration = json.loads(COMPONENT_INTEGRATION.read_text())
    current_validation = json.loads(CURRENT_VALIDATION.read_text())
    if component_integration.get("schema") != "ggd-palworld-material-integration@1":
        raise ValueError("Unexpected Palworld component integration schema")
    if current_validation.get("schema") != "ggd-palworld-full-motion-option-validation@1":
        raise ValueError("Unexpected current Palworld validation schema")
    source_candidates = {row["id"]: row for row in component_integration["newCandidates"]}
    validation_rows = {row["componentId"]: row for row in current_validation["rows"]}
    registrations = []
    for spec in SPECS:
        full = ROOT / spec["glbPath"]
        source = ROOT / spec["sourceGlb"]
        if not full.is_file() or full.stat().st_size != spec["bytes"] or sha256(full) != spec["sha256"]:
            raise ValueError(f"Changed full-motion GLB: {spec['componentId']}")
        source_candidate = source_candidates[spec["componentId"]]
        if (source_candidate.get("gitPath"), source_candidate["sha256"], source_candidate["bytes"]) != (
            spec["glbPath"], spec["sha256"], spec["bytes"]
        ):
            raise ValueError(f"Component source pin changed: {spec['componentId']}")
        audit = validation_rows[spec["componentId"]]
        measured = {
            "triangles": audit["metrics"]["triangles"], "meshes": audit["metrics"]["meshes"],
            "maxTextureEdge": audit["metrics"]["maxTextureEdge"],
            "maxClipChannels": audit["metrics"]["maxClipChannels"],
            "clipCount": audit["metrics"]["clips"],
        }
        expected_measured = {key: spec[key] for key in measured}
        if (audit.get("budget", {}).get("errors") != [] or audit.get("khronos", {}).get("errors") != 0
                or audit.get("formalAdoptionEligible") is not True or measured != expected_measured):
            raise ValueError(f"Current contract audit does not qualify {spec['componentId']}: {measured}")
        source_doc_path = ROOT / "content/models" / f"{spec['sourceModelKey']}.json"
        source_doc = json.loads(source_doc_path.read_text(encoding="utf-8"))
        if source_doc.get("clipMap") != spec["clipMap"]:
            raise ValueError(f"Existing semantic clip map changed: {spec['heroId']}")
        equality = {}
        for semantic, clip in spec["clipMap"].items():
            same = animation_signature(source, clip) == animation_signature(full, clip)
            if not same:
                raise ValueError(f"Mapped clip samples differ for {spec['heroId']} {semantic}:{clip}")
            equality[semantic] = {"clip": clip, "byteIdenticalAccessorSamples": True}
        target_doc_path = ROOT / "content/models" / f"{spec['modelKey']}.json"
        payload = json.dumps(model_document(spec), ensure_ascii=False, indent=2) + "\n"
        if write:
            target_doc_path.write_text(payload, encoding="utf-8")
            forge = update_forge_source(forge, spec)
        elif not target_doc_path.is_file() or target_doc_path.read_text(encoding="utf-8") != payload:
            raise ValueError(f"Missing or stale model document: {target_doc_path.relative_to(ROOT)}")
        registrations.append({
            **{key: spec[key] for key in ("componentId", "heroId", "nameZh", "sourceModelKey", "modelKey")},
            "isDefault": False,
            "modelDocument": {"gitPath": target_doc_path.relative_to(ROOT).as_posix(), "bytes": len(payload.encode()), "sha256": hashlib.sha256(payload.encode()).hexdigest()},
            "modelGlb": {"gitPath": spec["glbPath"], "bytes": spec["bytes"], "sha256": spec["sha256"]},
            "measured": measured,
            "sourceArchive": {"s3Uri": source_candidate["s3ArchiveUri"], "archiveMember": source_candidate["s3ArchiveMember"], "readbackEvidence": source_candidate["backupArchiveId"]},
            "semanticMap": equality,
            "nativeMotionLibraryPreserved": True,
            "deathFallback": "native Damage clip reused; owner-approved hurt-plus-fade policy remains a separate runtime presentation concern",
            "productionDeploymentVerified": False,
        })
    if write:
        FORGE_SOURCE.write_text(forge, encoding="utf-8")
    elif FORGE_SOURCE.read_text(encoding="utf-8") != forge:
        raise ValueError("Hero Forge options are stale")
    receipt = {
        "schema": "ggd-palworld-full-motion-option-registration@1",
        "scope": "Two already admitted 256px full-motion GLBs become non-default local Hero Forge model options. Existing defaults and semantic mappings are preserved.",
        "inputs": [
            {"gitPath": COMPONENT_INTEGRATION.relative_to(ROOT).as_posix(), "sha256": sha256(COMPONENT_INTEGRATION)},
            {"gitPath": CURRENT_VALIDATION.relative_to(ROOT).as_posix(), "sha256": sha256(CURRENT_VALIDATION)},
            {"gitPath": FORGE_SOURCE.relative_to(ROOT).as_posix(), "sha256": sha256(FORGE_SOURCE)},
        ],
        "currentContractLimits": current_validation["currentPolicy"],
        "registrations": registrations,
        "blocked": [{
            "componentId": "opgg-palworld-astralym-2026081102.idle-walk-256",
            "heroId": "acquired-astralym",
            "reason": "Only native Idle and Walk are present; a six-state hero model document would require inventing or duplicating unreviewed combat semantics.",
            "productionDeploymentVerified": False,
        }],
        "summary": {"registered": 2, "blocked": 1, "newNativeMotionEntriesExposed": 62, "defaultsChanged": 0, "productionDeploymentVerified": False},
    }
    rendered = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    if write:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        RECEIPT.write_text(rendered, encoding="utf-8")
    elif not RECEIPT.is_file() or RECEIPT.read_text(encoding="utf-8") != rendered:
        raise ValueError(f"Missing or stale receipt: {RECEIPT.relative_to(ROOT)}")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    receipt = build(args.write)
    print(json.dumps(receipt["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
