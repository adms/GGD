#!/usr/bin/env python3
"""Blender-side UV-seam-preserving decimation for JUMP FORCE Dai chr0430."""
from __future__ import annotations

import bmesh
import bpy
import hashlib
import json
from pathlib import Path
import sys


TARGETS = {
    "MI_chr0430_lens": 200,
    "MI_chr0430_eyeshadow": 200,
    "MI_chr0430_pants": 500,
    "MI_chr0430_weapon": 120,
    "MI_chr0430_glass": 40,
    "MI_chr0430_face": 2200,
    "MI_chr0430_hair": 1300,
    "MI_chr0430_eye": 1034,
    "MI_chr0430_oral": 120,
    "MI_chr0430_damage_blood": 80,
    "MI_chr0430_pants.001": 40,
    "MI_chr0430_cloth": 120,
    "MI_chr0430_skin": 100,
    "MI_chr0430_cloth.001": 250,
    "MI_chr0430_pants.002": 120,
    "MI_chr0430_face.001": 250,
    "MI_chr0430_skin.001": 350,
    "MI_chr0430_cloth.002": 500,
    "MI_chr0430_pants.003": 60,
    "MI_chr0430_weapon.001": 350,
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def triangles(obj: bpy.types.Object) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:]
    if len(argv) != 3:
        raise ValueError("usage: blender --background --python blender_decimate.py -- source.glb output.glb receipt.json")
    source, output, receipt = map(Path, argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name == "Icosphere":
            bpy.data.objects.remove(obj, do_unlink=True)

    parts = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        for material_index, material in enumerate(obj.data.materials):
            if material is None:
                continue
            part = obj.copy()
            part.data = obj.data.copy()
            part.name = f"{obj.name}__{material.name}"
            bpy.context.collection.objects.link(part)
            mesh = bmesh.new()
            mesh.from_mesh(part.data)
            bmesh.ops.delete(
                mesh,
                geom=[face for face in mesh.faces if face.material_index != material_index],
                context="FACES",
            )
            mesh.to_mesh(part.data)
            mesh.free()
            part.data.materials.clear()
            part.data.materials.append(material)
            for polygon in part.data.polygons:
                polygon.material_index = 0
            parts.append(part)
        bpy.data.objects.remove(obj, do_unlink=True)

    records = []
    for part in parts:
        material = part.data.materials[0].name
        if material not in TARGETS:
            raise ValueError(f"missing triangle target for {material}")
        before, target = triangles(part), TARGETS[material]
        if before > target:
            bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active = part
            part.select_set(True)
            modifier = part.modifiers.new(name="GGD_UV_safe_decimate", type="DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = max(0.001, target / before)
            modifier.use_collapse_triangulate = True
            modifier.delimit = {"UV"}
            bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        after = triangles(part)
        records.append({
            "object": part.name,
            "material": material,
            "trianglesBefore": before,
            "target": target,
            "trianglesAfter": after,
        })

    if len(records) != len(TARGETS):
        raise ValueError(f"expected {len(TARGETS)} material parts, found {len(records)}")
    total_after = sum(row["trianglesAfter"] for row in records)
    if total_after > 8000:
        raise ValueError(f"formal 8,000-triangle maximum missed: {total_after}")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    result = {
        "schema": "ggd.jump-force-dai-blender-decimation@1",
        "input": {"absolutePath": str(source), "bytes": source.stat().st_size, "sha256": sha(source)},
        "output": {"absolutePath": str(output), "bytes": output.stat().st_size, "sha256": sha(output)},
        "blender": bpy.app.version_string,
        "parameters": {"decimateType": "COLLAPSE", "delimit": ["UV"], "triangulate": True, "targets": TARGETS},
        "trianglesBeforeBlenderImport": sum(row["trianglesBefore"] for row in records),
        "trianglesAfter": total_after,
        "records": records,
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print("JUMP_DECIMATION", json.dumps({"trianglesAfter": total_after, "outputSha256": result["output"]["sha256"]}))


main()
