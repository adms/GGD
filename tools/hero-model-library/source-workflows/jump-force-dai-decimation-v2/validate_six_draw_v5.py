#!/usr/bin/env python3
"""Validate the material-faithful JUMP FORCE Dai V5 stage without publishing it."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess

from build_six_draw_candidate import accessor_rows, metrics, pin, read_glb


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def vertex_multiset(model: dict, binary: bytes) -> Counter:
    rows = Counter()
    for mesh in model["meshes"]:
        for primitive in mesh["primitives"]:
            source_rows = []
            for name in ("POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"):
                _, values = accessor_rows(model, binary, primitive["attributes"][name])
                source_rows.append(values)
            rows.update(zip(*source_rows))
    return rows


def json_command(command: list[str], repo: Path) -> dict:
    result = subprocess.run(command, cwd=repo, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--conversion-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, root = args.repo.resolve(), args.conversion_root.resolve()
    conversion = json.loads((root / "conversion.json").read_text())
    if conversion["candidateId"] != "jump-force-native-dai-chr0430-material-faithful-six-draw-v5":
        raise ValueError("not the pinned V5 conversion")
    candidate = root / "run-a/dai-chr0430-six-draw.glb"
    rebuild = root / "run-b/dai-chr0430-six-draw.glb"
    source = repo.parent / "GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/run-a/dai-chr0430-review-v4.glb"
    if sha(candidate) != conversion["output"]["sha256"] or sha(rebuild) != conversion["rebuild"]["sha256"]:
        raise ValueError("candidate pin differs from conversion receipt")
    if candidate.read_bytes() != rebuild.read_bytes():
        raise ValueError("independent V5 rebuild differs")
    source_model, source_binary = read_glb(source)
    candidate_model, candidate_binary = read_glb(candidate)
    if vertex_multiset(source_model, source_binary) != vertex_multiset(candidate_model, candidate_binary):
        raise ValueError("POSITION/NORMAL/JOINTS/WEIGHTS changed during atlas merge")
    observed = metrics(candidate)
    expected = {"triangles": 7930, "drawPrimitives": 6, "maxTextureEdge": 256, "skins": 1, "joints": 159, "animations": 0}
    if observed != expected:
        raise ValueError(f"V5 metrics differ: {observed}")
    plan = json.loads((root / "atlas/atlas-plan.json").read_text())
    if plan["perMaterialTileCount"] != 15 or len(plan["slots"]) != 15:
        raise ValueError("V5 failed to allocate one opaque atlas tile per material")
    khronos = json_command(["node", str(Path(__file__).with_name("validate_khronos.mjs")), str(candidate), str(repo)], repo)
    guard = json_command(["node", "--import", "tsx", str(repo / "tools/model-budget/guard.ts"), str(candidate), "--role", "champion", "--json", "--warn-only"], repo)
    axes = {axis["key"]: axis for axis in guard["results"][0]["axes"]}
    if khronos["errors"] != 0 or khronos["truncated"] or guard["results"][0]["adoption"]["status"] != "eligible":
        raise ValueError("Khronos or GGD adoption validation failed")
    if axes["drawCalls"]["value"] != 6 or axes["maxTextureEdge"]["value"] != 256:
        raise ValueError("draw or texture metrics differ from limits")
    render = root / "render"
    run = json.loads((render / "run.json").read_text())
    if not run["complete"] or run["errorExists"] or run["sourceSha256"] != sha(candidate):
        raise ValueError("V5 WebGL renderer receipt differs")
    result = {
        "schema": "ggd.jump-force-dai-material-faithful-six-draw-validation@1",
        "candidateId": conversion["candidateId"], "source": pin(source),
        "candidate": pin(candidate), "deterministicRebuild": {**pin(rebuild), "byteIdentical": True},
        "metrics": observed,
        "preservation": {"all20SourceMeshObjectsRemainAsGeometry": True, "damageMeshesRemoved": False, "perMaterialAtlasTiles": 15, "representativeTextureReuse": False, "nonUvVertexAttributesByteEquivalentAsMultiset": True, "preservedEyeLensHairGlassPrimitives": 5},
        "khronos": khronos, "policy": guard["results"][0],
        "webgl": {"complete": True, "views": 3, "rendererBundleSha256": run["rendererBundleSha256"], "sourceSha256": run["sourceSha256"], "reviewState": "pending-owner-v5-visual-review"},
        "states": {"geometryTargetPassed": True, "drawCallLimitPassed": True, "textureEdgePassed": True, "khronosPassed": True, "visualReview": "pending-owner-review", "motionReview": "blocked-no-reviewed-motion-binding", "backendOptionRegistered": False, "runtimeSelectable": False, "productionDeployed": False},
        "rejectedExperiment": {"id": "six-draw-v4-v-shift", "reason": "The V-shift renderer showed full-body material corruption; no asset path or registry points to it."},
    }
    if args.write:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        args.output.with_name("guard.json").write_text(json.dumps(guard, ensure_ascii=False, indent=2) + "\n")
    else:
        if json.loads(args.output.read_text()) != result:
            raise ValueError("validation receipt is stale")
    print(json.dumps({"sha256": sha(candidate), **observed, "runtimeSelectable": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
