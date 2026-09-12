#!/usr/bin/env python3
"""Normalize transparent Mario materials while preserving geometry and animation bytes."""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
ALPHA_TOOL = REPO / "tools/w3x-import/repair_alpha_backdrops.py"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_alpha_tool():
    spec = importlib.util.spec_from_file_location("ggd_alpha_repair", ALPHA_TOOL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-sha256", required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_file():
        raise SystemExit(f"Missing source GLB: {source}")
    if output.exists():
        raise SystemExit(f"Output directory must not exist: {output}")
    source_bytes = source.read_bytes()
    if sha(source_bytes) != args.source_sha256.lower():
        raise SystemExit("Source GLB hash mismatch")

    alpha = load_alpha_tool()
    before, binary = alpha.chunks(source_bytes)
    after = copy.deepcopy(before)
    changes = alpha.repairs(after, binary)
    expected = {"mat2:EyeL transparent=81.61%", "mat3:EyeR transparent=81.61%"}
    if set(changes) != expected:
        raise RuntimeError(f"Unexpected material repairs: {changes}")
    output_bytes = alpha.encode(after, binary)
    decoded, output_binary = alpha.chunks(output_bytes)
    if output_binary != binary:
        raise RuntimeError("Binary chunk changed during material normalization")
    for key in set(before) | set(decoded):
        if key != "materials" and before.get(key) != decoded.get(key):
            raise RuntimeError(f"Non-material glTF JSON changed: {key}")
    if before.get("animations") != decoded.get("animations"):
        raise RuntimeError("Animation JSON changed during material normalization")

    output.mkdir(parents=True)
    output_path = output / "component.glb"
    output_path.write_bytes(output_bytes)
    tool_bytes = ALPHA_TOOL.read_bytes()
    receipt = {
        "schema": "ggd-ssbu-mario-ultimate14-motion-material-normalization@1",
        "source": {"path": str(source), "bytes": len(source_bytes), "sha256": sha(source_bytes)},
        "tool": {"path": str(ALPHA_TOOL), "sha256": sha(tool_bytes)},
        "changes": changes,
        "binaryChunkByteIdentical": True,
        "nonMaterialJsonSemanticIdentical": True,
        "animationJsonSemanticIdentical": True,
        "output": {"path": str(output_path), "bytes": len(output_bytes), "sha256": sha(output_bytes)},
    }
    receipt_path = output / "normalization.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
