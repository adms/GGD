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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from glb_material_alpha import (
    composite_alpha_masked_colors,
    promote_transparent_base_color_materials,
    should_promote_source_material,
)


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
    parser.add_argument(
        "--exclude-visible-mesh-prefix",
        action="append",
        default=[],
        help=(
            "Exclude a render-visible mesh whose name starts with this exact prefix. "
            "May be repeated; every exclusion is recorded in the receipts. This is "
            "used to choose one source LOD when a Worldblender file exposes both."
        ),
    )
    parser.add_argument(
        "--join-visible-by-material",
        action="store_true",
        help=(
            "Join render-visible, single-material skinned meshes that use the same "
            "material. The source analysis remains pre-join and the receipt records "
            "every joined group."
        ),
    )
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
source_visible_meshes = [
    obj for obj in all_meshes if not obj.hide_render and obj.visible_get()
]
excluded_visible_meshes = [
    obj
    for obj in source_visible_meshes
    if any(obj.name.startswith(prefix) for prefix in args.exclude_visible_mesh_prefix)
]
meshes = [obj for obj in source_visible_meshes if obj not in excluded_visible_meshes]
hidden_or_nonrender_mesh_names = [obj.name for obj in all_meshes if obj not in meshes]
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
output.mkdir(parents=True)
used_images = set()
material_compatibility_adjustments = []


def upstream_image_nodes(socket) -> set:
    """Return image nodes feeding a material input, through intermediate nodes."""
    found = set()
    pending = [link.from_node for link in socket.links]
    visited = set()
    while pending:
        node = pending.pop()
        if node in visited:
            continue
        visited.add(node)
        if node.type == "TEX_IMAGE" and node.image is not None:
            found.add(node)
        for node_input in node.inputs:
            pending.extend(link.from_node for link in node_input.links)
    return found


def image_alpha_minimum(image) -> float | None:
    """Read the source image alpha channel without changing or saving the image."""
    if int(image.channels) < 4:
        return None
    pixels = image.pixels[:]
    if len(pixels) < 4:
        return None
    return float(min(pixels[3::4]))


def one_link(socket):
    return socket.links[0] if len(socket.links) == 1 else None


def vector_source_signature(image_node):
    vector = image_node.inputs.get("Vector")
    link = one_link(vector) if vector is not None else None
    if link is None:
        return None
    source = link.from_node
    return (
        source.type,
        getattr(source, "uv_map", None),
        link.from_socket.name,
    )


