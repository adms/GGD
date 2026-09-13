#!/usr/bin/env python3
"""Separate shared BLEND/OPAQUE atlas alpha after SSBU atlas packing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


HELPER_ROOT = Path(__file__).resolve().parents[1] / "ssbu-models-v1"
sys.path.insert(0, str(HELPER_ROOT))
from glb_material_alpha import separate_opaque_material_texture_alpha  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb", type=Path)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    adjustments = separate_opaque_material_texture_alpha(args.glb)
    receipt = {
        "schema": "ggd-worldblender-alpha-atlas-finalization@1",
        "glb": str(args.glb.resolve()),
        "adjustments": adjustments,
        "opaqueTextureAlphaCopiesCreated": len(adjustments),
        "opaqueTransparentSharedAtlasesSeparated": sum(
            len(adjustment["sourceModes"]) > 1 for adjustment in adjustments
        ),
    }
    args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
