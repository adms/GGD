#!/usr/bin/env python3
"""Repair only particle carrier edges proven unsafe by ``check.py``.

The center of the sprite is never recolored.  A four-pixel border tapers RGB
and alpha to zero, which is neutral for additive, alpha/alphaKey and modulate
rendering and prevents linear texture filtering from resurrecting a square at
the edge during animation.
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
CHECK_PATH = HERE / "check.py"
EDGE_FADE_PX = 4


def load_check_module():
    spec = importlib.util.spec_from_file_location("ggd_vfx_asset_safety_check", CHECK_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {CHECK_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fade_carrier_edge(image: Image.Image, width: int = EDGE_FADE_PX) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    changed = 0
    for y in range(rgba.height):
        for x in range(rgba.width):
            distance = min(x, y, rgba.width - 1 - x, rgba.height - 1 - y)
            factor = min(1.0, max(0.0, distance / max(1, width)))
            if factor >= 1:
                continue
            index = y * rgba.width + x
            original = pixels[index]
            faded = tuple(round(channel * factor) for channel in original)
            if faded != original:
                pixels[index] = faded
                changed += 1
    rgba.putdata(pixels)
    return rgba, changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="apply the narrow edge fade")
    args = parser.parse_args()
    check = load_check_module()
    findings = check.audit_vfx()
    non_repairable = [message for path, message in findings if path is None or "TEXTURE_BACKDROP" not in message]
    if non_repairable:
        for message in non_repairable:
            print(f"FAIL {message}")
        return 1
    paths = sorted({path for path, _message in findings if path is not None})
    if not paths:
        print("vfx-asset-safety repair: nothing to do")
        return 0
    if not args.write:
        for path in paths:
            print(path.relative_to(check.ROOT))
        print(f"vfx-asset-safety repair: {len(paths)} texture(s) require --write")
        return 1
    for path in paths:
        with Image.open(path) as source:
            repaired, changed = fade_carrier_edge(source)
        repaired.save(path, "PNG")
        print(f"repaired {path.relative_to(check.ROOT)} ({changed} edge texels)")
    remaining = check.audit_vfx()
    if remaining:
        for _path, message in remaining:
            print(f"FAIL after repair {message}")
        return 1
    print(f"vfx-asset-safety repair: PASS ({len(paths)} texture(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
