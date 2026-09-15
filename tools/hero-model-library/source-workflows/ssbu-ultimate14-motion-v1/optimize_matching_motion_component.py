#!/usr/bin/env python3
"""Apply the established SSBU geometry/draw pipeline to animated GLBs."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ASSETS = WORKSPACE / "GGD-Asset-Library"
CONFIG = {
    "chrom": {"harmonize": True, "atlas": True},
    "lucina": {"harmonize": False, "atlas": True},
}
DECIMATE_RUNTIME = ASSETS / "dependencies/ggd-gltf-decimate-v1/decimate.mjs"
PINNED_RUNTIME = Path(__file__).with_name("decimate-runtime")
REPO_DECIMATE_WORKER = REPO / "tools/model-budget/optimize/decimate.mjs"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str]) -> str:
    return subprocess.run(command, cwd=REPO, check=True, text=True, capture_output=True).stdout.strip()


def pin(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def optimize(fighter: str, build: int) -> dict:
    if not DECIMATE_RUNTIME.is_file():
        raise ValueError(
            "Missing fixed decimation runtime; install the committed package-lock "
            "as documented in ssbu-ultimate14-motion-v1/README.md"
        )
    for installed, committed in (
        (DECIMATE_RUNTIME, REPO_DECIMATE_WORKER),
        (DECIMATE_RUNTIME.parent / "package.json", PINNED_RUNTIME / "package.json"),
        (DECIMATE_RUNTIME.parent / "package-lock.json", PINNED_RUNTIME / "package-lock.json"),
    ):
        if not installed.is_file() or sha(installed) != sha(committed):
            raise ValueError(f"Decimation runtime pin mismatch: {installed}")
    config = CONFIG[fighter]
    root = ASSETS / f"conversions/ssbu-{fighter}-ultimate14-motion-v1"
    raw = root / f"converted-{build:02d}"
    out = root / f"optimized-v3-{build:02d}"
    if out.exists():
        raise ValueError(f"Refusing to overwrite {out}")
    out.mkdir(parents=True)
    source = raw / "body.glb"
    shutil.copyfile(source, out / "blender-export.glb")
    decimate = json.loads(run([
        "node", str(DECIMATE_RUNTIME),
        str(source), str(out / "decimated.glb"), "7900", "0.02",
    ]))
    (out / "decimation.json").write_text(json.dumps(decimate, ensure_ascii=False, indent=2) + "\n")
    run([
        "node", "--import", "tsx",
        str(REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/coalesce_worldblender_component.mts"),
        str(out / "decimated.glb"), str(out / "coalesced.glb"), str(out / "coalescing.json"),
        f"ssbu-{fighter}-c00-ultimate14-motion-v1",
    ])
    merge_input = out / "coalesced.glb"
    if config["harmonize"]:
        run([
            "node", "--import", "tsx",
            str(REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/harmonize_worldblender_attributes.mts"),
            str(merge_input), str(out / "harmonized.glb"), str(out / "attribute-harmonization.json"),
            f"ssbu-{fighter}-c00-ultimate14-motion-v1",
        ])
        merge_input = out / "harmonized.glb"
    shutil.copyfile(merge_input, out / "merged.glb")
    merge_stdout = run(["python3", str(REPO / "tools/w3x-import/merge_glb_prims.py"), str(out / "merged.glb")])
    (out / "primitive-merge.json").write_text(json.dumps({
        "schema": "ggd-ssbu-ultimate14-motion-primitive-merge@1",
        "input": pin(merge_input), "output": pin(out / "merged.glb"), "toolOutput": merge_stdout,
    }, ensure_ascii=False, indent=2) + "\n")
    atlas = json.loads(run([
        "python3", str(REPO / "tools/model-budget/optimize/atlas_pack.py"), str(out / "merged.glb"),
        "--out", str(out / "body.glb"), "--edge", "256", "--pad", "4", "--max-draws", "6",
        "--quality", "0.45", "--atlases", "2",
    ]))
    if atlas.get("afterDraws", 999) > 6:
        raise ValueError(f"{fighter} atlas did not reach six draws")
    (out / "atlas.json").write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n")
    run([
        "python3", str(REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/finalize_worldblender_alpha_atlas.py"),
        str(out / "body.glb"), str(out / "alpha-atlas-finalization.json"),
    ])
    receipt = {
        "schema": "ggd-ssbu-ultimate14-motion-optimization@1",
        "candidateId": f"ssbu-{fighter}-c00-ultimate14-motion-v1",
        "fighterId": fighter,
        "input": pin(source),
        "inputConversion": pin(raw / "conversion.json"),
        "parameters": {"targetTriangles": 7900, "errorBound": 0.02, "maxDraws": 6, "textureEdge": 256, "harmonizeAttributes": config["harmonize"]},
        "dependencyRuntime": {
            "worker": pin(DECIMATE_RUNTIME),
            "packageLock": pin(DECIMATE_RUNTIME.parent / "package-lock.json"),
            "packageJson": pin(DECIMATE_RUNTIME.parent / "package.json"),
            "committedPackageLock": pin(PINNED_RUNTIME / "package-lock.json"),
            "committedPackageJson": pin(PINNED_RUNTIME / "package.json"),
            "committedWorker": pin(REPO_DECIMATE_WORKER),
        },
        "stages": {
            "decimation": pin(out / "decimation.json"),
            "coalescing": pin(out / "coalescing.json"),
            "attributeHarmonization": pin(out / "attribute-harmonization.json") if config["harmonize"] else None,
            "primitiveMerge": pin(out / "primitive-merge.json"),
            "atlas": pin(out / "atlas.json"),
            "alphaAtlasFinalization": pin(out / "alpha-atlas-finalization.json"),
        },
        "output": pin(out / "body.glb"),
        "runtimeSelectable": False,
        "deployed": False,
    }
    (out / "optimization.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fighter", action="append", choices=sorted(CONFIG), required=True)
    args = parser.parse_args()
    results = []
    for fighter in args.fighter:
        builds = [optimize(fighter, number) for number in (1, 2)]
        if builds[0]["output"]["sha256"] != builds[1]["output"]["sha256"]:
            raise ValueError(f"{fighter} optimized GLB rebuild is not byte-identical")
        results.append({"fighterId": fighter, "builds": builds, "byteIdentical": True})
    print(json.dumps({"schema": "ggd-ssbu-ultimate14-motion-optimization-batch@1", "fighters": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
