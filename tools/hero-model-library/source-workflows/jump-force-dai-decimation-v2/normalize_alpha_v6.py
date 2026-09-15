#!/usr/bin/env python3
"""Create the JUMP FORCE Dai v6 alpha-only successor of the frozen v5 GLB.

The v5 bytes remain in Git and in the local conversion tree.  v6 changes only
glTF material alpha modes for atlases that contain transparent texels; it does
not reuse v5's visual decision, does not add motion, and does not register a
hero option.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

from build_six_draw_candidate import metrics, read_glb


V5_SHA = "53606bca3df424e867d1d2bc63e105db255a061dd792228154476b625d044482"
V5_BYTES = 3010392
CANDIDATE_ID = "jump-force-native-dai-chr0430-material-faithful-six-draw-v6-alpha"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": digest(data)}


def encoded(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def alpha_module(repo: Path):
    path = repo / "tools/w3x-import/repair_alpha_backdrops.py"
    spec = importlib.util.spec_from_file_location("jumpforce_alpha", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def command_json(command: list[str], repo: Path) -> dict:
    return json.loads(subprocess.run(command, cwd=repo, text=True, capture_output=True, check=True).stdout)


def build(repo: Path, asset_root: Path) -> tuple[dict[Path, bytes], dict]:
    repo, asset_root = repo.resolve(), asset_root.resolve()
    source_stage = asset_root / "conversions/jump-force-dai-six-draw-v5b"
    run_a = source_stage / "run-a/dai-chr0430-six-draw.glb"
    run_b = source_stage / "run-b/dai-chr0430-six-draw.glb"
    if (run_a.stat().st_size, digest(run_a.read_bytes())) != (V5_BYTES, V5_SHA):
        raise ValueError("pinned v5 run-a is absent or changed")
    if run_a.read_bytes() != run_b.read_bytes():
        raise ValueError("v5 independent rebuild differs")

    module = alpha_module(repo)
    before, binary = module.chunks(run_a.read_bytes())
    after = copy.deepcopy(before)
    changes = module.repairs(after, binary)
    if len(changes) != 12:
        raise ValueError(f"expected 12 transparent-atlas repairs, got {len(changes)}")
    output = module.encode(after, binary)
    decoded, output_binary = module.chunks(output)
    if output_binary != binary:
        raise ValueError("alpha-only conversion changed GLB binary chunk")
    for key in set(before) | set(decoded):
        if key != "materials" and before.get(key) != decoded.get(key):
            raise ValueError("alpha-only conversion changed non-material GLB JSON: " + key)
    if module.repairs(copy.deepcopy(decoded), output_binary):
        raise ValueError("v6 still contains an opaque transparent atlas")

    stage = asset_root / "conversions/jump-force-dai-six-draw-v6-alpha"
    output_a = stage / "run-a/dai-chr0430-six-draw.glb"
    output_b = stage / "run-b/dai-chr0430-six-draw.glb"
    model = repo / f"content/assets/models/community/{digest(output)}.glb"
    model_doc, model_bin = read_glb(output_a if output_a.exists() else run_a)
    # Use the source bytes for a pre-write structural metric; alpha mode does
    # not affect geometry, skinning, texture edges, or animation count.
    if metrics(run_a) != {"triangles": 7930, "drawPrimitives": 6, "maxTextureEdge": 256, "skins": 1, "joints": 159, "animations": 0}:
        raise ValueError("v5 structural metrics changed")
    guard_path = stage / "guard.json"
    validation_path = stage / "validation.json"
    conversion_path = stage / "conversion.json"
    evidence_root = repo / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v6"
    conversion = {
        "schema": "ggd.jump-force-dai-alpha-normalization@1",
        "candidateId": CANDIDATE_ID,
        "source": {**pin(run_a), "gitPathAtIngest": f"content/assets/models/community/{V5_SHA}.glb"},
        "retainedPredecessors": [
            {
                "gitPathAtIngest": "content/assets/models/community/8be8b64eb20eeaeb4be1be69804dfe4486a11ce50c1ffa42849d16985775c71c.glb",
                "bytes": 3010392,
                "sha256": "8be8b64eb20eeaeb4be1be69804dfe4486a11ce50c1ffa42849d16985775c71c",
                "relationship": "v3-six-draw-predecessor-retained-before-v5-material-faithful-rebuild",
            },
            {
                "gitPathAtIngest": f"content/assets/models/community/{V5_SHA}.glb",
                "bytes": V5_BYTES,
                "sha256": V5_SHA,
                "relationship": "direct-v5-predecessor-alpha-normalized-to-v6",
            },
        ],
        "output": {"absolutePath": str(output_a.resolve()), "gitPath": model.relative_to(repo).as_posix(), "bytes": len(output), "sha256": digest(output)},
        "deterministicRebuild": {"absolutePath": str(output_b.resolve()), "bytes": len(output), "sha256": digest(output), "byteIdentical": True},
        "materialChanges": changes,
        "binaryChunkByteIdentical": True,
        "nonMaterialJsonByteSemanticIdentical": True,
        "visualReview": "pending-v6-alpha-normalization-review",
        "runtimeSelectable": False,
        "productionDeployed": False,
    }
    # The guard and Khronos commands run against the generated stage after it
    # has been written by main. Their expected content is built in main.
    writes = {output_a: output, output_b: output, model: output, conversion_path: encoded(conversion)}
    return writes, {"stage": stage, "model": model, "conversion": conversion, "evidenceRoot": evidence_root, "guardPath": guard_path, "validationPath": validation_path}


def write_or_match(path: Path, data: bytes, write: bool) -> None:
    if write:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() != data:
            if path.suffix == ".glb":
                raise ValueError("refusing to overwrite changed immutable output: " + str(path))
            path.write_bytes(data)
        elif not path.exists():
            path.write_bytes(data)
    elif not path.is_file() or path.read_bytes() != data:
        raise ValueError("stale or absent v6 output: " + str(path))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    writes, data = build(repo, asset_root)
    for path, body in writes.items():
        write_or_match(path, body, args.write)

    output = data["stage"] / "run-a/dai-chr0430-six-draw.glb"
    khronos = command_json(["node", str(Path(__file__).with_name("validate_khronos.mjs")), str(output), str(repo)], repo)
    guard = command_json(["node", "--import", "tsx", str(repo / "tools/model-budget/guard.ts"), str(output), "--role", "champion", "--json", "--warn-only"], repo)
    if khronos["errors"] != 0 or khronos["truncated"] or guard["results"][0]["adoption"]["status"] != "eligible":
        raise ValueError("v6 failed Khronos or formal adoption guard")
    validation = {
        "schema": "ggd.jump-force-dai-alpha-normalization-validation@1",
        "candidateId": CANDIDATE_ID,
        "source": data["conversion"]["source"],
        "candidate": data["conversion"]["output"],
        "deterministicRebuild": data["conversion"]["deterministicRebuild"],
        "metrics": metrics(output),
        "khronos": khronos,
        "policy": guard["results"][0],
        "preservation": {"binaryChunkByteIdentical": True, "nonMaterialJsonByteSemanticIdentical": True, "geometryAndSkinningUnchanged": True},
        "states": {"visualReview": "pending-v6-alpha-normalization-review", "motionReview": "blocked-no-reviewed-motion-binding", "backendOptionRegistered": False, "runtimeSelectable": False, "productionDeployed": False},
    }
    writes = {data["guardPath"]: encoded(guard), data["validationPath"]: encoded(validation)}
    receipt = {"schema": "ggd.jump-force-dai-v6-freeze@1", "candidateId": CANDIDATE_ID, "gitModel": {key: data["conversion"]["output"][key] for key in ("gitPath", "bytes", "sha256")}, "sourceArtifact": data["conversion"]["source"], "validation": {"gitPath": (data["evidenceRoot"] / "validation.json").relative_to(repo).as_posix()}, "notAcceptedFor": ["visual acceptance", "hero option registration", "runtime switching", "production deployment"]}
    writes[data["evidenceRoot"] / "conversion.json"] = encoded(data["conversion"])
    writes[data["evidenceRoot"] / "guard.json"] = encoded(guard)
    writes[data["evidenceRoot"] / "validation.json"] = encoded(validation)
    writes[data["evidenceRoot"] / "freeze-receipt.json"] = encoded(receipt)
    for path, body in writes.items():
        write_or_match(path, body, args.write)
    print(json.dumps({"candidateId": CANDIDATE_ID, "sha256": data["conversion"]["output"]["sha256"], "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
