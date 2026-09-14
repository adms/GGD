#!/usr/bin/env python3
"""Validate the deterministic JUMP FORCE Dai v2 candidate and write a receipt."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import struct
import subprocess

from PIL import Image


EXPECTED_SOURCE_SHA = "53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810"
EXPECTED_CANDIDATE_SHA = "2b3030a97ff3add18e8addbc5d0ab39153e66d2da45a0d5ccf1dc10ff0fc55ba"
OVERLAYS = {"T_Chr0430_lens_C", "T_Chr0430_eyeshadow_C"}
COMPONENTS = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TYPE_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def load_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError(f"not a GLB 2 file: {path}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("JSON is not the first GLB chunk")
    model = json.loads(data[20:20 + json_length])
    offset = 20 + ((json_length + 3) // 4 * 4)
    binary_length, binary_type = struct.unpack_from("<II", data, offset)
    if binary_type != 0x004E4942:
        raise ValueError("GLB has no BIN chunk")
    return model, data[offset + 8:offset + 8 + binary_length]


def accessor_values(model: dict, binary: bytes, index: int) -> list[float | int]:
    accessor = model["accessors"][index]
    if accessor.get("sparse"):
        raise ValueError(f"sparse accessor unsupported in receipt validator: {index}")
    view = model["bufferViews"][accessor["bufferView"]]
    component_format, component_bytes = COMPONENTS[accessor["componentType"]]
    count = TYPE_COUNTS[accessor["type"]]
    packed = component_bytes * count
    stride = view.get("byteStride", packed)
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    values: list[float | int] = []
    for row in range(accessor["count"]):
        values.extend(struct.unpack_from("<" + component_format * count, binary, offset + row * stride))
    return values


def embedded_images(model: dict, binary: bytes) -> dict[str, bytes]:
    result = {}
    for image in model.get("images", []):
        view = model["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        result[image["name"]] = binary[start:start + view["byteLength"]]
    return result


def material_signatures(model: dict) -> Counter:
    def image_name(texture_info: dict | None) -> str | None:
        if not texture_info:
            return None
        texture = model["textures"][texture_info["index"]]
        return model["images"][texture["source"]].get("name")

    rows = []
    for material in model.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        rows.append((
            re.sub(r"\.\d{3}$", "", material.get("name", "")),
            material.get("alphaMode", "OPAQUE"),
            round(material.get("alphaCutoff", 0.5), 3),
            material.get("doubleSided", False),
            image_name(pbr.get("baseColorTexture")),
            image_name(material.get("normalTexture")),
            image_name(pbr.get("metallicRoughnessTexture")),
            image_name(material.get("occlusionTexture")),
            image_name(material.get("emissiveTexture")),
        ))
    return Counter(rows)


def joint_state(model: dict, binary: bytes) -> tuple[set[str], dict[str, str | None], dict[str, tuple[float, ...]]]:
    skin = model["skins"][0]
    names = [model["nodes"][index].get("name") for index in skin["joints"]]
    if None in names or len(names) != len(set(names)):
        raise ValueError("joint names are absent or ambiguous")
    parents = {}
    for parent_index, node in enumerate(model["nodes"]):
        for child in node.get("children", []):
            parents[model["nodes"][child].get("name")] = model["nodes"][parent_index].get("name")
    values = accessor_values(model, binary, skin["inverseBindMatrices"])
    matrices = {name: tuple(values[index * 16:(index + 1) * 16]) for index, name in enumerate(names)}
    return set(names), {name: parents.get(name) for name in names}, matrices


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("rebuild", type=Path)
    parser.add_argument("conversion", type=Path)
    parser.add_argument("draw_audit", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args()
    source, candidate, rebuild = args.source.resolve(), args.candidate.resolve(), args.rebuild.resolve()
    conversion = json.loads(args.conversion.read_text())
    draw = json.loads(args.draw_audit.read_text())
    repo = args.repo.resolve()
    if sha(source) != EXPECTED_SOURCE_SHA or sha(candidate) != EXPECTED_CANDIDATE_SHA:
        raise ValueError("frozen source or candidate SHA differs")
    if candidate.read_bytes() != rebuild.read_bytes() or conversion.get("byteIdenticalRebuild") is not True:
        raise ValueError("independent rebuild is not byte-identical")
    if conversion["output"]["sha256"] != EXPECTED_CANDIDATE_SHA or conversion["rebuild"]["sha256"] != EXPECTED_CANDIDATE_SHA:
        raise ValueError("conversion pins differ")

    source_model, source_binary = load_glb(source)
    model, binary = load_glb(candidate)
    triangles = sum(model["accessors"][primitive["indices"]]["count"] // 3 for mesh in model.get("meshes", []) for primitive in mesh.get("primitives", []))
    draws = sum(len(mesh.get("primitives", [])) for mesh in model.get("meshes", []))
    skinned = sum("JOINTS_0" in primitive.get("attributes", {}) and "WEIGHTS_0" in primitive.get("attributes", {}) for mesh in model.get("meshes", []) for primitive in mesh.get("primitives", []))
    images = embedded_images(model, binary)
    edges = []
    overlay_alpha = {}
    for name, data in images.items():
        with Image.open(BytesIO(data)) as opened:
            edges.extend(opened.size)
            if name in OVERLAYS:
                alpha = opened.convert("RGBA").getchannel("A")
                overlay_alpha[name] = {"size": list(opened.size), "alphaExtrema": list(alpha.getextrema()), "sha256": hashlib.sha256(data).hexdigest()}
    if set(overlay_alpha) != OVERLAYS or any(row["size"] != [256, 256] or row["alphaExtrema"] != [0, 0] for row in overlay_alpha.values()):
        raise ValueError("eye overlays are not fully transparent 256px RGBA images")

    source_joints, source_parents, source_ibm = joint_state(source_model, source_binary)
    joints, parents, ibm = joint_state(model, binary)
    if joints != source_joints or parents != source_parents:
        raise ValueError("joint names or hierarchy changed")
    ibm_max_delta = max(abs(a - b) for name in joints for a, b in zip(source_ibm[name], ibm[name]))
    if ibm_max_delta > 1.2e-5:
        raise ValueError(f"inverse bind matrices drifted: {ibm_max_delta}")
    if material_signatures(source_model) != material_signatures(model):
        raise ValueError("material assignments or texture slots changed")

    float_accessors = 0
    float_values = 0
    for index, accessor in enumerate(model.get("accessors", [])):
        if accessor["componentType"] != 5126:
            continue
        values = accessor_values(model, binary, index)
        if not all(value == value and abs(value) != float("inf") for value in values):
            raise ValueError(f"non-finite float accessor: {index}")
        float_accessors += 1
        float_values += len(values)

    khronos_result = subprocess.run(
        ["node", str(Path(__file__).with_name("validate_khronos.mjs")), str(candidate), str(repo)],
        cwd=repo, text=True, capture_output=True, check=True,
    )
    khronos = json.loads(khronos_result.stdout)
    if khronos["errors"] != 0 or khronos["truncated"]:
        raise ValueError(f"Khronos validation failed: {khronos}")
    guard_result = subprocess.run(
        ["node", "--import", "tsx", str(repo / "tools/model-budget/guard.ts"), str(candidate), "--role", "champion", "--json", "--warn-only"],
        cwd=repo, text=True, capture_output=True, check=True,
    )
    guard = json.loads(guard_result.stdout)
    checked = guard["results"][0]
    axes = {row["key"]: row for row in checked["axes"]}
    expected = {"triangles": 7930, "draws": 20, "textureEdge": 256, "skins": 1, "joints": 159, "textures": 24, "animations": 0}
    observed = {"triangles": triangles, "draws": draws, "textureEdge": max(edges), "skins": len(model.get("skins", [])), "joints": len(joints), "textures": len(images), "animations": len(model.get("animations", []))}
    if observed != expected or skinned != 20:
        raise ValueError(f"frozen metrics differ: {observed}, skinned={skinned}")
    if checked["adoption"]["status"] != "eligible" or axes["drawCalls"]["verdict"] != "over" or checked["worst"] != "over":
        raise ValueError("current policy classification differs")
    if draw["candidate"]["sha256"] != EXPECTED_CANDIDATE_SHA or draw["observed"]["drawPrimitives"] != 20:
        raise ValueError("draw-call audit differs")

    result = {
        "schema": "ggd.jump-force-dai-decimation-validation@2",
        "candidateId": conversion["candidateId"],
        "source": pin(source),
        "candidate": pin(candidate),
        "deterministicRebuild": {**pin(rebuild), "byteIdentical": True},
        "metrics": observed,
        "preservation": {
            "allPrimitivesSkinned": True,
            "skinnedPrimitives": skinned,
            "jointNamesAndHierarchyEquivalent": True,
            "jointCount": len(joints),
            "inverseBindMatricesMaxAbsoluteDelta": ibm_max_delta,
            "materialAndTextureSlotMultisetEquivalent": True,
            "sourceMeshContainers": len(source_model.get("meshes", [])),
            "candidateMaterialSplitMeshes": len(model.get("meshes", [])),
        },
        "eyeOverlayRepair": {"underlyingEyeTextureRetained": "T_Chr0430_eye_C" in images, "transparentOverlays": overlay_alpha},
        "finiteFloatAccessors": {"passed": True, "accessorCount": float_accessors, "valueCount": float_values},
        "khronos": khronos,
        "currentPolicy": {
            "source": "packages/shared/src/content/modelUpload/adoptionPolicy.json and runtime budget constants via tools/model-budget/guard.ts",
            "adoptionEligible": True,
            "decimateWhenTrianglesAbove": checked["adoption"]["triggerTrianglesAbove"],
            "decimatedTargetTrianglesMax": checked["adoption"]["targetTrianglesMax"],
            "textureEdgePassed": axes["maxTextureEdge"]["verdict"] == "ok",
            "drawCallPassed": False,
            "drawCallLimit": axes["drawCalls"]["limit"],
        },
        "ownerState": {"publicationAuthorization": "approved-all-resources-2026-09-15", "visualQualityReview": "pending-new-v2-render-review", "technicalGatesStillApply": True},
        "readiness": "converted-and-structurally-validated; owner-publication-authorized; visual-review-pending; draw20-over-limit6; animations0; not-runtime-selectable",
        "componentAcceptedForGitRuntime": False,
        "backendRegistered": False,
        "runtimeSelectable": False,
        "productionDeployed": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    guard_path = args.output.with_name("guard.json")
    guard_path.write_text(json.dumps(guard, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"triangles": triangles, "drawPrimitives": draws, "maxTextureEdge": max(edges), "sha256": EXPECTED_CANDIDATE_SHA, "khronosErrors": 0, "runtimeSelectable": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
