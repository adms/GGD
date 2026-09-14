#!/usr/bin/env python3
"""Build the deterministic UV-safe, eye-repaired JUMP FORCE Dai candidate."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess

from PIL import Image
from io import BytesIO


SOURCE_RELATIVE = Path("converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb")
SOURCE_SHA256 = "53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810"
SOURCE_BYTES = 76_796_608
CANDIDATE_ID = "jump-force-native-dai-chr0430-uv-eye-repaired-256-v2"
FINAL_NAME = "dai-chr0430-review-v4.glb"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path, key: str = "absolutePath", repo: Path | None = None) -> dict:
    if key == "gitPath":
        if repo is None:
            raise ValueError("repo is required for a gitPath pin")
        value = path.resolve().relative_to(repo.resolve()).as_posix()
    else:
        value = str(path.resolve())
    return {key: value, "bytes": path.stat().st_size, "sha256": sha(path)}


def run(command: list[str], cwd: Path, log: Path) -> None:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}); see {log}")


def metrics(path: Path) -> dict:
    data = path.read_bytes()
    json_length, _ = struct.unpack_from("<II", data, 12)
    model = json.loads(data[20:20 + json_length])
    binary_offset = 20 + ((json_length + 3) // 4 * 4)
    binary_length, _ = struct.unpack_from("<II", data, binary_offset)
    binary = data[binary_offset + 8:binary_offset + 8 + binary_length]
    edges = []
    for image in model.get("images", []):
        view = model["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        with Image.open(BytesIO(binary[start:start + view["byteLength"]])) as opened:
            edges.extend(opened.size)
    return {
        "triangles": sum(model["accessors"][primitive["indices"]]["count"] // 3 for mesh in model.get("meshes", []) for primitive in mesh.get("primitives", [])),
        "drawPrimitives": sum(len(mesh.get("primitives", [])) for mesh in model.get("meshes", [])),
        "maxTextureEdge": max(edges),
        "skins": len(model.get("skins", [])),
        "joints": max((len(skin.get("joints", [])) for skin in model.get("skins", [])), default=0),
        "textures": len(model.get("textures", [])),
        "animations": len(model.get("animations", [])),
    }


def build(repo: Path, asset_root: Path, output: Path, blender: Path) -> None:
    if output.exists():
        raise ValueError(f"refusing to overwrite conversion stage: {output}")
    source = asset_root / SOURCE_RELATIVE
    if not source.is_file() or source.stat().st_size != SOURCE_BYTES or sha(source) != SOURCE_SHA256:
        raise ValueError("frozen JUMP FORCE Dai source differs")
    workflow = Path(__file__).resolve().parent
    eye_layers = output / "eye-layers"
    run(["python3", str(workflow / "make_eye_layers.py"), str(source), str(eye_layers)], repo, output / "eye-layers.log")
    outputs = []
    commands = []
    for run_name in ("run-a", "run-b"):
        root = output / run_name
        geometry = root / "stage-geometry.glb"
        geometry_receipt = root / "geometry-receipt.json"
        blender_command = [str(blender), "--background", "--python", str(workflow / "blender_decimate.py"), "--", str(source), str(geometry), str(geometry_receipt)]
        run(blender_command, repo, root / "blender.log")
        eye_fixed = root / "stage-eye-fixed.glb"
        replace_command = ["node", str(repo / "tools/model-budget/optimize/replace-textures-by-name.mjs"), str(geometry), str(eye_layers), str(eye_fixed), "T_Chr0430_lens_C", "T_Chr0430_eyeshadow_C"]
        run(replace_command, repo, root / "eye-repair.log")
        optimized = root / "optimized"
        optimize_command = ["node", "--import", "tsx", str(repo / "tools/model-budget/optimize.ts"), str(eye_fixed), "--role", "champion", "--tex-edge", "256", "--out", str(optimized), "--apply", "--force", "--json"]
        run(optimize_command, repo, root / "texture-optimize.log")
        final = root / FINAL_NAME
        shutil.copy2(optimized / eye_fixed.name, final)
        outputs.append(final)
        commands.append({"run": run_name, "blender": blender_command, "replaceEyeLayers": replace_command, "textureOptimize": optimize_command})
    if outputs[0].read_bytes() != outputs[1].read_bytes():
        raise ValueError("independent rebuild differs")
    observed = metrics(outputs[0])
    if observed["triangles"] > 8000 or observed["maxTextureEdge"] > 256:
        raise ValueError(f"formal limits missed: {observed}")
    version = subprocess.run([str(blender), "--version"], cwd=repo, text=True, capture_output=True, check=True).stdout.splitlines()[0]
    receipt = {
        "schema": "ggd.jump-force-dai-decimation@2",
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "candidateId": CANDIDATE_ID,
        "nativeCharacterId": "chr0430",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "input": pin(source),
        "output": pin(outputs[0]),
        "rebuild": pin(outputs[1]),
        "byteIdenticalRebuild": True,
        "parameters": {"decimateWhenTrianglesAbove": 10000, "formalMaximumTriangles": 8000, "textureEdge": 256, "uvSeamsPreserved": True, "opaqueEyeOverlaysCleared": True},
        "observed": observed,
        "tools": {
            "blender": version,
            "workflow": pin(workflow / "blender_decimate.py", "gitPath", repo),
            "eyeRepair": pin(workflow / "make_eye_layers.py", "gitPath", repo),
            "textureReplacement": pin(repo / "tools/model-budget/optimize/replace-textures-by-name.mjs", "gitPath", repo),
            "textureOptimizer": pin(repo / "tools/model-budget/optimize.ts", "gitPath", repo),
        },
        "commands": commands,
        "states": {"geometryTargetPassed": True, "textureEdgePassed": True, "visualReview": "pending-owner-review", "drawCallLimitPassed": False, "runtimeSelectable": False, "productionDeployed": False},
    }
    (output / "conversion.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--blender", type=Path, default=Path("/Applications/Blender.app/Contents/MacOS/Blender"))
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    output = (args.output_root or asset_root / "conversions/jump-force-dai-decimation-v2").resolve()
    if args.write:
        build(repo, asset_root, output, args.blender.resolve())
    receipt = json.loads((output / "conversion.json").read_text())
    for key in ("input", "output", "rebuild"):
        path = Path(receipt[key]["absolutePath"])
        if not path.is_file() or pin(path) != receipt[key]:
            raise ValueError(f"{key} pin differs")
    print(json.dumps({"candidateId": receipt["candidateId"], "triangles": receipt["observed"]["triangles"], "textureEdge": receipt["observed"]["maxTextureEdge"], "sha256": receipt["output"]["sha256"], "byteIdenticalRebuild": receipt["byteIdenticalRebuild"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
