#!/usr/bin/env python3
"""Small, Blender-independent helpers for SSBU base-colour alpha export."""

from __future__ import annotations

import json
import io
from pathlib import Path
import struct


TRANSPARENCY_RENDER_METHODS = frozenset({"BLENDED", "DITHERED"})
ALPHA_OPAQUE_THRESHOLD = 1.0 - (0.5 / 255.0)


def composite_alpha_masked_colors(
    base_pixels: list[float] | tuple[float, ...],
    overlay_pixels: list[float] | tuple[float, ...],
) -> list[float]:
    """Bake ``mix(base RGB, overlay RGB, overlay alpha)`` as opaque RGBA.

    Blender exposes byte-image pixels in scene-linear float space. Keeping the
    calculation here avoids colour-space round trips and makes the exact node
    operation independently regression-testable.
    """

    if len(base_pixels) != len(overlay_pixels) or len(base_pixels) % 4:
        raise ValueError("Base and overlay must be equally sized RGBA pixel arrays")
    output = [0.0] * len(base_pixels)
    for offset in range(0, len(base_pixels), 4):
        factor = min(1.0, max(0.0, float(overlay_pixels[offset + 3])))
        inverse = 1.0 - factor
        output[offset] = float(base_pixels[offset]) * inverse + float(overlay_pixels[offset]) * factor
        output[offset + 1] = float(base_pixels[offset + 1]) * inverse + float(overlay_pixels[offset + 1]) * factor
        output[offset + 2] = float(base_pixels[offset + 2]) * inverse + float(overlay_pixels[offset + 2]) * factor
        output[offset + 3] = 1.0
    return output


def should_promote_source_material(
    source_render_method: str | None,
    base_color_alpha_minimum: float | None,
    base_color_image_count: int,
) -> bool:
    """Return whether source evidence authorizes OPAQUE -> BLEND correction.

    The image alone is insufficient: game textures can store unrelated data in
    alpha.  Worldblender's DITHERED/BLENDED material setting is the author's
    transparency signal, while one unambiguous upstream base-colour image with
    a non-opaque alpha value proves that glTF must consume the channel.
    """

    return (
        source_render_method in TRANSPARENCY_RENDER_METHODS
        and base_color_image_count == 1
        and base_color_alpha_minimum is not None
        and base_color_alpha_minimum < ALPHA_OPAQUE_THRESHOLD
    )


def _load_glb(path: Path) -> tuple[int, int, dict, list[tuple[int, bytes]]]:
    raw = path.read_bytes()
    if len(raw) < 28 or raw[:4] != b"glTF":
        raise RuntimeError("Blender output is not a complete GLB")
    magic, version, total = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise RuntimeError("Blender output has an invalid GLB header")
    chunks: list[tuple[int, bytes]] = []
    offset = 12
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise RuntimeError("Blender GLB chunk header is truncated")
        length, kind = struct.unpack_from("<II", raw, offset)
        payload = raw[offset + 8 : offset + 8 + length]
        if len(payload) != length:
            raise RuntimeError("Blender GLB chunk is truncated")
        chunks.append((kind, payload))
        offset += 8 + length
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise RuntimeError("Expected a leading JSON chunk from Blender")
    document = json.loads(chunks[0][1].decode("utf-8").rstrip(" \t\r\n\0"))
    return magic, version, document, chunks


