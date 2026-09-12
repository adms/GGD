#!/usr/bin/env python3
"""Freeze Dark Sakura current-contract and Babylon WebGL static-body evidence."""
import argparse
import hashlib
import json
from pathlib import Path


EXPECTED = {
    "fuc-mod-dark-sakura-p1": ("sakura-p1", "converted/models/01-p1/body.glb", "db1038b27795660802f7701195ddf48ab8b5a520f63f7d5bc0cbacff1dd108eb"),
    "fuc-mod-dark-sakura-p2": ("sakura-p2", "converted/models/02-p2/body.glb", "a60f1b30d613f16c95d20579aaadce672bddc0fe0f8d084979aa01d835eee247"),
}


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace_root.resolve()
    output = args.output.resolve()
    intake = workspace / "GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7/dark-sakura"
    contract = read(output / "contract-validation.json")
    if (contract.get("schema") != "ggd.fuc-dark-sakura-current-contract-validation@1"
            or contract.get("allKhronosErrorsZero") is not True
            or contract.get("allKhronosWarningsZero") is not True
            or contract.get("allGgdBudgetErrorsZero") is not True):
        raise ValueError("Current GGD contract evidence is incomplete")
    contract_rows = {row["candidateId"]: row for row in contract.get("records", [])}
    variants = {}
    for candidate_id, (label, relative, digest) in EXPECTED.items():
        source = intake / relative
        if sha256(source) != digest:
            raise ValueError(f"Source bytes changed: {candidate_id}")
        row = contract_rows.get(candidate_id)
        if (row is None or row.get("sha256") != digest or row.get("clipCount") != 0
                or row.get("skinJointCounts") != [57] or row.get("budget", {}).get("errors") != []):
            raise ValueError(f"Unexpected current-contract result: {candidate_id}")
        directory = output / label
        webgl = directory / "webgl"
        run = read(webgl / "run.json")
        proof = read(webgl / "proof.json")
        if (run.get("source") != str(source.resolve()) or run.get("sourceSha256") != digest
                or run.get("complete") is not True or run.get("proofExists") is not True
                or run.get("errorExists") is not False or run.get("images") != 3):
            raise ValueError(f"Unexpected renderer run: {candidate_id}")
        if (proof.get("schema") != "ggd.fateubw-static-webgl@1"
                or proof.get("babylonVersion") != "7.54.3"
                or proof.get("animationGroups") != 0 or proof.get("skeletons") != 1
                or len(proof.get("geometry", [])) != 1 or proof["geometry"][0].get("bones") != 59
                or proof["geometry"][0].get("gpuSkinning") is not True
                or len(proof.get("materials", [])) != 1
                or not proof["materials"][0].get("albedoTexture", {}).get("ready")
                or len(proof.get("shots", [])) != 3
                or proof.get("sourceGameShaderParity") is not False
                or proof.get("gameplayAcceptance") is not False):
            raise ValueError(f"Unexpected WebGL proof: {candidate_id}")
        images = {}
        for view in ("front", "back", "isometric"):
            path = webgl / f"{view}.png"
            if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError(f"Invalid PNG: {path}")
            images[view] = record(path)
        variants[candidate_id] = {
            "label": label,
            "sourceGlb": record(source),
            "contractValidation": record(directory / "contract-validation.json"),
            "run": record(webgl / "run.json"),
            "proof": record(webgl / "proof.json"),
            "images": images,
            "webgl": {
                "engine": f"Babylon {proof['babylonVersion']}",
                "vertices": proof["geometry"][0]["vertices"],
                "indices": proof["geometry"][0]["indices"],
                "gltfSkinJoints": 57,
                "babylonSkeletonBones": 59,
                "gpuSkinning": True,
                "animationGroups": 0,
                "sourceGameShaderParity": False,
                "gameplayAcceptance": False,
            },
        }
    review = {
        "schema": "ggd.fuc-dark-sakura-webgl-review@1",
        "reviewScope": "Two distinct Dark Sakura community-MOD palette bodies only; current GGD structural budget plus static Babylon WebGL completeness and material visibility.",
        "contractValidation": record(output / "contract-validation.json"),
        "variants": variants,
        "manualReview": {
            "status": "reviewed-static-body-only",
            "observations": [
                "P1 and P2 each show a connected head, torso, arms, hands, legs and feet in front, back and isometric views.",
                "Both candidates render their embedded albedo texture; P1 preserves the black/red dress and P2 preserves the white/red dress as distinct options.",
                "Four source outfit records reduce to two distinct GLB byte sets, so duplicate P1/P2 source relationships remain documented without inventing four model versions.",
            ],
            "notProven": [
                "PSP versus PS2 origin, original Fate/unlimited codes skeleton or native animation, source-game toon shader parity, or dynamic hair/skirt behavior.",
                "Voice language, individual speaker identity, or gameplay event mapping for the 15 retained WAV files.",
                "Rights/republication approval, GGD action integration, backend dropdown registration, default selection, gameplay validation or deployment.",
            ],
        },
        "result": {
            "staticBodyAccepted": True,
            "currentGgdBudgetAccepted": True,
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "nextRequirements": ["rights review", "native or approved action integration", "backend selection", "gameplay validation"],
        },
    }
    encoded = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    review_path = output / "review.json"
    if review_path.exists() and review_path.read_text() != encoded:
        raise ValueError(f"Frozen review differs: {review_path}")
    review_path.write_text(encoded)
    print(json.dumps({"review": str(review_path), "sha256": sha256(review_path), "variants": len(variants)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
