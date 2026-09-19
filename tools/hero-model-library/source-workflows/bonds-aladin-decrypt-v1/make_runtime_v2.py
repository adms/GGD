#!/usr/bin/env python3
"""Atlas and merge a rigged runtime-v1 GLB into the GGD runtime-v2 limits.

Input already satisfies the triangle policy.  This pass creates one 256x256
atlas and one material per source mesh, remaps polygon UVs by original material
slot, and therefore exports five skinned primitives and five embedded images.
The input GLB is never modified.
"""

from __future__ import annotations

from array import array
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy


ATLAS_SIZE = 256
SOURCE_MESH_NAMES = ("bodygeo", "facegeo", "hairgeo", "realbodygeo", "weapongeo")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def first_base_color_image(material: bpy.types.Material | None) -> bpy.types.Image | None:
    if material is None or not material.use_nodes:
        return None
    connected = []
    fallback = []
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or node.image is None:
            continue
        fallback.append(node.image)
        if any(link.to_node.type == "BSDF_PRINCIPLED" for output in node.outputs for link in output.links):
            connected.append(node.image)
    return (connected or fallback or [None])[0]


def solid_image(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Image:
    image = bpy.data.images.new(name=name, width=4, height=4, alpha=True)
    image.pixels = list(rgba) * 16
    return image


def resized_pixels(image: bpy.types.Image, width: int, height: int) -> array:
    duplicate = image.copy()
    duplicate.name = f"{image.name}_atlas_tmp"
    duplicate.scale(width, height)
    pixels = array("f", [0.0]) * (width * height * 4)
    duplicate.pixels.foreach_get(pixels)
    bpy.data.images.remove(duplicate)
    return pixels


def build_atlas(obj: bpy.types.Object) -> dict:
    materials = list(obj.data.materials)
    fallback = solid_image(f"{obj.name}_fallback", (0.8, 0.2, 0.8, 1.0))
    slot_images = [first_base_color_image(material) or fallback for material in materials]
    unique_images: list[bpy.types.Image] = []
    image_index: dict[int, int] = {}
    for image in slot_images:
        key = int(image.as_pointer())
        if key not in image_index:
            image_index[key] = len(unique_images)
            unique_images.append(image)
    if not unique_images:
        unique_images = [fallback]
        image_index[int(fallback.as_pointer())] = 0
        slot_images = [fallback]

    columns = max(1, math.ceil(math.sqrt(len(unique_images))))
    rows = max(1, math.ceil(len(unique_images) / columns))
    cell_width = ATLAS_SIZE // columns
    cell_height = ATLAS_SIZE // rows
    atlas = bpy.data.images.new(
        name=f"{obj.name}_runtime_v2_atlas",
        width=ATLAS_SIZE,
        height=ATLAS_SIZE,
        alpha=True,
    )
    atlas_pixels = array("f", [0.0]) * (ATLAS_SIZE * ATLAS_SIZE * 4)
    cells = []
    for index, image in enumerate(unique_images):
        column = index % columns
        row = index // columns
        pixels = resized_pixels(image, cell_width, cell_height)
        for y in range(cell_height):
            source_start = y * cell_width * 4
            target_start = ((row * cell_height + y) * ATLAS_SIZE + column * cell_width) * 4
            atlas_pixels[target_start : target_start + cell_width * 4] = pixels[
                source_start : source_start + cell_width * 4
            ]
        cells.append(
            {
                "sourceImage": image.name,
                "column": column,
                "row": row,
                "width": cell_width,
                "height": cell_height,
            }
        )
    atlas.pixels.foreach_set(atlas_pixels)
    atlas.pack()

    if not obj.data.uv_layers:
        raise RuntimeError(f"{obj.name} has no UV layer")
    uv_data = obj.data.uv_layers.active.data
    for polygon in obj.data.polygons:
        slot_index = min(polygon.material_index, len(slot_images) - 1)
        atlas_index = image_index[int(slot_images[slot_index].as_pointer())]
        column = atlas_index % columns
        row = atlas_index // columns
        for loop_index in polygon.loop_indices:
            uv = uv_data[loop_index].uv
            uv.x = (uv.x + column) / columns
            uv.y = (uv.y + row) / rows
        polygon.material_index = 0

    material = bpy.data.materials.new(name=f"{obj.name}_runtime_v2")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = atlas
    texture.interpolation = "Linear"
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
    metallic = principled.inputs.get("Metallic IOR Level") or principled.inputs.get("Metallic")
    if metallic is not None:
        metallic.default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.8
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if fallback.users == 0:
        bpy.data.images.remove(fallback)
    return {
        "meshObjectName": obj.name,
        "triangleCount": triangle_count(obj),
        "sourceMaterialSlotCount": len(materials),
        "runtimeMaterialSlotCount": len(obj.data.materials),
        "atlasName": atlas.name,
        "atlasWidth": ATLAS_SIZE,
        "atlasHeight": ATLAS_SIZE,
        "atlasCells": cells,
        "vertexGroupCount": len(obj.vertex_groups),
        "armatureModifierCount": sum(1 for modifier in obj.modifiers if modifier.type == "ARMATURE"),
    }


def glb_document(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"not a glTF 2 GLB: {path}")
    length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        raise ValueError("first GLB chunk is not JSON")
    return json.loads(data[20 : 20 + length].decode("utf-8"))


def main() -> int:
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise SystemExit("expected: runtime-v1.glb runtime-v2.glb receipt.json")
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
            if obj.type == "MESH" and any(name in obj.name.lower() for name in SOURCE_MESH_NAMES)
        ],
        key=lambda obj: obj.name,
    )
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(meshes) != 5:
        raise RuntimeError(f"expected five source meshes, found {len(meshes)}")
    mesh_receipts = [build_atlas(obj) for obj in meshes]
    triangle_total = sum(item["triangleCount"] for item in mesh_receipts)
    if triangle_total > 8000:
        raise RuntimeError(f"runtime-v2 has {triangle_total} triangles, above 8000")
    if any(item["runtimeMaterialSlotCount"] != 1 for item in mesh_receipts):
        raise RuntimeError("material merge did not reduce every mesh to one slot")

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_skins=True,
        export_animations=False,
        export_materials="EXPORT",
        export_yup=True,
    )
    document = glb_document(output_path)
    primitive_count = sum(len(mesh["primitives"]) for mesh in document.get("meshes", []))
    image_count = len(document.get("images", []))
    skin_count = len(document.get("skins", []))
    if primitive_count > 6:
        raise RuntimeError(f"runtime-v2 exported {primitive_count} primitives, above 6")
    if image_count > 6:
        raise RuntimeError(f"runtime-v2 exported {image_count} images, above 6")
    receipt = {
        "schema": "ggd.heros-bonds-runtime-v2@1",
        "blenderVersion": bpy.app.version_string,
        "inputRuntimeV1AbsolutePath": str(input_path),
        "inputRuntimeV1Sha256": sha256_file(input_path),
        "outputRuntimeV2AbsolutePath": str(output_path),
        "outputRuntimeV2Bytes": output_path.stat().st_size,
        "outputRuntimeV2Sha256": sha256_file(output_path),
        "triangleCount": triangle_total,
        "meshCount": len(meshes),
        "skinnedPrimitiveCount": primitive_count,
        "embeddedImageCount": image_count,
        "maxTextureDimension": ATLAS_SIZE,
        "skinCount": skin_count,
        "armatureObjectCount": len(armatures),
        "animationCount": len(document.get("animations", [])),
        "meshes": mesh_receipts,
        "status": "runtime-v2-exported-awaiting-khronos-and-visual-validation",
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
