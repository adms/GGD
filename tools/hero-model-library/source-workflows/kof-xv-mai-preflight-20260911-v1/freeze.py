#!/usr/bin/env python3
"""Freeze the KOF XV Mai conversion preflight without promoting it to a model candidate."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def ref(root: Path, name: str) -> dict:
    path = root / name
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-fbx", type=Path, required=True)
    parser.add_argument("--stage", type=Path, required=True)
    args = parser.parse_args()
    source, stage = args.source_fbx.resolve(), args.stage.resolve()
    if sha(source) != "cf74b4e4f551fcd1a3dd89ea8813981bb36de16f0aa8fcbd72fc18a262e01afe":
        raise ValueError("unrecognised Mai FBX source")
    files = [
        "stages/assimp-fbx-export.glb", "stages/geometry-only-analysis.glb",
        "stages/geometry-only-analysis.receipt.json", "stages/decimate-error-0.10.glb",
        "stages/decimate-error-0.25.glb", "stages/decimate-error-0.50.glb",
        "optimize-rejection.json",
    ]
    if any(not (stage / item).is_file() for item in files):
        raise ValueError("stage directory is incomplete")
    report = {
        "schema": "ggd.kof-xv-mai-standardization-preflight@1",
        "sourceId": "kof-xv-mai-whitemagesunny-raw",
        "sourceFbx": ref(source.parent, source.name),
        "tools": {
            "assimp": "6.0 shared; assimp export <FBX> assimp-fbx-export.glb -f gltf2",
            "geometryWorker": "tools/model-budget/optimize/decimate.mjs; meshoptimizer 1.2.0",
            "acceptanceTool": "tools/model-budget/optimize.ts model-budget/optimize@2",
        },
        "stages": {item: ref(stage, item) for item in files},
        "observations": {
            "sourceTriangles": 116939,
            "sourceFbxBones": 319,
            "assimpGlbSkinJoints": 229,
            "externalTextureUris": "present in the Assimp GLB and absent from the source package; removed only from geometry-only analysis copy",
            "nativeTextureBinding": "unresolved; the 12 supplied TGA files were not assigned by inference",
            "decimationTargetTriangles": 26000,
            "decimationResults": {"0.10": 87086, "0.25": 87083, "0.50": 87083},
        },
        "acceptance": {
            "convertedModel": False, "textureComplete": False, "skeletonEquivalentToFbxVerified": False,
            "budgetPassed": False, "visualReview": False, "backendRegistered": False,
            "runtimeSelectable": False,
        },
        "outcome": "rejected-preflight; preserve all source and stage files, resolve material mapping and use a conversion path that meets the triangle budget before retrying",
    }
    (stage / "analysis.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
