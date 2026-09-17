#!/usr/bin/env python3
"""Build five honest derivatives from FateUBW clips without source durations.

Three numeric summon poses become one-second holds.  Medea's summon bob and
Heracles' arm idle contain time formulas, so their exact formula periods are
baked as derived loops.  None of these outputs claim a source-authored length.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
SOURCE_COMMIT = "07e9d79b332c82b8fd10dada04cadbd84f4e6ce9"
SOURCE_RELATIVE_ROOT = Path(
    "common/src/main/resources/assets/fateubw"
)

CANDIDATES = [
    {
        "candidateId": "fateubw-cu_chulainn_lancer",
        "stem": "cu_chulainn_lancer",
        "sourceClip": "summon",
        "derivedClip": "derived-hold-summon",
        "classification": "derived-static-pose-hold",
        "duration": 1.0,
        "rotationFps": 1,
        "formulaPeriodEvidence": None,
    },
    {
        "candidateId": "fateubw-diarmuid_ua_duibhne_lancer",
        "stem": "diarmuid_ua_duibhne_lancer",
        "sourceClip": "summon",
        "derivedClip": "derived-hold-summon",
        "classification": "derived-static-pose-hold",
        "duration": 1.0,
        "rotationFps": 1,
        "formulaPeriodEvidence": None,
    },
    {
        "candidateId": "fateubw-medea_caster",
        "stem": "medea_caster",
        "sourceClip": "summon",
        "derivedClip": "derived-formula-loop-summon",
        "classification": "derived-procedural-formula-loop",
        "duration": 2.0,
        "rotationFps": 60,
        "formulaPeriodEvidence": {
            "formula": "1+math.sin(query.anim_time * 180)",
            "angularRateDegreesPerSecond": 180,
            "exactPeriodSeconds": 2.0,
        },
    },
    {
        "candidateId": "fateubw-sasaki_kojiro_assassin",
        "stem": "sasaki_kojiro_assassin",
        "sourceClip": "summon",
        "derivedClip": "derived-hold-summon",
        "classification": "derived-static-pose-hold",
        "duration": 1.0,
        "rotationFps": 1,
        "formulaPeriodEvidence": None,
    },
    {
        "candidateId": "fateubw-heracles_berserker",
        "stem": "heracles_berserker",
        "sourceClip": "idle",
        "derivedClip": "derived-formula-loop-idle",
        "classification": "derived-procedural-formula-loop",
        "duration": 4.0,
        "rotationFps": 60,
        "allowLeafRestRotations": True,
        "formulaPeriodEvidence": {
            "formulas": [
                "math.sin(time*90)*2-3",
                "-math.cos(time*90)*2-6",
                "math.cos(time*90)*2+6",
            ],
            "angularRateDegreesPerSecond": 90,
            "exactPeriodSeconds": 4.0,
        },
    },
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_files(source_root: Path, stem: str) -> tuple[Path, Path, Path]:
    base = source_root / SOURCE_RELATIVE_ROOT
    paths = (
        base / "tenshilib/models/servant" / f"{stem}.geo.json",
        base / "textures/entity/servant" / f"{stem}.png",
        base / "tenshilib/animations/servant" / f"{stem}.json",
    )
    require(all(path.is_file() for path in paths), f"missing pinned source member for {stem}")
    return paths


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)


def rewrite_glb(source: Path, output: Path, config: dict) -> str:
    data = source.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    require(magic == b"glTF" and version == 2 and total == len(data), "invalid GLB header")
    offset = 12
    chunks = []
    document = None
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8: offset + 8 + length]
        require(len(payload) == length, "truncated GLB chunk")
        if kind == 0x4E4F534A:
            require(document is None, "duplicate JSON chunk")
            document = json.loads(payload.decode("utf-8").rstrip(" \0"))
            chunks.append((kind, None))
        else:
            chunks.append((kind, payload))
        offset += 8 + length
    require(document is not None, "missing GLB JSON chunk")
    require(len(document.get("animations", [])) == 1, "expected exactly one derived animation")
    animation = document["animations"][0]
    animation["name"] = config["derivedClip"]
    metadata = animation.setdefault("extras", {}).setdefault("ggd", {})
    metadata.pop("sourceAnimationLength", None)
    metadata.update({
        "nativeClassification": config["classification"],
        "sourceClipName": config["sourceClip"],
        "sourceAnimationLengthProvided": False,
        "derivedDurationSeconds": config["duration"],
        "nativeDurationClaim": False,
        "formulaPeriodEvidence": config["formulaPeriodEvidence"],
    })
    root = document.setdefault("extras", {}).setdefault("ggd", {})
    root.update({
        "nativeAnimationIncluded": False,
        "nativeAnimationClassification": None,
        "derivedAnimationIncluded": True,
        "derivedAnimationClassification": config["classification"],
        "sourceClipName": config["sourceClip"],
        "sourceAnimationLengthProvided": False,
        "derivedDurationSeconds": config["duration"],
        "nativeDurationClaim": False,
        "runtimeReady": False,
    })
    asset_extras = document.setdefault("asset", {}).setdefault("extras", {}).setdefault("ggd", {})
    asset_extras.update({"derivativeTool": Path(__file__).name, "classification": config["classification"]})
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    rebuilt = bytearray(struct.pack("<4sII", b"glTF", 2, 0))
    for kind, payload in chunks:
        if kind == 0x4E4F534A:
            payload = encoded
        rebuilt.extend(struct.pack("<II", len(payload), kind))
        rebuilt.extend(payload)
    struct.pack_into("<I", rebuilt, 8, len(rebuilt))
    output.write_bytes(rebuilt)
    return hashlib.sha256(rebuilt).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True,
                        help="root containing the pinned FateUBW-<commit> checkout")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo, source_root, output = args.repo.resolve(), args.source_root.resolve(), args.output.resolve()
    require((source_root.name == "FateUBW-" + SOURCE_COMMIT), "source root commit directory changed")
    require(not output.exists(), "output must be a new immutable stage")
    output.mkdir(parents=True)
    converter = Path(__file__).with_name("convert_bedrock_native_animation.py")
    records = []
    for config in CANDIDATES:
        directory = output / config["candidateId"]
        directory.mkdir()
        geometry, texture, animation = source_files(source_root, config["stem"])
        original = json.loads(animation.read_text())
        clips = original.get("animations")
        require(isinstance(clips, dict) and config["sourceClip"] in clips, "source clip missing")
        source_clip = copy.deepcopy(clips[config["sourceClip"]])
        require("animation_length" not in source_clip, "source clip now has an authored duration")
        # Loop enums are strings too; only channel payload strings are formulas.
        formulas = sorted(set(strings(source_clip.get("bones", {}))))
        if config["classification"] == "derived-static-pose-hold":
            require(not formulas, config["candidateId"] + ": configured static pose contains a formula")
        else:
            require(formulas, config["candidateId"] + ": configured formula loop has no formula")
            evidence = config["formulaPeriodEvidence"]
            expected = sorted(evidence.get("formulas", [evidence.get("formula")]))
            require(formulas == expected, config["candidateId"] + ": formula set changed")
            require(math.isclose(360 / evidence["angularRateDegreesPerSecond"], config["duration"]),
                    config["candidateId"] + ": configured formula period is inconsistent")
        derived_clip = copy.deepcopy(source_clip)
        derived_clip["animation_length"] = config["duration"]
        derived_input = {"format_version": original.get("format_version"),
                         "animations": {config["derivedClip"]: derived_clip}}
        derived_input_path = directory / "derived-animation-input.json"
        derived_input_path.write_text(json.dumps(derived_input, ensure_ascii=False, indent=2) + "\n")
        intermediate_glb = directory / "intermediate-duration-injected.glb"
        intermediate_report = directory / "intermediate-conversion-report.json"
        command = [
            sys.executable, str(converter),
            "--geometry", str(geometry), "--texture", str(texture),
            "--animation", str(derived_input_path),
            "--output", str(intermediate_glb), "--report", str(intermediate_report),
            "--source-id", SOURCE_ID, "--candidate-id", config["candidateId"],
            "--rotation-fps", str(config["rotationFps"]),
        ]
        if config.get("allowLeafRestRotations"):
            command.append("--allow-untargeted-leaf-rest-rotations")
        subprocess.run(command, cwd=repo, check=True)
        body = directory / "body.glb"
        body_sha = rewrite_glb(intermediate_glb, body, config)
        base_report = json.loads(intermediate_report.read_text())
        clip_row = base_report["clips"][0]
        report = {
            "schema": "ggd-fateubw-static-pose-derivative@1",
            "sourceId": SOURCE_ID,
            "sourceCommit": SOURCE_COMMIT,
            "candidateId": config["candidateId"],
            "sourceClip": config["sourceClip"],
            "derivedClip": config["derivedClip"],
            "classification": config["classification"],
            "sourceAnimationLengthProvided": False,
            "derivedDurationSeconds": config["duration"],
            "nativeDurationClaim": False,
            "formulaPeriodEvidence": config["formulaPeriodEvidence"],
            "sourceFormulas": formulas,
            "inputs": {
                "geometry": {"path": str(geometry), "sha256": sha256(geometry), "bytes": geometry.stat().st_size},
                "texture": {"path": str(texture), "sha256": sha256(texture), "bytes": texture.stat().st_size},
                "animation": {"path": str(animation), "sha256": sha256(animation), "bytes": animation.stat().st_size},
                "derivedAnimationInput": {"path": str(derived_input_path), "sha256": sha256(derived_input_path),
                                           "bytes": derived_input_path.stat().st_size},
            },
            "output": {"path": str(body), "sha256": body_sha, "bytes": body.stat().st_size,
                       "animationCount": 1, "channelCount": clip_row["channelCount"],
                       "outputKeyCount": clip_row["outputKeyCount"]},
            "process": {
                "durationPolicy": "one-second review hold" if config["classification"].endswith("hold")
                                  else "exact trigonometric period derived from the retained source formula",
                "rotationSamplingFps": config["rotationFps"],
                "intermediateGlb": {"path": str(intermediate_glb), "sha256": sha256(intermediate_glb)},
                "intermediateReport": {"path": str(intermediate_report), "sha256": sha256(intermediate_report)},
                "metadataRewrite": "relabels injected duration and clip as derived; no source-authored length is claimed",
            },
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "defaultEligible": False,
            "rightsStatus": "Source metadata says ARR; redistribution permission remains pending.",
            "remaining": ["structural and Khronos validation", "WebGL visual review",
                          "GGD action/event mapping", "rights clearance", "backend registration and deployment"],
        }
        (directory / "derivative-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        records.append(report)
    manifest = {
        "schema": "ggd-fateubw-static-pose-derivative-batch@1",
        "sourceId": SOURCE_ID,
        "sourceCommit": SOURCE_COMMIT,
        "counts": {"candidates": len(records), "staticPoseHolds": 3, "proceduralFormulaLoops": 2,
                   "nativeDurationClips": 0},
        "records": [{"candidateId": row["candidateId"], "sourceClip": row["sourceClip"],
                     "derivedClip": row["derivedClip"], "classification": row["classification"],
                     "duration": row["derivedDurationSeconds"], "sha256": row["output"]["sha256"],
                     "bytes": row["output"]["bytes"]} for row in records],
        "nativeDurationClaim": False,
        "runtimeReady": False,
        "scope": "Five durationless source entries converted only as clearly labelled derivatives. No action mapping, selection, rights, deployment, or source-engine parity is claimed.",
    }
    (output / "batch-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
