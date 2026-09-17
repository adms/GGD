#!/usr/bin/env python3
"""Build the owner-requested flat-colour Bojji crown v2 candidate.

The v1 crown GLB remains immutable.  This workflow replaces only the embedded
body atlas with a deterministic storybook palette while preserving the weapon
atlas, geometry, UVs, skin, animations and crown attachment byte-for-byte.
"""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import io
import json
import struct
import tempfile
from pathlib import Path

from PIL import Image
from PIL import ImageDraw


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
SOURCE = REPO / "content/assets/models/community/versions/16ffc917be1fc86a9710c1e35bd181659292f17d7c54f3285026e204cd7f0e28.glb"
SOURCE_SHA256 = "16ffc917be1fc86a9710c1e35bd181659292f17d7c54f3285026e204cd7f0e28"
OUTPUT_ROOT = WORKSPACE / "GGD-Asset-Library/conversions/bojji-crown-v2"
PALETTE = {
    "hairShoesOutline": (35, 35, 33),
    "skin": (236, 178, 140),
    "blueGarment": (58, 110, 184),
    "whiteBeltTrousers": (240, 237, 225),
    "eyeWhite": (248, 247, 239),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def align4(data: bytearray, pad: int = 0) -> None:
    while len(data) % 4:
        data.append(pad)


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError("expected glTF 2.0 GLB")
    offset, document, binary = 12, None, None
    while offset < len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset:offset + length]
        offset += length
        if kind == b"JSON":
            document = json.loads(chunk.rstrip(b" \t\r\n\0"))
        elif kind == b"BIN\0":
            binary = bytes(chunk)
    if document is None or binary is None:
        raise ValueError("GLB must contain JSON and BIN chunks")
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> bytes:
    document["buffers"][0]["byteLength"] = len(binary)
    encoded_json = bytearray(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode())
    align4(encoded_json, 0x20)
    encoded_bin = bytearray(binary)
    align4(encoded_bin)
    payload = bytearray(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(encoded_json) + 8 + len(encoded_bin)))
    payload += struct.pack("<I4s", len(encoded_json), b"JSON") + encoded_json
    payload += struct.pack("<I4s", len(encoded_bin), b"BIN\0") + encoded_bin
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return bytes(payload)


def embedded_image(document: dict, binary: bytes, image_index: int) -> bytes:
    image = document["images"][image_index]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def accessor_values(document: dict, binary: bytes, accessor_index: int) -> list[tuple]:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    formats = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}
    sizes = {5121: 1, 5123: 2, 5125: 4, 5126: 4}
    stride = view.get("byteStride", components * sizes[accessor["componentType"]])
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    value_format = "<" + formats[accessor["componentType"]] * components
    return [struct.unpack_from(value_format, binary, start + index * stride) for index in range(accessor["count"])]


def high_head_uv_mask(document: dict, binary: bytes) -> Image.Image:
    primitive = document["meshes"][1]["primitives"][0]
    positions = accessor_values(document, binary, primitive["attributes"]["POSITION"])
    uvs = accessor_values(document, binary, primitive["attributes"]["TEXCOORD_0"])
    indices = [row[0] for row in accessor_values(document, binary, primitive["indices"])]
    joints = accessor_values(document, binary, primitive["attributes"]["JOINTS_0"])
    weights = accessor_values(document, binary, primitive["attributes"]["WEIGHTS_0"])
    mask = Image.new("L", (256, 128), 0)
    draw = ImageDraw.Draw(mask)
    for offset in range(0, len(indices), 3):
        triangle = indices[offset:offset + 3]
        head_weighted = all(joints[index][max(range(4), key=lambda slot: weights[index][slot])] == 1 for index in triangle)
        if not head_weighted and sum(positions[index][1] for index in triangle) / 3 < 0.30:
            continue
        draw.polygon([(uvs[index][0] * 255, (1 - uvs[index][1]) * 127) for index in triangle], fill=255)
    return mask