def bake_alpha_masked_base_color_mix(material) -> dict | None:
    """Bake the exact two-image eye graph that glTF cannot represent.

    Worldblender eyes use ``mix(A.color, B.color, B.alpha)`` as an opaque Base
    Color. Blender's glTF exporter drops A and writes B as an OPAQUE RGBA image,
    leaving transparent alpha in an opaque atlas. We only bake when the graph,
    image sizes, colour spaces, and UV source are all unambiguous.
    """
    if not material.use_nodes or not material.node_tree:
        return None
    tree = material.node_tree
    principled = [node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"]
    if len(principled) != 1:
        return None
    base_socket = principled[0].inputs.get("Base Color")
    base_link = one_link(base_socket) if base_socket is not None else None
    if base_link is None or base_link.from_node.type != "MIX":
        return None
    mix_node = base_link.from_node
    incoming = [link for link in tree.links if link.to_node == mix_node]

    def named_link(name: str):
        found = [link for link in incoming if link.to_socket.name == name]
        return found[0] if len(found) == 1 else None

    factor_link = named_link("Factor")
    a_link = named_link("A")
    b_link = named_link("B")
    if any(link is None for link in (factor_link, a_link, b_link)):
        return None
    if any(link.from_node.type != "TEX_IMAGE" for link in (a_link, b_link, factor_link)):
        return None
    if a_link.from_socket.name != "Color" or b_link.from_socket.name != "Color":
        return None
    if factor_link.from_socket.name != "Alpha" or factor_link.from_node != b_link.from_node:
        return None
    base_node, overlay_node = a_link.from_node, b_link.from_node
    base_image, overlay_image = base_node.image, overlay_node.image
    if base_image is None or overlay_image is None:
        return None
    if tuple(base_image.size) != tuple(overlay_image.size):
        return None
    if base_image.colorspace_settings.name != overlay_image.colorspace_settings.name:
        return None
    base_vector = vector_source_signature(base_node)
    overlay_vector = vector_source_signature(overlay_node)
    if base_vector is None or overlay_vector is None:
        return None
    if image_alpha_minimum(overlay_image) is None:
        return None
    width, height = int(base_image.size[0]), int(base_image.size[1])
    baked = bpy.data.images.new(
        f"{material.name}.ggd-opaque-base-color",
        width=width,
        height=height,
        alpha=True,
        float_buffer=False,
    )
    baked.colorspace_settings.name = base_image.colorspace_settings.name
    baked_node = tree.nodes.new("ShaderNodeTexImage")
    baked_node.name = f"GGD Opaque Base Color {material.name}"
    baked_node.image = baked
    baked_node.interpolation = overlay_node.interpolation
    baked_node.extension = overlay_node.extension
    vector_socket = overlay_node.inputs.get("Vector")
    vector_link = one_link(vector_socket) if vector_socket is not None else None
    if vector_link is not None:
        tree.links.new(vector_link.from_socket, baked_node.inputs["Vector"])
    bake_method = "scene-linear-pixel-composite"
    if base_vector == overlay_vector:
        baked_pixels = composite_alpha_masked_colors(
            base_image.pixels[:], overlay_image.pixels[:]
        )
        baked.pixels.foreach_set(baked_pixels)
        baked.update()
    else:
        target_uv = overlay_vector[1]
        material_users = [
            mesh
            for mesh in meshes
            if any(slot.material == material for slot in mesh.material_slots)
        ]
        if len(material_users) != 1:
            tree.nodes.remove(baked_node)
            bpy.data.images.remove(baked)
            return None
        bake_object = material_users[0]
        if any(slot.material != material for slot in bake_object.material_slots):
            tree.nodes.remove(baked_node)
            bpy.data.images.remove(baked)
            return None
        uv_layer = bake_object.data.uv_layers.get(target_uv)
        if uv_layer is None:
            tree.nodes.remove(baked_node)
            bpy.data.images.remove(baked)
            return None
        bake_object.data.uv_layers.active = uv_layer
        uv_layer.active_render = True
        for obj in bpy.context.scene.objects:
            obj.select_set(False)
        bake_object.hide_set(False)
        bake_object.select_set(True)
        bpy.context.view_layer.objects.active = bake_object
        tree.nodes.active = baked_node
        for node in tree.nodes:
            node.select = node == baked_node
        bpy.context.scene.render.engine = "CYCLES"
        bpy.context.scene.cycles.device = "CPU"
        bpy.context.scene.cycles.samples = 1
        bpy.ops.object.bake(
            type="DIFFUSE",
            pass_filter={"COLOR"},
            margin=4,
            use_clear=True,
        )
        baked_pixels = list(baked.pixels[:])
        baked_pixels[3::4] = [1.0] * (len(baked_pixels) // 4)
        baked.pixels.foreach_set(baked_pixels)
        baked.update()
        bake_method = f"Blender diffuse-colour bake to {target_uv}"
    baked.file_format = "PNG"
    baked_path = output / "derived-materials" / f"{material.name}.ggd-opaque-base-color.png"
    baked_path.parent.mkdir(parents=True, exist_ok=True)
    baked.filepath_raw = str(baked_path)
    baked.save()
    tree.links.remove(base_link)
    tree.links.new(baked_node.outputs["Color"], base_socket)
    return {
        "material": material.name,
        "node": mix_node.name,
        "property": "Principled Base Color alpha-mask mix",
        "sourceValue": {
            "baseImage": base_image.name,
            "overlayImage": overlay_image.name,
            "factor": f"{overlay_image.name}.Alpha",
            "opaqueSurface": True,
        },
        "exportValue": {
            "image": baked.name,
            "path": str(baked_path),
            "bytes": baked_path.stat().st_size,
            "sha256": digest(baked_path),
            "alphaMinimum": 1.0,
            "method": bake_method,
        },
        "reason": (
            "Bake a source opaque two-image colour mix that glTF core cannot "
            "represent; retaining only the overlay creates OPAQUE+transparent texture data."
        ),
    }


for material in sorted(used_materials, key=lambda item: item.name):
    adjustment = bake_alpha_masked_base_color_mix(material)
    if adjustment is not None:
        material_compatibility_adjustments.append(adjustment)

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


transparent_base_color_materials = {}
for material in sorted(used_materials, key=lambda item: item.name):
    if not material.use_nodes or not material.node_tree:
        continue
    render_method = getattr(material, "surface_render_method", None)
    base_color_images = {
        image_node.image
        for node in material.node_tree.nodes
        if node.type == "BSDF_PRINCIPLED"
        for image_node in upstream_image_nodes(node.inputs["Base Color"])
    }
    alpha_minima = {
        image.name: image_alpha_minimum(image)
        for image in sorted(base_color_images, key=lambda item: item.name)
    }
    minimum = next(iter(alpha_minima.values()), None)
    if should_promote_source_material(render_method, minimum, len(base_color_images)):
        transparent_base_color_materials[material.name] = {
            "sourceSurfaceRenderMethod": render_method,
            "baseColorImages": sorted(alpha_minima),
            "baseColorAlphaMinimum": minimum,
        }

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

material_join_adjustments = []
if args.join_visible_by_material:
    groups = {}
    for mesh in meshes:
        material_slots = [slot.material for slot in mesh.material_slots]
        if len(material_slots) != 1 or material_slots[0] is None:
            raise RuntimeError(
                "Material joining requires exactly one non-null material per visible mesh: "
                + mesh.name
            )
        if mesh.data.shape_keys is not None:
            raise RuntimeError(
                "Material joining refuses source morph targets: " + mesh.name
            )
        modifiers = [
            modifier.object
            for modifier in mesh.modifiers
            if modifier.type == "ARMATURE" and modifier.object is not None
        ]
        if len(modifiers) != 1:
            raise RuntimeError(
                "Material joining requires one armature modifier: " + mesh.name
            )
        groups.setdefault((material_slots[0], modifiers[0]), []).append(mesh)
    for (material, armature), group in sorted(
        groups.items(), key=lambda item: item[0][0].name
    ):
        if len(group) < 2:
            continue
        parents = {mesh.parent for mesh in group}
        if parents != {armature}:
            raise RuntimeError(
                "Material joining requires the shared armature to be the direct parent: "
                + material.name
            )
        before = [
            {
                "name": mesh.name,
                "vertices": len(mesh.data.vertices),
                "polygons": len(mesh.data.polygons),
            }
            for mesh in sorted(group, key=lambda item: item.name)
        ]
        for obj in bpy.context.scene.objects:
            obj.select_set(False)
        active = sorted(group, key=lambda item: item.name)[0]
        for mesh in group:
            mesh.hide_set(False)
            mesh.select_set(True)
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = "GGD_joined_" + material.name
        for polygon in active.data.polygons:
            polygon.material_index = 0
        while len(active.data.materials) > 1:
            active.data.materials.pop(index=len(active.data.materials) - 1)
        if len(active.data.materials) != 1 or active.data.materials[0] != material:
            raise RuntimeError("Joined mesh did not preserve its material: " + material.name)
        material_join_adjustments.append(
            {
                "material": material.name,
                "armature": armature.name,
                "sourceMeshes": before,
                "outputMesh": active.name,
                "outputVertices": len(active.data.vertices),
                "outputPolygons": len(active.data.polygons),
                "reason": "Reduce draw primitives without mixing materials or changing world-space source geometry.",
            }
        )
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.hide_render and obj.visible_get()]

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
alpha_mode_adjustments = promote_transparent_base_color_materials(
    glb_path, set(transparent_base_color_materials)
)
material_compatibility_adjustments.extend(alpha_mode_adjustments)
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
    "sourceVisibleMeshesExcludedByPrefix": [
        {
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
        }
        for obj in sorted(excluded_visible_meshes, key=lambda item: item.name)
    ],
    "excludeVisibleMeshPrefixes": args.exclude_visible_mesh_prefix,
    "hiddenOrNonrenderMeshes": hidden_or_nonrender_mesh_names,
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
    "transparentBaseColorMaterials": transparent_base_color_materials,
    "materialCompatibilityAdjustments": material_compatibility_adjustments,
    "materialJoinAdjustments": material_join_adjustments,
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
        "visibleMeshesJoinedByMaterial": args.join_visible_by_material,
        "excludeVisibleMeshPrefixes": args.exclude_visible_mesh_prefix,
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
    "sourceVisibleMeshesExcludedByPrefix": [obj.name for obj in excluded_visible_meshes],
    "sourceImageCountUsed": len(used_images),
    "materialCompatibilityAdjustments": material_compatibility_adjustments,
    "materialJoinAdjustments": material_join_adjustments,
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
