#!/usr/bin/env python3
"""Build and register a non-runtime Re:Zero Rem current-policy candidate.

This workflow preserves the accepted 18,328-triangle source conversion and
creates a separate <=8,000 triangle candidate.  It deliberately does not make
the static-only candidate selectable: the source carries no AnimationClip, so
the user still needs to review any borrowed/procedural motion before a dropdown
option can be enabled.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ASSET_ROOT = WORKSPACE / "GGD-Asset-Library"
SOURCE = ASSET_ROOT / "conversions/rezero-subaru-rem-emilia-felix-thunderstore-0.1.1-receipt-v2/final/rem/body.glb"
SOURCE_SHA256 = "5bc147726f99061f492fe5dc34700a033a46c7ac4941a3255e7ab927e6766e93"
SOURCE_TRIANGLES = 18328
STAGE = ASSET_ROOT / "conversions/rezero-rem-formal-decimation-v1"
FINAL = STAGE / "final/body.glb"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/rezero-rem-formal-decimation-v1"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
CANDIDATE_ID = "rezero-rem-thunderstore-0.1.1-static-skinned-formal-decimation-v1"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(REPO).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def parse_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError("GLB is too short")
    magic, version, length = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError("Invalid GLB header")
    json_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A or 20 + json_length > len(raw):
        raise ValueError("Invalid GLB JSON chunk")
    document = json.loads(raw[20:20 + json_length].decode("utf-8"))
    binary = b""
    cursor = 20 + json_length
    if cursor < len(raw):
        binary_length, binary_type = struct.unpack_from("<II", raw, cursor)
        if binary_type != 0x004E4942 or cursor + 8 + binary_length != len(raw):
            raise ValueError("Invalid GLB binary chunk")
        binary = raw[cursor + 8:]
    return document, binary


def accessor_count(document: dict, accessor_index: int) -> int:
    accessor = document["accessors"][accessor_index]
    return int(accessor["count"])


def measure(path: Path) -> dict:
    document, binary = parse_glb(path)
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError("Not glTF 2.0")
    triangles = 0
    required_attributes = {"POSITION", "JOINTS_0", "WEIGHTS_0"}
    primitives = []
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4:
                raise ValueError("Only triangle primitives are supported in this candidate")
            if not required_attributes.issubset(primitive.get("attributes", {})):
                raise ValueError("Skinning attributes are missing")
            count = accessor_count(document, primitive["indices"]) if "indices" in primitive else accessor_count(document, primitive["attributes"]["POSITION"])
            if count % 3:
                raise ValueError("Triangle primitive index count is not divisible by three")
            triangles += count // 3
            primitives.append(count // 3)
    skins = document.get("skins", [])
    if len(skins) != 1 or len(skins[0].get("joints", [])) != 151:
        raise ValueError("Rem skeleton changed")
    if document.get("animations", []):
        raise ValueError("Static source unexpectedly gained animations")
    if not binary:
        raise ValueError("GLB has no binary payload")
    return {
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "triangles": triangles,
        "primitiveTriangles": primitives,
        "drawPrimitives": len(primitives),
        "skins": len(skins),
        "joints": len(skins[0]["joints"]),
        "animations": len(document.get("animations", [])),
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
    }


def write_or_check(path: Path, content: bytes, write: bool) -> None:
    if write:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    elif not path.is_file() or path.read_bytes() != content:
        raise ValueError("Stale generated output: " + str(path.relative_to(REPO)))


def build(write: bool) -> dict:
    if not SOURCE.is_file() or sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("The accepted Rem source conversion is missing or changed")
    source_metrics = measure(SOURCE)
    if source_metrics["triangles"] != SOURCE_TRIANGLES:
        raise ValueError("Unexpected accepted Rem source triangle count")
    if write:
        FINAL.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "node", str(REPO / "tools/model-budget/optimize/decimate.mjs"), str(SOURCE), str(FINAL), "7900", "0.02"
        ], check=True)
    candidate_metrics = measure(FINAL)
    if candidate_metrics["triangles"] > 8000 or candidate_metrics["triangles"] >= source_metrics["triangles"]:
        raise ValueError("Formal decimation target was not met")

    render_script = Path(__file__).with_name("render_compare.py")
    source_png = EVIDENCE / "source-front.png"
    candidate_png = EVIDENCE / "candidate-front.png"
    render_attempt = EVIDENCE / "render-attempt.json"
    if write:
        results = []
        for model, image in ((SOURCE, source_png), (FINAL, candidate_png)):
            completed = subprocess.run([
                "/Applications/Blender.app/Contents/MacOS/Blender", "--background", "--python", str(render_script), "--", str(model), str(image)
            ], check=False, capture_output=True, text=True)
            results.append({"modelSha256": sha256(model), "returnCode": completed.returncode, "imageProduced": image.is_file(), "stderrTail": completed.stderr[-800:]})
        write_or_check(render_attempt, encode({"renderer": "/Applications/Blender.app/Contents/MacOS/Blender", "results": results}), True)
    if not render_attempt.is_file():
        raise ValueError("Missing render attempt receipt")
    render_data = json.loads(render_attempt.read_text())
    renders_available = source_png.is_file() and candidate_png.is_file() and all(item.get("returnCode") == 0 for item in render_data.get("results", []))

    downloads = json.loads(DOWNLOADS.read_text())
    source_rows = [row for bucket in ("publicSources", "paidSources") for row in downloads.get(bucket, []) if row.get("id") == "thunderstore-rezero"]
    if len(source_rows) != 1:
        raise ValueError("Expected exactly one Thunderstore Re:Zero source row")
    source_row = source_rows[0]
    record = {
        "id": CANDIDATE_ID,
        "conversionCandidateId": CANDIDATE_ID,
        "sourceId": "thunderstore-rezero",
        "sourceClass": "community-mod",
        "selectionClass": "community-mod",
        "nameZh": "蕾姆", "originalName": "Rem", "workZh": "Re:Zero",
        "sourceGame": "Lethal Company community model replacement", "platform": "PC / Unity AssetBundle",
        "nativeId": "remPrefab", "sourceVersion": "0.1.1",
        "resourceRole": "character-body-decimation-candidate-pending-validation",
        "assetKinds": ["model-component", "skeleton", "texture"],
        "absolutePath": str(FINAL), "path": str(FINAL), "bytes": candidate_metrics["bytes"], "sha256": candidate_metrics["sha256"],
        "componentReady": False, "converted": True, "structuralValidationPassed": False, "visualValidationPassed": False,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False,
        "heroIds": [], "relatedHeroIds": [], "possibleTargetHeroIds": ["b2-rem"], "identityIds": ["rem"],
        "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "triangles": candidate_metrics["triangles"], "drawPrimitives": candidate_metrics["drawPrimitives"],
        "skinCount": candidate_metrics["skins"], "jointCount": candidate_metrics["joints"],
        "textureCount": candidate_metrics["textures"],
        "readiness": "formal-decimated-local-candidate-pending-full-structural-visual-and-motion-review",
        "formalAdoption": {"triggerTrianglesAbove": 10000, "targetTrianglesMax": 8000, "sourceTriangles": source_metrics["triangles"], "candidateTriangles": candidate_metrics["triangles"]},
        "limitations": [
            "Source Unity bundle contains zero AnimationClip objects; idle, run, attack, cast, hurt and death remain absent.",
            "This is a geometry-only candidate; source and output texture/material containers are retained without texture resampling.",
            "Automated front renders are evidence only. Owner visual acceptance and any borrowed/procedural-motion playback review are still required before dropdown registration.",
            "No VFX, sound effect, dialogue or voice asset was accepted from this source.",
        ],
    }
    receipt = {
        "schema": "ggd.rezero-rem-formal-decimation@1",
        "sourceId": "thunderstore-rezero", "componentId": CANDIDATE_ID,
        "policy": {"ownerRule": "over 10,000 triangles decimate below 8,000", "triggerTrianglesAbove": 10000, "targetTrianglesMax": 8000},
        "source": {"absolutePath": str(SOURCE), **source_metrics},
        "candidate": {"absolutePath": str(FINAL), **candidate_metrics},
        "geometryOnly": True, "textureResamplingPerformed": False,
        "validation": {"glbHeader": "valid", "skinCount": 1, "jointCount": 151, "animationCount": 0, "triangleTargetMet": True},
        "visualEvidence": ({"sourceFront": {"gitPath": source_png.relative_to(REPO).as_posix(), "bytes": source_png.stat().st_size, "sha256": sha256(source_png)}, "candidateFront": {"gitPath": candidate_png.relative_to(REPO).as_posix(), "bytes": candidate_png.stat().st_size, "sha256": sha256(candidate_png)}, "ownerAccepted": False} if renders_available else {"renderAttempt": {"gitPath": render_attempt.relative_to(REPO).as_posix(), "bytes": render_attempt.stat().st_size, "sha256": sha256(render_attempt)}, "automatedRenderAvailable": False, "ownerAccepted": False}),
        "runtimeDropdownRegistered": False, "runtimeSelectable": False, "productionDeploymentVerified": False,
    }
    write_or_check(EVIDENCE / "receipt.json", encode(receipt), write)
    record["validationEvidence"] = pin(EVIDENCE / "receipt.json")
    source_row["componentCandidates"] = [item for item in source_row.get("componentCandidates", []) if item.get("id") != CANDIDATE_ID] + [record]
    # Keep the source-level integration contract complete even though this
    # decimated Rem candidate is deliberately not a runtime option yet.  The
    # library generator rejects acquired sources without this tracking, and
    # inheriting the source hero IDs preserves the existing Subaru mapping
    # without inventing an identity for Rem.
    source_row["backendIntegration"] = {
        "required": True,
        "state": "pending-standardization",
        "heroIds": list(source_row.get("heroIds", [])),
        "ownerEntryIds": list(source_row.get("ownerEntryIds", [])),
        "release": None,
        "selectionVerified": False,
        "productionDeploymentVerified": False,
    }

    write_or_check(DOWNLOADS, encode(downloads), write)
    return {"sourceTriangles": source_metrics["triangles"], "candidateTriangles": candidate_metrics["triangles"], "candidateSha256": candidate_metrics["sha256"], "runtimeSelectable": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        parser.error("Specify exactly one of --write or --check")
    print(json.dumps(build(args.write), ensure_ascii=False))


if __name__ == "__main__":
    main()
