#!/usr/bin/env python3
"""Build the small Windows Infinity Strash read-only probe handoff."""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path


MEMBERS = (
    "probe_infinity_strash.ps1",
    "RUN_INFINITY_STRASH_PROBE.cmd",
    "INFINITY_STRASH_PROBE_README.md",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in MEMBERS:
            data = (source / name).read_bytes()
            info = zipfile.ZipInfo(name, (2026, 9, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    data = args.output.read_bytes()
    receipt = {
        "schema": "ggd-infinity-strash-probe-bundle@1",
        "path": str(args.output.resolve()),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "members": list(MEMBERS),
    }
    receipt_path = args.output.with_suffix(args.output.suffix + ".receipt.json")
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
