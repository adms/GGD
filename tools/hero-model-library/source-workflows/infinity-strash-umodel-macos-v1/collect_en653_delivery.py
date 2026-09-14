#!/usr/bin/env python3
"""Freeze the complete EN653 identity review and deterministic rebuild inputs."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


CANDIDATE_ID = "infinity-strash-mystvearn-en653-01-static-skinned-v1"
TOOL_NAMES = (
    "export.py",
    "ueviewer-infinity-strash.patch",
    "prepare_en653_component.py",
    "normalize_validate_candidate.mts",
    "render_babylon.py",
    "render_babylon.mjs",
    "collect_en653_delivery.py",
)


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def collect(identity_root: Path, output: Path, repo: Path) -> dict:
    identity_root, output, repo = identity_root.resolve(), output.resolve(), repo.resolve()
    if output.exists() or output.is_symlink():
        raise ValueError("Preserve existing EN653 delivery: " + str(output))
    final_conversion = identity_root / "component-portable-v2"
    rebuild_conversion = identity_root / "component-portable-v3"
    final_normalized = identity_root / "normalized-v3"
    rebuild_normalized = identity_root / "normalized-v4"
    conversion = load(final_conversion / "conversion.json")
    replay_conversion = load(rebuild_conversion / "conversion.json")
    normalized = load(final_normalized / "ggd-upload.json")
    replay_normalized = load(rebuild_normalized / "ggd-upload.json")
    khronos = load(final_normalized / "khronos-input.json")
    nullengine = load(final_normalized / "babylon-nullengine.json")
    webgl = load(final_normalized / "render-v4/proof.json")
    require(conversion["candidateId"] == replay_conversion["candidateId"] == CANDIDATE_ID, "Wrong EN653 identity")
    require(conversion["identity"]["notVearnPostTransformation"] is True, "EN653 cannot become post-transformation Vearn")
    require(conversion["identity"]["notBaran"] is True, "EN653 cannot become Baran")
    require(conversion["output"]["sha256"] == replay_conversion["output"]["sha256"], "EN653 GLB rebuild differs")
    require(sha(final_conversion / "component.glb") == sha(rebuild_conversion / "component.glb") == conversion["output"]["sha256"], "EN653 conversion bytes differ")
    require(normalized["output"]["sha256"] == replay_normalized["output"]["sha256"], "Normalized EN653 rebuild differs")
    final_glb = final_normalized / "component-ggd-normalized.glb"
    replay_glb = rebuild_normalized / "component-ggd-normalized.glb"
    require(sha(final_glb) == sha(replay_glb) == normalized["output"]["sha256"], "Normalized EN653 bytes differ")
    require(khronos["issues"]["numErrors"] == 0 and khronos["issues"]["numWarnings"] == 0, "EN653 Khronos validation failed")
    require(normalized["heroBudget"] == {"errors": [], "warnings": []}, "EN653 exceeds GGD budget")
    require(nullengine["skeletonBoneCounts"] == [175] and nullengine["animationGroups"] == [], "Unexpected EN653 Babylon skeleton")
    require(webgl["schema"] == "ggd.infinity-strash-babylon-webgl-static@1", "Wrong EN653 WebGL proof")
    require(webgl["nativeMotion"] is False and len(webgl["shots"]) == 3, "EN653 static review must contain three views")
    require(all(row["finite"] for row in webgl["shots"]), "EN653 WebGL pose contains non-finite vertices")
    for name in ("front.png", "back.png", "isometric.png", "contact-sheet.png"):
        require((final_normalized / "render-v4" / name).is_file(), "Missing EN653 visual evidence: " + name)

    output.mkdir(parents=True)
    shutil.copytree(identity_root, output / "stages")
    tool_root = Path(__file__).resolve().parent
    (output / "tools").mkdir()
    tool_pins = []
    for name in TOOL_NAMES:
        source = tool_root / name
        destination = output / "tools" / name
        shutil.copy2(source, destination)
        tool_pins.append({"repoPath": source.relative_to(repo).as_posix(), **pin(source)})
    receipt = {
        "schema": "ggd.infinity-strash-en653-static-component-delivery@1",
        "deliveryId": CANDIDATE_ID,
        "sourceId": conversion["sourceId"],
        "identity": conversion["identity"],
        "output": pin(final_glb),
        "conversion": pin(final_conversion / "component.glb"),
        "rebuild": {
            "conversionByteIdentical": True,
            "normalizedByteIdentical": True,
            "conversion": pin(rebuild_conversion / "component.glb"),
            "normalized": pin(replay_glb),
        },
        "metrics": {
            "triangles": conversion["output"]["triangles"],
            "drawPrimitives": conversion["output"]["drawPrimitives"],
            "skinCount": conversion["output"]["skinCount"],
            "jointCount": conversion["output"]["jointCount"],
            "textureCount": len(normalized["outputInspection"]["textures"]),
            "nativeAnimationCount": 0,
            "proceduralAnimationCount": 0,
        },
        "validation": {
            "khronosErrors": 0,
            "khronosWarnings": 0,
            "ggdUploadErrors": normalized["outputInspection"]["report"]["issues"]["numErrors"],
            "heroBudget": normalized["heroBudget"],
            "babylonBones": nullengine["skeletonBoneCounts"],
            "webglViews": [row["view"] for row in webgl["shots"]],
            "allWebglVerticesFinite": True,
            "humanVisualReview": "accepted-independent-static-skinned-component",
        },
        "toolPins": tool_pins,
        "status": {
            "downloaded": True,
            "extracted": True,
            "converted": True,
            "structurallyValidated": True,
            "visuallyAcceptedIndependentComponent": True,
            "completeHero": False,
            "heroBound": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "limitations": conversion["limitations"],
    }
    (output / "delivery.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"deliveryId": CANDIDATE_ID, "output": receipt["output"], "toolCount": len(tool_pins)}, ensure_ascii=False))
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("identity_root", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--repo", type=Path, required=True)
    args = parser.parse_args()
    collect(args.identity_root, args.output, args.repo)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
