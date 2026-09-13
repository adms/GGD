#!/usr/bin/env python3
"""Compose UModel Dai glTF parts and PNGs into a deterministic review GLB.

This dependency-free path exists because Blender 5.2.1 currently crashes in
Metal backend discovery on the target Mac before Python starts.  The converter
strictly reuses the identical 159-joint skeleton from the body part and does
not add animation data.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct


DEFAULT_PARTS = (
    "chr0430_form0.gltf",
    "chr0430_form0_head.gltf",
    "chr0430_damage_A.gltf",
    "chr0430_damage_B.gltf",
    "chr0430_damage_AB.gltf",
    "chr0430_equipment1.gltf",
)
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def align4(data: bytearray, byte: int = 0) -> None:
    data.extend(bytes([byte]) * ((-len(data)) % 4))


def skeleton_signature(data: dict) -> list[tuple[str | None, tuple[float, ...], tuple[float, ...], tuple[float, ...]]]:
    skin = data["skins"][0]
    result = []
    for index in skin["joints"]:
        node = data["nodes"][index]
        result.append((
            node.get("name"),
            tuple(node.get("translation", (0.0, 0.0, 0.0))),
            tuple(node.get("rotation", (0.0, 0.0, 0.0, 1.0))),
            tuple(node.get("scale", (1.0, 1.0, 1.0))),
        ))
    return result


def material_stem(name: str) -> str | None:
    lowered = name.lower()
    for token in ("eyeshadow", "pants", "weapon", "glass", "face", "hair", "eye", "lens", "skin", "cloth", "effect"):
        if token in lowered:
            return token
    if "oral" in lowered:
        return "face"
    return None


def find_texture(texture_dir: Path, stem: str, suffix: str) -> Path | None:
    path = texture_dir / f"T_Chr0430_{stem}_{suffix}.png"
    return path if path.is_file() else None


def append_material_textures(document: dict, binary: bytearray, texture_dir: Path) -> list[dict[str, object]]:
    document.setdefault("images", [])
    document.setdefault("textures", [])
    document.setdefault("samplers", [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}])
    texture_by_path: dict[Path, int] = {}

    def texture_index(path: Path) -> int:
        if path in texture_by_path:
            return texture_by_path[path]
        align4(binary)
        payload = path.read_bytes()
        offset = len(binary)
        binary.extend(payload)
        view = len(document["bufferViews"])
        document["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload)})
        image = len(document["images"])
        document["images"].append({"name": path.stem, "bufferView": view, "mimeType": "image/png"})
        texture = len(document["textures"])
        document["textures"].append({"source": image, "sampler": 0})
        texture_by_path[path] = texture
        return texture

    bindings = []
    for material in document.get("materials", []):
        name = material.get("name", "")
        stem = material_stem(name)
        bound: dict[str, str] = {}
        pbr = material.setdefault("pbrMetallicRoughness", {})
        # UModel assigns red/green/blue diagnostic factors to material slots.
        # They are not serialized MaterialInstanceConstant values and must not
        # tint the actual exported textures.
        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
        pbr["metallicFactor"] = 0.0
        pbr["roughnessFactor"] = 0.8
        if stem:
            color = find_texture(texture_dir, stem, "C")
            normal = find_texture(texture_dir, stem, "N")
            orm = find_texture(texture_dir, stem, "ORM")
            if color:
                pbr["baseColorTexture"] = {"index": texture_index(color)}
                bound["baseColor"] = str(color)
            if normal:
                material["normalTexture"] = {"index": texture_index(normal)}
                bound["normal"] = str(normal)
            if orm:
                index = texture_index(orm)
                pbr["metallicRoughnessTexture"] = {"index": index}
                material["occlusionTexture"] = {"index": index}
                pbr["metallicFactor"] = 1.0
                pbr["roughnessFactor"] = 1.0
                bound["orm"] = str(orm)
        if "damage_blood" in name.lower():
            pbr["baseColorFactor"] = [0.18, 0.005, 0.005, 1.0]
        if "eyeshadow" in name.lower() or "head_shadow" in name.lower():
            material["alphaMode"] = "BLEND"
            material["doubleSided"] = True
        elif any(token in name.lower() for token in ("hair", "lens", "glass")):
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.333
            material["doubleSided"] = True
        bindings.append({"material": name, "textureStem": stem, "bound": bound})
    return bindings


def remap_mesh(mesh: dict, accessor_offset: int, material_offset: int) -> dict:
    result = copy.deepcopy(mesh)
    for primitive in result.get("primitives", []):
        if "indices" in primitive:
            primitive["indices"] += accessor_offset
        primitive["attributes"] = {name: index + accessor_offset for name, index in primitive.get("attributes", {}).items()}
        for target in primitive.get("targets", []):
            for name in list(target):
                target[name] += accessor_offset
        if "material" in primitive:
            primitive["material"] += material_offset
    return result


def compose(model_dir: Path, texture_dir: Path, parts: list[str]) -> tuple[dict, bytes, list[dict[str, object]]]:
    sources = []
    documents = []
    binaries = []
    for name in parts:
        path = model_dir / name
        data = json.loads(path.read_text(encoding="utf-8"))
        if len(data.get("buffers", [])) != 1 or len(data.get("skins", [])) != 1 or len(data.get("meshes", [])) != 1:
            raise ValueError(f"unexpected UModel glTF structure: {name}")
        binary_path = path.with_name(data["buffers"][0]["uri"])
        payload = binary_path.read_bytes()
        if len(payload) != data["buffers"][0]["byteLength"]:
            raise ValueError(f"binary byte length differs: {binary_path}")
        documents.append(data)
        binaries.append(payload)
        sources.extend([
            {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)},
            {"path": str(binary_path), "bytes": binary_path.stat().st_size, "sha256": sha256(binary_path)},
        ])
    signature = skeleton_signature(documents[0])
    if len(signature) != 159 or any(skeleton_signature(data) != signature for data in documents[1:]):
        raise ValueError("source parts do not have the same ordered 159-joint skeleton")

    output = copy.deepcopy(documents[0])
    binary = bytearray(binaries[0])
    output["buffers"] = [{"byteLength": 0}]
    output["asset"]["generator"] = "GGD compose_glb.py from UModel exports"
    output["asset"].setdefault("extras", {})
    output["asset"]["extras"].update({
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "nativeCharacterId": "chr0430",
        "animationStatus": "no-native-clips-in-current-export",
    })
    output.setdefault("animations", [])
    for part_number, (data, payload) in enumerate(zip(documents[1:], binaries[1:]), 1):
        align4(binary)
        binary_offset = len(binary)
        binary.extend(payload)
        view_offset = len(output["bufferViews"])
        accessor_offset = len(output["accessors"])
        material_offset = len(output["materials"])
        mesh_offset = len(output["meshes"])
        for view in data["bufferViews"]:
            copied = copy.deepcopy(view)
            copied["buffer"] = 0
            copied["byteOffset"] = copied.get("byteOffset", 0) + binary_offset
            output["bufferViews"].append(copied)
        for accessor in data["accessors"]:
            copied = copy.deepcopy(accessor)
            if "bufferView" in copied:
                copied["bufferView"] += view_offset
            if isinstance(copied.get("sparse"), dict):
                copied["sparse"]["indices"]["bufferView"] += view_offset
                copied["sparse"]["values"]["bufferView"] += view_offset
            output["accessors"].append(copied)
        output["materials"].extend(copy.deepcopy(data.get("materials", [])))
        output["meshes"].append(remap_mesh(data["meshes"][0], accessor_offset, material_offset))
        source_node = data["nodes"][0]
        node = {key: copy.deepcopy(value) for key, value in source_node.items() if key not in {"children", "mesh", "skin"}}
        node["name"] = f"Dai_chr0430_part{part_number}_{source_node.get('name', 'mesh')}"
        node["mesh"] = mesh_offset
        node["skin"] = 0
        output["nodes"].append(node)
        output["scenes"][output.get("scene", 0)]["nodes"].append(len(output["nodes"]) - 1)

    bindings = append_material_textures(output, binary, texture_dir)
    align4(binary)
    output["buffers"][0]["byteLength"] = len(binary)
    return output, bytes(binary), [{"inputs": sources, "materialBindings": bindings}]


def encode_glb(document: dict, binary: bytes) -> bytes:
    encoded = bytearray(json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    align4(encoded, 0x20)
    payload = bytearray()
    payload.extend(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(binary)))
    payload.extend(struct.pack("<II", len(encoded), JSON_CHUNK))
    payload.extend(encoded)
    payload.extend(struct.pack("<II", len(binary), BIN_CHUNK))
    payload.extend(binary)
    return bytes(payload)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--texture-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--part", action="append", default=[], help="Source glTF filename; repeat in composition order.")
    args = parser.parse_args()
    model_dir = args.model_dir.resolve()
    texture_dir = args.texture_dir.resolve()
    parts = args.part or list(DEFAULT_PARTS)
    document, binary, evidence = compose(model_dir, texture_dir, parts)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encode_glb(document, binary))
    receipt = {
        "schema": "ggd-python-gltf-composition-receipt@1",
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "converter": "tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/compose_glb.py",
        "composition": parts,
        **evidence[0],
        "output": {"path": str(output), "bytes": output.stat().st_size, "sha256": sha256(output)},
        "animationCount": 0,
        "status": "review-glb-pending-visual-and-ggd-intake",
        "blenderFallbackReason": "Blender 5.2.1 crashes during Metal backend discovery before Python starts on this host.",
    }
    receipt_path = args.receipt.resolve()
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": receipt["output"], "materials": len(document.get("materials", [])), "images": len(document.get("images", []))}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, struct.error) as error:
        print(f"error: {error}")
        raise SystemExit(1)
