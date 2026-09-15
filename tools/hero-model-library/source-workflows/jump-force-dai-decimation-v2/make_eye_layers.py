#!/usr/bin/env python3
"""Create transparent 256px replacements for broken opaque JUMP eye overlays."""
from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import struct

from PIL import Image


NAMES = ("T_Chr0430_lens_C", "T_Chr0430_eyeshadow_C")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = args.source.read_bytes()
    json_length, chunk_type = struct.unpack_from("<II", data, 12)
    if data[:4] != b"glTF" or chunk_type != 0x4E4F534A:
        raise ValueError("input is not a binary glTF with JSON first")
    model = json.loads(data[20:20 + json_length])
    binary_offset = 20 + ((json_length + 3) // 4 * 4)
    binary_length, binary_type = struct.unpack_from("<II", data, binary_offset)
    if binary_type != 0x004E4942:
        raise ValueError("GLB has no BIN chunk")
    binary = data[binary_offset + 8:binary_offset + 8 + binary_length]
    images = {image.get("name"): image for image in model.get("images", [])}
    args.output.mkdir(parents=True, exist_ok=False)
    records = []
    for name in NAMES:
        image = images.get(name)
        if not image or "bufferView" not in image:
            raise ValueError(f"missing embedded image {name}")
        view = model["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        source_image = Image.open(BytesIO(binary[start:start + view["byteLength"]])).convert("RGBA")
        source_size = source_image.size
        source_image.putalpha(0)
        replacement = source_image.resize((256, 256), Image.Resampling.LANCZOS)
        output = args.output / f"{name}.png"
        replacement.save(output, optimize=False)
        records.append({"name": name, "sourceSize": list(source_size), "outputSize": [256, 256], "bytes": output.stat().st_size, "sha256": sha(output)})
    receipt = {"schema": "ggd.jump-force-dai-eye-layer-repair@1", "reason": "RGB overlays were exported without their Unreal opacity channel and rendered as opaque black eye masks.", "operation": "set overlay alpha to zero; retain underlying eye texture", "files": records}
    (args.output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
