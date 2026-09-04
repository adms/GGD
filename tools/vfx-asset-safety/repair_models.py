#!/usr/bin/env python3
"""Repair opaque carriers and hidden emissive mattes in shipped effect GLBs.

The importer handles both cases in ``w3xlib.gltf``. This migration repairs
already-shipped GLBs whose texture predates those rules. It replaces image-only
bufferViews and proves that meshes, accessors, skins, nodes, animations,
materials and every non-image bufferView remain byte-for-byte unchanged.
"""
from __future__ import annotations

import argparse
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools" / "w3x-import"))

from w3xlib.gltf import (  # noqa: E402
    _clear_hidden_transparent_rgb,
    _key_opaque_additive_carrier,
)
from check import (  # noqa: E402
    CONTENT,
    MAX_BRIGHT_BACKGROUND_SHARE,
    MIN_BACKGROUND_SHARE,
    OPAQUE_CARRIER_EDGE_SHARE,
    OPAQUE_CARRIER_TOTAL_SHARE,
    embedded_image,
    glb_chunks,
    material_is_planar_card,
    opaque_carrier_shares,
    transparent_background_shares,
)


def image_index_for(doc: dict, material: dict) -> int | None:
    texture_index = material.get("pbrMetallicRoughness", {}).get(
        "baseColorTexture", {}).get("index")
    if not isinstance(texture_index, int):
        return None
    textures = doc.get("textures", [])
    if not 0 <= texture_index < len(textures):
        return None
    source = textures[texture_index].get("source")
    return source if isinstance(source, int) else None


def replacements_for(doc: dict, binary: bytes, *, effect_model: bool) -> tuple[dict[int, bytes], list[str]]:
    targets: dict[int, dict[str, object]] = {}
    for material_index, material in enumerate(doc.get("materials", [])):
        image_index = image_index_for(doc, material)
        if image_index is None:
            continue
        image = embedded_image(doc, binary, image_index)
        background_share, bright_share = transparent_background_shares(image)
        emissive = max(material.get("emissiveFactor", [0]))
        if background_share >= MIN_BACKGROUND_SHARE:
            # Emissive PBR paths can reveal RGB hidden below transparent alpha.
            # This is the same source rule used by the importer; unlike the
            # carrier key it changes no visible texel and preserves alpha.
            if (
                material.get("alphaMode", "OPAQUE") != "OPAQUE"
                and emissive > 0
                and bright_share >= MAX_BRIGHT_BACKGROUND_SHARE
            ):
                target = targets.setdefault(image_index, {"mode": "transparent", "materials": []})
                target["mode"] = "transparent"
                target["materials"].append(
                    f"mat{material_index}:{material.get('name', '?')}")
            image.close()
            continue
        carrier_share, carrier_edge_share = opaque_carrier_shares(image)
        image.close()
        if not (
            (material_is_planar_card(doc, material_index) or emissive > 0 or effect_model)
            and carrier_share >= OPAQUE_CARRIER_TOTAL_SHARE
            and carrier_edge_share >= OPAQUE_CARRIER_EDGE_SHARE
        ):
            continue
        target = targets.setdefault(image_index, {"mode": "carrier", "materials": []})
        target["materials"].append(f"mat{material_index}:{material.get('name', '?')}")

    replacements: dict[int, bytes] = {}
    notes: list[str] = []
    for image_index, target in sorted(targets.items()):
        image = embedded_image(doc, binary, image_index)
        if target["mode"] == "transparent":
            keyed, changed_count = _clear_hidden_transparent_rgb(image)
            changed = changed_count > 0
            action = f"cleared {changed_count} hidden RGB texels"
        else:
            keyed, changed = _key_opaque_additive_carrier(image)
            action = "keyed opaque carrier"
        image.close()
        if not changed:
            continue
        out = io.BytesIO()
        keyed.save(out, "PNG")
        view_index = doc["images"][image_index]["bufferView"]
        replacements[view_index] = out.getvalue()
        notes.append(
            f"image{image_index} {action} ← {','.join(target['materials'])}")
    return replacements, notes


def rebuild(doc: dict, binary: bytes, replacements: dict[int, bytes]) -> bytes:
    views = doc.get("bufferViews", [])
    parts: list[bytes] = []
    offset = 0
    new_views: list[dict] = []
    for index, view in enumerate(views):
        start = view.get("byteOffset", 0)
        raw = replacements.get(index, binary[start:start + view["byteLength"]])
        new_views.append({**view, "byteOffset": offset, "byteLength": len(raw)})
        parts.append(raw)
        offset += len(raw)
        if offset % 4:
            pad = 4 - offset % 4
            parts.append(b"\0" * pad)
            offset += pad
    out_doc = {**doc, "bufferViews": new_views, "buffers": [{"byteLength": offset}]}
    raw_json = json.dumps(out_doc, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    raw_json += b" " * ((-len(raw_json)) % 4)
    raw_bin = b"".join(parts)
    total = 12 + 8 + len(raw_json) + 8 + len(raw_bin)
    return (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(raw_json), 0x4E4F534A) + raw_json
        + struct.pack("<II", len(raw_bin), 0x004E4942) + raw_bin
    )


def assert_non_image_identical(before_doc: dict, before_bin: bytes,
                               after_doc: dict, after_bin: bytes) -> None:
    for key in ("meshes", "accessors", "skins", "animations", "nodes", "materials"):
        if before_doc.get(key) != after_doc.get(key):
            raise AssertionError(f"{key} changed during image-only repair")
    image_views = {row.get("bufferView") for row in before_doc.get("images", [])}
    before_views = before_doc.get("bufferViews", [])
    after_views = after_doc.get("bufferViews", [])
    if len(before_views) != len(after_views):
        raise AssertionError("bufferView count changed")
    for index, (left, right) in enumerate(zip(before_views, after_views)):
        if index in image_views:
            continue
        l0, r0 = left.get("byteOffset", 0), right.get("byteOffset", 0)
        lraw = before_bin[l0:l0 + left["byteLength"]]
        rraw = after_bin[r0:r0 + right["byteLength"]]
        if lraw != rraw:
            raise AssertionError(f"non-image bufferView {index} changed")


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    pending = 0
    seen: set[Path] = set()
    for model_doc_path in sorted((CONTENT / "models").glob("*.json")):
        if model_doc_path.name.startswith("_"):
            continue
        model_doc = json.loads(model_doc_path.read_text())
        glb_rel = model_doc.get("glbPath")
        if not glb_rel:
            continue
        path = (CONTENT / glb_rel).resolve()
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        data = path.read_bytes()
        doc, binary = glb_chunks(data)
        replacements, notes = replacements_for(
            doc, binary, effect_model=bool(model_doc.get("fxEmitters")))
        if not replacements:
            continue
        pending += len(replacements)
        print(f"{path.relative_to(CONTENT)}: " + "; ".join(notes))
        if not args.write:
            continue
        repaired = rebuild(doc, binary, replacements)
        next_doc, next_bin = glb_chunks(repaired)
        assert_non_image_identical(doc, binary, next_doc, next_bin)
        path.write_bytes(repaired)
    if args.check and pending:
        print(f"FAIL: {pending} embedded model carrier image(s) need repair")
        return 1
    print(f"{'repaired' if args.write else 'checked'}: {pending}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
