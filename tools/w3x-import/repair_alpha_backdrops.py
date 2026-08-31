#!/usr/bin/env python3
"""Repair shipped GLBs whose transparent atlas is bound to an OPAQUE material.

The importer now applies this rule in ``w3xlib/gltf.py``.  This migration keeps
the already-shipped geometry, animation, buffers and images byte-for-byte and
changes only the glTF material ``alphaMode``.  It exists because a full map
re-import also changes unrelated legacy geometry; a texture-safety repair must
not smuggle those changes into the same patch.

Usage:
  python3 tools/w3x-import/repair_alpha_backdrops.py --check
  python3 tools/w3x-import/repair_alpha_backdrops.py --write
"""
from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "content" / "assets" / "models" / "imported"
ALPHA_BACKGROUND_MAX = 5
MIN_BACKGROUND_SHARE = 0.02


def chunks(data: bytes) -> tuple[dict, bytes]:
    if len(data) < 20 or struct.unpack_from("<II", data, 0) != (0x46546C67, 2):
        raise ValueError("not GLB v2")
    offset, doc, binary = 12, None, None
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        body = data[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            doc = json.loads(body.rstrip(b" \0"))
        elif kind == 0x004E4942:
            binary = body
        offset = (offset + 8 + size + 3) & ~3
    if doc is None or binary is None:
        raise ValueError("missing JSON/BIN chunk")
    return doc, binary


def png_for(doc: dict, binary: bytes, texture_index: int) -> Image.Image | None:
    textures = doc.get("textures", [])
    if not 0 <= texture_index < len(textures):
        return None
    image_index = textures[texture_index].get("source")
    images = doc.get("images", [])
    if not isinstance(image_index, int) or not 0 <= image_index < len(images):
        return None
    view_index = images[image_index].get("bufferView")
    views = doc.get("bufferViews", [])
    if not isinstance(view_index, int) or not 0 <= view_index < len(views):
        return None
    view = views[view_index]
    start = view.get("byteOffset", 0)
    raw = binary[start:start + view["byteLength"]]
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def repairs(doc: dict, binary: bytes) -> list[str]:
    changed: list[str] = []
    cache: dict[int, Image.Image | None] = {}
    for index, material in enumerate(doc.get("materials", [])):
        if material.get("alphaMode", "OPAQUE") != "OPAQUE":
            continue
        texture_index = (material.get("pbrMetallicRoughness", {})
                         .get("baseColorTexture", {}).get("index"))
        if not isinstance(texture_index, int):
            continue
        image = cache.setdefault(texture_index, png_for(doc, binary, texture_index))
        if image is None:
            continue
        histogram = image.getchannel("A").histogram()
        pixels = image.width * image.height
        background = sum(histogram[:ALPHA_BACKGROUND_MAX + 1]) / pixels
        if background < MIN_BACKGROUND_SHARE:
            continue
        material["alphaMode"] = "BLEND"
        material.pop("alphaCutoff", None)
        changed.append(
            f"mat{index}:{material.get('name', '?')} transparent={background * 100:.2f}%"
        )
    return changed


def encode(doc: dict, binary: bytes) -> bytes:
    raw_json = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    raw_json += b" " * ((-len(raw_json)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(raw_json) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(raw_json), 0x4E4F534A) + raw_json
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    bad = 0
    for path in sorted(MODEL_DIR.glob("*.glb")):
        data = path.read_bytes()
        doc, binary = chunks(data)
        changed = repairs(doc, binary)
        if not changed:
            continue
        bad += len(changed)
        print(f"{path.name}: " + "; ".join(changed))
        if args.write:
            path.write_bytes(encode(doc, binary))
    if args.check and bad:
        print(f"FAIL: {bad} OPAQUE transparent-atlas material(s)")
        return 1
    print(f"{'repaired' if args.write else 'checked'}: {bad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
