#!/usr/bin/env python3
"""Validate the narrow structural contract for the Dai review GLB."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import struct


def glb_json(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError("not a glTF 2.0 GLB")
    declared = struct.unpack_from("<I", data, 8)[0]
    if declared != len(data):
        raise ValueError("GLB declared length differs from file length")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A or 20 + json_length > len(data):
        raise ValueError("GLB JSON chunk is invalid")
    return json.loads(data[20:20 + json_length].rstrip(b" \0"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb", type=Path)
    parser.add_argument("--expected-mesh-count", type=int, default=6)
    args = parser.parse_args()
    data = glb_json(args.glb)
    meshes = data.get("meshes", [])
    skins = data.get("skins", [])
    animations = data.get("animations", [])
    images = data.get("images", [])
    if len(meshes) != args.expected_mesh_count:
        raise ValueError(f"expected {args.expected_mesh_count} composed meshes, got {len(meshes)}")
    if len(skins) != 1 or len(skins[0].get("joints", [])) != 159:
        raise ValueError("expected one 159-joint skin")
    if animations:
        raise ValueError("review GLB must not fabricate animation clips")
    if not images:
        raise ValueError("review GLB has no embedded texture images")
    result = {
        "path": str(args.glb.resolve()),
        "bytes": args.glb.stat().st_size,
        "meshCount": len(meshes),
        "skinCount": len(skins),
        "jointCount": len(skins[0]["joints"]),
        "materialCount": len(data.get("materials", [])),
        "embeddedImageCount": len(images),
        "animationCount": len(animations),
        "status": "structural-pass-pending-visual-and-ggd-intake",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, struct.error) as error:
        print(f"error: {error}")
        raise SystemExit(1)
