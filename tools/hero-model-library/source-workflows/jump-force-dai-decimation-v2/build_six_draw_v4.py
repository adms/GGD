#!/usr/bin/env python3
"""Repair JUMP FORCE Dai's six-draw atlas V coordinate in a fresh, pinned stage.

The v3 binary merger preserved every source vertex and material group but wrote
UV V values as though PNG rows and glTF texture coordinates used the same
origin.  They do not: PNG rows start at the top, while glTF V=0 is the bottom.
This workflow first makes the deterministic v3 binary merge in an otherwise
empty staging directory, then changes only the merged opaque body's TEXCOORD_0
V values.  It does not remove a primitive or touch position, normal, joints,
weights, indices, eyes, lenses, hair, glass, or the damage body meshes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

from build_six_draw_candidate import metrics, pin, read_glb


CANDIDATE_ID = "jump-force-native-dai-chr0430-face-preserving-six-draw-v4"
FINAL_NAME = "dai-chr0430-six-draw.glb"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_parts(path: Path) -> tuple[dict, bytearray]:
    data = path.read_bytes()
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if data[:4] != b"glTF" or json_type != 0x4E4F534A:
        raise ValueError(f"not a GLB with a JSON first chunk: {path}")
    model = json.loads(data[20:20 + json_length])
    binary_offset = 20 + ((json_length + 3) // 4 * 4)
    binary_length, binary_type = struct.unpack_from("<II", data, binary_offset)
    if binary_type != 0x004E4942:
        raise ValueError("GLB has no BIN chunk")
    return model, bytearray(data[binary_offset + 8:binary_offset + 8 + binary_length])


def write_glb(model: dict, binary: bytearray, path: Path) -> None:
    model["buffers"] = [{"byteLength": len(binary)}]
    json_blob = json.dumps(model, ensure_ascii=False, separators=(",", ":")).encode()
    json_blob += b" " * ((-len(json_blob)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_blob) + 8 + len(binary))
        + struct.pack("<II", len(json_blob), 0x4E4F534A) + json_blob
        + struct.pack("<II", len(binary), 0x004E4942) + binary
    )


def repair_v_coordinate(path: Path) -> dict:
    model, binary = glb_parts(path)
    body = next((mesh for mesh in model.get("meshes", []) if mesh.get("name") == "chr0430_body_atlas"), None)
    if body is None or len(body.get("primitives", [])) != 1:
        raise ValueError("missing the single merged opaque body primitive")
    primitive = body["primitives"][0]
    accessor = model["accessors"][primitive["attributes"]["TEXCOORD_0"]]
    view = model["bufferViews"][accessor["bufferView"]]
    if accessor["componentType"] != 5126 or accessor["type"] != "VEC2":
        raise ValueError("opaque body UV accessor is not float VEC2")
    if view.get("byteStride", 8) != 8:
        raise ValueError("opaque body UV has unexpected stride")
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    changed = 0
    before_range = [1.0, 0.0]
    after_range = [1.0, 0.0]
    for index in range(accessor["count"]):
        pos = offset + index * 8
        u, v = struct.unpack_from("<ff", binary, pos)
        # All v3 atlas slots are 128 pixels high.  The v3 result therefore
        # maps exactly to the right source texel after a half-height V shift.
        fixed_v = v + 0.5
        if fixed_v >= 1.0:
            fixed_v -= 1.0
        before_range = [min(before_range[0], v), max(before_range[1], v)]
        after_range = [min(after_range[0], fixed_v), max(after_range[1], fixed_v)]
        if fixed_v != v:
            struct.pack_into("<ff", binary, pos, u, fixed_v)
            changed += 1
    write_glb(model, binary, path)
    return {
        "mesh": body["name"],
        "accessor": primitive["attributes"]["TEXCOORD_0"],
        "verticesChanged": changed,
        "operation": "v = (v + 0.5) mod 1.0",
        "beforeVRange": before_range,
        "afterVRange": after_range,
        "output": pin(path),
    }


def run(command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(command)}\n{result.stdout}{result.stderr}")


def build(repo: Path, asset_root: Path, output: Path) -> None:
    if output.exists():
        raise ValueError(f"refusing to overwrite an immutable conversion stage: {output}")
    workflow = Path(__file__).resolve().parent
    # v3's generator proves the source and retains its binary merge safeguards.
    run(["python3", str(workflow / "build_six_draw_candidate.py"), "--repo", str(repo), "--asset-root", str(asset_root), "--output-root", str(output), "--write"], repo)
    conversion = json.loads((output / "conversion.json").read_text())
    records = []
    outputs = []
    for run_name in ("run-a", "run-b"):
        candidate = output / run_name / FINAL_NAME
        records.append({"run": run_name, **repair_v_coordinate(candidate)})
        outputs.append(candidate)
    if outputs[0].read_bytes() != outputs[1].read_bytes():
        raise ValueError("face-preserving independent rebuild differs")
    observed = metrics(outputs[0])
    if observed["triangles"] > 8000 or observed["drawPrimitives"] > 6 or observed["maxTextureEdge"] > 256:
        raise ValueError(f"model policy limits missed: {observed}")
    conversion.update({
        "schema": "ggd.jump-force-dai-six-draw-face-preserving-conversion@1",
        "candidateId": CANDIDATE_ID,
        "output": pin(outputs[0]),
        "rebuild": pin(outputs[1]),
        "byteIdenticalRebuild": True,
        "observed": observed,
        "faceAndBodyAtlasRepair": {
            "reason": "v3 atlas used top-origin PNG row placement with an unshifted glTF V coordinate",
            "preservedSourceMeshObjects": 20,
            "mergedOpaqueSourceMeshObjects": 15,
            "preservedEyeLensHairGlassMeshObjects": 5,
            "damageMeshesRemoved": False,
            "runs": records,
        },
        "states": {
            "geometryTargetPassed": True,
            "drawCallLimitPassed": True,
            "textureEdgePassed": True,
            "khronosPending": True,
            "visualReview": "pending-new-v4-render-review",
            "animationBinding": "blocked-no-reviewed-motion",
            "backendOptionRegistered": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
    })
    (output / "conversion.json").write_text(json.dumps(conversion, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", required=True, type=Path)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    output = (args.output_root or asset_root / "conversions/jump-force-dai-six-draw-v4").resolve()
    if args.write:
        build(repo, asset_root, output)
    receipt = json.loads((output / "conversion.json").read_text())
    for key in ("input", "atlasPlan", "output", "rebuild"):
        path = Path(receipt[key]["absolutePath"])
        if not path.is_file() or pin(path) != receipt[key]:
            raise ValueError(f"{key} pin differs")
    if receipt["output"]["sha256"] != receipt["rebuild"]["sha256"]:
        raise ValueError("run-a/run-b hashes differ")
    print(json.dumps(receipt["observed"] | {"candidateId": CANDIDATE_ID, "sha256": receipt["output"]["sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
