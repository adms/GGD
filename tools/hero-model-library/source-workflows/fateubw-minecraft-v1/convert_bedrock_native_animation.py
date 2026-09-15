#!/usr/bin/env python3
"""Convert one numeric TenshiLib Bedrock model and its native clips to GLB.

This converter is deliberately narrower than a general Bedrock/Molang reader.
It accepts translation-only source rest rigs and numeric animation channels.
Formula-driven channels and pre/post discontinuities are rejected instead of
guessed.  Static rest rotations remain rejected by default.  The explicit
leaf-rest-rotation mode only accepts unanimated terminal bones, bakes their
reviewed rest transform into their vertices, and writes full inverse bind
matrices.  Rotations are sampled in Euler space before they are encoded as
glTF quaternions, preserving the source's component-wise linear interpolation
more closely than interpolating only the source key quaternions.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from convert_bedrock_geometry import (
    GLB,
    cube_faces,
    mapped,
    mapped_normal,
    rotation_matrix_degrees,
    source_bone_world_matrices,
)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def numeric_vector(value, channel, context):
    if channel == "scale" and isinstance(value, (int, float)):
        value = [value, value, value]
    require(isinstance(value, list) and len(value) == 3, context + ": expected a 3-vector")
    require(all(isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value),
            context + ": formula/nonfinite channel is outside this converter")
    return np.asarray(value, dtype=float)


def source_curve(payload, channel, duration, context):
    """Return sorted numeric source keys and reject ambiguous Bedrock forms."""
    if isinstance(payload, dict):
        rows = []
        for raw_time, value in payload.items():
            require(isinstance(value, (list, int, float)),
                    context + ": pre/post or custom interpolation is outside this converter")
            try:
                time = float(raw_time)
            except (TypeError, ValueError) as exc:
                raise ValueError(context + ": invalid key time " + str(raw_time)) from exc
            require(math.isfinite(time) and time >= 0, context + ": invalid key time")
            rows.append((time, numeric_vector(value, channel, context + "@" + str(raw_time))))
        rows.sort(key=lambda item: item[0])
        require(rows and len({time for time, _ in rows}) == len(rows), context + ": duplicate/empty key times")
        require(rows[-1][0] <= duration + 1e-6, context + ": key exceeds animation length")
        return rows
    value = numeric_vector(payload, channel, context)
    return [(0.0, value), (duration, value)] if duration > 0 else [(0.0, value)]


def interpolate(keys, time):
    if time <= keys[0][0]:
        return keys[0][1]
    if time >= keys[-1][0]:
        return keys[-1][1]
    for (left_time, left), (right_time, right) in zip(keys, keys[1:]):
        if time <= right_time:
            amount = (time - left_time) / (right_time - left_time)
            return left * (1 - amount) + right * amount
    raise AssertionError("curve interpolation fell through")


def matrix_quaternion(matrix):
    """Return a normalized glTF [x,y,z,w] quaternion for a 3x3 matrix."""
    m = np.asarray(matrix, dtype=float)
    trace = float(np.trace(m))
    if trace > 0:
        s = math.sqrt(trace + 1.0) * 2
        w = 0.25 * s
        x = (m[2, 1] - m[1, 2]) / s
        y = (m[0, 2] - m[2, 0]) / s
        z = (m[1, 0] - m[0, 1]) / s
    else:
        axis = int(np.argmax(np.diag(m)))
        if axis == 0:
            s = math.sqrt(max(0.0, 1.0 + m[0, 0] - m[1, 1] - m[2, 2])) * 2
            x, y, z, w = 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s
        elif axis == 1:
            s = math.sqrt(max(0.0, 1.0 + m[1, 1] - m[0, 0] - m[2, 2])) * 2
            x, y, z, w = (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s
        else:
            s = math.sqrt(max(0.0, 1.0 + m[2, 2] - m[0, 0] - m[1, 1])) * 2
            x, y, z, w = (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s
    value = np.asarray([x, y, z, w], dtype=float)
    return value / np.linalg.norm(value)


def mapped_rotation(rotation):
    reflection = np.diag([1.0, 1.0, -1.0])
    return matrix_quaternion(reflection @ rotation_matrix_degrees(rotation) @ reflection)


def mapped_rotation_matrix(rotation):
    reflection = np.diag([1.0, 1.0, -1.0])
    return reflection @ rotation_matrix_degrees(rotation) @ reflection


def validate_leaf_rest_rotations(bones, bones_by_name, clips, allowed):
    """Return rotated bone names after enforcing the narrow reviewed case.

    An animated rest-rotated bone would require source-engine proof of how the
    default and keyed Euler rotations compose.  A rotated bone with children
    would likewise require proof for pivot inheritance.  Neither is inferred.
    """
    children = {bone["name"]: [] for bone in bones}
    for bone in bones:
        parent = bone.get("parent")
        require(not parent or parent in bones_by_name, "missing parent bone")
        if parent:
            children[parent].append(bone["name"])
    rotated = {
        bone["name"] for bone in bones
        if any(float(value) for value in bone.get("rotation", []))
    }
    if not rotated:
        return []
    require(allowed, "static rest rotations are outside this native-animation converter")
    targets = {
        bone_name
        for clip in clips.values()
        for bone_name in clip.get("bones", {})
    }
    for name in sorted(rotated):
        require(not children[name], name + ": rest-rotated bone must be terminal")
        require(name not in targets, name + ": rest-rotated bone has an animation track")
    return sorted(rotated)


def sampled_times(keys, duration, fps, rotation):
    if not rotation:
        return sorted({0.0, duration, *(time for time, _ in keys)})
    frames = {min(duration, index / fps) for index in range(int(math.ceil(duration * fps)) + 1)}
    frames.update(time for time, _ in keys)
    frames.add(duration)
    return sorted(frames)


def add_animation(glb, name, clip, bones_by_name, base_translations, fps):
    duration = clip.get("animation_length")
    tracks = clip.get("bones", {})
    require(isinstance(tracks, dict), name + ": bones must be an object")
    if duration is None:
        # A constant numeric channel has no meaningful end time.  Empty clips
        # are retained in the report but cannot form a valid glTF animation.
        duration = 0.0
    duration = float(duration)
    require(math.isfinite(duration) and duration >= 0, name + ": invalid animation length")
    if duration == 0:
        return None, {"name": name, "sourceLoop": clip.get("loop"), "sourceLength": None,
                      "converted": False,
                      "reason": "source pose has no animation_length; retained without inventing playback duration"}
    # Parse every channel before changing the GLB so a rejected clip cannot
    # leave unused accessors or binary ranges behind.
    prepared = []
    for bone_name, track in sorted(tracks.items()):
        require(bone_name in bones_by_name, name + ": unknown bone target " + bone_name)
        require(isinstance(track, dict), name + "/" + bone_name + ": track must be an object")
        for source_channel, payload in sorted(track.items()):
            require(source_channel in ("position", "rotation", "scale"),
                    name + "/" + bone_name + ": unsupported channel " + source_channel)
            keys = source_curve(payload, source_channel, duration, name + "/" + bone_name + "/" + source_channel)
            require(duration > 0 or len(keys) == 1, name + ": zero-duration keyed track")
            prepared.append((bone_name, source_channel, keys))
    samplers, channels, channel_rows = [], [], []
    for bone_name, source_channel, keys in prepared:
        times = sampled_times(keys, duration, fps, source_channel == "rotation")
        values = []
        for time in times:
            value = interpolate(keys, time)
            if source_channel == "position":
                value = base_translations[bones_by_name[bone_name]] + mapped(value)
            elif source_channel == "rotation":
                value = mapped_rotation(value)
                if values and float(np.dot(values[-1], value)) < 0:
                    value = -value
            values.append(value)
        input_accessor = glb.acc(np.asarray(times, dtype=np.float32), "SCALAR", bounds=True)
        output_accessor = glb.acc(np.asarray(values, dtype=np.float32),
                                  "VEC4" if source_channel == "rotation" else "VEC3")
        sampler = len(samplers)
        samplers.append({"input": input_accessor, "output": output_accessor, "interpolation": "LINEAR"})
        channels.append({"sampler": sampler, "target": {"node": bones_by_name[bone_name],
                                                           "path": {"position": "translation", "rotation": "rotation", "scale": "scale"}[source_channel]}})
        channel_rows.append({"bone": bone_name, "sourceChannel": source_channel,
                             "gltfPath": channels[-1]["target"]["path"], "sourceKeys": len(keys),
                             "outputKeys": len(times), "eulerResampled": source_channel == "rotation"})
    if not channels:
        return None, {"name": name, "sourceLoop": clip.get("loop"), "sourceLength": duration,
                      "converted": False, "reason": "source clip has no bone channels"}
    glb.g.setdefault("animations", []).append({"name": name, "samplers": samplers, "channels": channels,
        "extras": {"ggd": {"sourceLoop": clip.get("loop", False), "sourceAnimationLength": duration,
                              "nativeClassification": "community-mod-native-animation-json",
                              "rotationSamplingFps": fps}}})
    return len(glb.g["animations"]) - 1, {"name": name, "sourceLoop": clip.get("loop"),
        "sourceLength": duration, "converted": True, "channelCount": len(channels),
        "outputKeyCount": sum(row["outputKeys"] for row in channel_rows), "channels": channel_rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geometry", type=Path, required=True)
    parser.add_argument("--texture", type=Path, required=True)
    parser.add_argument("--animation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--rotation-fps", type=int, default=60)
    parser.add_argument("--skip-unsupported-clips", action="store_true",
                        help="retain unsupported source clips in the report while converting the numeric subset")
    parser.add_argument("--allow-untargeted-leaf-rest-rotations", action="store_true",
                        help="accept only unanimated terminal rest-rotated bones and bake their reviewed bind pose")
    args = parser.parse_args()
    geometry_path, texture_path, animation_path = (args.geometry.resolve(), args.texture.resolve(), args.animation.resolve())
    output, report = args.output.resolve(), args.report.resolve()
    require(not output.exists() and not report.exists(), "output and report must be new")
    require(1 <= args.rotation_fps <= 240, "rotation sampling FPS must be 1..240")

    geometry_doc = json.loads(geometry_path.read_text())
    geometries = geometry_doc.get("minecraft:geometry", [])
    require(len(geometries) == 1, "expected exactly one Bedrock geometry")
    geometry = geometries[0]
    bones = geometry["bones"]
    names = [bone["name"] for bone in bones]
    require(len(names) == len(set(names)), "duplicate bone names")
    bones_by_name = {name: index for index, name in enumerate(names)}
    animation_doc = json.loads(animation_path.read_text())
    clips = animation_doc.get("animations")
    require(isinstance(clips, dict) and clips, "animation file has no clips")
    rest_rotated_bones = validate_leaf_rest_rotations(
        bones, bones_by_name, clips, args.allow_untargeted_leaf_rest_rotations)
    for bone in bones:
        for cube in bone.get("cubes", []):
            require(isinstance(cube.get("uv"), list) and len(cube["uv"]) == 2,
                    "only ordinary [u,v] cube UV is implemented")
    image = Image.open(texture_path).convert("RGBA")
    width, height = image.size
    glb = GLB()

    base_translations = []
    rest_world_matrices = []
    for index, bone in enumerate(bones):
        pivot = mapped(bone.get("pivot", [0, 0, 0]))
        parent_name = bone.get("parent")
        parent_pivot = mapped(bones[bones_by_name[parent_name]].get("pivot", [0, 0, 0])) if parent_name else np.zeros(3)
        base = pivot - parent_pivot
        base_translations.append(base)
        node = {"name": bone["name"], "translation": base.tolist()}
        rest_rotation = bone.get("rotation", [0, 0, 0])
        local_matrix = np.eye(4, dtype=float)
        local_matrix[:3, :3] = mapped_rotation_matrix(rest_rotation)
        local_matrix[:3, 3] = base
        if any(float(value) for value in rest_rotation):
            node["rotation"] = mapped_rotation(rest_rotation).tolist()
        glb.g["nodes"].append(node)
        if parent_name:
            glb.g["nodes"][bones_by_name[parent_name]].setdefault("children", []).append(index)
            rest_world_matrices.append(rest_world_matrices[bones_by_name[parent_name]] @ local_matrix)
        else:
            glb.g["scenes"][0]["nodes"].append(index)
            rest_world_matrices.append(local_matrix)

    source_rest_world = source_bone_world_matrices(
        bones, {bone["name"]: (index, bone) for index, bone in enumerate(bones)}) \
        if rest_rotated_bones else [None] * len(bones)

    positions, normals, texcoords, joints, weights, indices = [], [], [], [], [], []
    for bone_index, bone in enumerate(bones):
        for cube in bone.get("cubes", []):
            inflate = float(cube.get("inflate", 0))
            origin = np.asarray(cube["origin"], dtype=float) - inflate
            size = np.asarray(cube["size"], dtype=float) + 2 * inflate
            for points, normal, uv in cube_faces(
                    origin, size, cube["uv"], (width, height), bool(cube.get("mirror", False)),
                    source_rest_world[bone_index]):
                base = len(positions)
                positions.extend(points); normals.extend([normal] * 4); texcoords.extend(uv)
                joints.extend([[bone_index, 0, 0, 0]] * 4); weights.extend([[1, 0, 0, 0]] * 4)
                indices.extend([base, base + 2, base + 1, base, base + 3, base + 2])
    require(positions, "no cube geometry")
    attributes = {
        "POSITION": glb.acc(positions, "VEC3", bounds=True, target=34962),
        "NORMAL": glb.acc(normals, "VEC3", target=34962),
        "TEXCOORD_0": glb.acc(texcoords, "VEC2", target=34962),
        "JOINTS_0": glb.acc(joints, "VEC4", 5123, target=34962),
        "WEIGHTS_0": glb.acc(weights, "VEC4", target=34962),
    }
    index_accessor = glb.acc(indices, "SCALAR", 5123, target=34963)
    texture_view = glb.view(texture_path.read_bytes())
    glb.g["images"].append({"name": texture_path.name, "mimeType": "image/png", "bufferView": texture_view})
    glb.g["samplers"].append({"magFilter": 9728, "minFilter": 9984, "wrapS": 10497, "wrapT": 10497})
    glb.g["textures"].append({"source": 0, "sampler": 0})
    alpha = image.getchannel("A").getextrema()[0] < 255
    material = {"name": args.candidate_id + " source texture",
        "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1},
        "alphaMode": "MASK" if alpha else "OPAQUE", "doubleSided": False}
    if alpha:
        material["alphaCutoff"] = 0.5
    glb.g["materials"].append(material)
    glb.g["meshes"].append({"name": args.candidate_id,
                             "primitives": [{"attributes": attributes, "indices": index_accessor, "material": 0}]})

    inverse_bind = [
        np.linalg.inv(matrix).astype(np.float32).T.reshape(-1)
        for matrix in rest_world_matrices
    ]
    inverse_accessor = glb.acc(inverse_bind, "MAT4")
    glb.g["skins"].append({"name": args.candidate_id + " Bedrock rigid-cube skin",
                            "joints": list(range(len(bones))), "inverseBindMatrices": inverse_accessor})
    mesh_node = len(glb.g["nodes"])
    glb.g["nodes"].append({"name": args.candidate_id + " mesh", "mesh": 0, "skin": 0})
    glb.g["scenes"][0]["nodes"].append(mesh_node)

    clip_rows = []
    for name, clip in clips.items():
        require(isinstance(clip, dict), name + ": clip must be an object")
        try:
            _, row = add_animation(glb, name, clip, bones_by_name, base_translations, args.rotation_fps)
        except ValueError as error:
            if not args.skip_unsupported_clips:
                raise
            row = {"name": name, "sourceLoop": clip.get("loop"),
                   "sourceLength": clip.get("animation_length"), "converted": False,
                   "reason": "unsupported source curve retained: " + str(error)}
        clip_rows.append(row)
    converted = [row for row in clip_rows if row["converted"]]
    require(converted, "no nonempty numeric clips converted")
    glb.g["extras"] = {"ggd": {"sourceId": args.source_id, "candidateId": args.candidate_id,
        "format": "Bedrock geometry plus TenshiLib numeric animation JSON", "unitScale": "1/16",
        "nativeAnimationIncluded": True, "nativeAnimationClassification": "community-mod-native-animation-json",
        "restPosePolicy": "unanimated-terminal-static-rotations-baked-with-full-inverse-bind" if rest_rotated_bones else "translation-only-rest-rig",
        "restRotatedBones": rest_rotated_bones,
        "rotationSamplingFps": args.rotation_fps, "runtimeReady": False,
        "rightsStatus": "ARR; redistribution permission pending"}}
    output.parent.mkdir(parents=True, exist_ok=True); report.parent.mkdir(parents=True, exist_ok=True)
    output_sha = glb.write(output)
    result = {"schema": "ggd-bedrock-native-animation-glb-conversion@1",
        "sourceId": args.source_id, "candidateId": args.candidate_id,
        "inputs": {
            "geometry": {"path": str(geometry_path), "sha256": sha256(geometry_path), "bytes": geometry_path.stat().st_size},
            "texture": {"path": str(texture_path), "sha256": sha256(texture_path), "bytes": texture_path.stat().st_size,
                        "width": width, "height": height},
            "animation": {"path": str(animation_path), "sha256": sha256(animation_path), "bytes": animation_path.stat().st_size,
                          "sourceClipCount": len(clips)}},
        "output": {"path": str(output), "sha256": output_sha, "bytes": output.stat().st_size,
                   "meshCount": 1, "skinCount": 1, "jointCount": len(bones),
                   "cubeCount": sum(len(bone.get("cubes", [])) for bone in bones),
                   "vertices": len(positions), "triangles": len(indices) // 3, "textureCount": 1,
                   "animationCount": len(converted),
                   "unconvertedClipCount": len(clips) - len(converted),
                   "skippedNoDurationOrEmptyClipCount": sum(
                       not row["converted"] and "unsupported source curve" not in row["reason"] for row in clip_rows),
                   "retainedUnsupportedClipCount": sum(
                       not row["converted"] and "unsupported source curve" in row["reason"] for row in clip_rows)},
        "clips": clip_rows,
        "transformPolicy": {"sourceEulerOrder": "Rz @ Ry @ Rx, inherited from reviewed static-rest converter",
                            "handedness": "source [x,y,z] to glTF [x,y,-z]",
                            "restPose": "static rotations accepted only on unanimated terminal bones; affected source vertices are baked and full inverse bind matrices preserve the reviewed rest pose" if rest_rotated_bones else "translation-only source rest rig",
                            "restRotatedBones": rest_rotated_bones,
                            "position": "additive source bone position converted at 1/16 and added to rest local translation",
                            "rotation": "numeric source Euler curves linearly evaluated and resampled to glTF quaternions",
                            "scale": "numeric source scale encoded directly"},
        "nativeClassification": "community-mod-native-animation-json",
        "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
        "rightsStatus": "Source metadata says ARR; public source access is not redistribution permission.",
        "remaining": ["Khronos/GGD structural validation", "actual WebGL clip playback review",
                      "GGD action/event mapping", "backend selection verification", "redistribution permission"]}
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": output_sha, "animations": len(converted),
                      "unconverted": len(clips) - len(converted)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
