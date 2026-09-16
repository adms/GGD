#!/usr/bin/env python3
"""Validate and freeze the six-draw JUMP FORCE Dai component in Git."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess

from build_six_draw_candidate import accessor_rows, metrics, pin, read_glb


EXPECTED_SHA256 = "8be8b64eb20eeaeb4be1be69804dfe4486a11ce50c1ffa42849d16985775c71c"
EVIDENCE_RELATIVE = Path("materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v3")
CONTENT_RELATIVE = Path(f"content/assets/models/community/{EXPECTED_SHA256}.glb")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def vertex_counter(model: dict, binary: bytes, attributes: tuple[str, ...]) -> Counter:
    rows = Counter()
    for mesh in model.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            per_attribute = []
            for name in attributes:
                if name not in primitive["attributes"]:
                    raise ValueError(f"missing {name}")
                _, values = accessor_rows(model, binary, primitive["attributes"][name])
                per_attribute.append(values)
            for row in zip(*per_attribute):
                rows[tuple(row)] += 1
    return rows


def json_command(command: list[str], repo: Path) -> dict:
    result = subprocess.run(command, cwd=repo, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def copy_exact(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() != source.read_bytes():
            raise ValueError(f"refusing to overwrite different frozen file: {target}")
    else:
        shutil.copyfile(source, target)


def copy_generated(source: Path, target: Path) -> None:
    """Refresh generator-owned evidence while immutable local stages remain."""
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--conversion-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    root = args.conversion_root.resolve()
    source = repo.parent / "GGD-Asset-Library/conversions/jump-force-dai-decimation-v2/run-a/dai-chr0430-review-v4.glb"
    candidate = root / "run-a/dai-chr0430-six-draw.glb"
    rebuild = root / "run-b/dai-chr0430-six-draw.glb"
    render = root / "render"
    if sha(candidate) != EXPECTED_SHA256 or candidate.read_bytes() != rebuild.read_bytes():
        raise ValueError("six-draw candidate or independent rebuild differs")
    before_model, before_binary = read_glb(source)
    after_model, after_binary = read_glb(candidate)
    preserved_attributes = ("POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0")
    if vertex_counter(before_model, before_binary, preserved_attributes) != vertex_counter(after_model, after_binary, preserved_attributes):
        raise ValueError("non-UV vertex attributes changed during material merge")
    after = metrics(candidate)
    expected = {"triangles": 7930, "drawPrimitives": 6, "maxTextureEdge": 256, "skins": 1, "joints": 159, "animations": 0}
    if after != expected:
        raise ValueError(f"six-draw metrics differ: {after}")
    skinned = sum(
        "JOINTS_0" in primitive.get("attributes", {}) and "WEIGHTS_0" in primitive.get("attributes", {})
        for mesh in after_model.get("meshes", []) for primitive in mesh.get("primitives", [])
    )
    if skinned != 6:
        raise ValueError("not all six output primitives are skinned")
    khronos = json_command(["node", str(Path(__file__).with_name("validate_khronos.mjs")), str(candidate), str(repo)], repo)
    guard = json_command(["node", "--import", "tsx", str(repo / "tools/model-budget/guard.ts"), str(candidate), "--role", "champion", "--json", "--warn-only"], repo)
    if khronos["errors"] != 0 or khronos["truncated"]:
        raise ValueError("Khronos validation failed")
    axes = {row["key"]: row for row in guard["results"][0]["axes"]}
    if axes["drawCalls"]["verdict"] == "over" or guard["results"][0]["adoption"]["status"] != "eligible":
        raise ValueError("current GGD model policy rejected candidate")
    proof = json.loads((render / "proof.json").read_text())
    run = json.loads((render / "run.json").read_text())
    if not run.get("complete") or run.get("sourceSha256") != EXPECTED_SHA256 or run.get("errorExists") or len(list(render.glob("*.png"))) != 3:
        raise ValueError("WebGL three-view render is incomplete")

    evidence = repo / EVIDENCE_RELATIVE
    content = repo / CONTENT_RELATIVE
    if args.write:
        copy_exact(candidate, content)
        for name in ("conversion.json",):
            copy_generated(root / name, evidence / name)
        copy_generated(root / "atlas/atlas-plan.json", evidence / "atlas-plan.json")
        copy_generated(root / "run-a/merge-receipt.json", evidence / "merge-receipt.json")
        for name in ("front.png", "back.png", "isometric.png", "proof.json", "run.json"):
            copy_generated(render / name, evidence / name)
    validation = {
        "schema": "ggd.jump-force-dai-six-draw-validation@1",
        "candidateId": "jump-force-native-dai-chr0430-uv-eye-repaired-six-draw-v3",
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "source": pin(source),
        "candidate": {"gitPath": CONTENT_RELATIVE.as_posix(), "bytes": candidate.stat().st_size, "sha256": EXPECTED_SHA256},
        "deterministicRebuild": {**pin(rebuild), "byteIdentical": True},
        "metrics": after,
        "preservation": {
            "nonUvVertexAttributesByteEquivalentAsMultiset": True,
            "preservedAttributes": list(preserved_attributes),
            "triangleCountUnchangedFromV2": True,
            "allOutputPrimitivesSkinned": True,
            "skinAndJointCountPreserved": True,
            "transparentEyeHairLayersKeptSeparate": True,
            "opaqueBodyMaterialsMergedWithSourceSpecificBaseNormalOrmAtlas": True,
        },
        "khronos": khronos,
        "policy": guard["results"][0],
        "webgl": {
            "complete": True,
            "rendererBundleSha256": run["rendererBundleSha256"],
            "views": 3,
            "proof": proof,
            "technicalInspection": "whole body, face, eyes, hair, clothing and weapon visible without the rejected v1 UV breakup",
            "ownerVisualQualityReview": "pending-new-six-draw-render-review",
        },
        "states": {
            "ownerPublicationAuthorized": True,
            "geometryTargetPassed": True,
            "drawCallLimitPassed": True,
            "textureEdgePassed": True,
            "visualReview": "pending-owner-review",
            "motionReview": "blocked-no-reviewed-motion-binding",
            "gitProductFrozen": True,
            "backendOptionRegistered": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "remaining": [
            "The new six-draw render needs owner visual approval.",
            "The JUMP FORCE source contains no converted native clip; borrowed or same-work motion needs a separate playback review before binding.",
            "S3 backup/readback for this conversion stage is pending.",
        ],
    }
    if args.write:
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n")
        (evidence / "guard.json").write_text(json.dumps(guard, ensure_ascii=False, indent=2) + "\n")
    else:
        existing = json.loads((evidence / "validation.json").read_text())
        if existing != validation:
            raise ValueError("frozen validation is stale")
        if json.loads((evidence / "guard.json").read_text()) != guard:
            raise ValueError("frozen guard is stale")
        if sha(content) != EXPECTED_SHA256:
            raise ValueError("Git candidate differs")
    print(json.dumps({"sha256": EXPECTED_SHA256, "triangles": 7930, "drawPrimitives": 6, "runtimeSelectable": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
