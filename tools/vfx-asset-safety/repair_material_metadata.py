#!/usr/bin/env python3
"""Restore source WC3 material blend metadata in already-shipped GLBs.

Current ``w3xlib.gltf`` writes ``extras.w3x`` for every emitted MDX layer, but
older imported GLBs predate that contract.  Geometry heuristics cannot recover
the difference between Additive and AddAlpha (notably the spherical poweraura),
so this migration reads the checked-in raw MDX and copies only facts that map
unambiguously to an existing ``matN`` / ``matN_lM`` glTF material.

No texture, mesh, animation or binary buffer bytes are changed.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
IMPORT_ROOT = ROOT / "tools" / "w3x-import"
OUT = IMPORT_ROOT / "out" / "GoDieEX22s"
MODEL_DIR = ROOT / "content" / "assets" / "models" / "imported"
sys.path.insert(0, str(IMPORT_ROOT))

from w3xlib.gltf import filter_mode_info  # noqa: E402
from w3xlib.mdx import parse_mdx  # noqa: E402

MATERIAL_NAME = re.compile(r"mat(?P<material>\d+)(?:_l(?P<layer>\d+))?")


def glb_chunks(data: bytes) -> tuple[dict, bytes]:
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


def encode(doc: dict, binary: bytes) -> bytes:
    raw_json = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    raw_json += b" " * ((-len(raw_json)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(raw_json) + 8 + len(binary)
    return (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(raw_json), 0x4E4F534A) + raw_json
        + struct.pack("<II", len(binary), 0x004E4942) + binary
    )


def source_index() -> dict[str, Path]:
    report = json.loads((OUT / "models_report.json").read_text())
    return {
        row["glb"]: OUT / "raw" / row["source"]
        for row in report
        if row.get("glb") and row.get("source")
    }


def restore(doc: dict, model) -> list[str]:
    changed: list[str] = []
    for index, material in enumerate(doc.get("materials", [])):
        if (material.get("extras") or {}).get("w3x"):
            continue
        # The runtime only consumes source blend metadata for emissive stock
        # effects.  Do not expand this migration into unrelated body materials.
        if max(material.get("emissiveFactor", [0])) <= 0:
            continue
        match = MATERIAL_NAME.fullmatch(material.get("name", ""))
        if not match:
            continue
        material_index = int(match.group("material"))
        if material_index >= len(model.materials):
            continue
        layers = model.materials[material_index].layers
        layer_text = match.group("layer")
        # An old unsuffixed material is safe to map only when the MDX material
        # had exactly one layer.  A collapsed multi-layer material is lossy and
        # must be regenerated, not guessed here.
        if layer_text is None:
            if len(layers) != 1:
                continue
            layer_index = 0
        else:
            layer_index = int(layer_text)
            if layer_index >= len(layers):
                continue
        layer = layers[layer_index]
        texture_id = int(layer.texture_id)
        replaceable_id = (
            int(model.textures[texture_id].replaceable_id)
            if 0 <= texture_id < len(model.textures)
            else 0
        )
        mode = filter_mode_info(int(layer.filter_mode))
        material.setdefault("extras", {})["w3x"] = {
            "material": material_index,
            "layer": layer_index,
            "filterMode": int(layer.filter_mode),
            "blend": mode.name,
            "replaceableId": replaceable_id,
        }
        changed.append(
            f"mat{index}:{material.get('name', '?')}={mode.name}/{int(layer.filter_mode)}"
        )
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()

    pending = 0
    sources = source_index()
    for path in sorted(MODEL_DIR.glob("*.glb")):
        source = sources.get(path.name)
        if source is None or not source.is_file():
            continue
        data = path.read_bytes()
        doc, binary = glb_chunks(data)
        changed = restore(doc, parse_mdx(source.read_bytes()))
        if not changed:
            continue
        pending += len(changed)
        print(f"{path.name}: " + "; ".join(changed))
        if args.write:
            repaired = encode(doc, binary)
            _, repaired_binary = glb_chunks(repaired)
            if repaired_binary != binary:
                raise AssertionError(f"{path.name}: binary chunk changed during metadata-only repair")
            path.write_bytes(repaired)

    if args.check and pending:
        print(f"FAIL: {pending} source material metadata fact(s) are missing")
        return 1
    print(f"{'repaired' if args.write else 'checked'}: {pending}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
