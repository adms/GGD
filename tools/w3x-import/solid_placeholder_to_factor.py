#!/usr/bin/env python3
"""Replace one verified solid placeholder texture with a material color.

The source image is removed from the glTF document rather than enlarged to evade
the texture guard.  Its RGBA value is folded into each material's existing
baseColorFactor, so the rendered color stays the same and the unresolved texture
cannot silently masquerade as recovered source art.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def parse_rgba(value: str) -> list[float]:
    parts = [int(part) for part in value.split(",")]
    if len(parts) != 4 or any(part < 0 or part > 255 for part in parts):
        raise argparse.ArgumentTypeError("RGBA must contain four comma-separated bytes")
    return [part / 255 for part in parts]


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError(f"not a GLB 2.0 file: {path}")
    offset = 12
    document: dict[str, Any] | None = None
    binary: bytes | None = None
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.rstrip(b"\0 \t\r\n"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
    if document is None or binary is None:
        raise ValueError("expected exactly one JSON and one BIN payload")
    return document, binary


def texture_references(value: Any, path: str = "") -> list[tuple[str, dict[str, Any]]]:
    found: list[tuple[str, dict[str, Any]]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else key
            if key.endswith("Texture") and isinstance(child, dict) and isinstance(child.get("index"), int):
                found.append((child_path, child))
            found.extend(texture_references(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(texture_references(child, f"{path}[{index}]"))
    return found


def repair(
    document: dict[str, Any],
    binary: bytes,
    image_index: int,
    expected_image_sha256: str,
    rgba: list[float],
) -> dict[str, Any]:
    images = document.get("images", [])
    textures = document.get("textures", [])
    if image_index < 0 or image_index >= len(images):
        raise ValueError(f"image index {image_index} outside 0..{len(images) - 1}")
    image = images[image_index]
    if set(image) - {"bufferView", "mimeType", "name", "extras"}:
        raise ValueError(f"image {image_index} has unsupported fields: {sorted(image)}")
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    payload = binary[start : start + view["byteLength"]]
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected_image_sha256:
        raise ValueError(f"image {image_index} sha256 {actual} != expected {expected_image_sha256}")

    removed_textures = [index for index, texture in enumerate(textures) if texture.get("source") == image_index]
    if not removed_textures:
        raise ValueError(f"image {image_index} is not referenced by a texture")

    refs = texture_references(document.get("materials", []))
    affected = [(path, ref) for path, ref in refs if ref["index"] in removed_textures]
    if not affected:
        raise ValueError("placeholder texture is not referenced by any material")
    unsupported = [path for path, _ in affected if not path.endswith("pbrMetallicRoughness.baseColorTexture")]
    if unsupported:
        raise ValueError(f"placeholder has non-base-color uses: {unsupported}")

    changed_materials = 0
    for material in document.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        texture = pbr.get("baseColorTexture")
        if not isinstance(texture, dict) or texture.get("index") not in removed_textures:
            continue
        factor = pbr.get("baseColorFactor", [1.0, 1.0, 1.0, 1.0])
        pbr["baseColorFactor"] = [round(float(factor[i]) * rgba[i], 9) for i in range(4)]
        del pbr["baseColorTexture"]
        changed_materials += 1
    if changed_materials == 0:
        raise ValueError("no material changed")

    for removed in sorted(removed_textures, reverse=True):
        del textures[removed]
        for _, ref in texture_references(document.get("materials", [])):
            if ref["index"] > removed:
                ref["index"] -= 1

    del images[image_index]
    for texture in textures:
        if texture.get("source", -1) > image_index:
            texture["source"] -= 1

    asset = document.setdefault("asset", {})
    generator = asset.get("generator", "")
    suffix = "ggd-solid-placeholder-material"
    asset["generator"] = f"{generator}; {suffix}" if generator else suffix
    return {
        "removedImageIndex": image_index,
        "removedTextureIndices": sorted(removed_textures),
        "changedMaterialCount": changed_materials,
        "imageSha256": actual,
    }


def write_glb(path: Path, document: dict[str, Any], binary: bytes) -> None:
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    output = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    output.extend(struct.pack("<II", len(encoded), JSON_CHUNK))
    output.extend(encoded)
    output.extend(struct.pack("<II", len(binary), BIN_CHUNK))
    output.extend(binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--image-index", type=int, required=True)
    parser.add_argument("--expected-image-sha256", required=True)
    parser.add_argument("--rgba", type=parse_rgba, required=True)
    args = parser.parse_args()

    document, binary = read_glb(args.input)
    receipt = repair(document, binary, args.image_index, args.expected_image_sha256, args.rgba)
    write_glb(args.output, document, binary)
    receipt.update(
        {
            "input": str(args.input),
            "inputSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
            "output": str(args.output),
            "outputSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        }
    )
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
