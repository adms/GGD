#!/usr/bin/env python3
"""Convert the compatible FateUBW Minecraft servant geometries as static GLBs.

This is deliberately a bounded staging batch.  It only accepts the twelve
translation-only servant rigs declared in the frozen FateUBW source, leaves the
author's TenshiLib animation JSON untouched, and emits complete static meshes
without claiming that their source rig has been converted.  Rotation-bearing
models remain out of scope until their Bedrock transform semantics are
implemented and reviewed.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
SOURCE_COMMIT = "07e9d79b332c82b8fd10dada04cadbd84f4e6ce9"
COMPATIBLE = [
    "fateubw-artoria_pendragon_saber",
    "fateubw-cu_chulainn_lancer", "fateubw-diarmuid_ua_duibhne_lancer",
    "fateubw-emiya_archer", "fateubw-gilgamesh_archer",
    "fateubw-gilles_de_rais_caster", "fateubw-hassan-i-sabbah_assassin",
    "fateubw-iskander_rider", "fateubw-lancelot_berserker",
    "fateubw-medea_caster", "fateubw-medusa_rider",
    "fateubw-nero_claudius_saber", "fateubw-sasaki_kojiro_assassin",
]
REST_ROTATION_COMPATIBLE = ["fateubw-heracles_berserker"]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_path(intake, member):
    prefix = "extracted/FateUBW-" + SOURCE_COMMIT + "/"
    if not member.startswith(prefix):
        raise ValueError("unexpected FateUBW source member: " + member)
    path = (intake / member).resolve()
    if not path.is_relative_to(intake.resolve()) or not path.is_file():
        raise ValueError("missing source input: " + str(path))
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--intake", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--only", action="append", default=[], metavar="CANDIDATE_ID",
                        help="Convert only declared compatible candidate IDs; repeat as needed.")
    parser.add_argument("--include-static-rest-rotations", action="store_true",
                        help="Permit reviewed rotation-bearing candidates as baked static meshes only; never emits a glTF rig.")
    args = parser.parse_args()
    repo, intake, output = args.repo.resolve(), args.intake.resolve(), args.output.resolve()
    if output.exists():
        raise ValueError("output must be new for an immutable batch stage")
    sources = json.loads((repo / "materials/hero-model-library/download-sources.json").read_text())
    source = next((row for row in sources["publicSources"] if row["id"] == SOURCE_ID), None)
    if source is None or source.get("sourceCommit") != SOURCE_COMMIT:
        raise ValueError("frozen FateUBW source is not present")
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    declared = COMPATIBLE + REST_ROTATION_COMPATIBLE
    if set(declared) - candidates.keys():
        raise ValueError("declared compatible candidate missing from source index")
    allowed = declared if args.include_static_rest_rotations else COMPATIBLE
    selected = allowed if not args.only else args.only
    if not selected or len(selected) != len(set(selected)) or set(selected) - set(allowed):
        raise ValueError("--only must be a unique nonempty subset of declared compatible candidates")
    converter = Path(__file__).with_name("convert_bedrock_geometry.py")
    inspector = Path(__file__).with_name("inspect_tenshilib_animation.py")
    output.mkdir(parents=True)
    records = []
    for candidate_id in selected:
        candidate = candidates[candidate_id]
        geometry = source_path(intake, candidate["sourceModel"])
        texture = source_path(intake, candidate["sourceTexture"]["path"])
        animation = source_path(intake, candidate["sourceAnimation"]["path"])
        doc = json.loads(geometry.read_text())
        geometries = doc.get("minecraft:geometry", [])
        if len(geometries) != 1:
            raise ValueError(candidate_id + ": expected one geometry")
        bones = geometries[0].get("bones", [])
        has_static_rotations = any(any(float(value) for value in bone.get("rotation", [])) for bone in bones)
        if has_static_rotations and candidate_id not in REST_ROTATION_COMPATIBLE:
            raise ValueError(candidate_id + ": nonzero rotation is outside this reviewed static-rest-pose batch")
        cubes = [cube for bone in bones for cube in bone.get("cubes", [])]
        if not all(isinstance(cube.get("uv"), list) and len(cube["uv"]) == 2 for cube in cubes):
            raise ValueError(candidate_id + ": per-face or invalid UV is outside this batch")
        directory = output / candidate_id
        directory.mkdir()
        body, conversion, reserve, structural = (directory / "body.glb", directory / "conversion-report.json",
                                                  directory / "animation-reserve.json", directory / "structural-readback.json")
        converter_args = [sys.executable, str(converter), "--geometry", str(geometry), "--texture", str(texture),
                        "--output", str(body), "--report", str(conversion), "--source-id", SOURCE_ID,
                        "--candidate-id", candidate_id + "-static-v2", "--static-mesh-only"]
        if has_static_rotations:
            converter_args.append("--bake-static-bone-rotations")
        subprocess.run(converter_args, check=True)
        subprocess.run([sys.executable, str(inspector), "--geometry", str(geometry), "--animation", str(animation),
                        "--output", str(reserve)], check=True)
        subprocess.run([sys.executable, str(Path(__file__).with_name("validate_bedrock_static_glb.py")),
                        "--glb", str(body), "--source-texture", str(texture), "--output", str(structural),
                        "--expect-static-mesh-only"], check=True)
        conversion_doc, reserve_doc, structural_doc = (json.loads(path.read_text()) for path in (conversion, reserve, structural))
        if not structural_doc["valid"] or reserve_doc["allTargetsExistInGeometry"] is not True:
            raise ValueError(candidate_id + ": generated evidence failed")
        records.append({
            "candidateId": candidate_id, "character": candidate["character"], "heroIds": candidate["heroIds"],
            "source": {"geometry": {"path": str(geometry), "sha256": sha256(geometry)},
                       "texture": {"path": str(texture), "sha256": sha256(texture)},
                       "animation": {"path": str(animation), "sha256": sha256(animation)}},
            "output": {"body": {"path": str(body), "sha256": sha256(body), "bytes": body.stat().st_size},
                       "conversion": {"path": str(conversion), "sha256": sha256(conversion)},
                       "structuralReadback": {"path": str(structural), "sha256": sha256(structural), "valid": True},
                       "nativeAnimationReserve": {"path": str(reserve), "sha256": sha256(reserve),
                                                   "clipCount": reserve_doc["clipCount"], "convertedToGlb": False}},
            "geometry": conversion_doc["output"], "sourceRigRetained": True, "glbRigConverted": False,
            "bakedStaticBoneRotations": has_static_rotations, "runtimeReady": False,
            "backendSelectionVerified": False, "defaultEligible": False,
            "status": "static-body-structural-validated-pending-khronos-visual-rights-animation-rig",
        })
    summary = {"schema": "ggd-fateubw-compatible-static-batch@1", "sourceId": SOURCE_ID,
               "sourceCommit": SOURCE_COMMIT, "scope": "ordinary-UV servant static meshes; source rigs retained but not converted; only explicitly reviewed rest-pose rotation candidates are baked",
               "records": records, "counts": {"converted": len(records), "nativeAnimationConverted": 0,
               "runtimeReady": 0, "backendRegistered": 0, "deployed": 0}}
    (output / "batch-manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "converted": len(records), "manifestSha256": sha256(output / "batch-manifest.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
