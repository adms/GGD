#!/usr/bin/env python3
"""Assemble the verified JUMP FORCE Dai glTF components into one review GLB.

Run this file through Blender in background mode.  The output deliberately has
no fabricated animation clips; it remains a review component until the normal
GGD model intake and visual review pass.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


SOURCE_PARTS = ("chr0430_form0.gltf", "chr0430_form0_head.gltf", "chr0430_equipment1.gltf")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def texture_stem(material_name: str) -> str | None:
    name = material_name.lower()
    for token in ("eyeshadow", "pants", "weapon", "glass", "face", "hair", "eye", "lens", "skin", "cloth", "effect"):
        if token in name:
            return token
    if "oral" in name:
        return "face"
    return None


def find_texture(texture_dir: Path, stem: str, suffix: str) -> Path | None:
    matches = sorted(texture_dir.glob(f"T_Chr0430_{stem}_{suffix}.png"))
    return matches[0] if matches else None


def image_node(nodes, path: Path, *, non_color: bool) -> object:
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def bind_material(material, texture_dir: Path) -> dict[str, object]:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    stem = texture_stem(material.name)
    bound: dict[str, str] = {}
    if stem:
        color = find_texture(texture_dir, stem, "C")
        normal = find_texture(texture_dir, stem, "N")
        orm = find_texture(texture_dir, stem, "ORM")
        if color:
            tex = image_node(nodes, color, non_color=False)
            links.new(tex.outputs["Color"], shader.inputs["Base Color"])
            if "Alpha" in tex.outputs and "Alpha" in shader.inputs:
                links.new(tex.outputs["Alpha"], shader.inputs["Alpha"])
            bound["baseColor"] = str(color)
        if normal:
            tex = image_node(nodes, normal, non_color=True)
            normal_map = nodes.new("ShaderNodeNormalMap")
            links.new(tex.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
            bound["normal"] = str(normal)
        if orm:
            tex = image_node(nodes, orm, non_color=True)
            separate = nodes.new("ShaderNodeSeparateColor")
            links.new(tex.outputs["Color"], separate.inputs["Color"])
            links.new(separate.outputs["Green"], shader.inputs["Roughness"])
            links.new(separate.outputs["Blue"], shader.inputs["Metallic IOR Level"])
            bound["orm"] = str(orm)
    if "damage_blood" in material.name.lower():
        shader.inputs["Base Color"].default_value = (0.18, 0.005, 0.005, 1.0)
        shader.inputs["Roughness"].default_value = 0.7
    if any(token in material.name.lower() for token in ("hair", "lens", "glass", "eyeshadow")):
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        elif hasattr(material, "blend_method"):
            material.blend_method = "HASHED"
    return {"material": material.name, "textureStem": stem, "bound": bound}


def import_part(path: Path) -> tuple[list[object], list[object]]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    added = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in added if obj.type == "MESH"]
    armatures = [obj for obj in added if obj.type == "ARMATURE"]
    if len(meshes) != 1 or len(armatures) != 1:
        raise ValueError(f"expected one mesh and one armature in {path.name}; got {len(meshes)} and {len(armatures)}")
    return meshes, armatures


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--texture-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args(argv)
    model_dir = args.model_dir.resolve()
    texture_dir = args.texture_dir.resolve()
    output = args.output.resolve()
    receipt_path = args.receipt.resolve()
    inputs = [model_dir / name for name in SOURCE_PARTS]
    for path in (*inputs, texture_dir):
        if not path.exists():
            raise ValueError(f"missing input: {path}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    primary_armature = None
    mesh_objects = []
    imported = []
    for part_number, path in enumerate(inputs):
        meshes, armatures = import_part(path)
        mesh = meshes[0]
        armature = armatures[0]
        imported.append({"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)})
        if primary_armature is None:
            primary_armature = armature
            primary_armature.name = "Dai_JF_chr0430_Armature"
        else:
            for modifier in mesh.modifiers:
                if modifier.type == "ARMATURE":
                    modifier.object = primary_armature
            mesh.parent = primary_armature
            bpy.data.objects.remove(armature, do_unlink=True)
        mesh.name = f"Dai_JF_chr0430_{part_number}_{path.stem}"
        mesh.data.name = mesh.name
        mesh_objects.append(mesh)

    if primary_armature is None:
        raise ValueError("no primary armature")
    material_bindings = []
    for material in sorted(bpy.data.materials, key=lambda item: item.name):
        material_bindings.append(bind_material(material, texture_dir))
    primary_armature["ggdSourceId"] = "steam-jump-force-priority-original-assets-build-8523149"
    primary_armature["ggdNativeCharacterId"] = "chr0430"
    primary_armature["ggdCharacter"] = "Dai"
    primary_armature["ggdAnimationStatus"] = "no-native-clips-in-current-export"

    bpy.ops.object.select_all(action="DESELECT")
    primary_armature.select_set(True)
    for mesh in mesh_objects:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = primary_armature
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_extras=True,
        export_image_format="AUTO",
    )
    receipt = {
        "schema": "ggd-blender-conversion-receipt@1",
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "converter": {"name": "Blender", "version": bpy.app.version_string},
        "inputs": imported,
        "textureDirectory": str(texture_dir),
        "materialBindings": material_bindings,
        "composition": list(SOURCE_PARTS),
        "armatureCount": len([obj for obj in bpy.data.objects if obj.type == "ARMATURE"]),
        "meshCount": len(mesh_objects),
        "animationCount": 0,
        "output": {"path": str(output), "bytes": output.stat().st_size, "sha256": sha256(output)},
        "status": "review-glb-pending-ggd-intake-and-visual-acceptance",
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
