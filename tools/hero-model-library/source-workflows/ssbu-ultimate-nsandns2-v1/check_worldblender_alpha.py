#!/usr/bin/env python3
"""Audit finalized SSBU GLBs for OPAQUE materials with transparent images."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


HELPER_ROOT = Path(__file__).resolve().parents[1] / "ssbu-models-v1"
sys.path.insert(0, str(HELPER_ROOT))
from glb_material_alpha import audit_opaque_material_texture_alpha  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glbs", nargs="+", type=Path)
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()
    rows = [audit_opaque_material_texture_alpha(path) for path in args.glbs]
    receipt = {
        "schema": "ggd-worldblender-material-alpha-audit@1",
        "files": rows,
        "passed": all(row["passed"] for row in rows),
        "opaqueTransparentBlockers": sum(
            len(row["opaqueTransparentBlockers"]) for row in rows
        ),
    }
    if args.receipt:
        args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
