#!/usr/bin/env python3
"""Probe whether the preserved patched UModel can export the 17 VFX packages."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
LIBRARY = REPO.parent / "GGD-Asset-Library"
DEPENDENCY_INDEX = REPO / "materials/hero-model-library/infinity-strash/dependency-index.json"
RAW_VFX = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-popp-vfx-direct-packages-v1/raw/strash/Content"
UMODEL = LIBRARY / "tools/UEViewer/specific-infinity-strash-macos-v1-texture-export-fix/umodel"
OUTPUT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/conversion-probe.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_probe(dependency_index: Path, raw_vfx: Path, umodel: Path) -> dict:
    document = json.loads(dependency_index.read_text())
    references = [row for row in document["externalPackageDependencies"] if row.startswith("/Game/Strash/VFX/")]
    rows = []
    with tempfile.TemporaryDirectory(prefix="ggd-popp-vfx-probe-") as temporary:
        root = Path(temporary)
        for index, reference in enumerate(references):
            asset = raw_vfx / (reference.removeprefix("/Game/") + ".uasset")
            if not asset.is_file():
                raise ValueError(f"missing probe input: {asset}")
            output = root / str(index)
            output.mkdir()
            process = subprocess.run(
                [str(umodel), "-game=strash", "-export", f"-out={output}", str(asset)],
                text=True,
                capture_output=True,
            )
            log = process.stdout + process.stderr
            match = re.search(r"Exported\s+(\d+)/(\d+)\s+objects", log)
            produced = sorted(path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file())
            rows.append(
                {
                    "reference": reference,
                    "returnCode": process.returncode,
                    "reportedExportedObjects": int(match.group(1)) if match else None,
                    "reportedExportableObjects": int(match.group(2)) if match else None,
                    "producedFiles": produced,
                    "result": "no-exportable-output" if process.returncode == 0 and not produced and match and match.group(1) == "0" else "unexpected",
                }
            )
    return {
        "schema": "ggd.infinity-strash-popp-vfx-converter-probe@1",
        "tool": {"absolutePath": str(umodel.resolve()), "bytes": umodel.stat().st_size, "sha256": sha256(umodel)},
        "input": {"dependencyIndex": str(dependency_index.resolve()), "rawVfxRoot": str(raw_vfx.resolve())},
        "packageCount": len(rows),
        "noExportableOutputCount": sum(row["result"] == "no-exportable-output" for row in rows),
        "rows": rows,
        "claim": "This probe establishes only that this exact preserved UModel binary produced no converted files. It does not prove that Unreal Engine or a future converter cannot reconstruct the effects.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dependency-index", type=Path, default=DEPENDENCY_INDEX)
    parser.add_argument("--raw-vfx", type=Path, default=RAW_VFX)
    parser.add_argument("--umodel", type=Path, default=UMODEL)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build_probe(args.dependency_index.resolve(), args.raw_vfx.resolve(), args.umodel.resolve())
    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.is_file() or args.output.read_text() != content:
            raise SystemExit("conversion probe drift")
        print(json.dumps({"status": "current", "packages": result["packageCount"], "noExportableOutput": result["noExportableOutputCount"]}))
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content)
    print(json.dumps({"output": str(args.output), "packages": result["packageCount"], "noExportableOutput": result["noExportableOutputCount"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