def _save_glb(
    path: Path,
    magic: int,
    version: int,
    document: dict,
    chunks: list[tuple[int, bytes]],
) -> None:
    json_bytes = json.dumps(
        document, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    output_chunks = [(0x4E4F534A, json_bytes)]
    for kind, payload in chunks[1:]:
        # GLB requires every chunk length to be a multiple of four bytes.  Keep
        # buffers[0].byteLength at the logical BIN length recorded by the
        # caller; the trailing NUL bytes are container padding only.
        payload += b"\0" * ((4 - len(payload) % 4) % 4)
        output_chunks.append((kind, payload))
    total = 12 + sum(8 + len(payload) for _, payload in output_chunks)
    output = bytearray(struct.pack("<III", magic, version, total))
    for kind, payload in output_chunks:
        output.extend(struct.pack("<II", len(payload), kind))
        output.extend(payload)
    path.write_bytes(output)


def promote_transparent_base_color_materials(
    glb_path: Path, material_names: set[str]
) -> list[dict]:
    """Make source-authorized transparent materials explicit in glTF.

    Blender 4.5 can emit OPAQUE when a DITHERED source material has a
    transparent base-colour image but the Principled Alpha socket is not wired.
    The RGBA base-colour image is still embedded, so correcting alphaMode is a
    lossless JSON-level fix. Existing BLEND and MASK choices are preserved.
    """

    magic, version, document, chunks = _load_glb(glb_path)
    adjustments = []
    for material in document.get("materials", []):
        name = material.get("name")
        if name not in material_names:
            continue
        base_color_texture = (
            material.get("pbrMetallicRoughness", {}) or {}
        ).get("baseColorTexture")
        if not isinstance(base_color_texture, dict):
            raise RuntimeError(
                f"Source-authorized transparent material lost baseColorTexture: {name}"
            )
        source_mode = material.get("alphaMode", "OPAQUE")
        if source_mode == "MASK":
            continue
        if source_mode not in ("OPAQUE", "BLEND"):
            raise RuntimeError(f"Unsupported glTF alphaMode {source_mode!r}: {name}")
        if source_mode == "OPAQUE":
            material["alphaMode"] = "BLEND"
            adjustments.append(
                {
                    "material": name,
                    "property": "glTF alphaMode",
                    "sourceValue": "OPAQUE",
                    "exportValue": "BLEND",
                    "reason": (
                        "The source material requests transparent rendering and its "
                        "unambiguous base-colour image contains non-opaque alpha."
                    ),
                }
            )
    if adjustments:
        _save_glb(glb_path, magic, version, document, chunks)
    return adjustments


def deduplicate_near_identical_opaque_base_color_materials(
    glb_path: Path,
    material_pairs: list[tuple[str, str]],
    max_channel_difference: int = 1,
) -> list[dict]:
    """Make one explicitly named OPAQUE pair share a visually equal texture.

    Some source material bakes produce left/right images that differ only by
    byte-rounding.  This transform is opt-in per material pair: it verifies the
    render state, sampler, dimensions, opaque alpha, and RGB error bound before
    pointing the second material at the first material's texture.  UVs and
    sampler wrap behaviour are preserved.
    """

    if not 0 <= max_channel_difference <= 255:
        raise ValueError("max_channel_difference must be between 0 and 255")
    if not material_pairs:
        return []
    from PIL import Image

    magic, version, document, chunks = _load_glb(glb_path)
    if len(chunks) != 2 or chunks[1][0] != 0x004E4942:
        raise RuntimeError("Expected one JSON and one BIN chunk")
    binary = chunks[1][1]
    materials = document.get("materials", [])

    def material_index(name: str) -> int:
        matches = [index for index, material in enumerate(materials) if material.get("name") == name]
        if len(matches) != 1:
            raise RuntimeError(f"Expected exactly one material named {name!r}, got {len(matches)}")
        return matches[0]

    def normalized_render_state(material: dict) -> dict:
        state = json.loads(json.dumps(material))
        state.pop("name", None)
        state.pop("extras", None)
        base = (state.get("pbrMetallicRoughness", {}) or {}).get("baseColorTexture")
        if not isinstance(base, dict) or not isinstance(base.get("index"), int):
            raise RuntimeError("Expected an indexed baseColorTexture")
        base.pop("index")
        return state

    def texture_image(material: dict) -> tuple[int, dict, bytes, "Image.Image"]:
        if material.get("alphaMode", "OPAQUE") != "OPAQUE":
            raise RuntimeError(f"Near-identical texture dedup requires OPAQUE: {material.get('name')}")
        base = (material.get("pbrMetallicRoughness", {}) or {}).get("baseColorTexture")
        if not isinstance(base, dict) or not isinstance(base.get("index"), int):
            raise RuntimeError(f"Missing baseColorTexture: {material.get('name')}")
        texture_index = base["index"]
        texture = document["textures"][texture_index]
        image_index = texture.get("source")
        if not isinstance(image_index, int):
            raise RuntimeError(f"Base-colour texture has no image: {material.get('name')}")
        image_record = document["images"][image_index]
        if not str(image_record.get("name", "")).endswith(".ggd-opaque-base-color"):
            raise RuntimeError(f"Only derived opaque base-colour images may be deduplicated: {image_record}")
        view = document["bufferViews"][image_record["bufferView"]]
        start = int(view.get("byteOffset", 0))
        encoded = binary[start : start + int(view["byteLength"])]
        decoded = Image.open(io.BytesIO(encoded)).convert("RGBA")
        if decoded.getchannel("A").getextrema() != (255, 255):
            decoded.close()
            raise RuntimeError(f"Derived texture is not opaque: {image_record.get('name')}")
        return texture_index, image_record, encoded, decoded

    reports = []
    for canonical_name, duplicate_name in material_pairs:
        canonical = materials[material_index(canonical_name)]
        duplicate = materials[material_index(duplicate_name)]
        if normalized_render_state(canonical) != normalized_render_state(duplicate):
            raise RuntimeError(f"Material render states differ: {canonical_name}, {duplicate_name}")
        canonical_texture, canonical_image, _, canonical_pixels = texture_image(canonical)
        duplicate_texture, duplicate_image, _, duplicate_pixels = texture_image(duplicate)
        canonical_texture_record = dict(document["textures"][canonical_texture])
        duplicate_texture_record = dict(document["textures"][duplicate_texture])
        canonical_texture_record.pop("source", None)
        duplicate_texture_record.pop("source", None)
        if canonical_texture_record != duplicate_texture_record:
            canonical_pixels.close(); duplicate_pixels.close()
            raise RuntimeError(f"Texture sampler states differ: {canonical_name}, {duplicate_name}")
        if canonical_pixels.size != duplicate_pixels.size:
            canonical_pixels.close(); duplicate_pixels.close()
            raise RuntimeError(f"Texture dimensions differ: {canonical_name}, {duplicate_name}")
        canonical_bytes = canonical_pixels.tobytes()
        duplicate_bytes = duplicate_pixels.tobytes()
        differences = [abs(left - right) for left, right in zip(canonical_bytes, duplicate_bytes)]
        maximum = max(differences, default=0)
        changed_pixels = sum(
            canonical_bytes[offset : offset + 4] != duplicate_bytes[offset : offset + 4]
            for offset in range(0, len(canonical_bytes), 4)
        )
        canonical_pixels.close(); duplicate_pixels.close()
        if maximum > max_channel_difference:
            raise RuntimeError(
                f"Texture difference {maximum} exceeds {max_channel_difference}: "
                f"{canonical_name}, {duplicate_name}"
            )
        duplicate["pbrMetallicRoughness"]["baseColorTexture"]["index"] = canonical_texture
        reports.append(
            {
                "materials": [canonical_name, duplicate_name],
                "property": "glTF baseColorTexture index",
                "canonicalTextureIndex": canonical_texture,
                "replacedTextureIndex": duplicate_texture,
                "canonicalImage": canonical_image.get("name"),
                "replacedImage": duplicate_image.get("name"),
                "maximumRgbaChannelDifference": maximum,
                "changedPixelCount": changed_pixels,
                "alphaOpaque": True,
                "uvAndSamplerPreserved": True,
                "reason": (
                    "The explicitly authorized derived OPAQUE textures differ only "
                    "within the recorded byte-rounding bound, so sharing the canonical "
                    "texture removes one draw without changing UV or wrap behaviour."
                ),
            }
        )
    if reports:
        _save_glb(glb_path, magic, version, document, chunks)
    return reports


def separate_opaque_material_texture_alpha(glb_path: Path) -> list[dict]:
    """Give OPAQUE materials an opaque copy of any texture with alpha.

    Atlas packing can place opaque and transparent render keys in the same PNG.
    It can also leave unused transparent pixels in an OPAQUE-only atlas. A
    file-wide safety scan correctly rejects both cases. The OPAQUE copy retains
    RGB exactly and changes only alpha to 255; non-OPAQUE materials keep the
    original atlas.
    """

    from PIL import Image

    magic, version, document, chunks = _load_glb(glb_path)
    if len(chunks) != 2 or chunks[1][0] != 0x004E4942:
        raise RuntimeError("Expected one JSON and one BIN chunk")
    binary = bytearray(chunks[1][1])
    texture_modes: dict[int, set[str]] = {}
    for material in document.get("materials", []):
        base = (material.get("pbrMetallicRoughness", {}) or {}).get("baseColorTexture")
        if isinstance(base, dict) and isinstance(base.get("index"), int):
            texture_modes.setdefault(base["index"], set()).add(
                material.get("alphaMode", "OPAQUE")
            )
    replacements: dict[int, int] = {}
    reports = []
    for texture_index, modes in sorted(texture_modes.items()):
        if "OPAQUE" not in modes:
            continue
        texture = document["textures"][texture_index]
        image_index = texture.get("source")
        if not isinstance(image_index, int):
            continue
        image_record = document["images"][image_index]
        view_index = image_record.get("bufferView")
        if not isinstance(view_index, int):
            continue
        view = document["bufferViews"][view_index]
        start = int(view.get("byteOffset", 0))
        encoded = bytes(binary[start : start + int(view["byteLength"])])
        decoded = Image.open(io.BytesIO(encoded)).convert("RGBA")
        alpha = decoded.getchannel("A")
        if alpha.getextrema() == (255, 255):
            decoded.close()
            continue
        opaque = decoded.copy()
        opaque.putalpha(255)
        encoded_output = io.BytesIO()
        opaque.save(encoded_output, format="PNG", optimize=True)
        opaque.close()
        decoded.close()
        while len(binary) % 4:
            binary.append(0)
        new_offset = len(binary)
        payload = encoded_output.getvalue()
        binary.extend(payload)
        document.setdefault("bufferViews", []).append(
            {"buffer": 0, "byteOffset": new_offset, "byteLength": len(payload)}
        )
        new_view = len(document["bufferViews"]) - 1
        document.setdefault("images", []).append(
            {
                "bufferView": new_view,
                "mimeType": "image/png",
                "name": f"{image_record.get('name', f'image{image_index}')}.ggd-opaque",
            }
        )
        new_image = len(document["images"]) - 1
        new_texture_record = dict(texture)
        new_texture_record["source"] = new_image
        document.setdefault("textures", []).append(new_texture_record)
        new_texture = len(document["textures"]) - 1
        replacements[texture_index] = new_texture
        reports.append(
            {
                "sourceTextureIndex": texture_index,
                "sourceImageIndex": image_index,
                "sourceImageName": image_record.get("name"),
                "sourceModes": sorted(modes),
                "opaqueTextureIndex": new_texture,
                "opaqueImageIndex": new_image,
                "opaqueImageName": document["images"][new_image]["name"],
                "rgbUnchanged": True,
                "outputAlphaMinimum": 255,
            }
        )
    if not replacements:
        return []
    for material in document.get("materials", []):
        if material.get("alphaMode", "OPAQUE") != "OPAQUE":
            continue
        base = (material.get("pbrMetallicRoughness", {}) or {}).get("baseColorTexture")
        if isinstance(base, dict) and base.get("index") in replacements:
            base["index"] = replacements[base["index"]]
    document["buffers"][0]["byteLength"] = len(binary)
    _save_glb(glb_path, magic, version, document, [chunks[0], (0x004E4942, bytes(binary))])
    return reports


def audit_opaque_material_texture_alpha(glb_path: Path) -> dict:
    """Report OPAQUE materials whose referenced image has transparent pixels."""

    from PIL import Image

    _, _, document, chunks = _load_glb(glb_path)
    if len(chunks) != 2 or chunks[1][0] != 0x004E4942:
        raise RuntimeError("Expected one JSON and one BIN chunk")
    binary = chunks[1][1]
    image_alpha: dict[int, tuple[int, int]] = {}
    rows = []
    blockers = []
    for material_index, material in enumerate(document.get("materials", [])):
        base = (material.get("pbrMetallicRoughness", {}) or {}).get("baseColorTexture")
        if not isinstance(base, dict) or not isinstance(base.get("index"), int):
            continue
        texture_index = base["index"]
        image_index = document["textures"][texture_index].get("source")
        if not isinstance(image_index, int):
            continue
        if image_index not in image_alpha:
            image = document["images"][image_index]
            view = document["bufferViews"][image["bufferView"]]
            start = int(view.get("byteOffset", 0))
            encoded = binary[start : start + int(view["byteLength"])]
            decoded = Image.open(io.BytesIO(encoded)).convert("RGBA")
            image_alpha[image_index] = decoded.getchannel("A").getextrema()
            decoded.close()
        alpha_minimum, alpha_maximum = image_alpha[image_index]
        row = {
            "materialIndex": material_index,
            "materialName": material.get("name"),
            "alphaMode": material.get("alphaMode", "OPAQUE"),
            "textureIndex": texture_index,
            "imageIndex": image_index,
            "imageName": document["images"][image_index].get("name"),
            "alphaMinimum": alpha_minimum,
            "alphaMaximum": alpha_maximum,
        }
        rows.append(row)
        if row["alphaMode"] == "OPAQUE" and alpha_minimum < 255:
            blockers.append(row)
    return {
        "glb": str(glb_path.resolve()),
        "materials": rows,
        "opaqueTransparentBlockers": blockers,
        "passed": not blockers,
    }
