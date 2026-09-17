#!/usr/bin/env python3
"""Losslessly enlarge one verified embedded palette texture with nearest sampling."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
from typing import Any

import PIL
from PIL import Image

from solid_placeholder_to_factor import read_glb, write_glb


def replace_palette(
    document: dict[str, Any],
    binary: bytes,
    image_index: int,
    expected_image_sha256: str,
    expected_size: tuple[int, int],
    scale: int,
) -> tuple[dict[str, Any], bytes, dict[str, Any]]:
    if scale < 2:
        raise ValueError("scale must be at least 2")
    images = document.get("images", [])
    if image_index < 0 or image_index >= len(images):
        raise ValueError(f"image index {image_index} outside 0..{len(images) - 1}")
    image = images[image_index]
    if image.get("mimeType") != "image/png" or not isinstance(image.get("bufferView"), int):
        raise ValueError("only an embedded PNG bufferView is supported")
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    end = start + view["byteLength"]
    source = binary[start:end]
    actual = hashlib.sha256(source).hexdigest()
    if actual != expected_image_sha256:
        raise ValueError(f"image sha256 {actual} != expected {expected_image_sha256}")
    decoded = Image.open(io.BytesIO(source)).convert("RGBA")
    if decoded.size != expected_size:
        raise ValueError(f"image size {decoded.size} != expected {expected_size}")
    colors = sorted(decoded.get_flattened_data())
    if len(set(colors)) < 2:
        raise ValueError("verified palette must contain at least two colors")

    output_image = decoded.resize(
        (decoded.width * scale, decoded.height * scale),
        resample=Image.Resampling.NEAREST,
    )
    encoded = io.BytesIO()
    output_image.save(encoded, format="PNG", optimize=False, compress_level=9)
    replacement = encoded.getvalue()
    expected_colors = sorted(color for color in colors for _ in range(scale * scale))
    if sorted(output_image.get_flattened_data()) != expected_colors:
        raise ValueError("nearest-neighbour expansion changed palette colors")

    # This focused converter accepts only a final image bufferView. That keeps
    # geometry, skin and animation byte offsets exactly unchanged.
    if end != len(binary):
        raise ValueError("image bufferView must be the final binary payload")
    binary = binary[:start] + replacement
    view["byteLength"] = len(replacement)
    document["buffers"][0]["byteLength"] = len(binary)
    asset = document.setdefault("asset", {})
    generator = asset.get("generator", "")
    suffix = "ggd-verified-palette-nearest"
    asset["generator"] = f"{generator}; {suffix}" if generator else suffix
    return document, binary, {
        "imageIndex": image_index,
        "inputImageSha256": actual,
        "outputImageSha256": hashlib.sha256(replacement).hexdigest(),
        "inputSize": list(expected_size),
        "outputSize": [output_image.width, output_image.height],
        "uniqueRgbaColors": len(set(colors)),
        "scale": scale,
        "resampling": "nearest",
        "pillowVersion": PIL.__version__,
        "geometrySkinAnimationBinaryPrefixIdentical": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--image-index", type=int, required=True)
    parser.add_argument("--expected-image-sha256", required=True)
    parser.add_argument("--expected-width", type=int, required=True)
    parser.add_argument("--expected-height", type=int, required=True)
    parser.add_argument("--scale", type=int, required=True)
    args = parser.parse_args()

    document, binary = read_glb(args.input)
    document, binary, receipt = replace_palette(
        document,
        binary,
        args.image_index,
        args.expected_image_sha256,
        (args.expected_width, args.expected_height),
        args.scale,
    )
    write_glb(args.output, document, binary)
    receipt.update({
        "input": str(args.input),
        "inputSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "output": str(args.output),
        "outputSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        "outputBytes": args.output.stat().st_size,
    })
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
