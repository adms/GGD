#!/usr/bin/env python3
"""Render deterministic visual-review views from a prepared Blender candidate."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def look_at(camera, point: Vector) -> None:
    camera.rotation_euler = (point - camera.location).to_track_quat("-Z", "Y").to_euler()


def main() -> int:
    args_after_double_dash = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(args_after_double_dash)
    output = args.output.resolve()
    if output.exists() or output.is_symlink():
        raise SystemExit("refusing to overwrite review directory: " + str(output))
    output.mkdir(parents=True)

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and len(obj.data.vertices)]
    if not meshes:
        raise RuntimeError("blend has no renderable mesh")
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    center = (low + high) / 2
    extent = high - low
    distance = max(extent.x, extent.y, extent.z) * 2.2

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.035, 0.035, 0.035)

    camera_data = bpy.data.cameras.new("GGD_Review_Camera")
    camera = bpy.data.objects.new("GGD_Review_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = 55

    for name, location, energy, size in [
        ("Key", center + Vector((-distance * 0.7, -distance * 0.8, distance * 0.7)), 1300, max(extent) * 1.5),
        ("Fill", center + Vector((distance * 0.7, -distance * 0.4, distance * 0.3)), 900, max(extent) * 1.2),
        ("Rim", center + Vector((0, distance * 0.8, distance * 0.8)), 1100, max(extent) * 1.2),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        light = bpy.data.objects.new(name, data)
        light.location = location
        look_at(light, center)
        scene.collection.objects.link(light)

    views = {
        "front": center + Vector((0, -distance, 0)),
        "back": center + Vector((0, distance, 0)),
        "isometric": center + Vector((distance * 0.65, -distance * 0.75, distance * 0.35)),
    }
    rows = []
    for name, location in views.items():
        camera.location = location
        look_at(camera, center)
        path = output / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rows.append({"view": name, "path": str(path), "bytes": path.stat().st_size})
    receipt = {
        "schema": "ggd.infinity-strash-blender-visual-review@1",
        "blender": bpy.app.version_string,
        "bounds": {"min": list(low), "max": list(high), "center": list(center)},
        "views": rows,
        "humanReview": "pending",
    }
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("GGD_BLENDER_REVIEW " + json.dumps(receipt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
