#!/usr/bin/env python3
"""Build a non-destructive multi-channel atlas candidate for KOF XV Ash.

The generic optimiser deliberately refuses this source: it has two meshes and
every useful material has more than a base-colour map.  This source-specific
step keeps those rendering inputs coupled.  It creates base-colour, normal and
metallic-roughness atlases together, remaps UV0 for every primitive, and merges
only primitives that retain the same alpha/factor rendering group.  Originals
are read-only and the output is a candidate until visual review succeeds.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

CT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
EDGE = 256
PAD = 2

# Each group has exactly one render state after all texture channels are
# atlas-backed.  Group 2 remains BLEND; no alpha mode is silently changed.
GROUP_OF_MATERIAL = {
    0: 0, 3: 0, 4: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0,
    1: 1, 6: 1,
    2: 2, 17: 2,
    5: 3, 15: 3, 16: 3,
}
REPRESENTATIVE = {0: 0, 1: 1, 2: 2, 3: 5}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2:
        raise ValueError(f"not a GLB 2: {path}")
    json_len, json_kind = struct.unpack_from("<II", raw, 12)
    if json_kind != 0x4E4F534A:
        raise ValueError("GLB has no JSON chunk")
    data = json.loads(raw[20:20 + json_len])
    at = 20 + ((json_len + 3) & ~3)
    bin_len, bin_kind = struct.unpack_from("<II", raw, at)
    if bin_kind != 0x004E4942:
        raise ValueError("GLB has no BIN chunk")
    return data, bytearray(raw[at + 8:at + 8 + bin_len])


def save(path: Path, data: dict, blob: bytes) -> None:
    encoded = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    binary = bytes(blob) + b"\0" * ((4 - len(blob) % 4) % 4)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(binary))
        + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
        + struct.pack("<II", len(binary), 0x004E4942) + binary
    )


def append_view(data: dict, blob: bytearray, payload: bytes, target: int | None = None) -> int:
    while len(blob) % 4:
        blob.append(0)
    offset = len(blob)
    blob.extend(payload)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
    if target is not None:
        view["target"] = target
    data["bufferViews"].append(view)
    return len(data["bufferViews"]) - 1


def view_bytes(data: dict, blob: bytes, index: int) -> bytes:
    view = data["bufferViews"][index]
    offset = view.get("byteOffset", 0)
    return bytes(blob[offset:offset + view["byteLength"]])


def read_accessor(data: dict, blob: bytes, index: int):
    accessor = data["accessors"][index]
    if "sparse" in accessor or "bufferView" not in accessor:
        raise ValueError(f"unsupported accessor {index}")
    view = data["bufferViews"][accessor["bufferView"]]
    width = NC[accessor["type"]]
    fmt = CT[accessor["componentType"]]
    unit = struct.calcsize(fmt) * width
    stride = view.get("byteStride", unit)
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<" + fmt * width, blob, offset + i * stride)
            for i in range(accessor["count"])]


def texture_image(data: dict, blob: bytes, texture: int | None, fallback: Image.Image) -> Image.Image:
    if texture is None:
        return fallback.copy()
    source = data["textures"][texture].get("source")
    if not isinstance(source, int):
        raise ValueError("texture has no embedded image source")
    image = data["images"][source]
    if "bufferView" not in image:
        raise ValueError("external image URI is not allowed in frozen candidate")
    return Image.open(io.BytesIO(view_bytes(data, blob, image["bufferView"]))).convert("RGBA")


def material_tuple(data: dict, material: int) -> tuple[int, int | None, int | None]:
    entry = data["materials"][material]
    pbr = entry.get("pbrMetallicRoughness", {})
    base = pbr.get("baseColorTexture", {}).get("index")
    if not isinstance(base, int):
        raise ValueError(f"material {material} lacks base colour texture")
    normal = entry.get("normalTexture", {}).get("index")
    mr = pbr.get("metallicRoughnessTexture", {}).get("index")
    return base, normal if isinstance(normal, int) else None, mr if isinstance(mr, int) else None


def cell_positions(count: int) -> list[tuple[int, int, int, int]]:
    if not 1 <= count <= 4:
        raise ValueError(f"unsupported atlas member count {count}")
    cell = EDGE if count == 1 else EDGE // 2
    return [(i % 2 * cell, i // 2 * cell, cell, cell) for i in range(count)]


def make_atlas(data: dict, blob: bytearray, members: list[tuple[int, int | None, int | None]]):
    flat_normal = Image.new("RGBA", (EDGE, EDGE), (128, 128, 255, 255))
    default_mr = Image.new("RGBA", (EDGE, EDGE), (0, 255, 0, 255))
    atlases = [Image.new("RGBA", (EDGE, EDGE), (0, 0, 0, 0)) for _ in range(3)]
    mapping = {}
    for item, (x, y, width, height) in zip(members, cell_positions(len(members))):
        inner_w, inner_h = width - PAD * 2, height - PAD * 2
        inputs = [texture_image(data, blob, item[0], Image.new("RGBA", (EDGE, EDGE))),
                  texture_image(data, blob, item[1], flat_normal),
                  texture_image(data, blob, item[2], default_mr)]
        for atlas, image in zip(atlases, inputs):
            atlas.paste(image.resize((inner_w, inner_h), Image.Resampling.LANCZOS), (x + PAD, y + PAD))
        mapping[item] = ((x + PAD) / EDGE, (y + PAD) / EDGE, inner_w / EDGE, inner_h / EDGE)
    return atlases, mapping


def add_texture(data: dict, blob: bytearray, image: Image.Image, name: str, sampler: int) -> int:
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    view = append_view(data, blob, out.getvalue())
    data.setdefault("images", []).append({"name": name, "mimeType": "image/png", "bufferView": view})
    data.setdefault("textures", []).append({"source": len(data["images"]) - 1, "sampler": sampler})
    return len(data["textures"]) - 1


def replace_uv(data: dict, blob: bytearray, primitive: dict, mapping: tuple[float, float, float, float]) -> None:
    accessor = primitive["attributes"].get("TEXCOORD_0")
    if not isinstance(accessor, int):
        raise ValueError("Ash primitive lacks UV0")
    ox, oy, sx, sy = mapping
    values = read_accessor(data, blob, accessor)
    if any(u < -1e-5 or u > 1.00001 or v < -1e-5 or v > 1.00001 for u, v in values):
        raise ValueError("tiled UV cannot enter an atlas")
    payload = b"".join(struct.pack("<ff", ox + min(max(u, 0.0), 1.0) * sx,
                                     oy + min(max(v, 0.0), 1.0) * sy)
                       for u, v in values)
    view = append_view(data, blob, payload, 34962)
    data["accessors"].append({"bufferView": view, "componentType": 5126,
                               "count": len(values), "type": "VEC2"})
    primitive["attributes"]["TEXCOORD_0"] = len(data["accessors"]) - 1


def merge_mesh(data: dict, blob: bytearray, mesh: dict) -> int:
    """Merge matching primitives inside one mesh; never bake node transforms."""
    groups: dict[int, list[dict]] = {}
    order: list[int] = []
    for primitive in mesh["primitives"]:
        material = primitive.get("material")
        if not isinstance(material, int):
            raise ValueError("primitive has no material")
        if material not in groups:
            groups[material] = []
            order.append(material)
        groups[material].append(primitive)
    output = []
    for material in order:
        rows = groups[material]
        if len(rows) == 1:
            output.append(rows[0])
            continue
        names = set(rows[0]["attributes"])
        if any(set(row["attributes"]) != names for row in rows):
            raise ValueError("same Ash atlas group has mismatched vertex attributes")
        attributes = {}
        counts = []
        for name in sorted(names):
            source_accessors = [row["attributes"][name] for row in rows]
            first = data["accessors"][source_accessors[0]]
            joint_width_upgrade = (name.startswith("JOINTS_") and
                                   {data["accessors"][index]["componentType"] for index in source_accessors}
                                   <= {5121, 5123})
            if any((not joint_width_upgrade and data["accessors"][index]["componentType"] != first["componentType"]) or
                   data["accessors"][index]["type"] != first["type"] or
                   bool(data["accessors"][index].get("normalized")) != bool(first.get("normalized"))
                   for index in source_accessors):
                raise ValueError("same Ash atlas group has incompatible accessor shapes")
            values = [value for index in source_accessors for value in read_accessor(data, blob, index)]
            component_type = 5123 if joint_width_upgrade else first["componentType"]
            fmt, width = CT[component_type], NC[first["type"]]
            payload = b"".join(struct.pack("<" + fmt * width, *value) for value in values)
            view = append_view(data, blob, payload, 34962)
            accessor = {"bufferView": view, "componentType": component_type,
                        "count": len(values), "type": first["type"]}
            if first.get("normalized"):
                accessor["normalized"] = True
            if name == "POSITION":
                accessor["min"] = [min(value[i] for value in values) for i in range(3)]
                accessor["max"] = [max(value[i] for value in values) for i in range(3)]
            data["accessors"].append(accessor)
            attributes[name] = len(data["accessors"]) - 1
            if not counts:
                counts = [data["accessors"][index]["count"] for index in source_accessors]
        indices = []
        base = 0
        for row, count in zip(rows, counts):
            index = row.get("indices")
            if not isinstance(index, int):
                raise ValueError("unindexed primitive is not supported")
            indices.extend(value[0] + base for value in read_accessor(data, blob, index))
            base += count
        ctype, fmt = (5125, "I") if base > 0xFFFF else (5123, "H")
        view = append_view(data, blob, struct.pack("<" + fmt * len(indices), *indices), 34963)
        data["accessors"].append({"bufferView": view, "componentType": ctype,
                                   "count": len(indices), "type": "SCALAR"})
        output.append({"attributes": attributes, "indices": len(data["accessors"]) - 1,
                       "material": material})
    before = len(mesh["primitives"])
    mesh["primitives"] = output
    return before - len(output)


def metrics(data: dict) -> dict:
    draws = sum(len(mesh.get("primitives", [])) for mesh in data.get("meshes", []))
    triangles = sum(data["accessors"][primitive["indices"]]["count"] // 3
                    for mesh in data.get("meshes", []) for primitive in mesh.get("primitives", []))
    return {"drawPrimitives": draws, "triangles": triangles, "materialCount": len(data.get("materials", [])),
            "imageCount": len(data.get("images", [])), "skinCount": len(data.get("skins", []))}


def build(source: Path, output: Path, receipt: Path) -> dict:
    data, blob = load(source)
    before = metrics(data)
    if before["drawPrimitives"] != 18 or before["triangles"] not in (7868, 7869):
        raise ValueError("unexpected Ash v2 source shape")
    nodes = [node for node in data.get("nodes", []) if "mesh" in node]
    if len(nodes) != 2 or {node.get("skin") for node in nodes} != {0} or any(
        any(key in node for key in ("matrix", "translation", "rotation", "scale")) for node in nodes
    ):
        raise ValueError("Ash mesh transform/skin assumptions changed")
    if set(range(len(data.get("materials", [])))) != set(GROUP_OF_MATERIAL):
        raise ValueError("Ash material roster changed")
    sampler = len(data.setdefault("samplers", []))
    data["samplers"].append({"wrapS": 33071, "wrapT": 33071})
    group_material = {}
    group_mapping = {}
    for group in sorted(REPRESENTATIVE):
        members = []
        for material in sorted(index for index, value in GROUP_OF_MATERIAL.items() if value == group):
            item = material_tuple(data, material)
            if item not in members:
                members.append(item)
        atlases, mapping = make_atlas(data, blob, members)
        tex = [add_texture(data, blob, image, f"ash-universal-atlas-g{group}-{channel}", sampler)
               for channel, image in zip(("base", "normal", "mr"), atlases)]
        material = copy.deepcopy(data["materials"][REPRESENTATIVE[group]])
        material.pop("name", None)
        # KHR_materials_ior is not accepted by GGD's deliberately narrow GLB
        # importer.  These source records use only its default-like IOR value
        # (1.45), while the portable PBR material is otherwise fully explicit.
        # Drop this optional, non-required extension instead of broadening the
        # importer contract or retaining an un-importable candidate.
        extensions = material.get("extensions")
        if isinstance(extensions, dict):
            extensions.pop("KHR_materials_ior", None)
            if not extensions:
                material.pop("extensions", None)
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorTexture"] = {"index": tex[0]}
        pbr["metallicRoughnessTexture"] = {"index": tex[2]}
        material["normalTexture"] = {"index": tex[1]}
        group_material[group] = len(data["materials"])
        data["materials"].append(material)
        group_mapping[group] = mapping
    for mesh in data["meshes"]:
        for primitive in mesh["primitives"]:
            original = primitive.get("material")
            if not isinstance(original, int):
                raise ValueError("Ash primitive material missing")
            group = GROUP_OF_MATERIAL[original]
            replace_uv(data, blob, primitive, group_mapping[group][material_tuple(data, original)])
            primitive["material"] = group_material[group]
    merged = sum(merge_mesh(data, blob, mesh) for mesh in data["meshes"])
    used = [value for value in data.get("extensionsUsed", []) if value != "KHR_materials_ior"]
    if used:
        data["extensionsUsed"] = used
    else:
        data.pop("extensionsUsed", None)
    required = [value for value in data.get("extensionsRequired", []) if value != "KHR_materials_ior"]
    if required:
        data["extensionsRequired"] = required
    else:
        data.pop("extensionsRequired", None)
    data["buffers"] = [{"byteLength": len(blob)}]
    save(output, data, blob)
    # Reuse the repository's conservative GC. It retains every live skin and
    # accessor and removes now-unreferenced source images/materials only.
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "model-budget" / "optimize"))
    from atlas_pack import gc_glb  # noqa: PLC0415
    gc = gc_glb(str(output))
    final, _ = load(output)
    after = metrics(final)
    if after["drawPrimitives"] > 6 or after["triangles"] != before["triangles"] or after["skinCount"] != 1:
        raise ValueError("Ash universal atlas violated draw/geometry/skin invariants")
    result = {
        "schema": "ggd.kof-xv-ash-universal-atlas@1",
        "source": {"absolutePath": str(source.resolve()), "bytes": source.stat().st_size, "sha256": sha256(source)},
        "output": {"absolutePath": str(output.resolve()), "bytes": output.stat().st_size, "sha256": sha256(output)},
        "before": before, "after": after, "mergedPrimitives": merged, "garbageCollection": gc,
        "limits": {"maxDrawPrimitives": 6, "maxTextureDimension": 256, "sourceTrianglePolicy": "preserve already-decimated 7868/7869 triangles"},
        "status": "candidate-only; requires Khronos, model guard, source-versus-output visual review and deterministic rebuild before registration",
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output, args.receipt), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
