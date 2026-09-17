#!/usr/bin/env python3
"""Verify rig, materials, textures, policy and A/B evidence after decimation."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_candidates import CONFIG


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def sha(value: bytes | Path) -> str:
    raw = value.read_bytes() if isinstance(value, Path) else value
    return hashlib.sha256(raw).hexdigest()


def glb(path: Path) -> tuple[dict[str, Any], bytes]:
    raw = path.read_bytes(); require(raw[:4] == b"glTF", f"not GLB: {path}")
    offset = 12; document = None; binary = b""
    while offset + 8 <= len(raw):
        length, kind = struct.unpack_from("<II", raw, offset); offset += 8
        chunk = raw[offset:offset + length]; offset += length
        if kind == 0x4E4F534A: document = json.loads(chunk.decode().rstrip(" \t\r\n\0"))
        elif kind == 0x004E4942: binary = chunk
    require(document is not None, f"missing GLB JSON: {path}")
    return document, binary


def view_bytes(doc: dict, binary: bytes, index: int) -> bytes:
    view = doc["bufferViews"][index]
    start = view.get("byteOffset", 0); return binary[start:start + view["byteLength"]]


def accessor_bytes(doc: dict, binary: bytes, index: int) -> bytes:
    acc = doc["accessors"][index]; view = doc["bufferViews"][acc["bufferView"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    components = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[acc["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]] * components
    require(view.get("byteStride", width) == width, "strided accessor not supported by preservation check")
    return binary[start:start + acc["count"] * width]


def image_hashes(doc: dict, binary: bytes) -> list[dict]:
    result = []
    for image in doc.get("images", []):
        raw = view_bytes(doc, binary, image["bufferView"])
        result.append({"name": image.get("name"), "mimeType": image.get("mimeType"), "bytes": len(raw), "sha256": sha(raw)})
    return result


def semantic_materials(doc: dict, binary: bytes) -> list[dict]:
    images = image_hashes(doc, binary)
    textures = doc.get("textures", [])
    samplers = [{"magFilter": row.get("magFilter"), "minFilter": row.get("minFilter"),
                 "wrapS": row.get("wrapS", 10497), "wrapT": row.get("wrapT", 10497)}
                for row in doc.get("samplers", [])]
    def visit(value: Any, key: str = "") -> Any:
        if isinstance(value, list):
            return [visit(item) for item in value]
        if isinstance(value, dict):
            if key.endswith("Texture") and "index" in value:
                texture = textures[value["index"]]
                source = texture["source"]
                sampler = texture.get("sampler")
                return {**{k: visit(v, k) for k, v in value.items() if k != "index"},
                        "resolvedImage": images[source],
                        "resolvedSampler": samplers[sampler] if sampler is not None else None}
            return {k: visit(v, k) for k, v in value.items()}
        return value
    return [visit(material) for material in doc.get("materials", [])]


def primitive_contract(doc: dict) -> list[dict]:
    rows = []
    for mesh_index, mesh in enumerate(doc.get("meshes", [])):
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            semantics = sorted(primitive["attributes"])
            require("JOINTS_0" in semantics and "WEIGHTS_0" in semantics, "skinning attributes missing")
            rows.append({"mesh": mesh_index, "primitive": primitive_index, "material": primitive.get("material"), "mode": primitive.get("mode", 4), "attributes": semantics})
    return rows


def compare_nodes(left: list[dict], right: list[dict], variant: str) -> float:
    """Treat writer-elided identity TRS values as equivalent within float noise."""
    require(len(left) == len(right), f"node count changed: {variant}")
    defaults = {"translation": [0.0, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0, 1.0], "scale": [1.0, 1.0, 1.0]}
    structural = {"name", "children", "mesh", "skin", "camera", "weights"}
    maximum = 0.0
    for index, (a, b) in enumerate(zip(left, right)):
        for key in structural:
            require(a.get(key) == b.get(key), f"node {index} {key} changed: {variant}")
        require(a.get("matrix") == b.get("matrix"), f"node {index} matrix changed: {variant}")
        for key, default in defaults.items():
            av, bv = a.get(key, default), b.get(key, default)
            delta = max(abs(float(x) - float(y)) for x, y in zip(av, bv))
            maximum = max(maximum, delta)
            require(len(av) == len(bv) and delta <= 1e-5,
                    f"node {index} {key} changed beyond 1e-5: {variant}")
    return maximum


def validate(repo: Path, output_root: Path, write: bool) -> dict:
    summaries = []
    for variant, cfg in CONFIG.items():
        stage = output_root / variant; source = repo / cfg["sourceGitPath"]; candidate = stage / "candidate.glb"
        a, ab = glb(source); b, bb = glb(candidate)
        max_trs_delta = compare_nodes(a.get("nodes", []), b.get("nodes", []), variant)
        require(image_hashes(a, ab) == image_hashes(b, bb), f"embedded images changed: {variant}")
        require(semantic_materials(a, ab) == semantic_materials(b, bb), f"material/image bindings changed: {variant}")
        require(len(a.get("skins", [])) == len(b.get("skins", [])), f"skin count changed: {variant}")
        skin_rows = []
        for index, (left, right) in enumerate(zip(a.get("skins", []), b.get("skins", []))):
            require(left.get("joints") == right.get("joints") and left.get("skeleton") == right.get("skeleton"), f"skin joints changed: {variant}")
            left_ibm, right_ibm = accessor_bytes(a, ab, left["inverseBindMatrices"]), accessor_bytes(b, bb, right["inverseBindMatrices"])
            require(left_ibm == right_ibm, f"inverse bind matrices changed: {variant}")
            skin_rows.append({"skin": index, "jointCount": len(left["joints"]), "inverseBindMatricesSha256": sha(left_ibm)})
        require(primitive_contract(a) == primitive_contract(b), f"primitive/material/skinning contract changed: {variant}")
        require(a.get("animations", []) == b.get("animations", []) == [], f"unexpected animations: {variant}")
        raw = json.loads((stage / "raw-validation.json").read_text())
        visual = json.loads((stage / "visual-comparison.json").read_text())
        inspection = raw["ggdInspection"]
        require(raw["khronosIssues"]["numErrors"] == raw["khronosIssues"]["numWarnings"] == 0, f"Khronos not clean: {variant}")
        require(inspection["budget"]["errors"] == [], f"GGD hard policy failed: {variant}")
        require(inspection["triangles"] <= 8000 and inspection["clipCount"] == 0, f"formal triangle/action contract failed: {variant}")
        require(visual["underFivePercentContract"] and visual["humanReview"]["result"] == "accepted", f"visual acceptance missing: {variant}")
        output = {
            "schema": "ggd-ssbu-ptrainer-decimation-validation@1", "variant": variant,
            "componentId": cfg["componentId"],
            "source": {"gitPath": cfg["sourceGitPath"], "bytes": source.stat().st_size, "sha256": sha(source)},
            "candidate": {"localPath": f"GGD-Asset-Library/conversions/ssbu-ptrainer-formal-decimation-v1/{variant}/candidate.glb", "bytes": candidate.stat().st_size, "sha256": sha(candidate)},
            "metrics": {"triangles": inspection["triangles"], "drawPrimitives": inspection["drawPrimitives"], "textures": inspection["textureCount"], "joints": inspection["joints"], "skins": inspection["skinCount"], "nativeAnimationCount": 0},
            "preservation": {"nodeHierarchyExact": True, "nodeTrsEquivalentWithin1eMinus5": True, "maximumNodeTrsAbsoluteDelta": max_trs_delta, "writerElidedIdentityTrsValues": True, "materialDefinitionsAndResolvedImageBindingsExact": True, "embeddedImagesExact": True, "duplicateTextureReferencesCoalesced": len(a.get("textures", [])) - len(b.get("textures", [])), "skinJointsAndInverseBindMatricesExact": True, "primitiveMaterialAndSkinningSemanticsExact": True, "skins": skin_rows},
            "khronos": {"validator": raw["validator"], "errors": 0, "warnings": 0, "infos": raw["khronosIssues"]["numInfos"], "truncated": raw["khronosIssues"]["truncated"]},
            "ggdHardPolicyErrors": [], "formalAdoptionGeometryEligible": True,
            "visualAcceptance": {"maxChangedPixelPct": visual["maxChangedPixelPctAtChannelDeltaGt10"], "maxLitClassificationXorPct": visual["maxLitClassificationXorPctAtLuma128"], "contractMaxPct": 5, "humanReview": visual["humanReview"]},
            "motion": {"native": 0, "procedural": 0, "sixStateComplete": False, "missing": ["idle", "run", "attack", "cast", "hurt", "death"]},
            "runtimeSelectable": False, "productionDeploymentVerified": False,
        }
        encoded = json.dumps(output, ensure_ascii=False, indent=2) + "\n"; target = stage / "final-validation.json"
        if write: target.write_text(encoded)
        else: require(target.is_file() and target.read_text() == encoded, f"stale final validation: {variant}")
        summaries.append({"variant": variant, "sha256": output["candidate"]["sha256"], "metrics": output["metrics"], "visual": output["visualAcceptance"]})
    return {"candidates": summaries}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    print(json.dumps(validate(args.repo.resolve(), args.output_root.resolve(), args.write), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
