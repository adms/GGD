#!/usr/bin/env python3
"""Batch-import the acquired Vearn PMX family and emit private review GLBs/renders.

Run this file through Blender, not the system Python. The script keeps every
source model separate so an owner decision can identify character, prop, and
VFX-helper payloads without overwriting the original archive.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy


SOURCE_ID = "bowlroll-sabakan359-vearn-mmd-v087"
MMD_TOOLS_COMMIT = "29d1478cf4385945b1c011d4c1e6adda7ad7cf70"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def mesh_bounds(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points = [obj.matrix_world @ corner for obj in objects for corner in obj.bound_box]
    return (
        [min(point[i] for point in points) for i in range(3)],
        [max(point[i] for point in points) for i in range(3)],
    )


def add_review_camera(bounds_min: list[float], bounds_max: list[float]) -> None:
    center = [(a + b) / 2 for a, b in zip(bounds_min, bounds_max)]
    span = max(b - a for a, b in zip(bounds_min, bounds_max))
    camera_data = bpy.data.cameras.new("ReviewCamera")
    camera = bpy.data.objects.new("ReviewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (center[0], center[1] - span * 2.35, center[2] + span * 0.12)
    direction = mathutils.Vector(center) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera_data.lens = 55
    bpy.context.scene.camera = camera

    for name, location, energy, size in (
        ("Key", (center[0] - span, center[1] - span, center[2] + span * 1.5), 1300, span),
        ("Fill", (center[0] + span, center[1] - span * 0.5, center[2] + span), 800, span),
        ("Rim", (center[0], center[1] + span, center[2] + span), 1000, span),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = max(size, 0.1)
        light = bpy.data.objects.new(name, data)
        light.location = location
        light.rotation_euler = (mathutils.Vector(center) - light.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.collection.objects.link(light)


def main() -> int:
    if "--" not in sys.argv:
        raise SystemExit("usage: blender --background --python convert_review.py -- WORKSPACE MMD_TOOLS")
    workspace_arg, tools_arg = sys.argv[sys.argv.index("--") + 1 :]
    workspace = Path(workspace_arg).resolve()
    tools_root = Path(tools_arg).resolve()
    sys.path.insert(0, str(tools_root))
    import mmd_tools  # pylint: disable=import-error,import-outside-toplevel
    global mathutils
    import mathutils  # pylint: disable=import-error,import-outside-toplevel

    mmd_tools.register()
    source_root = workspace / "GGD-Asset-Library/intake/public-models-20260913/bowlroll-sabakan359-vearn-mmd-v087"
    input_root = source_root / "extracted/大魔王バーン"
    output_root = workspace / "GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1"
    output_root.mkdir(parents=True, exist_ok=True)
    rows = []

    for pmx in sorted(input_root.glob("*.pmx")):
        reset_scene()
        result = bpy.ops.mmd_tools.import_model(
            filepath=str(pmx),
            types={"MESH", "ARMATURE", "MORPHS"},
            scale=0.08,
            clean_model=True,
            remove_doubles=False,
            rename_bones=False,
            use_mipmap=True,
            log_level="INFO",
        )
        if "FINISHED" not in result:
            raise RuntimeError(f"PMX import failed: {pmx}: {result}")

        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
        if not meshes:
            raise RuntimeError(f"PMX import produced no meshes: {pmx}")
        triangles = 0
        vertices = 0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
            vertices += len(obj.data.vertices)
        bounds_min, bounds_max = mesh_bounds(meshes)

        slug = pmx.stem
        target = output_root / slug
        target.mkdir(parents=True, exist_ok=True)
        glb = target / "candidate.glb"
        blend = target / "source-import.blend"
        preview = target / "front.png"

        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
        bpy.ops.export_scene.gltf(
            filepath=str(glb),
            export_format="GLB",
            export_apply=False,
            export_animations=True,
            export_skins=True,
            export_morph=True,
            export_materials="EXPORT",
            export_image_format="AUTO",
            export_yup=True,
        )
        add_review_camera(bounds_min, bounds_max)
        scene = bpy.context.scene
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.render.resolution_x = 720
        scene.render.resolution_y = 720
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.film_transparent = False
        scene.world.color = (0.08, 0.08, 0.08)
        scene.render.filepath = str(preview)
        bpy.ops.render.render(write_still=True)

        rows.append(
            {
                "candidateId": f"{SOURCE_ID}:{slug}",
                "displayName": pmx.name,
                "sourcePmx": str(pmx),
                "sourceSha256": sha256(pmx),
                "meshObjectCount": len(meshes),
                "armatureCount": len(armatures),
                "vertexCount": vertices,
                "triangleCount": triangles,
                "materialCount": len({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
                "glb": {"path": str(glb), "bytes": glb.stat().st_size, "sha256": sha256(glb)},
                "blend": {"path": str(blend), "bytes": blend.stat().st_size, "sha256": sha256(blend)},
                "preview": {"path": str(preview), "bytes": preview.stat().st_size, "sha256": sha256(preview)},
                "identityStatus": "owner-visual-review-required",
                "conversionStatus": "private-review-converted",
                "runtimeStatus": "not-registered",
            }
        )

    manifest = {
        "schema": "ggd.vearn-owner-review-conversion@1",
        "sourceId": SOURCE_ID,
        "ownerDecision": {
            "date": "2026-09-17",
            "instruction": "巴恩大魔王相關的 3d model 都可以抓取 我來人工視覺鑑定就好",
            "effect": "retain-and-convert-all-related-candidates-for-owner-visual-review",
        },
        "toolchain": {
            "blenderVersion": bpy.app.version_string,
            "mmdToolsCommit": MMD_TOOLS_COMMIT,
        },
        "candidates": rows,
        "summary": {
            "candidateCount": len(rows),
            "characterCandidates": sum(1 for row in rows if "バーン" in row["displayName"]),
            "reviewReadyCount": sum(1 for row in rows if Path(row["preview"]["path"]).is_file()),
            "runtimeRegisteredCount": 0,
            "productionDeployedCount": 0,
        },
    }
    manifest_path = output_root / "conversion-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
