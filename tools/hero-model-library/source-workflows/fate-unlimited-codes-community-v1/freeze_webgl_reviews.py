#!/usr/bin/env python3
"""Freeze bounded static-body WebGL review evidence for eight Fate/UC community-MOD variants."""
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT.parent / "GGD-Asset-Library"
REVIEW_ROOT = ASSET_ROOT / "conversions/fuc-community-webgl-review-v1"
VARIANTS = {
    "fuc-mod-rin-rin": ("rin-01", "gamebanana-rin", "converted/models/01-rin/body.glb"),
    "fuc-mod-rin-homurahara": ("rin-02", "gamebanana-rin", "converted/models/02-homurahara/body.glb"),
    "fuc-mod-rin-rinb": ("rin-03", "gamebanana-rin", "converted/models/03-rinb/body.glb"),
    "fuc-mod-rin-extra": ("rin-04", "gamebanana-rin", "converted/models/04-extra/body.glb"),
    "fuc-mod-shirou-casual": ("shirou-01", "gamebanana-shirou", "converted/models/01-casual/body.glb"),
    "fuc-mod-shirou-homurahara": ("shirou-02", "gamebanana-shirou", "converted/models/02-homurahara/body.glb"),
    "fuc-mod-shirou-casual-b": ("shirou-03", "gamebanana-shirou", "converted/models/03-casual-b/body.glb"),
    "fuc-mod-shirou-satsujinki": ("shirou-04", "gamebanana-shirou", "converted/models/04-satsujinki/body.glb"),
}
INTAKE = ASSET_ROOT / "intake/public-models-20260910/fate-unlimited-codes-psp-second-batch"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def record(path: Path) -> dict:
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def read_json(path: Path):
    return json.loads(path.read_text())


def png_record(path: Path) -> dict:
    if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Invalid PNG evidence: {path}")
    return record(path)


def main():
    variants = {}
    for candidate_id, (label, intake_name, rel_model) in VARIANTS.items():
        source = INTAKE / intake_name / rel_model
        directory = REVIEW_ROOT / label
        run = read_json(directory / "run.json")
        proof = read_json(directory / "proof.json")
        expected_run = {"source": str(source), "sourceSha256": sha256(source), "complete": True,
                        "proofExists": True, "errorExists": False, "images": 3}
        if run != expected_run:
            raise ValueError(f"Unexpected or incomplete renderer run: {label}")
        if (proof.get("schema") != "ggd.fateubw-static-webgl@1" or proof.get("babylonVersion") != "7.54.3"
                or len(proof.get("geometry", [])) != 1 or proof.get("skeletons") != 1
                or proof.get("animationGroups") != 0 or len(proof.get("materials", [])) != 1
                or proof.get("sourceGameShaderParity") is not False or proof.get("gameplayAcceptance") is not False
                or len(proof.get("shots", [])) != 3):
            raise ValueError(f"Unexpected static-body WebGL contract: {label}")
        geometry = proof["geometry"][0]
        if geometry.get("gpuSkinning") is not True or geometry.get("bones") not in {47, 50}:
            raise ValueError(f"GPU skinning evidence missing: {label}")
        albedo = proof["materials"][0].get("albedoTexture")
        if not albedo or albedo.get("ready") is not True:
            raise ValueError(f"Source albedo texture did not render: {label}")
        variants[candidate_id] = {
            "label": label, "sourceGlb": record(source),
            "run": record(directory / "run.json"), "proof": record(directory / "proof.json"),
            "images": {view: png_record(directory / f"{view}.png") for view in ("front", "back", "isometric")},
            "webgl": {"engine": f"Babylon {proof['babylonVersion']}", "vertices": geometry["vertices"],
                      "indices": geometry["indices"], "importedBones": geometry["bones"],
                      "gpuSkinning": True, "animationGroups": 0, "sourceGameShaderParity": False,
                      "gameplayAcceptance": False},
        }
    review = {
        "schema": "ggd.fate-unlimited-codes-community-webgl-static-review@1",
        "reviewScope": "Eight source-labelled community-MOD body variants only; static WebGL completeness and material visibility, not original platform, animation, speaker, rights, or runtime acceptance.",
        "variants": variants,
        "manualReview": {
            "status": "reviewed-static-body-only",
            "observations": [
                "All four Rin and all four Shirou variants show connected head, torso, arms, hands, legs and feet in front, back and isometric views.",
                "Each reviewed candidate renders its single embedded albedo material without a visible transparent body gap or detached mesh in the three captured views.",
                "Clothing and hair-color variations remain individual source-labelled variants; review does not upgrade their community-MOD provenance to an original Fate/UC platform extraction.",
            ],
            "notProven": [
                "PSP versus PS2 origin, source-game shader parity, original skeleton or native animation.",
                "Voice language or individual speaker identity.",
                "Rights/republication approval, GGD action integration, backend dropdown registration, default selection, gameplay validation or deployment.",
            ],
        },
        "result": {"staticBodyAccepted": True, "runtimeReady": False, "backendSelectionVerified": False,
                   "nextRequirements": ["rights review", "action integration", "backend selection", "gameplay validation"]},
    }
    output = REVIEW_ROOT / "review.json"
    encoded = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    if output.exists() and output.read_text() != encoded:
        raise ValueError(f"Existing frozen review differs: {output}")
    output.write_text(encoded)
    print(json.dumps({"review": str(output), "sha256": sha256(output), "variants": len(variants)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
