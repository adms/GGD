#!/usr/bin/env python3
"""Repair the four community bodies rejected by the shipped backdrop gate.

Only material metadata and pixels that are already transparent or belong to a
dominant rectangular carrier are changed. Geometry, rig and animation buffer
views stay byte-identical. Repaired GLBs are written under their SHA-256 name,
then the corresponding model document is updated atomically.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
MODEL_ASSETS = CONTENT / "assets/models/community"
MARKER = "ggdCommunityBackdropRepairV1"

TARGETS = {
    "community.body.406ee3ab0b16edcacb05a529e166da3807848b6c0416848e": {"blend": [0]},
    "community.body.90ece6241bb7ea6061ad46fe3e3714cd6bd470b2d3589223": {"blend": [0]},
    "community.body.88f4f2cead78c695452d9c95429fe7478bd842dde8bc7b59": {"clear_hidden_rgb": [1, 2]},
    "community.body.d5743afe53dd93c4e69d1f951702a55c1f9fe1ca04c3b9bb": {
        "clear_carrier": [2],
        "clear_hidden_rgb": [2],
    },
}


def decode_glb(data: bytes) -> tuple[dict, bytes]:
    if len(data) < 20 or struct.unpack_from("<II", data, 0) != (0x46546C67, 2):
        raise ValueError("not GLB v2")
    doc = binary = None
    offset = 12
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        body = data[offset + 8 : offset + 8 + size]
        if kind == 0x4E4F534A:
            doc = json.loads(body.rstrip(b" \0"))
        elif kind == 0x004E4942:
            binary = body
        offset = (offset + 8 + size + 3) & ~3
    if doc is None or binary is None:
        raise ValueError("missing JSON or BIN chunk")
    return doc, binary


def encode_glb(doc: dict, binary: bytes) -> bytes:
    raw_json = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    raw_json += b" " * (-len(raw_json) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(raw_json) + 8 + len(binary)
    return (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(raw_json), 0x4E4F534A)
        + raw_json
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )


def material_image_view(doc: dict, material_index: int) -> int:
    material = doc["materials"][material_index]
    texture = material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    image = doc["textures"][texture]["source"]
    return doc["images"][image]["bufferView"]


def rewrite_views(doc: dict, binary: bytes, replacements: dict[int, bytes]) -> bytes:
    original = []
    rebuilt = bytearray()
    for index, view in enumerate(doc.get("bufferViews", [])):
        start = view.get("byteOffset", 0)
        blob = binary[start : start + view["byteLength"]]
        original.append(blob)
        while len(rebuilt) % 4:
            rebuilt.append(0)
        view["byteOffset"] = len(rebuilt)
        blob = replacements.get(index, blob)
        view["byteLength"] = len(blob)
        rebuilt.extend(blob)
    for index, blob in enumerate(original):
        if index not in replacements:
            start = doc["bufferViews"][index]["byteOffset"]
            end = start + doc["bufferViews"][index]["byteLength"]
            if bytes(rebuilt[start:end]) != blob:
                raise AssertionError(f"non-image bufferView {index} changed")
    doc["buffers"] = [{"byteLength": len(rebuilt)}]
    return bytes(rebuilt)


def png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def clear_hidden_rgb(image: Image.Image) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    changed = 0
    fixed = []
    for red, green, blue, alpha in pixels:
        if alpha <= 5 and max(red, green, blue) > 0:
            fixed.append((0, 0, 0, alpha))
            changed += 1
        else:
            fixed.append((red, green, blue, alpha))
    rgba.putdata(fixed)
    return rgba, changed


def clear_dominant_edge_carrier(image: Image.Image) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    width, height = rgba.size
    border = max(1, round(min(width, height) * 0.05))
    buckets: dict[int, int] = {}
    for index, (red, green, blue, alpha) in enumerate(pixels):
        x, y = index % width, index // width
        if alpha < 250 or not (x < border or y < border or x >= width - border or y >= height - border):
            continue
        key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5)
        buckets[key] = buckets.get(key, 0) + 1
    if not buckets:
        raise AssertionError("no opaque edge carrier found")
    dominant = max(buckets, key=buckets.get)
    changed = 0
    fixed = []
    for red, green, blue, alpha in pixels:
        key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5)
        if alpha >= 250 and key == dominant:
            fixed.append((red, green, blue, 0))
            changed += 1
        else:
            fixed.append((red, green, blue, alpha))
    rgba.putdata(fixed)
    return rgba, changed


def repair(model_id: str, plan: dict, write: bool) -> bool:
    doc_path = CONTENT / "models" / f"{model_id}.json"
    model_doc = json.loads(doc_path.read_text())
    source = CONTENT / model_doc["glbPath"]
    gltf, binary = decode_glb(source.read_bytes())
    replacements: dict[int, bytes] = {}
    changes: list[str] = []

    for material_index in plan.get("blend", []):
        material = gltf["materials"][material_index]
        if material.get("alphaMode", "OPAQUE") == "OPAQUE":
            material["alphaMode"] = "BLEND"
            material.pop("alphaCutoff", None)
            changes.append(f"mat{material_index}: OPAQUE->BLEND")

    for operation, fixer in (("clear_carrier", clear_dominant_edge_carrier), ("clear_hidden_rgb", clear_hidden_rgb)):
        for material_index in plan.get(operation, []):
            material = gltf["materials"][material_index]
            extras = material.setdefault("extras", {})
            operation_marker = f"{MARKER}:{operation}"
            if extras.get(operation_marker) is True or extras.get(MARKER) == operation:
                continue
            view_index = material_image_view(gltf, material_index)
            view = gltf["bufferViews"][view_index]
            start = view.get("byteOffset", 0)
            image_bytes = replacements.get(view_index, binary[start : start + view["byteLength"]])
            with Image.open(io.BytesIO(image_bytes)) as image:
                fixed, count = fixer(image)
            if count == 0:
                raise AssertionError(f"{model_id} mat{material_index}: {operation} changed zero pixels")
            replacements[view_index] = png_bytes(fixed)
            extras[operation_marker] = True
            changes.append(f"mat{material_index}: {operation} {count} pixels")

    if not changes:
        print(f"PASS {model_id}: already repaired")
        return False
    print(f"{'WRITE' if write else 'PENDING'} {model_id}: " + "; ".join(changes))
    if not write:
        return True

    rebuilt_binary = rewrite_views(gltf, binary, replacements) if replacements else binary
    result = encode_glb(gltf, rebuilt_binary)
    digest = hashlib.sha256(result).hexdigest()
    destination = MODEL_ASSETS / f"{digest}.glb"
    destination.write_bytes(result)
    model_doc["glbPath"] = destination.relative_to(CONTENT).as_posix()
    doc_path.write_text(json.dumps(model_doc, ensure_ascii=False, indent=2) + "\n")

    referenced = False
    for candidate in (CONTENT / "models").glob("*.json"):
        if candidate == doc_path or candidate.name.startswith("_"):
            continue
        try:
            referenced |= json.loads(candidate.read_text()).get("glbPath") == source.relative_to(CONTENT).as_posix()
        except (json.JSONDecodeError, KeyError):
            pass
    if source != destination and not referenced:
        source.unlink()
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    pending = sum(repair(model_id, plan, args.write) for model_id, plan in TARGETS.items())
    if pending and not args.write:
        print(f"FAIL: {pending} community model(s) need backdrop repair")
        return 1
    print(f"PASS: {pending} community model(s) repaired" if args.write else "PASS: all community backdrops current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
