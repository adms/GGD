#!/usr/bin/env python3
"""Apply an explicit near-identical OPAQUE material-pair dedupe to one GLB."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from glb_material_alpha import deduplicate_near_identical_opaque_base_color_materials


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb", type=Path)
    parser.add_argument("conversion", type=Path)
    parser.add_argument("source_analysis", type=Path)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--pair", action="append", nargs=2, required=True, metavar=("CANONICAL", "DUPLICATE"))
    args = parser.parse_args()
    conversion = json.loads(args.conversion.read_text())
    analysis = json.loads(args.source_analysis.read_text())
    input_bytes = args.glb.stat().st_size
    input_sha256 = digest(args.glb)
    if conversion["output"]["bytes"] != input_bytes or conversion["output"]["sha256"] != input_sha256:
        raise RuntimeError("GLB differs from Blender conversion receipt before material finalization")

    adjustments = deduplicate_near_identical_opaque_base_color_materials(
        args.glb, [tuple(pair) for pair in args.pair]
    )
    if len(adjustments) != len(args.pair):
        raise RuntimeError("Every explicit material pair must produce exactly one adjustment")
    output_bytes = args.glb.stat().st_size
    output_sha256 = digest(args.glb)
    conversion["output"].update({"bytes": output_bytes, "sha256": output_sha256})
    conversion.setdefault("materialCompatibilityAdjustments", []).extend(adjustments)
    analysis.setdefault("materialCompatibilityAdjustments", []).extend(adjustments)
    args.conversion.write_text(json.dumps(conversion, ensure_ascii=False, indent=2) + "\n")
    args.source_analysis.write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + "\n")
    receipt = {
        "schema": "ggd-near-identical-opaque-material-finalization@1",
        "input": {"path": str(args.glb.resolve()), "bytes": input_bytes, "sha256": input_sha256},
        "output": {"path": str(args.glb.resolve()), "bytes": output_bytes, "sha256": output_sha256},
        "conversionReceipt": str(args.conversion.resolve()),
        "sourceAnalysis": str(args.source_analysis.resolve()),
        "adjustments": adjustments,
    }
    args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
