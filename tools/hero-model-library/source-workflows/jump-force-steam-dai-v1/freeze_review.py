#!/usr/bin/env python3
"""Freeze compact conversion and WebGL evidence without promoting the review GLB."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--conversion-receipt", type=Path, required=True)
    parser.add_argument("--review-dir", type=Path, required=True)
    parser.add_argument("--git-evidence-dir", type=Path, required=True)
    args = parser.parse_args()
    glb = args.glb.resolve()
    conversion_path = args.conversion_receipt.resolve()
    review_dir = args.review_dir.resolve()
    git_dir = args.git_evidence_dir.resolve()
    conversion = json.loads(conversion_path.read_text(encoding="utf-8"))
    run = json.loads((review_dir / "run.json").read_text(encoding="utf-8"))
    proof = json.loads((review_dir / "proof.json").read_text(encoding="utf-8"))
    if conversion["output"]["sha256"] != sha256(glb) or run["sourceSha256"] != sha256(glb):
        raise ValueError("conversion and WebGL receipts do not reference the selected GLB")
    if len(conversion.get("composition", [])) != 6 or not proof.get("geometry") or proof.get("skeletons") != 1 or proof.get("animationGroups") != 0:
        raise ValueError("WebGL proof does not match the complete-body static review contract")
    images = [review_dir / f"{name}.png" for name in ("front", "back", "isometric")]
    if any(not path.is_file() for path in images):
        raise ValueError("three-view evidence is incomplete")
    git_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(conversion_path, git_dir / "conversion-receipt.json")
    shutil.copy2(review_dir / "proof.json", git_dir / "webgl-proof.json")
    image_rows = []
    for path in images:
        target = git_dir / path.name
        shutil.copy2(path, target)
        image_rows.append({"path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target)})
    receipt = {
        "schema": "ggd-jump-force-dai-visual-review@1",
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "candidateId": "jump-force-native-dai-chr0430-review-v4",
        "glb": {"absolutePath": str(glb), "bytes": glb.stat().st_size, "sha256": sha256(glb)},
        "composition": conversion["composition"],
        "structuralEvidence": {
            "meshCount": len(conversion["composition"]),
            "rendererGeometryCount": len(proof["geometry"]),
            "skeletonCount": proof["skeletons"],
            "animationCount": proof["animationGroups"],
            "textures": len(proof.get("textures", [])),
        },
        "visualEvidence": image_rows,
        "review": {
            "completeBodyObserved": True,
            "frontBackIsometricRendered": True,
            "diagnosticMaterialTintRemoved": True,
            "sourceTexturesBound": True,
            "genericPbrMaterialBindingAccepted": True,
            "sourceGameShaderParity": False,
            "materialParityStatus": "source-textures-and-blend-modes-bound-parent-shader-parity-unverified",
            "ggdIntakeAccepted": False,
            "backendSelectable": False,
            "productionDeployed": False,
        },
        "decision": "retain-as-local-complete-body-review-component-pending-parent-shader-parity-formal-intake-and-motion",
    }
    target_receipt = git_dir / "visual-review.json"
    target_receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"visualReview": str(target_receipt), "sha256": sha256(target_receipt)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}")
        raise SystemExit(1)
