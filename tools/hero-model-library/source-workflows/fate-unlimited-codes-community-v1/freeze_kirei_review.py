#!/usr/bin/env python3
"""Freeze Kirei's six-state GGD candidate and Babylon WebGL evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path


SOURCE_SHA = "cf5f5d84cf6c8419c8d8a006771d5ce1d6206ddbb97701cb24b8ef4450190ac3"
BODY_SHA = "e2559814585dfc1b2474832b10096c6d0993eafc1b5223fb25e22e9fccdd2923"
EXPECTED = [
    ("idle", 1, "idle", 14.0, 31, True),
    ("run", 3, "run2", 40.0, 25, True),
    ("attack", 5, "2handshoot", 20.0, 8, False),
    ("cast", 348, "action_wave", 10.0, 22, False),
    ("hurt", 18, "gutshot", 26.0, 38, False),
    ("death", 12, "die_simple", 22.0, 19, False),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def record(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def read(path: Path):
    return json.loads(path.read_text())


def finite(value) -> bool:
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(finite(child) for child in value.values())
    if isinstance(value, list):
        return all(finite(child) for child in value)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--stage", type=Path, required=True)
    args = parser.parse_args()
    workspace, stage = args.workspace_root.resolve(), args.stage.resolve()
    source_root = workspace / "GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7/kotomine-kirei"
    source = source_root / "converted/kotomine-kirei-standard.glb"
    motion_index_path = source_root / "motion-index.json"
    body = stage / "body.glb"
    if sha256(source) != SOURCE_SHA or sha256(body) != BODY_SHA:
        raise ValueError("source or prepared body bytes changed")

    preflight = read(stage / "conversion-preflight.json")
    preparation = read(stage / "preparation.json")
    motion_index = read(motion_index_path)
    run = read(stage / "webgl/run.json")
    proof = read(stage / "webgl/proof.json")
    if (preflight.get("schema") != "ggd.fuc-kotomine-kirei-preflight@1"
            or preflight.get("source", {}).get("sha256") != SOURCE_SHA
            or preflight.get("transform", {}).get("omittedAnimationEntriesPreservedInFullSource") != 343):
        raise ValueError("preflight evidence changed")
    result = preparation.get("result", {})
    if (preparation.get("schema") != "ggd.fuc-kotomine-kirei-ggd-candidate@1"
            or preparation.get("output", {}).get("sha256") != BODY_SHA
            or preparation.get("output", {}).get("model", {}).get("yawOffsetDeg") != 90
            or preparation.get("officialNormalization", {}).get("drawCalls") != {"before": 8, "after": 4}
            or preparation.get("ggdInspection", {}).get("budget", {}).get("errors") != []
            or result.get("currentGgdContractAccepted") is not True
            or result.get("khronosErrorsZero") is not True
            or result.get("khronosWarningsZero") is not True
            or result.get("fateNativeMotion") is not False
            or result.get("gameplayAccepted") is not False):
        raise ValueError("official GGD/Khronos evidence changed")
    if (run.get("source") != str(body) or run.get("sourceSha256") != BODY_SHA
            or run.get("complete") is not True or run.get("proofExists") is not True
            or run.get("errorExists") is not False or run.get("images") != 24):
        raise ValueError("renderer run is incomplete")
    if (proof.get("schema") != "ggd.fateubw-native-motion-webgl@1"
            or proof.get("babylonVersion") != "7.54.3"
            or proof.get("model", {}).get("skeletons") != 1
            or proof.get("model", {}).get("animationGroups") != 6
            or len(proof.get("model", {}).get("meshes", [])) != 4
            or any(mesh.get("bones") != 18 or mesh.get("gpuSkinning") is not True
                   for mesh in proof["model"]["meshes"])
            or [group.get("name") for group in proof.get("groups", [])] != [row[2] for row in EXPECTED]
            or any(len(group.get("shots", [])) != 4 for group in proof["groups"])
            or not finite(proof)):
        raise ValueError("Babylon WebGL proof is incomplete")

    indexed = {row["glbAnimationIndex"]: row for row in motion_index.get("clips", [])}
    motions = []
    for role, index, name, fps, frames, loop in EXPECTED:
        row = indexed.get(index)
        if (row is None or row.get("sourceLabel") != name or row.get("fps") != fps
                or row.get("frames") != frames or row.get("loop") is not loop
                or row.get("hasTimeVaryingTransform") is not True
                or row.get("motionOrigin") != "GoldSrc/Sven Co-op MOD; not Fate native"):
            raise ValueError(f"source motion evidence changed: {name}")
        motions.append({key: row[key] for key in (
            "glbAnimationIndex", "sourceSequence", "sourceLabel", "blendIndex", "fps", "frames",
            "loop", "sampleDurationSeconds", "hasTimeVaryingTransform", "movingPositionBones",
            "movingRotationBones", "glbTranslationRotationChannels", "motionOrigin")})
        motions[-1]["role"] = role
        motions[-1]["semanticStatus"] = "provisional-pending-gameplay-review"

    images = sorted((stage / "webgl").glob("*.png"))
    if len(images) != 25 or not (stage / "webgl/kirei-six-motion-contact-sheet.png").is_file():
        raise ValueError("expected 24 renderer shots plus one contact sheet")
    for path in images:
        if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"invalid PNG: {path}")
    review = {
        "schema": "ggd.fuc-kotomine-kirei-six-state-review@1",
        "source": record(source),
        "motionIndex": record(motion_index_path),
        "preflight": record(stage / "preflight.glb"),
        "conversionPreflight": record(stage / "conversion-preflight.json"),
        "body": record(body),
        "preparation": record(stage / "preparation.json"),
        "webgl": {
            "run": record(stage / "webgl/run.json"),
            "proof": record(stage / "webgl/proof.json"),
            "contactSheet": record(stage / "webgl/kirei-six-motion-contact-sheet.png"),
            "engine": "Babylon 7.54.3 actual WebGL",
            "animationGroups": 6,
            "rendererShots": 24,
            "skeletons": 1,
            "babylonBones": 18,
            "gpuSkinningAllMeshes": True,
        },
        "motions": motions,
        "manualReview": {
            "status": "reviewed-phase-samples-candidate-only",
            "observations": [
                "All six clips render a complete connected head, torso, arms, hands, legs, feet and coat at start, midpoint and end; midpoint side views also remain finite and connected.",
                "Idle and run are visibly time-varying; 2handshoot raises both hands; action_wave extends one arm; gutshot and die_simple visibly fall to the ground.",
                "The +X camera is frontal, so the GGD descriptor uses the shared +X-authored correction yawOffsetDeg 90.",
            ],
            "limitations": [
                "These are Sven/GoldSrc community-MOD sequences, not original Fate/unlimited codes animations.",
                "Attack, cast, hurt and death role choices are provisional. In particular gutshot falls to the ground and still needs gameplay recovery/transition review.",
                "Phase screenshots do not prove continuous playback, loop seams, root-motion policy, source-engine events/controllers, source shader parity or gameplay timing.",
                "PSP versus PS2 origin, redistribution permission, backend selection and deployment remain unverified.",
            ],
        },
        "result": {
            "currentGgdContractAccepted": True,
            "currentGgdBudgetAccepted": True,
            "khronosAccepted": True,
            "webglPhaseReviewAccepted": True,
            "communityModMotionCandidate": True,
            "fateNativeMotion": False,
            "semanticRoleMappingAccepted": False,
            "continuousPlaybackAccepted": False,
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "defaultEligible": False,
            "deployed": False,
        },
    }
    encoded = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    review_path = stage / "review.json"
    if review_path.exists() and review_path.read_text() != encoded:
        raise ValueError("frozen review differs")
    review_path.write_text(encoded)
    print(json.dumps({"review": str(review_path), "sha256": sha256(review_path), "motions": len(motions)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
