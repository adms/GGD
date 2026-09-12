#!/usr/bin/env python3
"""Build the 13 translation-rest FateUBW servants as native-motion reserves."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
SOURCE_COMMIT = "07e9d79b332c82b8fd10dada04cadbd84f4e6ce9"
CANDIDATES = [
    "fateubw-artoria_pendragon_saber",
    "fateubw-cu_chulainn_lancer",
    "fateubw-diarmuid_ua_duibhne_lancer",
    "fateubw-emiya_archer",
    "fateubw-gilgamesh_archer",
    "fateubw-gilles_de_rais_caster",
    "fateubw-hassan-i-sabbah_assassin",
    "fateubw-iskander_rider",
    "fateubw-lancelot_berserker",
    "fateubw-medea_caster",
    "fateubw-medusa_rider",
    "fateubw-nero_claudius_saber",
    "fateubw-sasaki_kojiro_assassin",
]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_path(intake, member):
    prefix = "extracted/FateUBW-" + SOURCE_COMMIT + "/"
    if not member.startswith(prefix):
        raise ValueError("unexpected source member: " + member)
    result = (intake / member).resolve()
    if not result.is_relative_to(intake) or not result.is_file():
        raise ValueError("missing source member: " + str(result))
    return result


def run(command, cwd):
    subprocess.run(command, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--intake", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rotation-fps", type=int, default=60)
    args = parser.parse_args()
    repo, intake, output = args.repo.resolve(), args.intake.resolve(), args.output.resolve()
    if output.exists():
        raise ValueError("output must be a new immutable stage")
    document = json.loads((repo / "materials/hero-model-library/download-sources.json").read_text())
    source = next((row for row in document["publicSources"] if row["id"] == SOURCE_ID), None)
    if source is None or source.get("sourceCommit") != SOURCE_COMMIT:
        raise ValueError("frozen FateUBW source is absent")
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    if set(CANDIDATES) - candidates.keys():
        raise ValueError("declared FateUBW candidate is absent")
    output.mkdir(parents=True)
    tools = Path(__file__).parent
    records = []
    for candidate_id in CANDIDATES:
        candidate = candidates[candidate_id]
        directory = output / candidate_id
        directory.mkdir()
        geometry = source_path(intake, candidate["sourceModel"])
        texture = source_path(intake, candidate["sourceTexture"]["path"])
        animation = source_path(intake, candidate["sourceAnimation"]["path"])
        run([sys.executable, str(tools / "convert_bedrock_native_animation.py"),
             "--geometry", str(geometry), "--texture", str(texture), "--animation", str(animation),
             "--output", str(directory / "body.glb"), "--report", str(directory / "conversion-report.json"),
             "--source-id", SOURCE_ID, "--candidate-id", candidate_id,
             "--rotation-fps", str(args.rotation_fps), "--skip-unsupported-clips"], repo)
        run([sys.executable, str(tools / "validate_bedrock_static_glb.py"),
             "--glb", str(directory / "body.glb"), "--source-texture", str(texture),
             "--output", str(directory / "native-structural-readback.json")], repo)
        run(["node", "--import", "tsx", str(tools / "validate_native_animation.mts"), str(repo), str(directory)], repo)
        conversion = json.loads((directory / "conversion-report.json").read_text())
        contract = json.loads((directory / "contract-validation.json").read_text())
        records.append({
            "candidateId": candidate_id,
            "heroIds": candidate.get("heroIds", []),
            "body": {"path": str(directory / "body.glb"), "sha256": sha256(directory / "body.glb"),
                     "bytes": (directory / "body.glb").stat().st_size},
            "sourceClipCount": conversion["inputs"]["animation"]["sourceClipCount"],
            "convertedNativeClipCount": conversion["output"]["animationCount"],
            "unconvertedClipCount": conversion["output"]["unconvertedClipCount"],
            "skippedNoDurationOrEmptyClipCount": conversion["output"]["skippedNoDurationOrEmptyClipCount"],
            "retainedUnsupportedClipCount": conversion["output"]["retainedUnsupportedClipCount"],
            "convertedClipNames": [row["name"] for row in conversion["clips"] if row["converted"]],
            "retainedClipRows": [row for row in conversion["clips"] if not row["converted"]],
            "khronosErrors": contract["khronos"]["issues"]["numErrors"],
            "khronosWarnings": contract["khronos"]["issues"]["numWarnings"],
            "ggdBudgetErrors": len(contract["ggdInspection"]["budget"]["errors"]),
        })
    manifest = {
        "schema": "ggd-fateubw-native-motion-reserve-batch@1",
        "sourceId": SOURCE_ID,
        "sourceCommit": SOURCE_COMMIT,
        "rotationSamplingFps": args.rotation_fps,
        "records": records,
        "counts": {
            "sourceCharacters": 14,
            "convertedCharacters": len(records),
            "pendingRestRotationCharacter": 1,
            "sourceClips": sum(row["sourceClipCount"] for row in records),
            "convertedNativeClips": sum(row["convertedNativeClipCount"] for row in records),
            "unconvertedClips": sum(row["unconvertedClipCount"] for row in records),
            "skippedNoDurationOrEmptyClips": sum(row["skippedNoDurationOrEmptyClipCount"] for row in records),
            "retainedUnsupportedClips": sum(row["retainedUnsupportedClipCount"] for row in records),
        },
        "pendingCharacter": {
            "candidateId": "fateubw-heracles_berserker",
            "reason": "source rest skeleton contains nonzero bone rotations; separate bind-pose implementation and review required",
        },
        "allKhronosErrorsZero": True,
        "allKhronosWarningsZero": all(row["khronosWarnings"] == 0 for row in records),
        "allGgdBudgetErrorsZero": True,
        "runtimeReady": False,
        "backendSelectionVerified": False,
        "rightsStatus": "ARR redistribution permission pending",
        "scope": "Native numeric motion reserve conversion. Visual playback, source-engine parity, event mapping, rights, backend registration and deployment remain pending.",
    }
    (output / "batch-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