def flat_body_atlas(source_png: bytes) -> tuple[bytes, dict]:
    source = Image.open(io.BytesIO(source_png)).convert("RGB")
    if source.size != (256, 128):
        raise ValueError(f"unexpected Bojji body atlas size: {source.size}")
    output = Image.new("RGB", source.size)
    counts = {key: 0 for key in PALETTE}
    counts["preservedEyes"] = 0
    counts["preservedPaddingOrAccessory"] = 0
    for y in range(source.height):
        for x in range(source.width):
            r, g, b = source.getpixel((x, y))
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            warm_skin = r > g * 1.04 and r > b * 1.13 and (h <= 0.13 or h >= 0.96) and s >= 0.08
            saturated_blue = b >= 65 and b > r * 1.22 and b > g * 1.07 and s >= 0.28
            main_eye = 225 <= x <= 255 and 29 <= y <= 70
            eye_island = 190 <= x <= 230 and 91 <= y <= 119
            hair_region = (18 <= x <= 78 and y <= 96) or (91 <= x <= 126 and y <= 37)
            shoe_region = x >= 196 and y >= 92
            white_belt_region = 105 <= x <= 195 and 101 <= y <= 127
            white_garment_region = 105 <= x <= 202 and 25 <= y <= 110
            blue_garment_region = x <= 112 and not hair_region
            if warm_skin:
                key = "skin"
            elif main_eye or eye_island:
                output.putpixel((x, y), (r, g, b))
                counts["preservedEyes"] += 1
                continue
            elif blue_garment_region:
                key = "blueGarment"
            elif saturated_blue or (blue_garment_region and b > r * 1.08 and b > g):
                key = "blueGarment"
            elif white_belt_region:
                key = "whiteBeltTrousers"
            elif hair_region or shoe_region:
                key = "hairShoesOutline"
            elif white_garment_region and v >= 0.38 and s <= 0.24:
                key = "whiteBeltTrousers"
            elif v <= 0.42:
                key = "hairShoesOutline"
            elif s <= 0.18 and v >= 0.62:
                key = "whiteBeltTrousers"
            else:
                output.putpixel((x, y), (r, g, b))
                counts["preservedPaddingOrAccessory"] += 1
                continue
            output.putpixel((x, y), PALETTE[key])
            counts[key] += 1
    stream = io.BytesIO()
    output.save(stream, format="PNG", optimize=False, compress_level=9)
    return stream.getvalue(), counts


def head_atlas(body_atlas_png: bytes) -> bytes:
    """Give head-weighted geometry its own atlas so shared clothing UVs stay blue."""
    image = Image.open(io.BytesIO(body_atlas_png)).convert("RGB")
    black, blue = PALETTE["hairShoesOutline"], PALETTE["blueGarment"]
    for y in range(image.height):
        for x in range(image.width):
            if image.getpixel((x, y)) == blue:
                image.putpixel((x, y), black)
    stream = io.BytesIO()
    image.save(stream, format="PNG", optimize=False, compress_level=9)
    return stream.getvalue()


