#!/usr/bin/env python3
"""Prepare a registry-selected MBA GLB without changing the source library.

The Assimp export contains separate texture materials, optional extensions and
unnormalized weights. Bake its diffuse textures into an unlit atlas, merge draw
primitives, and normalize existing weights. This does not create or retarget a
rig. The result still requires the shared GGD validator and visual acceptance.
Requires Pillow. Only the explicitly supported source layout is accepted.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import struct
from pathlib import Path

from PIL import Image


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_glb(data: bytes) -> tuple[dict, bytes]:
    if len(data) > 32 * 1024 * 1024 or len(data) < 28:
        raise ValueError("Expected a complete GLB no larger than 32 MiB")
    magic, version, size, length, kind = struct.unpack_from("<5I", data)
    if (magic, version, size, kind) != (0x46546C67, 2, len(data), 0x4E4F534A):
        raise ValueError("Invalid GLB header")
    if length % 4 or length > 8 * 1024 * 1024 or 28 + length > len(data):
        raise ValueError("Invalid offline GLB JSON chunk")
    binary_length, binary_kind = struct.unpack_from("<2I", data, 20 + length)
    if binary_kind != 0x004E4942 or binary_length % 4 or 28 + length + binary_length != len(data):
        raise ValueError("Invalid binary chunk")
    return json.loads(data[20:20 + length]), data[28 + length:]


def encode_glb(doc: dict, binary: bytes) -> bytes:
    doc["buffers"] = [{"byteLength": len(binary)}]
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
    raw += b" " * (-len(raw) % 4)
    padded = binary + bytes(-len(binary) % 4)
    return (struct.pack("<5I", 0x46546C67, 2, 28 + len(raw) + len(padded), len(raw), 0x4E4F534A)
            + raw + struct.pack("<2I", len(padded), 0x004E4942) + padded)


def prepare(doc: dict, source_bin: bytes) -> tuple[dict, bytes, dict]:
    # Deep copy: no caller-owned descriptors or source bytes are mutated.
    doc = json.loads(json.dumps(doc))
    binary = bytearray(source_bin)
    allowed = {"KHR_materials_specular", "KHR_materials_volume", "FB_ngon_encoding"}
    if set(doc.get("extensionsUsed", [])) - allowed or doc.get("extensionsRequired"):
        raise ValueError("Unsupported required or unknown source extension")
    if len(doc.get("meshes", [])) != 1 or len(doc.get("skins", [])) != 1:
        raise ValueError("Expected one MBA body mesh and one original rig")
    if len([n for n in doc.get("nodes", []) if "mesh" in n]) != 1:
        raise ValueError("Instanced or composite source bodies need separate handling")
    primitives = doc["meshes"][0]["primitives"]
    material_ids = list(dict.fromkeys(p["material"] for p in primitives))
    if not material_ids or len(material_ids) > 16:
        raise ValueError("Unexpected material count")

    def view_bytes(index: int) -> bytes:
        view = doc["bufferViews"][index]
        if view.get("buffer", 0) != 0 or view.get("extensions"):
            raise ValueError("External or compressed buffer view")
        at, size = view.get("byteOffset", 0), view["byteLength"]
        if at < 0 or size < 0 or at + size > len(source_bin):
            raise ValueError("Buffer view outside source")
        return source_bin[at:at + size]

    def values(index: int, width: int) -> list[tuple]:
        accessor = doc["accessors"][index]
        expected = {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[width]
        if accessor["type"] != expected or accessor.get("sparse") or accessor.get("normalized"):
            raise ValueError("Unsupported accessor layout")
        fmt = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[accessor["componentType"]]
        item_size = struct.calcsize("<" + fmt * width)
        view = doc["bufferViews"][accessor["bufferView"]]
        stride = view.get("byteStride", item_size)
        start = accessor.get("byteOffset", 0)
        raw = view_bytes(accessor["bufferView"])
        count = accessor["count"]
        if count <= 0 or count > 1_000_000 or stride < item_size or start < 0 or start + (count - 1) * stride + item_size > len(raw):
            raise ValueError("Accessor outside buffer")
        return [struct.unpack_from("<" + fmt * width, raw, start + i * stride) for i in range(count)]

    uv_domains = {}
    for material_id in material_ids:
        uv = [row for primitive in primitives if primitive["material"] == material_id for row in values(primitive["attributes"]["TEXCOORD_0"], 2)]
        if any(not math.isfinite(value) for row in uv for value in row):
            raise ValueError("Non-finite UV")
        lo = [math.floor(min(row[k] for row in uv)) for k in range(2)]
        hi = [max(lo[k]+1, math.ceil(max(row[k] for row in uv))) for k in range(2)]
        if any(hi[k]-lo[k] > 4 for k in range(2)):
            raise ValueError("UV repeat domain exceeds four tiles")
        uv_domains[material_id] = (lo, hi)
    images = []
    for material_id in material_ids:
        material = doc["materials"][material_id]
        if set(material.get("extensions", {})) - {"KHR_materials_specular"}:
            raise ValueError("Unsupported material extension")
        if any(key in material for key in ("normalTexture", "occlusionTexture", "emissiveTexture")) or material.get("alphaMode", "OPAQUE") != "OPAQUE":
            raise ValueError("Atlas adaptation currently supports opaque diffuse bodies")
        pbr = material["pbrMetallicRoughness"]
        if pbr.get("baseColorFactor", [1, 1, 1, 1]) != [1, 1, 1, 1] or "metallicRoughnessTexture" in pbr:
            raise ValueError("Material factors need explicit baking")
        tex = pbr["baseColorTexture"]
        if tex.get("texCoord", 0) != 0 or tex.get("extensions"):
            raise ValueError("Nonstandard UV mapping")
        image_doc = doc["images"][doc["textures"][tex["index"]]["source"]]
        if image_doc.get("uri") or image_doc.get("mimeType") not in {"image/png", "image/jpeg"}:
            raise ValueError("Texture must be embedded PNG/JPEG")
        with Image.open(io.BytesIO(view_bytes(image_doc["bufferView"]))) as source:
            if max(source.size) > 2048:
                raise ValueError("Texture exceeds tablet budget")
            image = source.convert("RGBA")
            image.putalpha(255)  # Source material is OPAQUE; alpha is ignored by its renderer.
            lo, hi = uv_domains[material_id]
            texture = doc["textures"][tex["index"]]
            sampler = doc.get("samplers", [])[texture["sampler"]] if "sampler" in texture else {}
            for k, axis in enumerate(("wrapS", "wrapT")):
                if (lo[k] != 0 or hi[k] != 1) and sampler.get(axis, 10497) != 10497:
                    raise ValueError("Only REPEAT UVs support tiled atlas baking")
            tiled = Image.new("RGBA", (image.width*(hi[0]-lo[0]), image.height*(hi[1]-lo[1])))
            for u in range(hi[0]-lo[0]):
                for v in range(hi[1]-lo[1]):
                    tiled.paste(image, (u*image.width, v*image.height))
            images.append(tiled)

    gutter = 8
    columns = math.ceil(math.sqrt(len(images)))
    rows = math.ceil(len(images) / columns)
    cell_w = max(i.width for i in images) + 2 * gutter
    cell_h = max(i.height for i in images) + 2 * gutter
    edge = 2 ** math.ceil(math.log2(max(columns * cell_w, rows * cell_h)))
    if edge > 4096:
        raise ValueError("Atlas would exceed 4096 pixels")
    atlas = Image.new("RGBA", (edge, edge), (0, 0, 0, 255))
    placements = {}
    for i, (material_id, image) in enumerate(zip(material_ids, images)):
        x, y = (i % columns) * cell_w + gutter, (i // columns) * cell_h + gutter
        # Extrude edge texels into the gutter to avoid mip/filter seams.
        for dy in range(-gutter, image.height + gutter):
            strip = image.crop((0, max(0, min(image.height - 1, dy)), image.width, max(0, min(image.height - 1, dy)) + 1))
            atlas.paste(strip, (x, y + dy))
            atlas.paste(strip.crop((0, 0, 1, 1)).resize((gutter, 1)), (x - gutter, y + dy))
            atlas.paste(strip.crop((image.width - 1, 0, image.width, 1)).resize((gutter, 1)), (x + image.width, y + dy))
        placements[material_id] = (x, y, image.width, image.height)

    attributes = {"POSITION": [], "NORMAL": [], "TEXCOORD_0": [], "JOINTS_0": [], "WEIGHTS_0": []}
    indices = []
    corrected = 0
    max_delta = 0.0
    for primitive in primitives:
        if primitive.get("mode", 4) != 4 or primitive.get("targets") or primitive.get("extensions") or set(primitive["attributes"]) != set(attributes):
            raise ValueError("Expected plain skinned triangles with one UV set")
        source_attributes = {key: values(primitive["attributes"][key], width) for key, width in
                             {"POSITION": 3, "NORMAL": 3, "TEXCOORD_0": 2, "JOINTS_0": 4, "WEIGHTS_0": 4}.items()}
        count = len(source_attributes["POSITION"])
        if any(len(v) != count for v in source_attributes.values()):
            raise ValueError("Mismatched vertex attributes")
        offset = len(attributes["POSITION"])
        source_indices = [v[0] for v in values(primitive["indices"], 1)]
        if len(source_indices) % 3 or any(i >= count for i in source_indices):
            raise ValueError("Triangle index outside primitive")
        indices.extend((offset + i,) for i in source_indices)
        x, y, w, h = placements[primitive["material"]]
        for uv in source_attributes["TEXCOORD_0"]:
            lo, hi = uv_domains[primitive["material"]]
            attributes["TEXCOORD_0"].append(((x + (uv[0]-lo[0])/(hi[0]-lo[0]) * w) / edge, (y + (uv[1]-lo[1])/(hi[1]-lo[1]) * h) / edge))
        for joints, weights in zip(source_attributes["JOINTS_0"], source_attributes["WEIGHTS_0"]):
            total = sum(weights)
            if any(not math.isfinite(v) or v < 0 for v in weights) or total <= 0:
                raise ValueError("Invalid original skin weights")
            if any(not isinstance(j, int) or j >= len(doc["skins"][0]["joints"]) for j in joints):
                raise ValueError("Invalid original joint index")
            max_delta = max(max_delta, abs(total - 1))
            corrected += abs(total - 1) > 1e-7
            attributes["WEIGHTS_0"].append(tuple(v / total for v in weights))
        for key in ("POSITION", "NORMAL", "JOINTS_0"):
            attributes[key].extend(source_attributes[key])

    def append_view(raw: bytes, target: int | None = None) -> int:
        binary.extend(bytes(-len(binary) % 4))
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw)}
        if target is not None:
            view["target"] = target
        binary.extend(raw)
        doc["bufferViews"].append(view)
        return len(doc["bufferViews"]) - 1

    def append_accessor(rows: list[tuple], fmt: str, kind: str, target: int) -> int:
        flat = [v for row in rows for v in row]
        raw = struct.pack("<" + fmt * len(flat), *flat)
        accessor = {"bufferView": append_view(raw, target), "componentType": {"f": 5126, "H": 5123, "I": 5125}[fmt], "count": len(rows), "type": kind}
        if kind == "VEC3":
            accessor.update(min=[min(v[k] for v in rows) for k in range(3)], max=[max(v[k] for v in rows) for k in range(3)])
        doc["accessors"].append(accessor)
        return len(doc["accessors"]) - 1

    output_attributes = {key: append_accessor(rows, "H" if key == "JOINTS_0" else "f", "VEC" + str(len(rows[0])), 34962) for key, rows in attributes.items()}
    index_accessor = append_accessor(indices, "I", "SCALAR", 34963)
    doc["meshes"][0]["primitives"] = [{"attributes": output_attributes, "indices": index_accessor, "material": 0, "mode": 4}]
    encoded = io.BytesIO()
    source_edge = edge
    if edge > 1024:
        atlas = atlas.resize((1024, 1024), Image.Resampling.LANCZOS)
        edge = 1024
    atlas.save(encoded, format="PNG")
    doc["images"] = [{"bufferView": append_view(encoded.getvalue()), "mimeType": "image/png"}]
    doc["textures"] = [{"source": 0, "sampler": 0}]
    doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
    doc["materials"] = [{"name": "MBA diffuse atlas", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1}, "extensions": {"KHR_materials_unlit": {}}, "doubleSided": any(doc["materials"][i].get("doubleSided", False) for i in material_ids)}]
    normalized_rotations = {}
    for clip in doc.get("animations", []):
        for channel in clip.get("channels", []):
            if channel["target"]["path"] != "rotation":
                continue
            sampler = clip["samplers"][channel["sampler"]]
            if sampler.get("interpolation", "LINEAR") not in ("LINEAR", "STEP"):
                raise ValueError("Rotation normalization requires LINEAR or STEP")
            old = sampler["output"]
            if old not in normalized_rotations:
                rotations = values(old, 4)
                norms = [math.sqrt(sum(x*x for x in row)) for row in rotations]
                if any(not math.isfinite(n) or n < 1e-8 for n in norms):
                    raise ValueError("Invalid animation quaternion")
                normalized_rotations[old] = append_accessor([tuple(x/n for x in row) for row,n in zip(rotations,norms)], "f", "VEC4", None)
            sampler["output"] = normalized_rotations[old]
    renamed = []
    used = set()
    for index, clip in enumerate(doc.get("animations", [])):
        name = clip.get("name", "")
        if name in used:
            replacement = f"{name}__source_{index}"
            while replacement in used:
                replacement += "_"
            clip["name"] = replacement
            renamed.append({"index": index, "source": name, "output": replacement})
        used.add(clip.get("name", ""))
    doc["extensionsUsed"] = ["KHR_materials_unlit"]
    doc.pop("extensionsRequired", None)
    return doc, bytes(binary), {"sourceDrawPrimitives": len(primitives), "outputDrawPrimitives": 1, "vertices": len(attributes["POSITION"]), "triangles": len(indices) // 3, "atlasEdge": edge, "sourceAtlasEdge": source_edge, "renamedDuplicateClips": renamed, "normalizedRotationAccessors": len(normalized_rotations), "tiledUvDomains": uv_domains, "weightNormalization": {"vertices": corrected, "maxSumDelta": max_delta}, "adaptations": ["Diffuse textures packed; final atlas downsampled to at most 1024px, normalized UV coordinates retained", "Existing joint indices retained and weights normalized", "Unlit textured material replaces Assimp specular material", "Original rig and clip timing retained; quaternion orientation normalized"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", type=Path, required=True)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    rows = json.loads(args.query.read_text())["results"]
    matching = [r for r in rows if r["id"] == args.asset]
    if len(matching) != 1:
        raise ValueError("Select exactly one asset from query.py results")
    row = matching[0]
    if row.get("library") != "mba" or row.get("format") != "glb" or row.get("kind") != "model" or not row.get("exists_local") or row.get("readiness") != "glb_candidate" or not any(link.get("confidence") == "character_definition" for link in row.get("character_links", [])):
        raise ValueError("Registry does not establish an available MBA model candidate")
    source = Path(row["path"])
    if not source.is_absolute() or not source.is_file() or args.out.resolve() == source.resolve():
        raise ValueError("Source must exist locally; output must be a separate file")
    if not 0 < source.stat().st_size <= 32 * 1024 * 1024:
        raise ValueError("Source exceeds the 32 MiB offline preparation limit")
    raw = source.read_bytes()
    doc, binary = read_glb(raw)
    result, result_bin, report = prepare(doc, binary)
    output = encode_glb(result, result_bin)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # An existing result is never overwritten, including its adjacent receipt.
    receipt_path = args.out.with_suffix(".receipt.json")
    if args.out.exists() or receipt_path.exists():
        raise ValueError("Output already exists; choose a new version path")
    with args.out.open("xb") as stream:
        stream.write(output)
    receipt = {"schema": "ggd-library-model-preparation@1", "asset": row["id"], "source": {"path": str(source), "sha256": digest(raw), "bytes": len(raw), "characterLinks": row["character_links"]}, "output": {"path": str(args.out.resolve()), "sha256": digest(output), "bytes": len(output)}, "validation": "pending-shared-validator-and-visual-review", **report}
    with receipt_path.open("x") as stream:
        stream.write(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
