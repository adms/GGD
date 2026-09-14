#!/usr/bin/env python3
"""Render one deterministic representative frame from every embedded GLB clip."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def look_at(camera, point: Vector) -> None:
    camera.rotation_euler = (point - camera.location).to_track_quat("-Z", "Y").to_euler()


def evaluated_bounds(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for mesh in meshes:
        evaluated = mesh.evaluated_get(depsgraph)
        evaluated_mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices)
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError("evaluated meshes have no vertices")
    # Cloth/decal helper bones can leave a handful of unused vertices far from
    # the visible body. Use the central 98% for camera framing so those outliers
    # cannot shrink a valid pose to a few pixels.
    axes = [sorted(point[index] for point in points) for index in range(3)]
    low_index = int(len(points) * 0.01)
    high_index = min(len(points) - 1, int(len(points) * 0.99))
    return (
        Vector(tuple(axis[low_index] for axis in axes)),
        Vector(tuple(axis[high_index] for axis in axes)),
    )


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    source, output = args.input.resolve(), args.output.resolve()
    if not source.is_file():
        raise SystemExit("missing GLB: " + str(source))
    if output.exists() or output.is_symlink():
        raise SystemExit("refusing to overwrite review directory: " + str(output))
    output.mkdir(parents=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source), import_shading="NORMALS")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and len(obj.data.vertices)]
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    actions = sorted((action for action in bpy.data.actions if action.name.startswith("GGD_native_")), key=lambda action: action.name)
    if not meshes or len(armatures) != 1 or not actions:
        raise RuntimeError("expected a skinned GLB with one armature and named native actions")
    armature = armatures[0]
    animation_data = armature.animation_data_create()
    for track in animation_data.nla_tracks:
        track.mute = True

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.world.color = (0.035, 0.035, 0.035)

    camera_data = bpy.data.cameras.new("GGD_Animation_Review_Camera")
    camera = bpy.data.objects.new("GGD_Animation_Review_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = 55
    light_specs = [
        ("Key", Vector((-0.7, -0.8, 0.7)), 1300, 1.5),
        ("Fill", Vector((0.7, -0.4, 0.3)), 900, 1.2),
        ("Rim", Vector((0, 0.8, 0.8)), 1100, 1.2),
    ]
    lights = []
    for name, _direction, energy, _size_factor in light_specs:
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape = energy, "DISK"
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        lights.append(light)

    rows = []
    for action in actions:
        # A sparse glTF action intentionally omits channels that use the node
        # baseline. Blender otherwise leaves values from the previously sampled
        # action on those pose bones, unlike the glTF runtime. Reset first.
        animation_data.action = None
        for pose_bone in armature.pose.bones:
            pose_bone.matrix_basis.identity()
        animation_data.action = action
        start, end = action.frame_range
        role = action.name.removeprefix("GGD_native_")
        ratio = 1.0 if role in {"death", "down"} else 0.67
        frame = int(round(start + (end - start) * ratio))
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        low, high = evaluated_bounds(meshes)
        center = (low + high) / 2
        extent = high - low
        distance = max(extent.x, extent.y, extent.z) * 2.8
        camera.location = center + Vector((distance * 0.55, -distance, distance * 0.22))
        look_at(camera, center)
        for light, (_name, direction, _energy, size_factor) in zip(lights, light_specs):
            light.location = center + direction * distance
            light.data.size = max(extent) * size_factor
            look_at(light, center)
        path = output / f"{role}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rows.append({
            "clip": action.name,
            "frameRange": [float(start), float(end)],
            "reviewFrame": frame,
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        })

    rest_low, rest_high = evaluated_bounds(meshes)
    receipt = {
        "schema": "ggd.infinity-strash-blender-animation-review@1",
        "blender": bpy.app.version_string,
        "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": sha256(source)},
        "lastSampleBounds": {"min": list(rest_low), "max": list(rest_high)},
        "clips": rows,
        "humanReview": "pending",
    }
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("GGD_BLENDER_ANIMATION_REVIEW " + json.dumps(receipt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
