#!/usr/bin/env python3
"""Render a fixed front comparison for the Re:Zero Rem decimation candidate."""
from __future__ import annotations

import argparse
from pathlib import Path

import bpy
from mathutils import Vector


def clear() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        raise RuntimeError("No mesh was imported")
    low = [min(point[i] for point in points) for i in range(3)]
    high = [max(point[i] for point in points) for i in range(3)]
    return low, high


def render(model: Path, destination: Path) -> None:
    clear()
    bpy.ops.import_scene.gltf(filepath=str(model))
    imported = list(bpy.context.selected_objects)
    low, high = bounds(imported)
    center = [(low[i] + high[i]) / 2 for i in range(3)]
    height = max(0.01, high[2] - low[2])
    for obj in imported:
        obj.location.x -= center[0]
        obj.location.y -= center[1]
        obj.location.z -= low[2]

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.08, 0.08, 0.08)
    bpy.ops.object.light_add(type="AREA", location=(3.5, -4.5, height * 1.2))
    bpy.context.object.data.energy = 900
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5
    bpy.ops.object.light_add(type="AREA", location=(-3, -2, height * 0.8))
    bpy.context.object.data.energy = 500
    bpy.context.object.data.size = 4
    bpy.ops.object.camera_add(location=(0, -max(4.0, height * 2.4), height * 0.54))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    target = bpy.data.objects.new("camera-target", None)
    bpy.context.collection.objects.link(target)
    target.location = (0, 0, height * 0.52)
    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(destination)
    scene.render.film_transparent = False
    bpy.ops.wm.save_as_mainfile(filepath=str(destination.with_suffix(".blend")))
    bpy.ops.render.render(write_still=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    render(args.model.resolve(), args.destination.resolve())


if __name__ == "__main__":
    main()