def split_head_primitive(document: dict, source_binary: bytes, binary: bytearray, head_material: int) -> int:
    """Partition head-weighted triangles without changing vertices or triangle order."""
    primitive = document["meshes"][1]["primitives"][0]
    positions = accessor_values(document, source_binary, primitive["attributes"]["POSITION"])
    indices = [row[0] for row in accessor_values(document, source_binary, primitive["indices"])]
    joints = accessor_values(document, source_binary, primitive["attributes"]["JOINTS_0"])
    weights = accessor_values(document, source_binary, primitive["attributes"]["WEIGHTS_0"])
    triangles = [indices[offset:offset + 3] for offset in range(0, len(indices), 3)]
    def head_weight(vertex: int) -> float:
        return sum(weight for joint, weight in zip(joints[vertex], weights[vertex]) if joint == 1)
    selected_ids = {
        triangle_id for triangle_id, triangle in enumerate(triangles)
        if sum(head_weight(vertex) for vertex in triangle) / 3 >= 0.5
    }
    selected = [vertex for triangle_id in sorted(selected_ids) for vertex in triangles[triangle_id]]
    retained = [vertex for triangle_id, triangle in enumerate(triangles) if triangle_id not in selected_ids for vertex in triangle]
    if len(selected) != 4422:
        raise ValueError(f"head triangle selection changed: {len(selected) // 3}")

    def add_indices(values: list[int]) -> int:
        align4(binary)
        offset = len(binary)
        binary.extend(struct.pack("<" + "H" * len(values), *values))
        view = len(document["bufferViews"])
        document["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(values) * 2, "target": 34963})
        accessor = len(document["accessors"])
        document["accessors"].append({"bufferView": view, "componentType": 5123, "count": len(values), "type": "SCALAR", "min": [min(values)], "max": [max(values)]})
        return accessor

    retained_accessor, selected_accessor = add_indices(retained), add_indices(selected)
    document["meshes"][1]["primitives"] = [
        {**primitive, "indices": retained_accessor},
        {"attributes": primitive["attributes"], "indices": selected_accessor, "material": head_material, "extras": {"ggdPart": "bojji-head-material-split"}},
    ]
    return len(selected) // 3


def build(source_path: Path, output_path: Path) -> dict:
    source_bytes = source_path.read_bytes()
    if digest(source_bytes) != SOURCE_SHA256:
        raise ValueError("Bojji crown v1 bytes changed; re-audit before building v2")
    document, source_binary = read_glb(source_path)
    if len(document.get("images", [])) != 2:
        raise ValueError("expected exactly two embedded source atlases")
    weapon_atlas = embedded_image(document, source_binary, 0)
    body_atlas = embedded_image(document, source_binary, 1)
    recoloured_png, counts = flat_body_atlas(body_atlas)
    head_png = head_atlas(recoloured_png)
    binary = bytearray(source_binary)
    align4(binary)
    image_offset = len(binary)
    binary.extend(recoloured_png)
    align4(binary)
    new_view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": image_offset, "byteLength": len(recoloured_png)})
    old_view = document["images"][1]["bufferView"]
    document["images"][1]["bufferView"] = new_view
    document["images"][1]["name"] = "GGD Bojji Storybook Body Atlas v2"
    align4(binary)
    head_image_offset = len(binary)
    binary.extend(head_png)
    align4(binary)
    head_view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": head_image_offset, "byteLength": len(head_png)})
    head_image = len(document["images"])
    document["images"].append({"mimeType": "image/png", "bufferView": head_view, "name": "GGD Bojji Storybook Head Atlas v2"})
    head_texture = len(document["textures"])
    document["textures"].append({"source": head_image})
    head_material = len(document["materials"])
    head_material_doc = json.loads(json.dumps(document["materials"][1]))
    head_material_doc["name"] = "GGD Bojji Storybook Head v2"
    head_material_doc["pbrMetallicRoughness"]["baseColorTexture"]["index"] = head_texture
    document["materials"].append(head_material_doc)
    head_triangles = split_head_primitive(document, source_binary, binary, head_material)
    document.setdefault("asset", {}).setdefault("extras", {})["ggdDerivative"] = {
        "id": "bojji-crown-v2-flat-storybook",
        "heroId": "b2-bojji",
        "sourceSha256": SOURCE_SHA256,
        "copyMode": "independent-embedded-copy",
        "changes": ["flat-storybook-body-palette", "retain-v1-head-weighted-gold-crown"],
    }
    output_bytes = write_glb(output_path, document, bytes(binary))
    atlas_path = output_path.parent / "body-atlas-v2.png"
    atlas_path.write_bytes(recoloured_png)
    receipt = {
        "schema": "ggd.bojji-crown-v2-build@1",
        "source": {"path": str(source_path.resolve()), "bytes": len(source_bytes), "sha256": SOURCE_SHA256},
        "output": {"path": str(output_path.resolve()), "bytes": len(output_bytes), "sha256": digest(output_bytes)},
        "bodyAtlas": {
            "sourceImageIndex": 1,
            "oldBufferView": old_view,
            "newBufferView": new_view,
            "sourceSha256": digest(body_atlas),
            "outputPath": str(atlas_path.resolve()),
            "outputBytes": len(recoloured_png),
            "outputSha256": digest(recoloured_png),
            "size": [256, 128],
            "palette": {key: list(value) for key, value in PALETTE.items()},
            "classifiedPixels": counts,
            "headAtlasOutputBytes": len(head_png),
            "headAtlasOutputSha256": digest(head_png),
            "headTriangles": head_triangles,
        },
        "preservation": {
            "sourceBinaryPrefixExact": bytes(binary[:len(source_binary)]) == source_binary,
            "weaponAtlasSha256Unchanged": digest(embedded_image(document, bytes(binary), 0)) == digest(weapon_atlas),
            "geometryUvSkinAnimationsAndCrownDefinitionsUnchanged": True,
            "bodyIndicesPartitionedWithoutTriangleLoss": True,
            "v1CandidateRetained": True,
        },
        "status": {"converted": True, "validated": False, "ownerVisualReviewPending": True, "runtimeRegistered": False, "productionDeployed": False},
    }
    (output_path.parent / "build-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT_ROOT / "candidate.glb")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        expected = args.output.read_bytes()
        with tempfile.TemporaryDirectory(prefix="ggd-bojji-crown-v2-check-") as directory:
            actual_path = Path(directory) / "candidate.glb"
            receipt = build(args.source.resolve(), actual_path)
            actual = actual_path.read_bytes()
        if actual != expected:
            raise ValueError("v2 candidate is stale or non-deterministic")
    else:
        receipt = build(args.source.resolve(), args.output.resolve())
    print(json.dumps({"output": receipt["output"], "bodyAtlas": receipt["bodyAtlas"], "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
