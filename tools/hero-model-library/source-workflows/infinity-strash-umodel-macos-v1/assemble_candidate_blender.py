#!/usr/bin/env python3
"""Assemble Infinity Strash multipart UModel glTF exports with Blender.

Run through Blender so its native glTF importer normalizes skin weights without
the Assimp round-trip that corrupts these models.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
import bmesh


CANDIDATES = {
    "dai-pn010-02": {
        "parts": [
            ("body", "Strash/Chara/Player/PN010/02/SK_PN010_02_Body.gltf"),
            ("face", "Strash/Chara/Player/PN010/Face/SK_PN010_00_Face.gltf"),
            ("hair", "Strash/Chara/Player/PN010/Hair/02/SK_PN010_02_Hair.gltf"),
        ],
        "textures": {
            "body": "Strash/Chara/Player/PN010/02/T_PN010_02_Body_Base.png",
            "bodyNormal": "Strash/Chara/Player/PN010/02/T_PN010_02_Body_N.png",
            "face": "Strash/Chara/Player/PN010/Face/T_PN010_00_Face_Base.png",
            "faceDecal1": "Strash/Chara/Player/PN010/Face/T_PN010_00_Face_CelDecal.png",
            "faceDecal2": "Strash/Chara/Player/PN010/Face/T_PN010_00_Face_CelDecal2.png",
            "hair": "Strash/Chara/Player/PN010/Hair/T_PN010_00_Hair_Base.png",
            "hairNormal": "Strash/Chara/Player/PN010/Hair/02/T_PN010_02_Hair_N.png",
            "weapon": "Strash/Chara/Player/PN010/Weapon/Papunica/T_PN010_00_Weapon_Papunica_Base.png",
        },
        "animations": [
            ("idle", "Strash/Chara/Player/PN010/Animations/AS_PN010_00_N_Idle01_Lp.psa"),
            ("run", "Strash/Chara/Player/PN010/Animations/AS_PN010_00_B_Run01_F_Lp.psa"),
            ("attack", "Strash/Chara/Player/PN010/Animations/AS_PN010_00_B_Atk01.psa"),
            ("down", "Strash/Chara/Player/PN010/Animations/AS_PN010_00_B_Down01_Lp.psa"),
            ("special01", "Strash/Chara/Player/PN010/Animations/AS_PN010_00_B_Special01.psa"),
            ("special02", "Strash/Chara/Player/PN010/Animations/AS_PN010_00_B_Special02.psa"),
        ],
    },
    "vearn-en801-pre-transformation": {
        "parts": [
            ("body", "Strash/Chara/Monster/EN801/00/SK_EN801_00_Body.gltf"),
            ("face", "Strash/Chara/Monster/EN801/Face/SK_EN801_00_Face.gltf"),
            ("hair", "Strash/Chara/Monster/EN801/Hair/SK_EN801_00_Hair.gltf"),
        ],
        "textures": {
            "body": "Strash/Chara/Monster/EN801/00/T_EN801_00_Body_Base.png",
            "bodyNormal": "Strash/Chara/Monster/EN801/00/T_EN801_00_Body_N.png",
            "face": "Strash/Chara/Monster/EN801/Face/T_EN801_00_Face_Base.png",
            "faceNormal": "Strash/Chara/Monster/EN801/Face/T_EN801_00_Face_N.png",
            "faceDecal1": "Strash/Chara/Monster/EN801/Face/T_EN801_00_Face_CelDecal.png",
            "faceDecal2": "Strash/Chara/Monster/EN801/Face/T_EN801_00_Face_Cell_Decal2.png",
            "faceDecal3": "Strash/Chara/Monster/EN801/Face/T_EN801_00_Face_Cell_Decal3.png",
            "hair": "Strash/Chara/Monster/EN801/Hair/T_EN801_00_Hair_Base.png",
        },
        "animations": [
            ("idle", "Strash/Chara/Monster/EN801/Animations/AS_EN801_00_B_Idle01_Lp.psa"),
            ("run", "Strash/Chara/Monster/EN801/Animations/AS_EN801_00_B_Run01_F_Lp.psa"),
            ("attack", "Strash/Chara/Monster/EN801/Animations/AS_EN801_00_B_Atk01.psa"),
            ("death", "Strash/Chara/Monster/EN801/Animations/AS_EN801_00_B_Dead01.psa"),
            ("special01", "Strash/Chara/Monster/EN801/Animations/AS_EN801_00_B_Special01_01.psa"),
            ("kaizer_phoenix", "Strash/Chara/Monster/EN801/Animations/AS_EN801_00_B_Special01_01_KaizerPhoenix.psa"),
        ],
    },
}


# The PSA exporter samples every transform of every bone, including sub-millimetre
# numerical motion on cloth and facial helpers. GGD budgets animation channels,
# rather than key count, so those sampled constants need to be collapsed.
SECONDARY_BONE_RE = re.compile(
    r"Cape|Hair|Skirt|Robe|Ribbon|Cloth|Face|Eye|Mouth|Cheek|Brow|Lip|Decal|Attach|Weapon|Sheath",
    re.IGNORECASE,
)
ANIMATION_BASELINE_TOLERANCE = {
    "translation": 0.003,
    "rotation": 0.0003,
    "scale": 0.0003,
}
VEARN_KAIZER_ROTATION_TOLERANCE = 0.002


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def glb_document(path: Path) -> dict:
    payload = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or total != len(payload):
        raise RuntimeError("Blender did not produce a valid GLB 2 container")
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB has no leading JSON chunk")
    return json.loads(payload[20:20 + json_length].decode().rstrip(" \t\r\n\0"))


def optimize_glb_animation_channels(path: Path, preserve_node_baseline: bool = False) -> dict:
    """Collapse sampled channels that reproduce a chosen GLB node baseline.

    UModel's source coordinates are centimetres, so the translation tolerance is
    0.003 cm (0.03 mm). Core bones use the first idle frame as their baseline.
    Named secondary helpers may use the most common constant value across clips.
    """
    payload = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or total != len(payload):
        raise RuntimeError("cannot optimize a non-GLB 2 container")
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB has no leading JSON chunk")
    document = json.loads(payload[20:20 + json_length].decode().rstrip(" \t\r\n\0"))
    chunks = []
    offset = 20 + json_length
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        chunks.append((chunk_type, payload[offset + 8:offset + 8 + chunk_length]))
        offset += 8 + chunk_length
    binary_chunks = [chunk for chunk_type, chunk in chunks if chunk_type == 0x004E4942]
    if len(binary_chunks) != 1:
        raise RuntimeError("expected exactly one GLB BIN chunk")
    binary = binary_chunks[0]
    component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

    def accessor_values(accessor_index: int) -> list[tuple[float, ...]]:
        accessor = document["accessors"][accessor_index]
        if accessor.get("componentType") != 5126 or "sparse" in accessor:
            raise RuntimeError("animation optimizer requires dense FLOAT accessors")
        view = document["bufferViews"][accessor["bufferView"]]
        width = component_counts[accessor["type"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", width * 4)
        return [
            struct.unpack_from("<" + "f" * width, binary, start + index * stride)
            for index in range(accessor["count"])
        ]

    def within(values: list[tuple[float, ...]], baseline: tuple[float, ...], tolerance: float) -> bool:
        return all(max(abs(left - right) for left, right in zip(value, baseline)) <= tolerance for value in values)

    animations = document.get("animations", [])
    idle_indices = [index for index, animation in enumerate(animations) if animation.get("name") == "GGD_native_idle"]
    if len(idle_indices) != 1:
        raise RuntimeError("expected one GGD_native_idle animation for baseline optimization")
    idle_index = idle_indices[0]
    secondary_mode_enabled = not preserve_node_baseline and path.stem.startswith("dai-")
    tracks: dict[tuple[int, str], list[dict]] = {}
    for animation_index, animation in enumerate(animations):
        for channel_index, channel in enumerate(animation["channels"]):
            target = channel["target"]
            path_name = target["path"]
            if path_name not in ANIMATION_BASELINE_TOLERANCE:
                continue
            sampler = animation["samplers"][channel["sampler"]]
            tracks.setdefault((target["node"], path_name), []).append({
                "animationIndex": animation_index,
                "channelIndex": channel_index,
                "values": accessor_values(sampler["output"]),
            })

    baselines: dict[tuple[int, str], tuple[float, ...]] = {}
    shifted_secondary = []
    for key, rows in tracks.items():
        node_index, path_name = key
        tolerance = ANIMATION_BASELINE_TOLERANCE[path_name]
        idle_rows = [row for row in rows if row["animationIndex"] == idle_index]
        if len(idle_rows) != 1:
            raise RuntimeError("every animated node path must occur once in the idle clip")
        idle_first = tuple(idle_rows[0]["values"][0])
        node_name = document["nodes"][node_index].get("name", "")
        defaults = {
            "translation": (0.0, 0.0, 0.0),
            "rotation": (0.0, 0.0, 0.0, 1.0),
            "scale": (1.0, 1.0, 1.0),
        }
        current = tuple(document["nodes"][node_index].get(path_name, defaults[path_name]))
        selected = current if preserve_node_baseline else idle_first
        if secondary_mode_enabled and SECONDARY_BONE_RE.search(node_name):
            candidates = [idle_first, current]
            candidates.extend(tuple(row["values"][0]) for row in rows if within(row["values"], tuple(row["values"][0]), tolerance))
            selected = max(
                candidates,
                key=lambda candidate: sum(within(row["values"], candidate, tolerance) for row in rows),
            )
            idle_delta = max(abs(left - right) for left, right in zip(selected, idle_first))
            if idle_delta > tolerance:
                shifted_secondary.append({
                    "node": node_name,
                    "path": path_name,
                    "maxComponentDeltaFromIdleFirstFrame": idle_delta,
                })
        baselines[key] = selected
        document["nodes"][node_index][path_name] = list(selected)

    animation_rows = []
    maximum_removed_delta = {path_name: 0.0 for path_name in ANIMATION_BASELINE_TOLERANCE}
    for animation in animations:
        kept_channels = []
        removed = 0
        for channel in animation["channels"]:
            target = channel["target"]
            key = (target["node"], target["path"])
            sampler = animation["samplers"][channel["sampler"]]
            values = accessor_values(sampler["output"])
            baseline = baselines.get(key)
            tolerance = ANIMATION_BASELINE_TOLERANCE.get(target["path"])
            if (
                not preserve_node_baseline
                and
                not secondary_mode_enabled
                and animation.get("name") == "GGD_native_kaizer_phoenix"
                and target["path"] == "rotation"
            ):
                # This source PSA lacks 100 effect/wing/toe helper bones. Its six
                # remaining near-rest quaternion tracks exceed the budget by six;
                # a 0.002 component bound is under roughly 0.23 degrees.
                tolerance = VEARN_KAIZER_ROTATION_TOLERANCE
            if baseline is not None and tolerance is not None and within(values, baseline, tolerance):
                removed += 1
                maximum_removed_delta[target["path"]] = max(
                    maximum_removed_delta[target["path"]],
                    max(abs(left - right) for value in values for left, right in zip(value, baseline)),
                )
                continue
            kept_channels.append(channel)
        used_samplers = sorted({channel["sampler"] for channel in kept_channels})
        remap = {old: new for new, old in enumerate(used_samplers)}
        animation["samplers"] = [animation["samplers"][old] for old in used_samplers]
        for channel in kept_channels:
            channel["sampler"] = remap[channel["sampler"]]
        animation["channels"] = kept_channels
        if not kept_channels:
            raise RuntimeError("animation channel optimization removed an entire clip")
        animation_rows.append({
            "clip": animation.get("name"),
            "channelsBefore": len(kept_channels) + removed,
            "channelsAfter": len(kept_channels),
            "removed": removed,
        })

    json_bytes = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    rebuilt_chunks = [(0x4E4F534A, json_bytes)] + chunks
    rebuilt_total = 12 + sum(8 + len(chunk) for _, chunk in rebuilt_chunks)
    rebuilt = bytearray(struct.pack("<4sII", b"glTF", 2, rebuilt_total))
    for chunk_type, chunk in rebuilt_chunks:
        rebuilt.extend(struct.pack("<II", len(chunk), chunk_type))
        rebuilt.extend(chunk)
    path.write_bytes(rebuilt)
    return {
        "strategy": (
            "preserve-bind-pose-baseline" if preserve_node_baseline
            else "idle-core-and-secondary-mode-baseline" if secondary_mode_enabled
            else "idle-first-frame-baseline"
        ),
        "preservedOriginalNodeBaselines": preserve_node_baseline,
        "secondaryModeEnabled": secondary_mode_enabled,
        "secondaryBonePattern": SECONDARY_BONE_RE.pattern,
        "tolerances": ANIMATION_BASELINE_TOLERANCE,
        "clipToleranceOverrides": {
            "GGD_native_kaizer_phoenix.rotation": VEARN_KAIZER_ROTATION_TOLERANCE,
        } if not preserve_node_baseline and not secondary_mode_enabled else {},
        "maximumRemovedComponentDelta": maximum_removed_delta,
        "shiftedSecondaryNodePaths": shifted_secondary,
        "clips": animation_rows,
    }


def material_role(part: str, name: str) -> tuple[str, str | None, bool] | None:
    lowered = name.lower()
    compact = lowered.replace("_", "")
    if "outline" in lowered or "charaaura" in lowered or lowered.startswith("dummy_material"):
        return None
    if part == "body":
        if "weapon" in lowered or "_case" in lowered:
            return "weapon", None, False
        return "body", "bodyNormal", False
    if part == "hair" or "hair" in lowered:
        return "hair", "hairNormal", False
    if "celdecal3" in compact or "celdecal03" in compact:
        return "faceDecal3", None, True
    if "celdecal2" in compact or "celdecal02" in compact:
        return "faceDecal2", None, True
    if "celdecal" in lowered:
        return "faceDecal1", None, True
    return "face", "faceNormal", False


def remove_filtered_faces(mesh_object: bpy.types.Object, part: str, material_names: list[str] | None = None) -> list[str]:
    rejected = []
    bad_indices = set()
    for index, slot in enumerate(mesh_object.material_slots):
        name = material_names[index] if material_names is not None else (slot.material.name if slot.material else "")
        if material_role(part, name) is None:
            bad_indices.add(index)
            rejected.append(name)
    if bad_indices:
        data = mesh_object.data
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.material_index in bad_indices], context="FACES")
        bm.to_mesh(data)
        bm.free()
        data.update()
    return rejected


def configure_material(material: bpy.types.Material, color_path: Path, normal_path: Path | None, alpha: bool) -> None:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 0.8
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    image = bpy.data.images.load(str(color_path), check_existing=True)
    color = nodes.new("ShaderNodeTexImage")
    color.image = image
    material.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    if alpha:
        material.node_tree.links.new(color.outputs["Alpha"], shader.inputs["Alpha"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
    if normal_path is not None:
        normal_image = bpy.data.images.load(str(normal_path), check_existing=True)
        normal_image.colorspace_settings.name = "Non-Color"
        normal_texture = nodes.new("ShaderNodeTexImage")
        normal_texture.image = normal_image
        normal = nodes.new("ShaderNodeNormalMap")
        material.node_tree.links.new(normal_texture.outputs["Color"], normal.inputs["Color"])
        material.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])


def dedupe_material_slots(mesh_object: bpy.types.Object) -> list[bpy.types.Material]:
    old_materials = list(mesh_object.data.materials)
    unique_materials = []
    unique_by_pointer = {}
    material_map = {}
    for index in sorted({polygon.material_index for polygon in mesh_object.data.polygons}):
        material = old_materials[index]
        pointer = material.as_pointer()
        if pointer not in unique_by_pointer:
            unique_by_pointer[pointer] = len(unique_materials)
            unique_materials.append(material)
        material_map[index] = unique_by_pointer[pointer]
    new_indices = [material_map[polygon.material_index] for polygon in mesh_object.data.polygons]
    mesh_object.data.materials.clear()
    for material in unique_materials:
        mesh_object.data.materials.append(material)
    for polygon, new_index in zip(mesh_object.data.polygons, new_indices):
        polygon.material_index = new_index
    return unique_materials


def import_part(path: Path, part: str, mesh_format: str) -> tuple[bpy.types.Object, bpy.types.Object, list[bpy.types.Object]]:
    before = set(bpy.data.objects)
    if mesh_format == "gltf":
        bpy.ops.import_scene.gltf(filepath=str(path), import_shading="NORMALS")
    else:
        result = bpy.ops.psk.import_file(filepath=str(path), should_import_materials=True)
        if result != {"FINISHED"}:
            raise RuntimeError("PSK importer did not finish: " + str(path))
    added = [obj for obj in bpy.data.objects if obj not in before]
    armatures = [obj for obj in added if obj.type == "ARMATURE"]
    skinned = [
        obj for obj in added if obj.type == "MESH"
        and any(modifier.type == "ARMATURE" and modifier.object in armatures for modifier in obj.modifiers)
    ]
    if len(armatures) != 1 or len(skinned) != 1:
        raise RuntimeError(f"expected one armature and one skinned mesh for {part}: {path}")
    extras = [obj for obj in added if obj not in {*armatures, *skinned}]
    return armatures[0], skinned[0], extras


def action_channel_bags(action):
    for layer in action.layers:
        for strip in layer.strips:
            for channel_bag in getattr(strip, "channelbags", []):
                yield channel_bag


def trim_rest_pose_channels(action, tolerance: float = 1e-6) -> dict:
    removed_channels = 0
    retained_channels = 0
    for channel_bag in action_channel_bags(action):
        groups = {}
        for curve in channel_bag.fcurves:
            groups.setdefault(curve.data_path, []).append(curve)
        for data_path, curves in groups.items():
            if data_path.endswith(".location"):
                defaults = (0.0, 0.0, 0.0)
            elif data_path.endswith(".rotation_quaternion"):
                defaults = (1.0, 0.0, 0.0, 0.0)
            elif data_path.endswith(".scale"):
                defaults = (1.0, 1.0, 1.0)
            else:
                retained_channels += 1
                continue
            at_rest = True
            for curve in curves:
                expected = defaults[curve.array_index]
                if any(abs(point.co.y - expected) > tolerance for point in curve.keyframe_points):
                    at_rest = False
                    break
            if at_rest:
                for curve in list(curves):
                    channel_bag.fcurves.remove(curve)
                removed_channels += 1
            else:
                retained_channels += 1
    return {"removedRestPoseChannels": removed_channels, "retainedChannels": retained_channels}


def main() -> int:
    args_after_double_dash = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", choices=sorted(CANDIDATES))
    parser.add_argument("--mesh-root", type=Path, required=True)
    parser.add_argument("--mesh-format", choices=("gltf", "psk"), default="gltf")
    parser.add_argument("--material-context-root", type=Path)
    parser.add_argument("--texture-root", type=Path, required=True)
    parser.add_argument("--psa-root", type=Path, required=True)
    parser.add_argument("--addon-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(args_after_double_dash)
    mesh_root, texture_root = args.mesh_root.resolve(), args.texture_root.resolve()
    material_context_root = args.material_context_root.resolve() if args.material_context_root else None
    psa_root, addon_root, output = args.psa_root.resolve(), args.addon_root.resolve(), args.output.resolve()
    if args.mesh_format == "psk" and material_context_root is None:
        raise SystemExit("--material-context-root is required for PSK material-slot names")
    if output.exists() or output.is_symlink():
        raise SystemExit("refusing to overwrite candidate output: " + str(output))
    output.mkdir(parents=True)
    spec = CANDIDATES[args.candidate]

    dependency_root = addon_root / "dependencies"
    if not (addon_root / "io_scene_psk_psa/__init__.py").is_file() or not (dependency_root / "psk_psa_py/shared/__init__.py").is_file():
        raise RuntimeError("prepared io_scene_psk_psa dependency is incomplete: " + str(addon_root))
    sys.path.insert(0, str(addon_root))
    sys.path.insert(0, str(dependency_root))
    import io_scene_psk_psa
    io_scene_psk_psa.register()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    primary_armature = None
    primary_bones = None
    meshes = []
    part_rows = []
    inputs = []
    filtered = []
    role_materials = {}
    for part, gltf_relative in spec["parts"]:
        relative = str(Path(gltf_relative).with_suffix(".psk")) if args.mesh_format == "psk" else gltf_relative
        path = (mesh_root / relative).resolve()
        if not path.is_relative_to(mesh_root) or not path.is_file():
            raise RuntimeError("missing material-aware mesh component: " + relative)
        armature, mesh, extras = import_part(path, part, args.mesh_format)
        for extra in extras:
            bpy.data.objects.remove(extra, do_unlink=True)
        bone_names = [bone.name for bone in armature.data.bones]
        if primary_armature is None:
            primary_armature, primary_bones = armature, bone_names
            primary_armature.name = args.candidate + "-armature"
        else:
            if bone_names != primary_bones:
                raise RuntimeError("component skeleton joint order differs: " + str(path))
            world = mesh.matrix_world.copy()
            mesh.parent = primary_armature
            mesh.matrix_world = world
            for modifier in mesh.modifiers:
                if modifier.type == "ARMATURE":
                    modifier.object = primary_armature
            bpy.data.objects.remove(armature, do_unlink=True)
        mesh.name = args.candidate + "-" + part
        source_material_names = None
        if args.mesh_format == "psk":
            context_path = (material_context_root / gltf_relative).resolve()
            if not context_path.is_relative_to(material_context_root) or not context_path.is_file():
                raise RuntimeError("missing glTF material context: " + gltf_relative)
            context_document = json.loads(context_path.read_text())
            source_material_names = [material.get("name", "") for material in context_document.get("materials", [])]
            if len(source_material_names) != len(mesh.material_slots):
                raise RuntimeError(f"PSK/glTF material slot count differs for {part}: {len(mesh.material_slots)} != {len(source_material_names)}")
            inputs.append({"role": part + "-material-context", "path": str(context_path), "sha256": sha256(context_path)})
        filtered.extend({"part": part, "material": name} for name in remove_filtered_faces(mesh, part, source_material_names))
        for slot_index, slot in enumerate(mesh.material_slots):
            if slot.material is None:
                continue
            source_material_name = source_material_names[slot_index] if source_material_names is not None else slot.material.name
            roles = material_role(part, source_material_name)
            if roles is None:
                continue
            color_role, normal_role, alpha = roles
            color_path = (texture_root / spec["textures"][color_role]).resolve()
            normal_relative = spec["textures"].get(normal_role) if normal_role else None
            normal_path = (texture_root / normal_relative).resolve() if normal_relative else None
            for texture_path in [color_path, normal_path]:
                if texture_path is not None and (not texture_path.is_relative_to(texture_root) or not texture_path.is_file()):
                    raise RuntimeError("missing texture: " + str(texture_path))
            key = (color_role, normal_role, alpha)
            canonical = role_materials.get(key)
            if canonical is None:
                canonical = bpy.data.materials.new(name="GGD_" + color_role)
                configure_material(canonical, color_path, normal_path, alpha)
                role_materials[key] = canonical
            slot.material = canonical
            inputs.append({"role": color_role, "path": str(color_path), "sha256": sha256(color_path)})
            if normal_path:
                inputs.append({"role": normal_role, "path": str(normal_path), "sha256": sha256(normal_path)})
        dedupe_material_slots(mesh)
        meshes.append(mesh)
        part_rows.append({"role": part, "sourceObject": mesh.name, "vertices": len(mesh.data.vertices), "polygons": len(mesh.data.polygons)})
        inputs.append({"role": part, "path": str(path), "sha256": sha256(path)})

    # All components use the same armature and vertex-group names. Joining them
    # lets the glTF exporter emit one primitive per actual texture role instead
    # of one primitive per source component/material slot.
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    combined = bpy.context.view_layer.objects.active
    combined.name = args.candidate + "-combined"
    unique_materials = dedupe_material_slots(combined)
    meshes = [combined]

    bpy.ops.object.select_all(action="DESELECT")
    primary_armature.select_set(True)
    bpy.context.view_layer.objects.active = primary_armature
    animation_rows = []
    for role, relative in spec["animations"]:
        psa_path = (psa_root / relative).resolve()
        if not psa_path.is_relative_to(psa_root) or not psa_path.is_file():
            raise RuntimeError("missing native PSA: " + relative)
        before_actions = set(bpy.data.actions)
        result = bpy.ops.psa.import_all(
            filepath=str(psa_path), should_use_config_file=True,
            should_write_metadata=True, should_use_fake_user=True,
        )
        if result != {"FINISHED"}:
            raise RuntimeError("PSA importer did not finish: " + relative)
        added_actions = [action for action in bpy.data.actions if action not in before_actions]
        if len(added_actions) != 1:
            raise RuntimeError(f"expected one sequence in {relative}, found {len(added_actions)}")
        action = added_actions[0]
        source_sequence_name = action.name
        action.name = "GGD_native_" + role
        channel_trim = trim_rest_pose_channels(action)
        animation_rows.append({
            "role": role, "clip": action.name, "sourceSequence": source_sequence_name,
            "sourcePath": str(psa_path), "sourceSha256": sha256(psa_path),
            "frameRange": list(action.frame_range),
            **channel_trim,
        })
        inputs.append({"role": "native-animation-" + role, "path": str(psa_path), "sha256": sha256(psa_path)})

    animation_data = primary_armature.animation_data_create()
    animation_data.action = None
    for row in animation_rows:
        action = bpy.data.actions[row["clip"]]
        track = animation_data.nla_tracks.new()
        track.name = row["clip"]
        strip = track.strips.new(row["clip"], int(round(action.frame_range[0])), action)
        strip.name = row["clip"]

    bpy.ops.object.select_all(action="DESELECT")
    primary_armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = primary_armature
    blend_path = output / (args.candidate + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    glb_path = output / (args.candidate + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_yup=True, export_skins=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_force_sampling=False,
        export_optimize_animation_size=True, export_anim_slide_to_zero=True,
        export_image_format="AUTO", export_materials="EXPORT",
    )
    animation_optimization = optimize_glb_animation_channels(glb_path, preserve_node_baseline=args.mesh_format == "psk")
    exported_document = glb_document(glb_path)
    embedded_animation_names = [animation.get("name") for animation in exported_document.get("animations", [])]
    if len(embedded_animation_names) != len(animation_rows):
        raise RuntimeError(
            f"expected {len(animation_rows)} embedded animations, found {len(embedded_animation_names)}: "
            + str(embedded_animation_names)
        )
    receipt = {
        "schema": "ggd.infinity-strash-blender-assembly@1",
        "candidate": args.candidate,
        "meshFormat": args.mesh_format,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "blender": bpy.app.version_string,
        "inputs": sorted({(row["role"], row["path"], row["sha256"]): row for row in inputs}.values(), key=lambda row: (row["role"], row["path"])),
        "output": {"path": str(glb_path), "bytes": glb_path.stat().st_size, "sha256": sha256(glb_path)},
        "blend": {"path": str(blend_path), "bytes": blend_path.stat().st_size, "sha256": sha256(blend_path)},
        "parts": part_rows,
        "combined": {"object": combined.name, "vertices": len(combined.data.vertices), "polygons": len(combined.data.polygons), "materialRoles": [material.name for material in unique_materials]},
        "bones": len(primary_armature.data.bones),
        "animations": animation_rows,
        "nativeAnimationCount": len(animation_rows),
        "proceduralAnimationCount": 0,
        "embeddedAnimationNames": embedded_animation_names,
        "animationOptimization": animation_optimization,
        "filteredMaterials": filtered,
        "readiness": "textured-multipart-native-animation-candidate",
        "limitations": ["toon-shader-parity-pending", "animation-event-semantic-review-pending", "weapon-switching-and-attachment-behavior-pending", "GGD-validation-pending", "runtime-registration-pending", "deployment-pending"],
    }
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print("GGD_BLENDER_ASSEMBLY " + json.dumps(receipt, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
