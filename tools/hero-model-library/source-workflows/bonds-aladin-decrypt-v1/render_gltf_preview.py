#!/usr/bin/env python3
"""Blender batch script for reproducible front/side/back GLB previews.

Run with Blender, not CPython:
  blender --background --python render_gltf_preview.py -- model.glb output-dir receipt.json
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def mesh_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    minimum = Vector((min(point[i] for point in points) for i in range(3)))
    maximum = Vector((max(point[i] for point in points) for i in range(3)))
    return minimum, maximum


def add_area_light(name: str, location: Vector, target: Vector, energy: float, size: float) -> None:
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()


def main() -> int:
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise SystemExit("expected: input.glb output-dir receipt.json")
    input_path = Path(arguments[0]).resolve()
    output_dir = Path(arguments[1]).resolve()
    receipt_path = Path(arguments[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path), import_pack_images=True)
    source_mesh_names = ("bodygeo", "facegeo", "hairgeo", "realbodygeo", "weapongeo")
    meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and any(name in obj.name.lower() for name in source_mesh_names)
    ]
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not meshes:
        raise RuntimeError("Blender imported no mesh objects")

    minimum, maximum = mesh_bounds(meshes)
    center = (minimum + maximum) * 0.5
    extent = maximum - minimum
    radius = max(extent.x, extent.y, extent.z) * 0.5
    distance = max(radius * 2.8, 1.0)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.25
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.055, 0.055, 0.07)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.12, 0.12, 0.15, 1.0)
    background.inputs["Strength"].default_value = 0.8

    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera_data.lens = 52.0
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    add_area_light(
        "Key",
        center + Vector((radius * 1.8, -radius * 2.5, radius * 2.5)),
        center,
        3000.0,
        radius * 1.5,
    )
    add_area_light(
        "Fill",
        center + Vector((-radius * 2.0, -radius * 1.0, radius * 1.0)),
        center,
        1600.0,
        radius * 2.0,
    )

    # Blender's glTF importer converts glTF Y-up to Blender Z-up.
    views = {
        "front": center + Vector((0.0, -distance, radius * 0.05)),
        "side": center + Vector((distance, 0.0, radius * 0.05)),
        "back": center + Vector((0.0, distance, radius * 0.05)),
    }
    rendered = []
    for name, location in views.items():
        camera.location = location
        look_at(camera, center)
        output_path = output_dir / f"{input_path.stem}-{name}.png"
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        rendered.append(
            {
                "view": name,
                "absolutePath": str(output_path),
                "bytes": output_path.stat().st_size,
                "sha256": sha256_file(output_path),
            }
        )

    receipt = {
        "schema": "ggd.heros-bonds-blender-preview@1",
        "blenderVersion": bpy.app.version_string,
        "inputGlbAbsolutePath": str(input_path),
        "inputGlbSha256": sha256_file(input_path),
        "meshObjectCount": len(meshes),
        "armatureObjectCount": len(armatures),
        "bounds": {"minimum": list(minimum), "maximum": list(maximum)},
        "views": rendered,
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
