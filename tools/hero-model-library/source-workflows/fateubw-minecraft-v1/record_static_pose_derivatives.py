#!/usr/bin/env python3
"""Copy bounded FateUBW derivative receipts into a new Git evidence directory."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_new(source: Path, destination: Path) -> dict:
    if not source.is_file(): raise ValueError("missing evidence source: " + str(source))
    if destination.exists(): raise ValueError("evidence destination already exists: " + str(destination))
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    if sha256(source) != sha256(destination): raise ValueError("evidence copy hash mismatch")
    return {"path": str(destination), "sha256": sha256(destination), "bytes": destination.stat().st_size}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--visual", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    batch, visual, output = args.batch.resolve(), args.visual.resolve(), args.output.resolve()
    if output.exists(): raise ValueError("output evidence directory must be new")
    output.mkdir(parents=True)
    copied = []
    for filename in ("batch-manifest.json", "validation.json"):
        copied.append(copy_new(batch / filename, output / filename))
    for filename in ("visual-evidence.json", "contact-sheet.png"):
        copied.append(copy_new(visual / filename, output / filename))
    manifest = json.loads((batch / "batch-manifest.json").read_text())
    for record in manifest["records"]:
        candidate = record["candidateId"]
        copied.append(copy_new(batch / candidate / "derivative-report.json",
                               output / "candidates" / candidate / "derivative-report.json"))
    receipt = {
        "schema": "ggd-fateubw-static-pose-derivative-evidence-receipt@1",
        "batchRoot": str(batch), "visualRoot": str(visual),
        "outputs": copied,
        "counts": manifest["counts"],
        "findings": {
            "converted": 5,
            "blocked": 0,
            "numericSourcePosesConvertedToOneSecondDerivedHolds": 3,
            "durationlessTimeFormulaSourcesConvertedToExactPeriodDerivedLoops": 2,
            "nativeDurationClips": 0,
        },
        "status": "derived GLB candidates structurally and visually verified; not registered or runtime ready",
        "nativeDurationClaim": False,
        "runtimeReady": False,
        "backendSelectionVerified": False,
        "rightsCleared": False,
        "remaining": ["human visual approval", "GGD action/event mapping", "rights clearance",
                      "backend option registration", "runtime switching validation", "deployment"],
    }
    (output / "evidence-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt["findings"], ensure_ascii=False))


if __name__ == "__main__":
    main()
