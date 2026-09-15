#!/usr/bin/env python3
"""Rebuild the fixed Mario, Link, and Sonic Worldblender c00 batch twice.

The script runs Blender with embedded scripts disabled through the shared SSBU
converter, applies the current GGD normalizer, validates every GLB, renders the
first build in WebGL, and requires the second build to be byte-identical. Link's
source exposes both high and low LODs at once, so the reproducible Link branch
selects the low LOD, targets 7,900 triangles, coalesces identity mesh nodes,
adds neutral vertex colours only where absent, and uses the checked-in atlas
worker to satisfy the six-draw limit. No animation is invented or retargeted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


CHARACTERS = {
    "mario": {
        "nameZh": "瑪利歐",
        "sourceSha256": "8af85d9accb3f13b2bc920553da2a9545cbdb980182bba15d59f23274a03c44d",
        "candidateId": "ssbu-mario-c00-static-skinned-v2",
        "excludePrefixes": [],
        "reduction": False,
    },
    "link": {
        "nameZh": "林克",
        "sourceSha256": "1291da62c7075a847d48841d087f350cc5bc62119661acda9cd00099b85f1506",
        "candidateId": "ssbu-link-c00-static-skinned-v1",
        "excludePrefixes": ["body_c00_highShape"],
        "reduction": True,
    },
    "sonic": {
        "nameZh": "索尼克",
        "sourceSha256": "670fcfa00a5fedf91344c3a9dac599130f51c44c0bc655ca710efe75e054cfc5",
        "candidateId": "ssbu-sonic-c00-static-skinned-v1",
        "excludePrefixes": [],
        "reduction": False,
    },
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str], cwd: Path) -> str:
    result = subprocess.run(command, cwd=cwd, check=True, text=True, capture_output=True)
    return result.stdout


def source_for(asset_root: Path, character: str) -> Path:
    return (
        asset_root
        / "intake/public-models-20260910/gitlab-ssbu-models/source-repository/fighter"
        / character
        / "model/body/c00"
        / f"{character}-c00.blend"
    )


def build_one(repo: Path, asset_root: Path, blender: Path, root: Path, character: str, render: bool) -> dict:
    config = CHARACTERS[character]
    source = source_for(asset_root, character)
    if not source.is_file() or sha(source) != config["sourceSha256"]:
        raise ValueError(f"{character} frozen source is missing or changed: {source}")
    if root.exists():
        raise ValueError(f"output must not exist: {root}")
    converter = repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py"
    command = [
        str(blender), "--background", "--factory-startup", "--python", str(converter), "--",
        str(source), str(root), "--expected-sha256", config["sourceSha256"],
        "--candidate-id", config["candidateId"],
    ]
    for prefix in config["excludePrefixes"]:
        command.extend(["--exclude-visible-mesh-prefix", prefix])
    run(command, repo)
    shutil.copyfile(root / "body.glb", root / "blender-export.glb")
    shutil.copyfile(root / "conversion.json", root / "blender-conversion.json")
    if config["reduction"]:
        run([
            "node", str(repo / "tools/model-budget/optimize/decimate.mjs"),
            str(root / "blender-export.glb"), str(root / "decimated.glb"), "7900", "0.02",
        ], repo)
        run([
            "node", "--import", "tsx",
            str(repo / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/coalesce_worldblender_component.mts"),
            str(root / "decimated.glb"), str(root / "coalesced.glb"), str(root / "coalescing.json"), config["candidateId"],
        ], repo)
        run([
            "node", "--import", "tsx",
            str(repo / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/harmonize_worldblender_attributes.mts"),
            str(root / "coalesced.glb"), str(root / "harmonized.glb"), str(root / "attribute-harmonization.json"), config["candidateId"],
        ], repo)
        atlas_output = run([
            "python3", str(repo / "tools/model-budget/optimize/atlas_pack.py"), str(root / "harmonized.glb"),
            "--out", str(root / "body.glb"), "--edge", "256", "--pad", "4", "--max-draws", "6",
            "--quality", "0.45", "--atlases", "2",
        ], repo)
        atlas = json.loads(atlas_output)
        if atlas.get("afterDraws") != 6:
            raise ValueError(f"Link atlas did not reach six draws: {atlas}")
        (root / "atlas.json").write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n")
        run([
            "python3", str(repo / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/finalize_worldblender_alpha_atlas.py"),
            str(root / "body.glb"), str(root / "alpha-atlas-finalization.json"),
        ], repo)
        standardization = {
            "schema": "ggd-worldblender-c00-standardization@1",
            "candidateId": config["candidateId"],
            "sourceId": "gitlab-ssbu-models",
            "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": sha(source)},
            "sourceActionCount": 0,
            "stages": {
                "lodSelection": {"excludedVisibleMeshPrefixes": config["excludePrefixes"]},
                "decimation": {"targetTriangles": 7900, "errorBound": 0.02},
                "coalescingReceipt": str(root / "coalescing.json"),
                "attributeHarmonizationReceipt": str(root / "attribute-harmonization.json"),
                "atlas": atlas,
                "alphaAtlasFinalizationReceipt": str(root / "alpha-atlas-finalization.json"),
            },
            "output": {"path": str(root / "body.glb"), "bytes": (root / "body.glb").stat().st_size, "sha256": sha(root / "body.glb")},
            "runtimeReady": False,
            "runtimeSelectable": False,
            "defaultEligible": False,
        }
        (root / "standardization.json").write_text(json.dumps(standardization, ensure_ascii=False, indent=2) + "\n")
    else:
        run([
            "node", "--import", "tsx",
            str(repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/normalize_static_component.mts"),
            str(root / "blender-export.glb"), str(root / "blender-conversion.json"),
            str(root / "body.glb"), str(root / "standardization.json"),
        ], repo)
    run([
        "node", "--import", "tsx",
        str(repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts"),
        str(root / "body.glb"), str(root / "standardization.json"), str(root / "validation.json"),
    ], repo)
    if render:
        run([
            "python3", str(repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.py"),
            str(root / "body.glb"), str(root / "render-v1"), "--repo", str(repo),
        ], repo)
    return json.loads((root / "validation.json").read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--blender", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--characters", nargs="+", choices=sorted(CHARACTERS), default=sorted(CHARACTERS))
    args = parser.parse_args()
    repo, asset_root, output_root = args.repo.resolve(), args.asset_root.resolve(), args.output_root.resolve()
    if output_root.exists():
        raise ValueError(f"batch output root must not exist: {output_root}")
    output_root.mkdir(parents=True)
    rows = []
    for character in args.characters:
        first = output_root / character / "first"
        rebuild = output_root / character / "rebuild"
        validation = build_one(repo, asset_root, args.blender.resolve(), first, character, True)
        rebuild_validation = build_one(repo, asset_root, args.blender.resolve(), rebuild, character, False)
        if (first / "body.glb").read_bytes() != (rebuild / "body.glb").read_bytes():
            raise ValueError(f"{character} rebuild is not byte-identical")
        rows.append({
            "character": character,
            "nameZh": CHARACTERS[character]["nameZh"],
            "candidateId": CHARACTERS[character]["candidateId"],
            "sourceSha256": CHARACTERS[character]["sourceSha256"],
            "outputSha256": sha(first / "body.glb"),
            "outputBytes": (first / "body.glb").stat().st_size,
            "triangles": validation["ggdInspection"]["triangles"],
            "drawPrimitives": validation["ggdInspection"]["drawPrimitives"],
            "joints": validation["ggdInspection"]["joints"],
            "textures": validation["ggdInspection"]["textures"],
            "finiteFloatValues": validation["finiteFloatAccessors"]["valueCount"],
            "nativeAnimationCount": 0,
            "khronosErrors": validation["khronosIssues"]["numErrors"],
            "khronosWarnings": validation["khronosIssues"]["numWarnings"],
            "rebuildValidationPassed": rebuild_validation["structuralValidationPassed"],
            "byteIdenticalRebuild": True,
            "runtimeSelectable": False,
            "deployed": False,
        })
    receipt = {"schema": "ggd-worldblender-c00-batch-build@1", "blender": str(args.blender.resolve()), "characters": rows}
    (output_root / "batch-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
