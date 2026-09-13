#!/usr/bin/env python3
"""Describe retained TenshiLib native animation JSON without reinterpreting it."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geometry", type=Path, required=True)
    parser.add_argument("--animation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    geometry, animation, output = (args.geometry.resolve(), args.animation.resolve(), args.output.resolve())
    if output.exists():
        raise ValueError("output must be new so it is a reproducible receipt")

    geo = json.loads(geometry.read_text())
    geometries = geo.get("minecraft:geometry", [])
    if len(geometries) != 1:
        raise ValueError("expected exactly one Bedrock geometry")
    bones = {bone["name"] for bone in geometries[0]["bones"]}
    source = json.loads(animation.read_text())
    clips = source.get("animations")
    if not isinstance(clips, dict):
        raise ValueError("TenshiLib animation file lacks an animations object")

    rows = []
    referenced_bones = set()
    for name, clip in sorted(clips.items()):
        bone_tracks = clip.get("bones", {}) if isinstance(clip, dict) else {}
        if not isinstance(bone_tracks, dict):
            raise ValueError(f"clip {name} has non-object bones")
        referenced_bones.update(bone_tracks)
        channels = {}
        keyframes = 0
        for bone_name, tracks in sorted(bone_tracks.items()):
            if not isinstance(tracks, dict):
                continue
            channel_names = sorted(tracks)
            channels[bone_name] = channel_names
            for payload in tracks.values():
                keyframes += len(payload) if isinstance(payload, dict) else 1
        rows.append({
            "name": name,
            "loop": clip.get("loop") if isinstance(clip, dict) else None,
            "length": clip.get("animation_length") if isinstance(clip, dict) else None,
            "boneTrackCount": len(bone_tracks),
            "channelByBone": channels,
            "encodedKeyframeValues": keyframes,
        })
    unknown = sorted(referenced_bones - bones)
    result = {
        "schema": "ggd-tenshilib-animation-reserve@1",
        "input": {
            "geometry": {"path": str(geometry), "sha256": sha256(geometry), "boneCount": len(bones)},
            "animation": {"path": str(animation), "sha256": sha256(animation), "bytes": animation.stat().st_size},
        },
        "nativeClassification": "community-mod-native-animation-json",
        "convertedToGlb": False,
        "reason": "The static GLB converter does not reinterpret TenshiLib curve semantics. This file remains the native motion reserve.",
        "clipCount": len(rows),
        "clips": rows,
        "unknownBoneTargets": unknown,
        "allTargetsExistInGeometry": not unknown,
        "requiredGGDActionCoverage": {
            "idle": "unconfirmed-event-mapping",
            "attack": "unconfirmed-event-mapping",
            "death": "unconfirmed-event-mapping",
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": sha256(output), "clipCount": len(rows), "unknownBoneTargets": unknown}, ensure_ascii=False))


if __name__ == "__main__":
    main()
