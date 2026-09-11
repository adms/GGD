#!/usr/bin/env python3
"""Convert one frozen SSBU Blender source into a reviewable GLB component.

Run this script only through Blender's background mode with ``--factory-startup``.
It opens the source with embedded scripts disabled, mutes every driver, exports
only render-visible meshes plus their armature hierarchy, and records every
input and output hash.  It does not invent animations or register a hero.
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def blender_arguments() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Pass converter arguments after Blender's -- separator")
    return sys.argv[sys.argv.index("--") + 1 :]


def detach_skinned_mesh_nodes(glb_path: Path) -> list[dict]:
    """Make skinned mesh nodes scene roots as required by glTF validation guidance."""
    raw = glb_path.read_bytes()
    if len(raw) < 28 or raw[:4] != b"glTF":
        raise RuntimeError("Blender output is not a complete GLB")
    magic, version, total = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise RuntimeError("Blender output has an invalid GLB header")
    chunks = []
    offset = 12
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise RuntimeError("Blender GLB chunk header is truncated")
        length, kind = struct.unpack_from("<II", raw, offset)
        payload = raw[offset + 8 : offset + 8 + length]
        if len(payload) != length:
            raise RuntimeError("Blender GLB chunk is truncated")
        chunks.append((kind, payload))
        offset += 8 + length
    if len(chunks) != 2 or chunks[0][0] != 0x4E4F534A or chunks[1][0] != 0x004E4942:
        raise RuntimeError("Expected one JSON and one BIN chunk from Blender")
    document = json.loads(chunks[0][1].decode("utf-8").rstrip(" \t\r\n\0"))
    nodes = document.get("nodes", [])
    parents = {
        child: parent
        for parent, node in enumerate(nodes)
        for child in node.get("children", [])
    }
    scene_index = document.get("scene", 0)
    scene_roots = document["scenes"][scene_index].setdefault("nodes", [])
    adjustments = []
    for node_index, node in enumerate(nodes):
        if "mesh" not in node or "skin" not in node or node_index not in parents:
            continue
        parent_index = parents[node_index]
        parent = nodes[parent_index]
        parent["children"] = [child for child in parent.get("children", []) if child != node_index]
        if not parent["children"]:
            parent.pop("children")
        if node_index not in scene_roots:
            scene_roots.append(node_index)
        adjustments.append(
            {
                "nodeIndex": node_index,
                "nodeName": node.get("name"),
                "previousParentIndex": parent_index,
                "previousParentName": parent.get("name"),
                "reason": "Skinned mesh parent transforms are ignored by glTF; make the node a scene root to remove NODE_SKINNED_MESH_NON_ROOT without changing its local transform or binary accessors.",
            }
        )
    if not adjustments:
        return []
    json_bytes = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = chunks[1][1]
    output = bytearray()
    output.extend(struct.pack("<III", magic, version, 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)))
    output.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    output.extend(json_bytes)
    output.extend(struct.pack("<II", len(bin_bytes), 0x004E4942))
    output.extend(bin_bytes)
    glb_path.write_bytes(output)
    return adjustments


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--source-id", default="gitlab-ssbu-models")
    parser.add_argument("--target-height", type=float, default=1.8)
    return parser.parse_args(blender_arguments())


args = parse_arguments()
source = args.source.resolve()
output = args.output.resolve()
if not source.is_file() or source.suffix.lower() != ".blend":
    raise SystemExit(f"Expected an existing .blend source: {source}")
if output.exists():
    raise SystemExit(f"Output directory must not exist: {output}")
if not math.isfinite(args.target_height) or args.target_height <= 0:
    raise SystemExit("--target-height must be a finite positive number")
source_sha256 = digest(source)
if source_sha256 != args.expected_sha256.lower():
    raise SystemExit(
        f"Frozen source hash mismatch: expected {args.expected_sha256}, got {source_sha256}"
    )

isolated_root = Path("/private/tmp/ggd-ssbu-blender-empty")
for key, leaf in (
    ("BLENDER_USER_CONFIG", "config"),
    ("BLENDER_USER_SCRIPTS", "scripts"),
    ("BLENDER_USER_DATAFILES", "datafiles"),
):
    os.environ[key] = str(isolated_root / leaf)
    Path(os.environ[key]).mkdir(parents=True, exist_ok=True)

import bpy  # noqa: E402  (must load inside Blender after isolated paths are set)
from mathutils import Vector  # noqa: E402


bpy.context.preferences.filepaths.use_scripts_auto_execute = False
if hasattr(bpy.context.preferences.system, "use_online_access"):
    bpy.context.preferences.system.use_online_access = False
open_properties = {
    prop.identifier for prop in bpy.ops.wm.open_mainfile.get_rna_type().properties
}
if "use_scripts" not in open_properties:
    raise RuntimeError("This Blender build cannot explicitly disable embedded scripts")
bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False, load_ui=False)
bpy.context.preferences.filepaths.use_scripts_auto_execute = False

muted_drivers = []
for collection in (
    bpy.data.objects,
    bpy.data.meshes,
    bpy.data.armatures,
    bpy.data.materials,
    bpy.data.shape_keys,
    bpy.data.scenes,
    bpy.data.worlds,
    bpy.data.node_groups,
    bpy.data.curves,
    bpy.data.cameras,
    bpy.data.lights,
):
    for block in collection:
        animation_data = getattr(block, "animation_data", None)
        if not animation_data:
            continue
        for driver in animation_data.drivers:
            driver.mute = True
            muted_drivers.append(
                {"datablock": block.name, "dataPath": driver.data_path}
            )

all_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
meshes = [obj for obj in all_meshes if not obj.hide_render and obj.visible_get()]
if not meshes:
    raise RuntimeError("Source has no render-visible mesh objects")

armatures = {
    modifier.object
    for mesh in meshes
    for modifier in mesh.modifiers
    if modifier.type == "ARMATURE" and modifier.object is not None
}
for mesh in meshes:
    parent = mesh.parent
    while parent is not None:
        if parent.type == "ARMATURE":
            armatures.add(parent)
        parent = parent.parent
if not armatures:
    raise RuntimeError("Source has no armature associated with its visible meshes")

used_materials = {
    slot.material
    for mesh in meshes
    for slot in mesh.material_slots
    if slot.material is not None
}
used_images = set()
material_compatibility_adjustments = []
for material in used_materials:
    if not material.use_nodes or not material.node_tree:
        continue
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image is not None:
            used_images.add(node.image)
        if node.type == "BSDF_PRINCIPLED":
            ior = node.inputs.get("IOR")
            if ior is not None and not math.isclose(
                float(ior.default_value), 1.5, rel_tol=0, abs_tol=1e-9
            ):
                material_compatibility_adjustments.append(
                    {
                        "material": material.name,
                        "node": node.name,
                        "property": "Principled BSDF IOR",
                        "sourceValue": float(ior.default_value),
                        "exportValue": 1.5,
                        "reason": "GGD does not allow KHR_materials_ior; 1.5 is the glTF core default.",
                    }
                )
                ior.default_value = 1.5

image_inputs = []
missing_used_images = []
for image in sorted(used_images, key=lambda item: item.name):
    resolved = Path(bpy.path.abspath(image.filepath)).resolve() if image.filepath else None
    generated = image.source == "GENERATED"
    packed = image.packed_file is not None
    exists = bool(resolved and resolved.is_file())
    record = {
        "name": image.name,
        "source": image.source,
        "filepath": image.filepath,
        "resolvedPath": str(resolved) if resolved else None,
        "exists": exists,
        "packed": packed,
        "width": int(image.size[0]),
        "height": int(image.size[1]),
    }
    if exists:
        record.update(
            {
                "bytes": resolved.stat().st_size,
                "sha256": digest(resolved),
            }
        )
    if not exists and not packed and not generated:
        missing_used_images.append(record)
    image_inputs.append(record)
if missing_used_images:
    raise RuntimeError(
        "A texture used by an exported material is missing: "
        + json.dumps(missing_used_images, ensure_ascii=False)
    )

output.mkdir(parents=True)
texture_compatibility_adjustments = []
for image in sorted(used_images, key=lambda item: item.name):
    width, height = int(image.size[0]), int(image.size[1])
    if max(width, height) <= 256:
        continue
    ratio = 256 / max(width, height)
    target_width = max(1, round(width * ratio))
    target_height = max(1, round(height * ratio))
    derived = image.copy()
    derived.name = f"{image.name}.ggd-256"
    derived.scale(target_width, target_height)
    derived.file_format = "PNG"
    derived_path = output / "derived-textures" / f"{image.name}.ggd-256.png"
    derived_path.parent.mkdir(parents=True, exist_ok=True)
    derived.filepath_raw = str(derived_path)
    derived.save()
    for material in used_materials:
        if not material.use_nodes or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image == image:
                node.image = derived
    texture_compatibility_adjustments.append(
        {
            "sourceImage": image.name,
            "sourceDimensions": [width, height],
            "exportDimensions": [target_width, target_height],
            "method": "Blender Image.scale preserving aspect ratio",
            "derivedPath": str(derived_path),
            "derivedBytes": derived_path.stat().st_size,
            "derivedSha256": digest(derived_path),
            "reason": "GGD hero model texture edge limit is 256 pixels.",
        }
    )

source_geometry = []
world_points = []
for mesh in meshes:
    world_points.extend(mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices)
    source_geometry.append(
        {
            "name": mesh.name,
            "vertices": len(mesh.data.vertices),
            "polygons": len(mesh.data.polygons),
            "vertexGroups": len(mesh.vertex_groups),
            "morphTargets": len(mesh.data.shape_keys.key_blocks)
            if mesh.data.shape_keys
            else 0,
            "uvLayers": [layer.name for layer in mesh.data.uv_layers],
            "materials": [
                slot.material.name if slot.material else None
                for slot in mesh.material_slots
            ],
        }
    )
minimum = Vector([min(point[index] for point in world_points) for index in range(3)])
maximum = Vector([max(point[index] for point in world_points) for index in range(3)])
height = maximum.z - minimum.z
if not math.isfinite(height) or height <= 0:
    raise RuntimeError(f"Invalid source Z height: {height}")
scale = args.target_height / height
center = (minimum + maximum) * 0.5

export_objects = set(meshes) | armatures
for obj in list(export_objects):
    parent = obj.parent
    while parent is not None:
        export_objects.add(parent)
        parent = parent.parent

for obj in bpy.context.scene.objects:
    obj.select_set(False)
normalizer = bpy.data.objects.new("GGD_Normalization", None)
bpy.context.scene.collection.objects.link(normalizer)
for obj in export_objects:
    if obj.parent not in export_objects:
        world = obj.matrix_world.copy()
        obj.parent = normalizer
        obj.matrix_world = world
    obj.hide_set(False)
    obj.select_set(True)
normalizer.scale = (scale, scale, scale)
normalizer.location = (-center.x * scale, -center.y * scale, -minimum.z * scale)
normalizer.select_set(True)
bpy.context.view_layer.objects.active = normalizer
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0

glb_path = output / "body.glb"
export_properties = {
    prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
}
export_options = {
    "filepath": str(glb_path),
    "export_format": "GLB",
    "use_selection": True,
    "export_skins": True,
    "export_animations": True,
    "export_morph": True,
    "export_cameras": False,
    "export_lights": False,
    "export_extras": False,
}
for key in export_options:
    if key not in export_properties:
        raise RuntimeError(f"Blender glTF exporter is missing required option {key}")
for key, value in {
    "export_def_bones": False,
    "export_all_influences": True,
    "export_apply": False,
    "export_materials": "EXPORT",
    "export_image_format": "AUTO",
}.items():
    if key in export_properties:
        export_options[key] = value
bpy.ops.export_scene.gltf(**export_options)
if not glb_path.is_file():
    raise RuntimeError("Blender did not produce body.glb")
hierarchy_compatibility_adjustments = detach_skinned_mesh_nodes(glb_path)
if digest(source) != source_sha256:
    raise RuntimeError("Source .blend bytes changed during conversion")

analysis = {
    "schema": "ggd-ssbu-blend-source-analysis@1",
    "candidateId": args.candidate_id,
    "sourceId": args.source_id,
    "source": str(source),
    "sourceBytes": source.stat().st_size,
    "sourceSha256": source_sha256,
    "blenderVersion": bpy.app.version_string,
    "embeddedScriptsExecuted": False,
    "embeddedTextBlockCount": len(bpy.data.texts),
    "mutedDrivers": muted_drivers,
    "visibleMeshes": source_geometry,
    "hiddenOrNonrenderMeshes": [
        obj.name for obj in all_meshes if obj not in meshes
    ],
    "armatures": [
        {
            "name": obj.name,
            "bones": len(obj.data.bones),
            "boneNames": [bone.name for bone in obj.data.bones],
        }
        for obj in sorted(armatures, key=lambda item: item.name)
    ],
    "actions": [
        {"name": action.name, "frameRange": list(action.frame_range)}
        for action in bpy.data.actions
    ],
    "usedMaterials": [
        {
            "name": material.name,
            "useNodes": material.use_nodes,
            "surfaceRenderMethod": getattr(
                material, "surface_render_method", None
            ),
        }
        for material in sorted(used_materials, key=lambda item: item.name)
    ],
    "usedImages": image_inputs,
    "materialCompatibilityAdjustments": material_compatibility_adjustments,
    "textureCompatibilityAdjustments": texture_compatibility_adjustments,
    "hierarchyCompatibilityAdjustments": hierarchy_compatibility_adjustments,
    "sourceUnits": {
        "system": bpy.context.scene.unit_settings.system,
        "scaleLength": bpy.context.scene.unit_settings.scale_length,
    },
}
(output / "source-analysis.json").write_text(
    json.dumps(analysis, ensure_ascii=False, indent=2) + "\n"
)

receipt = {
    "schema": "ggd-ssbu-blend-component-conversion@1",
    "candidateId": args.candidate_id,
    "sourceId": args.source_id,
    "input": {
        "path": str(source),
        "bytes": source.stat().st_size,
        "sha256": source_sha256,
    },
    "tool": {
        "name": "Blender",
        "version": bpy.app.version_string,
        "backgroundFactoryStartupRequired": True,
        "embeddedScriptsExecuted": False,
        "driversMuted": len(muted_drivers),
    },
    "output": {
        "path": str(glb_path),
        "bytes": glb_path.stat().st_size,
        "sha256": digest(glb_path),
    },
    "normalization": {
        "sourceBounds": [list(minimum), list(maximum)],
        "sourceUp": "Blender Z",
        "glbUp": "glTF Y",
        "targetHeightMeters": args.target_height,
        "uniformScale": scale,
        "footOrigin": True,
    },
    "sourceRigCount": len(armatures),
    "sourceBoneCounts": [len(obj.data.bones) for obj in armatures],
    "sourceActionCount": len(bpy.data.actions),
    "sourceImageCountUsed": len(used_images),
    "materialCompatibilityAdjustments": material_compatibility_adjustments,
    "textureCompatibilityAdjustments": texture_compatibility_adjustments,
    "hierarchyCompatibilityAdjustments": hierarchy_compatibility_adjustments,
    "sourceBytesUnchanged": True,
    "runtimeReady": False,
    "backendSelectionVerified": False,
    "defaultEligible": False,
    "limitations": [
        "This is a body component with source skin and basic materials; structural and visual validation are separate.",
        "No source actions were added, synthesized, or retargeted.",
        "Hidden native mesh variants remain preserved in the original Blender file and are excluded from this visible-appearance export.",
        "Source normal, PRM, emissive, and game shader parity remain unverified unless they were already connected in the source Blender material graph.",
        "Non-default source IOR values are recorded and normalized to glTF core IOR 1.5 because current GGD does not allow KHR_materials_ior.",
        "Source textures above 256 pixels are retained by hash and resized in a separate derived copy for the current GGD budget.",
    ],
}
(output / "conversion.json").write_text(
    json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(receipt, ensure_ascii=False))
