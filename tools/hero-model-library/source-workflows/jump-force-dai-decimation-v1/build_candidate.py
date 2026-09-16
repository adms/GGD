#!/usr/bin/env python3
"""Build Dai chr0430 twice with the repository's pinned model optimiser."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"
SOURCE_RELATIVE = Path("converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb")
SOURCE_SHA256 = "53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810"
SOURCE_BYTES = 76_796_608
TARGET_TRIANGLES = 7_500
MAX_ACCEPTED_TRIANGLES = 8_000
TEXTURE_EDGE = 256


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def pin(path: Path, key: str) -> dict:
    return {key: str(path), "bytes": path.stat().st_size, "sha256": sha(path)}


def run(command: list[str], cwd: Path) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError((result.stdout + "\n" + result.stderr).strip())
    return (result.stdout + result.stderr).strip()


def candidate_path(output: Path, run_name: str) -> Path:
    return output / run_name / SOURCE_RELATIVE.name


def build(repo: Path, asset_root: Path, output: Path) -> None:
    require(not output.exists(), f"refusing to overwrite existing conversion stage: {output}")
    source = asset_root / SOURCE_RELATIVE
    receipt = repo / "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/conversion-receipt.json"
    source_receipt = json.loads(receipt.read_text())
    require(source.is_file() and source.stat().st_size == SOURCE_BYTES and sha(source) == SOURCE_SHA256,
            "frozen Dai review-v4 source differs")
    require(source_receipt["output"]["sha256"] == SOURCE_SHA256 and source_receipt["output"]["bytes"] == SOURCE_BYTES,
            "Git source conversion receipt differs")

    optimiser = repo / "tools/model-budget/optimize.ts"
    worker = repo / "tools/model-budget/optimize/decimate.mjs"
    bootstrap = repo / "tools/model-budget/optimize/bootstrap-geometry.sh"
    vendor = repo / "tools/model-budget/.optvendor"
    vendor_package = vendor / "package.json"
    vendor_lock = vendor / "package-lock.json"
    for required in (optimiser, worker, bootstrap, vendor_package, vendor_lock):
        require(required.is_file(), f"missing pinned optimiser dependency: {required}")
    vendor_meta = json.loads(vendor_package.read_text())
    require(vendor_meta.get("dependencies") == {
        "@gltf-transform/core": "^4.4.1",
        "@gltf-transform/functions": "^4.4.1",
        "meshoptimizer": "^1.2.0",
    }, "unexpected geometry dependency versions")

    output.mkdir(parents=True)
    dependency_root = output / "dependencies"
    dependency_root.mkdir()
    shutil.copy2(vendor_package, dependency_root / "package.json")
    shutil.copy2(vendor_lock, dependency_root / "package-lock.json")

    commands = []
    for run_name in ("run-a", "run-b"):
        run_root = output / run_name
        command = [
            "node", "--import", "tsx", str(optimiser), str(source),
            "--role", "champion", "--geometry", "--tex-edge", str(TEXTURE_EDGE),
            "--tris-target", str(TARGET_TRIANGLES), "--out", str(run_root),
            "--apply", "--force",
        ]
        stdout = run(command, repo)
        (run_root / "optimize.log").write_text(stdout + "\n")
        commands.append(command)

    first, rebuild = candidate_path(output, "run-a"), candidate_path(output, "run-b")
    require(first.is_file() and rebuild.is_file(), "optimiser did not produce both candidates")
    require(first.read_bytes() == rebuild.read_bytes(), "Dai decimation is not byte deterministic")
    sidecar = json.loads(Path(str(first) + ".opt.json").read_text())
    require(sidecar["sourceSha256"] == SOURCE_SHA256, "optimizer source pin differs")
    require(sidecar["after"]["triangles"] <= MAX_ACCEPTED_TRIANGLES, "formal 8,000-triangle target missed")
    require(sidecar["after"]["drawCalls"] == 20, "unexpected draw-call change")

    node_version = run(["node", "-v"], repo)
    ffmpeg_version = run(["ffmpeg", "-version"], repo).splitlines()[0]
    receipt_out = {
        "schema": "ggd.jump-force-dai-decimation@1",
        "sourceId": SOURCE_ID,
        "candidateId": "jump-force-native-dai-chr0430-decimated-256-v1",
        "nativeCharacterId": "chr0430",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "input": pin(source, "absolutePath"),
        "output": pin(first, "absolutePath"),
        "rebuild": pin(rebuild, "absolutePath"),
        "byteIdenticalRebuild": True,
        "parameters": {
            "role": "champion", "geometry": True, "targetTriangles": TARGET_TRIANGLES,
            "formalMaximumTriangles": MAX_ACCEPTED_TRIANGLES, "meshoptimizerErrorBound": 0.02,
            "textureEdge": TEXTURE_EDGE, "atlas": False,
        },
        "tools": {
            "optimizer": pin(optimiser.relative_to(repo), "gitPath"),
            "geometryWorker": pin(worker.relative_to(repo), "gitPath"),
            "bootstrap": pin(bootstrap.relative_to(repo), "gitPath"),
            "vendorPackage": pin(dependency_root / "package.json", "absolutePath"),
            "vendorLock": pin(dependency_root / "package-lock.json", "absolutePath"),
            "node": node_version, "ffmpeg": ffmpeg_version,
        },
        "observed": sidecar["after"],
        "states": {
            "geometryTargetPassed": True, "textureEdgePassed": True,
            "drawCallLimitPassed": False, "sixStateMotionComplete": False,
            "ggdHardPolicyPassed": False, "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "s3BackupStatus": "pending-separate-conversion-stage-backup",
    }
    (output / "conversion.json").write_text(json.dumps(receipt_out, ensure_ascii=False, indent=2) + "\n")


def verify(asset_root: Path, output: Path) -> dict:
    source = asset_root / SOURCE_RELATIVE
    receipt = json.loads((output / "conversion.json").read_text())
    first, rebuild = candidate_path(output, "run-a"), candidate_path(output, "run-b")
    require(source.stat().st_size == SOURCE_BYTES and sha(source) == SOURCE_SHA256, "source differs")
    require(first.read_bytes() == rebuild.read_bytes(), "candidate rebuild differs")
    require(receipt["input"]["sha256"] == SOURCE_SHA256, "receipt input differs")
    require(receipt["output"]["sha256"] == sha(first), "receipt output differs")
    require(receipt["rebuild"]["sha256"] == sha(rebuild), "receipt rebuild differs")
    return {
        "sourceSha256": SOURCE_SHA256,
        "candidateSha256": sha(first),
        "candidateBytes": first.stat().st_size,
        "byteIdenticalRebuild": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    output = (args.output_root or asset_root / "conversions/jump-force-dai-decimation-v1").resolve()
    if args.write:
        build(repo, asset_root, output)
    print(json.dumps(verify(asset_root, output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
