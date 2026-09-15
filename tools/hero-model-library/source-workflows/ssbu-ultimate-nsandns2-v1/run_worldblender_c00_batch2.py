#!/usr/bin/env python3
"""Rebuild the Chrom, Ganondorf, and Lucina Worldblender c00 batch twice.

The fixed Blender 4.5.13 source is converted with embedded scripts disabled,
reduced below the 8,000-triangle adoption target, coalesced, merged by identical
render state, optionally atlased, structurally validated, and rendered through
the existing Babylon WebGL proof. A second clean build must be byte-identical.
This creates static skinned model components only; it does not merge Ultimate14
motions or claim six gameplay states.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


CHARACTERS = {
    "chrom": {
        "nameZh": "庫洛姆",
        "originalName": "Chrom",
        "sourceSha256": "315b422197357a96d5d3bc71532a4902f4a0e58d2f3287871e8e36e9764b83ad",
        "candidateId": "ssbu-chrom-c00-static-skinned-v1",
        "harmonize": True,
        "atlas": True,
        "ultimate14": {"nuanmbPaths": 9, "bodyMotionPaths": 9, "uniqueTransformPayloads": 9},
    },
    "ganon": {
        "nameZh": "加儂多夫",
        "originalName": "Ganondorf",
        "sourceSha256": "cefa74a20064364df875275345b06ef399182c9f98aec816ad7bc27143283613",
        "candidateId": "ssbu-ganondorf-c00-static-skinned-v1",
        "harmonize": True,
        "atlas": False,
        "ultimate14": {"nuanmbPaths": 10, "bodyMotionPaths": 10, "uniqueTransformPayloads": 10},
    },
    "lucina": {
        "nameZh": "露琪娜",
        "originalName": "Lucina",
        "sourceSha256": "b3cf288dade295275686cccee97824945347b430c8d91fa5a0ee2c103cc51e69",
        "candidateId": "ssbu-lucina-c00-static-skinned-v1",
        "harmonize": False,
        "atlas": True,
        "ultimate14": {"nuanmbPaths": 105, "bodyMotionPaths": 41, "uniqueTransformPayloads": 19},
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
    for prefix in config.get("excludePrefixes", []):
        command.extend(["--exclude-visible-mesh-prefix", prefix])
    run(command, repo)
    material_pairs = config.get("nearDuplicateOpaqueMaterialPairs", [])
    near_duplicate_receipt = None
    if material_pairs:
        near_duplicate_receipt = root / "near-duplicate-material-finalization.json"
        finalize_command = [
            "python3",
            str(repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/finalize_near_duplicate_materials.py"),
            str(root / "body.glb"),
            str(root / "conversion.json"),
            str(root / "source-analysis.json"),
            str(near_duplicate_receipt),
        ]
        for canonical, duplicate in material_pairs:
            finalize_command.extend(["--pair", canonical, duplicate])
        run(finalize_command, repo)
    shutil.copyfile(root / "body.glb", root / "blender-export.glb")
    shutil.copyfile(root / "conversion.json", root / "blender-conversion.json")

    run([
        "node", str(repo / "tools/model-budget/optimize/decimate.mjs"),
        str(root / "blender-export.glb"), str(root / "decimated.glb"), "7900", "0.02",
    ], repo)
    run([
        "node", "--import", "tsx",
        str(repo / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/coalesce_worldblender_component.mts"),
        str(root / "decimated.glb"), str(root / "coalesced.glb"), str(root / "coalescing.json"), config["candidateId"],
    ], repo)
    merge_input = root / "coalesced.glb"
    if config["harmonize"]:
        run([
            "node", "--import", "tsx",
            str(repo / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/harmonize_worldblender_attributes.mts"),
            str(root / "coalesced.glb"), str(root / "harmonized.glb"), str(root / "attribute-harmonization.json"), config["candidateId"],
        ], repo)
        merge_input = root / "harmonized.glb"
    shutil.copyfile(merge_input, root / "merged.glb")
    merge_stdout = run([
        "python3", str(repo / "tools/w3x-import/merge_glb_prims.py"), str(root / "merged.glb"),
    ], repo).strip()
    merge_receipt = {
        "schema": "ggd-worldblender-identical-render-state-merge@1",
        "candidateId": config["candidateId"],
        "input": {"path": str(merge_input), "bytes": merge_input.stat().st_size, "sha256": sha(merge_input)},
        "output": {"path": str(root / "merged.glb"), "bytes": (root / "merged.glb").stat().st_size, "sha256": sha(root / "merged.glb")},
        "toolOutput": merge_stdout,
    }
    (root / "primitive-merge.json").write_text(json.dumps(merge_receipt, ensure_ascii=False, indent=2) + "\n")

    atlas = None
    if config["atlas"]:
        atlas = json.loads(run([
            "python3", str(repo / "tools/model-budget/optimize/atlas_pack.py"), str(root / "merged.glb"),
            "--out", str(root / "body.glb"), "--edge", "256", "--pad", "4", "--max-draws", "6",
            "--quality", "0.45", "--atlases", "2",
        ], repo))
        if atlas.get("afterDraws", 999) > 6:
            raise ValueError(f"{character} atlas did not reach six draws: {atlas}")
        (root / "atlas.json").write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n")
    else:
        shutil.copyfile(root / "merged.glb", root / "body.glb")

    run([
        "python3", str(repo / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/finalize_worldblender_alpha_atlas.py"),
        str(root / "body.glb"), str(root / "alpha-atlas-finalization.json"),
    ], repo)

    standardization = {
        "schema": "ggd-worldblender-c00-standardization@2",
        "candidateId": config["candidateId"],
        "sourceId": "gitlab-ssbu-models",
        "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": sha(source)},
        "sourceActionCount": 0,
        "stages": {
            "lodSelection": {"excludedVisibleMeshPrefixes": config.get("excludePrefixes", [])},
            "decimation": {"targetTriangles": 7900, "errorBound": 0.02},
            "coalescingReceipt": str(root / "coalescing.json"),
            "attributeHarmonizationReceipt": str(root / "attribute-harmonization.json") if config["harmonize"] else None,
            "nearDuplicateMaterialFinalizationReceipt": str(near_duplicate_receipt) if near_duplicate_receipt else None,
            "primitiveMergeReceipt": str(root / "primitive-merge.json"),
            "atlas": atlas,
            "alphaAtlasFinalizationReceipt": str(root / "alpha-atlas-finalization.json"),
        },
        "output": {"path": str(root / "body.glb"), "bytes": (root / "body.glb").stat().st_size, "sha256": sha(root / "body.glb")},
        "ultimate14MotionCandidate": {
            **config["ultimate14"],
            "status": "source-indexed-not-converted-not-rig-tested-not-merged",
            "sixStateCoverageClaimed": False,
        },
        "runtimeReady": False,
        "runtimeSelectable": False,
        "defaultEligible": False,
    }
    (root / "standardization.json").write_text(json.dumps(standardization, ensure_ascii=False, indent=2) + "\n")
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
        inspect = validation["ggdInspection"]
        rows.append({
            "character": character,
            "nameZh": CHARACTERS[character]["nameZh"],
            "originalName": CHARACTERS[character]["originalName"],
            "candidateId": CHARACTERS[character]["candidateId"],
            "sourceSha256": CHARACTERS[character]["sourceSha256"],
            "outputSha256": sha(first / "body.glb"),
            "outputBytes": (first / "body.glb").stat().st_size,
            "triangles": inspect["triangles"],
            "drawPrimitives": inspect["drawPrimitives"],
            "joints": inspect["joints"],
            "textures": inspect["textureCount"],
            "finiteFloatValues": validation["finiteFloatAccessors"]["valueCount"],
            "nativeAnimationCount": inspect["clipCount"],
            "khronosErrors": validation["khronosIssues"]["numErrors"],
            "khronosWarnings": validation["khronosIssues"]["numWarnings"],
            "rebuildValidationPassed": rebuild_validation["structuralValidationPassed"],
            "byteIdenticalRebuild": True,
            "ultimate14MotionCandidate": {
                **CHARACTERS[character]["ultimate14"],
                "status": "source-indexed-not-converted-not-rig-tested-not-merged",
                "sixStateCoverageClaimed": False,
            },
            "runtimeSelectable": False,
            "deployed": False,
        })
    receipt = {
        "schema": "ggd-worldblender-c00-batch-build@2",
        "blender": str(args.blender.resolve()),
        "characters": rows,
    }
    (output_root / "batch-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
