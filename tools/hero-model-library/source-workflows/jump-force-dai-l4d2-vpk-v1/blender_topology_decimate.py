#!/usr/bin/env python3
"""Blender-side, material-budgeted decimation for the JUMP FORCE Dai Workshop GLB.

Run only through Blender in factory-startup mode:
  Blender --background --factory-startup --python blender_topology_decimate.py -- INPUT OUTPUT RECEIPT

The target allocations intentionally protect face, eye and hair topology.  UV
seams delimit collapse operations.  This is a candidate-preparation step only:
the resulting GLB still needs structural validation and owner visual review.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

import bmesh
import bpy


# The shape-key face mesh alone has 5,494 triangles and preserves 29 source
# expression keys.  It is retained exactly.  All remaining material targets
# sum to 1,875, leaving a safe margin under the 8,000-triangle hard limit.
TARGETS = {
    "Face": 100, "Face2": 60, "face1": 40, "eyes": 200,
    "EyeShadow": 20, "EyesHighlight": 20,
    "Hair": 400, "Hair1": 100, "Hair2": 45, "Hair3": 150,
    "Skin": 100, "Skin 1": 150,
    "Body": 200, "Body3": 30, "Body4": 70,
    "Pants": 100, "Pants1": 20, "PantsRip": 60,
    "Weapon": 150, "Glass": 20, "effect": 10, "<unassigned>": 30,
}
EXPECTED_INPUT_SHA256 = "963d392eeba652af1aafa448abf83eae3a8a6502f6dbaa932a6b584c3d94c4f1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangles(obj: bpy.types.Object) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def material_name(obj: bpy.types.Object, index: int) -> str:
    material = obj.data.materials[index] if index < len(obj.data.materials) else None
    return material.name if material is not None else "<unassigned>"


def split_material_parts() -> tuple[list[bpy.types.Object], list[dict]]:
    parts: list[bpy.types.Object] = []
    preserved: list[dict] = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        if obj.data.shape_keys is not None:
            preserved.append({"object": obj.name, "trianglesBefore": triangles(obj), "trianglesAfter": triangles(obj),
                              "materials": [material_name(obj, index) for index in range(len(obj.data.materials))],
                              "shapeKeys": [key.name for key in obj.data.shape_keys.key_blocks], "reason": "preserved-shape-key-mesh"})
            continue
        indices = sorted({polygon.material_index for polygon in obj.data.polygons})
        for index in indices:
            part = obj.copy()
            part.data = obj.data.copy()
            part.name = f"{obj.name}__{material_name(obj, index)}"
            bpy.context.collection.objects.link(part)
            mesh = bmesh.new()
            mesh.from_mesh(part.data)
            bmesh.ops.delete(mesh, geom=[face for face in mesh.faces if face.material_index != index], context="FACES")
            mesh.to_mesh(part.data)
            mesh.free()
            original = part.data.materials[index] if index < len(part.data.materials) else None
            part.data.materials.clear()
            if original is not None:
                part.data.materials.append(original)
            for polygon in part.data.polygons:
                polygon.material_index = 0
            parts.append(part)
        bpy.data.objects.remove(obj, do_unlink=True)
    return parts, preserved


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:]
    if len(argv) != 3:
        raise ValueError("usage: Blender --background --python blender_topology_decimate.py -- INPUT OUTPUT RECEIPT")
    source, output, receipt_path = map(Path, argv)
    if not source.is_file() or sha256(source) != EXPECTED_INPUT_SHA256:
        raise ValueError("expected material-rebuilt v3 input differs")
    if output.exists() or receipt_path.exists():
        raise ValueError("preserve existing decimation stage output")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    # SourceIO's GLB contains an unskinned Icosphere helper.  It is not a
    # character mesh or material slot and must not enter the GGD candidate.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)
    parts, preserved_shape_key_meshes = split_material_parts()
    records = []
    for part in parts:
        name = material_name(part, 0)
        if name not in TARGETS:
            raise ValueError("missing material allocation: " + name)
        before, target = triangles(part), TARGETS[name]
        if part.data.shape_keys is not None:
            raise RuntimeError("shape-key mesh must be preserved before decimation")
        if before > target:
            bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active = part
            part.select_set(True)
            modifier = part.modifiers.new(name="GGD_topology_aware_uv_decimate", type="DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = max(0.001, target / before)
            modifier.use_collapse_triangulate = True
            modifier.delimit = {"UV"}
            bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        records.append({"object": part.name, "material": name, "trianglesBefore": before,
                        "target": target, "trianglesAfter": triangles(part)})
    total = sum(row["trianglesAfter"] for row in records) + sum(row["trianglesAfter"] for row in preserved_shape_key_meshes)
    if total > 8000:
        raise ValueError(f"formal 8,000-triangle limit missed: {total}")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_animations=True,
                             export_cameras=False, export_lights=False, export_yup=True)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "schema": "ggd.jump-force-dai-workshop-topology-decimation@1",
        "input": {"absolutePath": str(source), "bytes": source.stat().st_size, "sha256": sha256(source)},
        "output": {"absolutePath": str(output), "bytes": output.stat().st_size, "sha256": sha256(output)},
        "blender": bpy.app.version_string,
        "policy": {"decimateWhenTrianglesAbove": 10000, "requiredOutputBelow": 8000,
                   "method": "per-material collapse decimation with UV delimit"},
        "targets": TARGETS, "records": records, "preservedShapeKeyMeshes": preserved_shape_key_meshes,
        "trianglesBefore": sum(row["trianglesBefore"] for row in records) + sum(row["trianglesBefore"] for row in preserved_shape_key_meshes), "trianglesAfter": total,
        "status": "under-8000-triangles-shape-keys-preserved-pending-structural-and-owner-visual-review",
    }
    receipt_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print("JUMP_TOPOLOGY_DECIMATION " + json.dumps({"trianglesAfter": total, "outputSha256": result["output"]["sha256"]}))


if __name__ == "__main__":
    main()
