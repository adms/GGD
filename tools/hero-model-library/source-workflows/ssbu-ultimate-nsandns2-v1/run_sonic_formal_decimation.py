#!/usr/bin/env python3
"""Rebuild or verify the accepted SSBU Sonic c00 formal decimation."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


INPUT_SHA = "9c05c3efbb080e8182ff32a2429c2b07a47b01842fe38bbfe1d7414748e56c2a"
OUTPUT_SHA = "5961f6366ccf8d3ce9f6859bc9aa70a8a0f0be15518b54d42d436f8e77aacfd3"
TARGETS = {
    "def_sonic_001": 4000,
    "EyeL": 100,
    "EyeR": 100,
    "skin_sonic_001": 300,
    "metal_sonic_001": 3400,
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str], cwd: Path) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def build(repo: Path, source: Path, output_root: Path) -> None:
    if output_root.exists():
        raise ValueError(f"Output root must not exist: {output_root}")
    output_root.mkdir(parents=True)
    tool = repo / "tools/model-budget/optimize/decimate-material-weighted.mjs"
    first = output_root / "candidate.glb"
    second = output_root / "candidate-rebuild.glb"
    options = ["--material-targets", json.dumps(TARGETS, separators=(",", ":")), "--error", "0.02"]
    receipts = []
    for target, receipt_name in ((first, "decimation.json"), (second, "decimation-rebuild.json")):
        receipt = json.loads(run(["node", str(tool), str(source), str(target), *options], repo))
        (output_root / receipt_name).write_text(json.dumps(receipt, ensure_ascii=False, separators=(",", ":")) + "\n")
        receipts.append(receipt)
    if first.read_bytes() != second.read_bytes():
        raise ValueError("Sonic decimation rebuild is not byte-identical")
    conversion = {
        "schema": "ggd-ssbu-sonic-formal-decimation@1",
        "candidateId": "ssbu-sonic-c00-static-skinned-v2",
        "sourceId": "gitlab-ssbu-models",
        "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": sha(source)},
        "output": {"path": str(first), "bytes": first.stat().st_size, "sha256": sha(first)},
        "sourceActionCount": 0,
        "decimationReceipt": {"path": str(output_root / "decimation.json"), "sha256": sha(output_root / "decimation.json")},
        "runtimeReady": False,
        "runtimeSelectable": False,
        "defaultEligible": False,
        "limitations": [
            "Static skinned component only; no source action is present.",
            "Visual A/B acceptance is recorded separately; no hero or backend registration is implied.",
        ],
    }
    (output_root / "conversion.json").write_text(json.dumps(conversion, ensure_ascii=False, indent=2) + "\n")
    run([
        "node", "--import", "tsx",
        str(repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/validate_blend_component.mts"),
        str(first), str(output_root / "conversion.json"), str(output_root / "validation.json"),
    ], repo)
    (output_root / "reproducibility.json").write_text(json.dumps({
        "schema": "ggd-byte-identical-rebuild@1",
        "first": {"path": str(first), "sha256": sha(first), "bytes": first.stat().st_size},
        "rebuild": {"path": str(second), "sha256": sha(second), "bytes": second.stat().st_size},
        "byteIdentical": True,
    }, ensure_ascii=False, indent=2) + "\n")


def verify(source: Path, output_root: Path) -> dict:
    if sha(source) != INPUT_SHA:
        raise ValueError("Pinned alpha-fixed Sonic input changed")
    first, second = output_root / "candidate.glb", output_root / "candidate-rebuild.glb"
    if sha(first) != OUTPUT_SHA or first.read_bytes() != second.read_bytes():
        raise ValueError("Accepted Sonic output or byte-identical rebuild changed")
    validation = json.loads((output_root / "validation.json").read_text())
    if validation["khronosIssues"]["numErrors"] or validation["khronosIssues"]["numWarnings"]:
        raise ValueError("Khronos validation is not clean")
    inspect = validation["ggdInspection"]
    if (inspect["triangles"], inspect["drawPrimitives"], inspect["skinCount"], inspect["joints"], inspect["textureCount"], inspect["clipCount"]) != (7900, 5, 1, [115], 5, 0):
        raise ValueError("Sonic metrics changed")
    if inspect["budget"]["errors"]:
        raise ValueError("GGD hard budget failed")
    alpha = json.loads((output_root / "alpha-audit.json").read_text())
    visual = json.loads((output_root / "visual-comparison.json").read_text())
    acceptance = json.loads((output_root / "acceptance.json").read_text())
    if not alpha["passed"] or alpha["opaqueTransparentBlockers"] != 0:
        raise ValueError("Sonic alpha audit failed")
    if visual["manualReview"] != "accepted-independent-static-skinned-component" or not acceptance["accepted"]:
        raise ValueError("Sonic visual acceptance missing")
    return {"inputSha256": INPUT_SHA, "outputSha256": OUTPUT_SHA, "triangles": 7900, "drawPrimitives": 5,
            "joints": 115, "textures": 5, "clips": 0, "byteIdenticalRebuild": True,
            "khronosErrors": 0, "khronosWarnings": 0, "alphaBlockers": 0,
            "visualAccepted": True, "runtimeSelectable": False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    source = asset_root / "conversions/ssbu-worldblender-c00-alpha-fixed-batch1-v2/sonic/first/body.glb"
    output_root = (args.output_root or asset_root / "conversions/ssbu-sonic-c00-formal-decimation-v1").resolve()
    if args.write:
        build(repo, source, output_root)
    print(json.dumps(verify(source, output_root), ensure_ascii=False))


if __name__ == "__main__":
    main()
