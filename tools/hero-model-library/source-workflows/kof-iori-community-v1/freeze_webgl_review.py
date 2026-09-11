#!/usr/bin/env python3
"""Freeze a bounded, reproducible static-body WebGL review for the Iori intake."""
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT.parent / "GGD-Asset-Library"
BODY = ASSET_ROOT / "conversions/iori-community-body-v1/native-glb/body.glb"
REVIEW_DIR = ASSET_ROOT / "conversions/iori-community-body-v1/webgl-visual-review-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text())


def png_record(path: Path):
    if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def main():
    run = read_json(REVIEW_DIR / "run.json")
    proof = read_json(REVIEW_DIR / "proof.json")
    if (run != {"source": str(BODY),
                "sourceSha256": sha256(BODY),
                "complete": True, "proofExists": True, "errorExists": False, "images": 3}):
        raise ValueError("Unexpected or incomplete browser review run record")
    if (proof.get("schema") != "ggd.fateubw-static-webgl@1"
            or proof.get("babylonVersion") != "7.54.3"
            or proof.get("animationGroups") != 0 or proof.get("skeletons") != 2
            or proof.get("sourceGameShaderParity") is not False
            or proof.get("gameplayAcceptance") is not False
            or len(proof.get("geometry", [])) != 2 or len(proof.get("materials", [])) != 2
            or len(proof.get("shots", [])) != 3):
        raise ValueError("WebGL proof does not meet the fixed Iori static-body contract")
    geometry = proof["geometry"]
    if ([item.get("vertices") for item in geometry] != [22612, 4183]
            or [item.get("bones") for item in geometry] != [102, 102]
            or not all(item.get("gpuSkinning") is True for item in geometry)):
        raise ValueError("Unexpected WebGL geometry or GPU skinning evidence")
    material_sizes = [item.get("albedoTexture", {}).get("size") for item in proof["materials"]]
    if material_sizes != [{"width": 512, "height": 512}, {"width": 256, "height": 256}]:
        raise ValueError("Expected source albedo textures did not render")
    images = {name: png_record(REVIEW_DIR / f"{name}.png") for name in ("front", "back", "isometric")}
    review = {
        "schema": "ggd-iori-community-webgl-static-review@1",
        "candidateId": "thunderstore-iori-kof-static-skinned-v1",
        "sourceGlb": {"path": str(BODY), "bytes": BODY.stat().st_size, "sha256": sha256(BODY)},
        "underlyingRendererEvidence": {
            "proof": {"path": str(REVIEW_DIR / "proof.json"), "sha256": sha256(REVIEW_DIR / "proof.json"),
                      "schema": proof["schema"], "engine": f"Babylon {proof['babylonVersion']}"},
            "run": {"path": str(REVIEW_DIR / "run.json"), "sha256": sha256(REVIEW_DIR / "run.json")},
            "renderContract": "Actual Babylon WebGL glTF load in a right-handed scene; two GPU-skinned meshes, two source albedo textures, three captured views.",
        },
        "images": images,
        "manualReview": {
            "status": "reviewed-static-body-only",
            "scope": "Static body completeness, limb continuity, material visibility and transparent-gap inspection across front, back and isometric WebGL captures.",
            "observations": [
                "All three captures show a complete humanoid body in T-pose with connected head, torso, arms, hands, legs and feet.",
                "The two material regions render as an opaque dark jacket/collar and red lower-body clothing; no detached mesh or transparent body gap is visible in the reviewed captures.",
                "The reviewed visual is Iori-like but is retained as a community-MOD candidate, not as proof of direct KOF extraction or source-game shader parity.",
            ],
            "notProven": [
                "No original KOF game shader or texture parity.",
                "No native or retargeted attack, movement, death or other action animation.",
                "No gameplay, backend dropdown, default-selection, deployment, rights or redistribution approval.",
            ],
        },
        "result": {
            "staticBodyAccepted": True,
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "gameplayAcceptance": False,
            "nextRequirements": ["rights review", "action integration", "backend selection", "gameplay validation"],
        },
    }
    output = REVIEW_DIR / "review.json"
    encoded = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    if output.exists() and output.read_text() != encoded:
        raise ValueError(f"Existing frozen review differs: {output}")
    output.write_text(encoded)
    print(json.dumps({"review": str(output), "sha256": sha256(output), "staticBodyAccepted": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
