#!/usr/bin/env python3
"""Rebuild the two Pokémon Trainer formal-adoption decimation candidates."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


CONFIG = {
    "male-c00": {
        "componentId": "ssbu-ptrainer-male-c00-formal-decimated-v1",
        "sourceGitPath": "content/assets/models/community/f9ae10168ce75cb6e9b6d4d8c8157cfa77e5da11b1b8531c799f61b1f3fe9f8b.glb",
        "sourceSha256": "f9ae10168ce75cb6e9b6d4d8c8157cfa77e5da11b1b8531c799f61b1f3fe9f8b",
        "sourceTriangles": 10698,
    },
    "female-c01": {
        "componentId": "ssbu-ptrainer-female-c01-formal-decimated-v1",
        "sourceGitPath": "content/assets/models/community/a40f2f987a31f4220f5b6686bd92f8fbf547f39a96ccc46be76ba42abc2e2cec.glb",
        "sourceSha256": "a40f2f987a31f4220f5b6686bd92f8fbf547f39a96ccc46be76ba42abc2e2cec",
        "sourceTriangles": 11086,
    },
}
TARGET = 7900
ERROR_BOUND = 0.02


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def run(command: list[str], cwd: Path) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def stable_pin(path: Path, relative: str) -> dict:
    return {"path": relative, "bytes": path.stat().st_size, "sha256": sha(path)}


def build(repo: Path, asset_root: Path, output_root: Path) -> None:
    require(not output_root.exists(), f"refusing to overwrite: {output_root}")
    runtime = asset_root / "dependencies/ggd-gltf-decimate-v1"
    worker = runtime / "decimate.mjs"
    committed_worker = repo / "tools/model-budget/optimize/decimate.mjs"
    committed_runtime = repo / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/decimate-runtime"
    for installed, committed in (
        (worker, committed_worker),
        (runtime / "package.json", committed_runtime / "package.json"),
        (runtime / "package-lock.json", committed_runtime / "package-lock.json"),
    ):
        require(installed.is_file() and committed.is_file(), f"missing decimation dependency: {installed}")
        require(sha(installed) == sha(committed), f"decimation dependency pin mismatch: {installed}")
    output_root.mkdir(parents=True)
    for variant, cfg in CONFIG.items():
        source = repo / cfg["sourceGitPath"]
        require(source.is_file() and sha(source) == cfg["sourceSha256"], f"source changed: {variant}")
        stage = output_root / variant
        stage.mkdir()
        first, rebuild = stage / "candidate.glb", stage / "candidate-rebuild.glb"
        receipts = []
        for target in (first, rebuild):
            result = json.loads(run(["node", str(worker), str(source), str(target), str(TARGET), str(ERROR_BOUND)], repo))
            require(result["before"]["tris"] == cfg["sourceTriangles"], f"source triangle count changed: {variant}")
            require(result["after"]["tris"] <= 8000, f"formal triangle target missed: {variant}")
            receipts.append(result)
        require(first.read_bytes() == rebuild.read_bytes(), f"non-deterministic decimation: {variant}")
        (stage / "decimation.json").write_text(json.dumps({
            "schema": "ggd-ssbu-ptrainer-decimation@1", "variant": variant,
            "first": receipts[0], "rebuild": receipts[1], "byteIdentical": True,
        }, ensure_ascii=False, indent=2) + "\n")
        conversion = {
            "schema": "ggd-ssbu-ptrainer-formal-decimation@1", "candidateId": cfg["componentId"],
            "sourceId": "gitlab-ssbu-models", "platform": "Nintendo Switch",
            "nativeId": f"fighter/ptrainer/model/ptrainer/{'c00' if variant == 'male-c00' else 'c01'}",
            "input": stable_pin(source, cfg["sourceGitPath"]),
            "output": stable_pin(first, f"GGD-Asset-Library/conversions/ssbu-ptrainer-formal-decimation-v1/{variant}/candidate.glb"),
            "rebuild": stable_pin(rebuild, f"GGD-Asset-Library/conversions/ssbu-ptrainer-formal-decimation-v1/{variant}/candidate-rebuild.glb"),
            "parameters": {"targetTriangles": TARGET, "errorBound": ERROR_BOUND},
            "tool": {
                "worker": stable_pin(committed_worker, "tools/model-budget/optimize/decimate.mjs"),
                "packageJson": stable_pin(committed_runtime / "package.json", "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/decimate-runtime/package.json"),
                "packageLock": stable_pin(committed_runtime / "package-lock.json", "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/decimate-runtime/package-lock.json"),
            },
            "sourceActionCount": 0, "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
            "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False,
            "s3BackupStatus": "pending-not-uploaded-by-this-workflow",
        }
        (stage / "conversion.json").write_text(json.dumps(conversion, ensure_ascii=False, indent=2) + "\n")
        run([
            "node", "--import", "tsx",
            str(repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts"),
            str(first), str(stage / "conversion.json"), str(stage / "raw-validation.json"),
        ], repo)


def verify(repo: Path, output_root: Path) -> dict:
    rows = []
    for variant, cfg in CONFIG.items():
        stage = output_root / variant
        source = repo / cfg["sourceGitPath"]
        first, rebuild = stage / "candidate.glb", stage / "candidate-rebuild.glb"
        conversion = json.loads((stage / "conversion.json").read_text())
        raw = json.loads((stage / "raw-validation.json").read_text())
        require(sha(source) == cfg["sourceSha256"], f"source changed: {variant}")
        require(first.read_bytes() == rebuild.read_bytes(), f"rebuild differs: {variant}")
        require(conversion["output"]["sha256"] == sha(first), f"receipt differs: {variant}")
        require(raw["khronosIssues"]["numErrors"] == 0, f"Khronos error: {variant}")
        require(raw["ggdInspection"]["budget"]["errors"] == [], f"GGD hard policy error: {variant}")
        require(raw["ggdInspection"]["triangles"] <= 8000, f"formal target missed: {variant}")
        require(raw["ggdInspection"]["clipCount"] == 0, f"unexpected action: {variant}")
        rows.append({
            "variant": variant, "componentId": cfg["componentId"], "sourceSha256": cfg["sourceSha256"],
            "outputSha256": sha(first), "bytes": first.stat().st_size,
            "triangles": raw["ggdInspection"]["triangles"], "drawPrimitives": raw["ggdInspection"]["drawPrimitives"],
            "joints": raw["ggdInspection"]["joints"], "textureCount": raw["ggdInspection"]["textureCount"],
            "nativeAnimationCount": 0, "byteIdenticalRebuild": True, "khronosErrors": 0,
            "khronosWarnings": raw["khronosIssues"]["numWarnings"], "runtimeSelectable": False,
        })
    return {"schema": "ggd-ssbu-ptrainer-formal-decimation-build@1", "candidates": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    output = (args.output_root or asset_root / "conversions/ssbu-ptrainer-formal-decimation-v1").resolve()
    if args.write:
        build(repo, asset_root, output)
    print(json.dumps(verify(repo, output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
