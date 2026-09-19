#!/usr/bin/env python3
"""Blender batch script that makes a skinned <=8000 triangle runtime LOD.

The source-resolution rigged GLB remains untouched.  Budgets protect the face
and hair more heavily than the very large body mesh while keeping every source
mesh/material slot present.

Run with Blender:
  blender --background --python make_runtime_lod.py -- input.glb output.glb receipt.json
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy


TARGET_MIN = 7500
TARGET_MAX = 8000
TARGET_BUDGETS = {
    "bodygeo": 5500,
    "facegeo": 800,
    "hairgeo": 700,
    "realbodygeo": 550,
    "weapongeo": 350,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def mesh_key(obj: bpy.types.Object) -> str:
    name = obj.name.lower().split(".")[0]
    for key in sorted(TARGET_BUDGETS, key=len, reverse=True):
        if key in name:
            return key
    raise ValueError(f"no runtime LOD budget for mesh object {obj.name}")


def decimate(obj: bpy.types.Object, target: int) -> None:
    before = triangle_count(obj)
    if before <= target:
        return
    modifier = obj.modifiers.new(name="GGD_Runtime_LOD", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = max(0.01, min(1.0, target / before))
    modifier.use_collapse_triangulate = True
    # Apply before the armature so Blender interpolates and preserves vertex
    # groups rather than baking the current pose.
    while obj.modifiers.find(modifier.name) > 0:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def main() -> int:
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise SystemExit("expected: input.glb output.glb receipt.json")
    input_path = Path(arguments[0]).resolve()
    output_path = Path(arguments[1]).resolve()
    receipt_path = Path(arguments[2]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path), import_pack_images=True)
    meshes = sorted(
        [
            obj
            for obj in bpy.context.scene.objects
            if obj.type == "MESH" and any(key in obj.name.lower() for key in TARGET_BUDGETS)
        ],
        key=lambda obj: obj.name,
    )
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(meshes) != 5:
        raise RuntimeError(f"expected five mesh objects, imported {len(meshes)}")

    before = {obj.name: triangle_count(obj) for obj in meshes}
    for obj in meshes:
        decimate(obj, TARGET_BUDGETS[mesh_key(obj)])
    after = {obj.name: triangle_count(obj) for obj in meshes}
    total_after = sum(after.values())
    if total_after > TARGET_MAX:
        largest = max(meshes, key=triangle_count)
        excess = total_after - TARGET_MAX
        decimate(largest, triangle_count(largest) - excess - 10)
        after = {obj.name: triangle_count(obj) for obj in meshes}
        total_after = sum(after.values())
    if not TARGET_MIN <= total_after <= TARGET_MAX:
        raise RuntimeError(
            f"runtime LOD triangle count {total_after} is outside {TARGET_MIN}..{TARGET_MAX}"
        )
    if any(count == 0 for count in after.values()):
        raise RuntimeError("runtime LOD removed a complete source mesh")

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_skins=True,
        export_animations=False,
        export_materials="EXPORT",
        export_yup=True,
    )
    receipt = {
        "schema": "ggd.heros-bonds-runtime-lod@1",
        "blenderVersion": bpy.app.version_string,
        "policy": {
            "sourceThresholdTriangles": 10000,
            "targetMinimumTriangles": TARGET_MIN,
            "targetMaximumTriangles": TARGET_MAX,
        },
        "inputGlbAbsolutePath": str(input_path),
        "inputGlbSha256": sha256_file(input_path),
        "outputGlbAbsolutePath": str(output_path),
        "outputGlbBytes": output_path.stat().st_size,
        "outputGlbSha256": sha256_file(output_path),
        "armatureObjectCount": len(armatures),
        "sourceTriangleCount": sum(before.values()),
        "runtimeTriangleCount": total_after,
        "meshes": [
            {
                "meshObjectName": obj.name,
                "sourceTriangleCount": before[obj.name],
                "runtimeTriangleCount": after[obj.name],
                "budget": TARGET_BUDGETS[mesh_key(obj)],
                "vertexGroupCount": len(obj.vertex_groups),
                "armatureModifierCount": sum(1 for mod in obj.modifiers if mod.type == "ARMATURE"),
                "materialSlotCount": len(obj.material_slots),
            }
            for obj in meshes
        ],
        "status": "runtime-lod-exported-awaiting-khronos-and-visual-validation",
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
