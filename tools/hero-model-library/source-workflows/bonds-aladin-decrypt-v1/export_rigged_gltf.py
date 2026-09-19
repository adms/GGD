#!/usr/bin/env python3
"""Export the two ch0270058 variants as deterministic, rigged GLB files.

The mesh bundles contain the complete Transform hierarchy, SkinnedMeshRenderer
bone lists, inverse bind matrices, vertex weights and material slots.  Their
embedded material texture pointers are stripped, so this exporter restores the
base-colour relationship by the original material/texture naming convention.
The relationship is recorded in the receipt instead of being hidden.

Unity uses a left-handed coordinate system.  glTF uses a right-handed system;
we mirror X, conjugate transforms and inverse bind matrices by that mirror, and
reverse triangle winding.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler


SCHEMA = "ggd.heros-bonds-rigged-gltf-export@1"
ANIMATION_SCHEMA = "ggd.heros-bonds-animation-clip-index@1"


@dataclass(frozen=True)
class Variant:
    character_id: str
    mesh_logical_path: str
    animation_logical_path: str
    texture_logical_path: str


VARIANTS = (
    Variant(
        "ch027005800",
        "Character/Model/Character/ch027005800/Meshes",
        "Character/AnimationClip/ch027005800",
        "Character/Model/Character/ch027005800/Textures",
    ),
    Variant(
        "ch027005801",
        "Character/Model/Character/ch027005801/Meshes",
        "Character/AnimationClip/ch027005801",
        # The 5801 mesh materials reuse the 5800 texture family.  No separate
        # 5801 texture bundle exists in the decrypted catalog.
        "Character/Model/Character/ch027005800/Textures",
    ),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pad4(data: bytes, byte: bytes = b"\0") -> bytes:
    return data + byte * ((-len(data)) % 4)


def unity_vector(value: Any) -> list[float]:
    return [-float(value.x), float(value.y), float(value.z)]


def unity_quaternion(value: Any) -> list[float]:
    # Reflection S=diag(-1, 1, 1), so R_gltf=S R_unity S.
    values = [float(value.x), -float(value.y), -float(value.z), float(value.w)]
    length = math.sqrt(sum(item * item for item in values))
    return [item / length for item in values] if length else [0.0, 0.0, 0.0, 1.0]


def unity_matrix(value: Any) -> list[float]:
    """Return S*M*S in glTF's column-major array order."""

    signs = (-1.0, 1.0, 1.0, 1.0)
    rows = [[float(getattr(value, f"e{row}{col}")) for col in range(4)] for row in range(4)]
    converted = [
        [rows[row][col] * signs[row] * signs[col] for col in range(4)]
        for row in range(4)
    ]
    return [converted[row][col] for col in range(4) for row in range(4)]


class GltfBuilder:
    def __init__(self, generator: str):
        self.binary = bytearray()
        self.document: dict[str, Any] = {
            "asset": {"version": "2.0", "generator": generator},
            "scene": 0,
            "scenes": [{"name": "Scene", "nodes": []}],
            "nodes": [],
            "meshes": [],
            "skins": [],
            "materials": [],
            "textures": [],
            "images": [],
            "samplers": [
                {
                    "magFilter": 9729,
                    "minFilter": 9987,
                    "wrapS": 10497,
                    "wrapT": 10497,
                }
            ],
            "accessors": [],
            "bufferViews": [],
            "buffers": [{"byteLength": 0}],
        }

    def add_bytes(self, data: bytes, *, target: int | None = None) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(data)
        view: dict[str, Any] = {
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(data),
        }
        if target is not None:
            view["target"] = target
        self.document["bufferViews"].append(view)
        return len(self.document["bufferViews"]) - 1

    def add_accessor(
        self,
        values: Sequence[Any],
        *,
        component_type: int,
        accessor_type: str,
        target: int | None = None,
        include_bounds: bool = False,
    ) -> int:
        component_formats = {5123: "H", 5125: "I", 5126: "f"}
        widths = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
        width = widths[accessor_type]
        flattened: list[int | float] = []
        rows: list[list[float]] = []
        for value in values:
            row = [value] if width == 1 else list(value)
            if len(row) != width:
                raise ValueError(f"{accessor_type} needs {width} values, got {len(row)}")
            flattened.extend(row)
            rows.append([float(item) for item in row])
        fmt = "<" + component_formats[component_type] * len(flattened)
        view = self.add_bytes(struct.pack(fmt, *flattened), target=target)
        accessor: dict[str, Any] = {
            "bufferView": view,
            "componentType": component_type,
            "count": len(values),
            "type": accessor_type,
        }
        if include_bounds and rows:
            accessor["min"] = [min(row[col] for row in rows) for col in range(width)]
            accessor["max"] = [max(row[col] for row in rows) for col in range(width)]
        self.document["accessors"].append(accessor)
        return len(self.document["accessors"]) - 1

    def write_glb(self, path: Path) -> None:
        self.document["buffers"][0]["byteLength"] = len(self.binary)
        json_bytes = json.dumps(
            self.document,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        json_chunk = pad4(json_bytes, b" ")
        bin_chunk = pad4(bytes(self.binary))
        total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
        glb = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
        glb.extend(struct.pack("<I4s", len(json_chunk), b"JSON"))
        glb.extend(json_chunk)
        glb.extend(struct.pack("<I4s", len(bin_chunk), b"BIN\0"))
        glb.extend(bin_chunk)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(glb)


def pptr_path_id(pair: Any) -> int:
    pointer = getattr(pair, "component", pair)
    return int(pointer.m_PathID)


def object_record_by_logical_path(receipt: dict[str, Any], logical_path: str) -> dict[str, Any]:
    matches = [item for item in receipt["bundles"] if item["logicalPath"] == logical_path]
    if len(matches) != 1:
        raise ValueError(f"expected one bundle for {logical_path}, found {len(matches)}")
    return matches[0]


def texture_map(receipt: dict[str, Any], logical_path: str) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for item in receipt["exportedTextures"]:
        if item["logicalPath"] == logical_path:
            result[item["objectName"].lower()] = Path(item["absolutePath"])
    return result


def select_texture_name(material_name: str) -> str | None:
    name = material_name.lower()
    if "attach" in name:
        return "tch0270058_v00_attach_co"
    if "newdaiken" in name:
        return "tch0270058_v00_newdaiken_co"
    if "shin" in name and ("leye" in name or "reye" in name or "eye" in name):
        return "tch0270058_v00_shinburn_eye_co"
    if "shin" in name:
        return "tch0270058_v00_shinburn_body_co"
    if "kigan" in name and ("head" in name or "_eye" in name):
        return "tch0270058_v00_kiganburnhead_body_co"
    if "kigan" in name:
        return "tch0270058_v00_kiganburn_body_co"
    return None


def add_materials(
    builder: GltfBuilder,
    names: Iterable[str],
    textures: dict[str, Path],
) -> tuple[dict[str, int], list[dict[str, Any]]]:
    material_indices: dict[str, int] = {}
    texture_indices: dict[Path, int] = {}
    mappings: list[dict[str, Any]] = []
    for material_name in names:
        if material_name in material_indices:
            continue
        texture_name = select_texture_name(material_name)
        texture_path = textures.get(texture_name.lower()) if texture_name else None
        material: dict[str, Any] = {
            "name": material_name,
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.8,
            },
            "extras": {"unityMaterialName": material_name},
        }
        mapping: dict[str, Any] = {
            "materialName": material_name,
            "textureRule": texture_name,
            "textureAbsolutePath": str(texture_path) if texture_path else None,
            "textureSha256": sha256_file(texture_path) if texture_path else None,
        }
        if texture_path:
            if texture_path not in texture_indices:
                view = builder.add_bytes(texture_path.read_bytes())
                builder.document["images"].append(
                    {
                        "name": texture_path.stem,
                        "bufferView": view,
                        "mimeType": "image/png",
                    }
                )
                image_index = len(builder.document["images"]) - 1
                builder.document["textures"].append(
                    {"sampler": 0, "source": image_index, "name": texture_path.stem}
                )
                texture_indices[texture_path] = len(builder.document["textures"]) - 1
            material["pbrMetallicRoughness"]["baseColorTexture"] = {
                "index": texture_indices[texture_path]
            }
            if any(token in material_name.lower() for token in ("attach", "eye", "hair")):
                material["alphaMode"] = "BLEND"
        else:
            mapping["warning"] = "no deterministic base-colour texture match"
        builder.document["materials"].append(material)
        material_indices[material_name] = len(builder.document["materials"]) - 1
        mappings.append(mapping)
    return material_indices, mappings


def transform_node(transform: Any) -> dict[str, Any]:
    game_object = transform.m_GameObject.read()
    node: dict[str, Any] = {
        "name": game_object.m_Name,
        "translation": unity_vector(transform.m_LocalPosition),
        "rotation": unity_quaternion(transform.m_LocalRotation),
        "scale": [
            float(transform.m_LocalScale.x),
            float(transform.m_LocalScale.y),
            float(transform.m_LocalScale.z),
        ],
        "extras": {
            "unityTransformPathId": int(transform.object_reader.path_id),
            "unityGameObjectPathId": int(game_object.object_reader.path_id),
        },
    }
    return node


def normalize_weights(weights: Sequence[float]) -> list[float]:
    values = [max(0.0, float(item)) for item in weights]
    total = sum(values)
    if total <= 0.0:
        return [1.0, 0.0, 0.0, 0.0]
    return [item / total for item in values]


def to_four(values: Sequence[Any], default: int | float = 0) -> list[Any]:
    result = list(values[:4])
    result.extend([default] * (4 - len(result)))
    return result


def export_variant(
    variant: Variant,
    receipt: dict[str, Any],
    output_root: Path,
) -> dict[str, Any]:
    mesh_record = object_record_by_logical_path(receipt, variant.mesh_logical_path)
    mesh_path = Path(mesh_record["unityFsAbsolutePath"])
    textures = texture_map(receipt, variant.texture_logical_path)
    environment = UnityPy.load(str(mesh_path))
    builder = GltfBuilder("GGD bonds-aladin-decrypt-v1 rigged exporter")
    builder.document["asset"]["extras"] = {
        "characterId": variant.character_id,
        "sourceUnityFsSha256": sha256_file(mesh_path),
        "coordinateConversion": "mirror X; reverse triangle winding",
    }

    transforms = [obj.read() for obj in environment.objects if obj.type.name == "Transform"]
    transforms.sort(key=lambda item: int(item.object_reader.path_id))
    transform_to_node: dict[int, int] = {}
    for transform in transforms:
        node_index = len(builder.document["nodes"])
        transform_to_node[int(transform.object_reader.path_id)] = node_index
        builder.document["nodes"].append(transform_node(transform))

    roots: list[int] = []
    for transform in transforms:
        node_index = transform_to_node[int(transform.object_reader.path_id)]
        parent_id = int(transform.m_Father.m_PathID)
        if parent_id:
            parent_node = builder.document["nodes"][transform_to_node[parent_id]]
            parent_node.setdefault("children", []).append(node_index)
        else:
            roots.append(node_index)
    for node in builder.document["nodes"]:
        if "children" in node:
            node["children"].sort()
    builder.document["scenes"][0]["nodes"] = sorted(roots)

    go_to_transform: dict[int, int] = {}
    for obj in environment.objects:
        if obj.type.name != "GameObject":
            continue
        game_object = obj.read()
        transform_ids = []
        for pair in game_object.m_Component:
            pointer = getattr(pair, "component", pair)
            try:
                if pointer.read().object_reader.type.name == "Transform":
                    transform_ids.append(int(pointer.m_PathID))
            except Exception:
                continue
        if len(transform_ids) == 1:
            go_to_transform[int(game_object.object_reader.path_id)] = transform_ids[0]

    renderers = [obj.read() for obj in environment.objects if obj.type.name == "SkinnedMeshRenderer"]
    renderers.sort(key=lambda item: (item.m_GameObject.read().m_Name, int(item.object_reader.path_id)))
    material_names: list[str] = []
    for renderer in renderers:
        material_names.extend(pointer.read().m_Name for pointer in renderer.m_Materials)
    material_indices, material_mappings = add_materials(builder, material_names, textures)

    mesh_receipts: list[dict[str, Any]] = []
    total_triangles = 0
    total_vertices = 0
    max_joint_count = 0
    for renderer in renderers:
        mesh = renderer.m_Mesh.read()
        handler = MeshHandler(mesh)
        handler.process()
        triangles_by_submesh = handler.get_triangles()
        vertices = [(-float(v[0]), float(v[1]), float(v[2])) for v in handler.m_Vertices]
        normals = (
            [(-float(v[0]), float(v[1]), float(v[2])) for v in handler.m_Normals]
            if handler.m_Normals
            else None
        )
        uvs = [(float(v[0]), float(v[1])) for v in handler.m_UV0] if handler.m_UV0 else None
        if handler.m_BoneWeights:
            weights = [normalize_weights(to_four(row, 0.0)) for row in handler.m_BoneWeights]
        else:
            weights = [[1.0, 0.0, 0.0, 0.0] for _ in vertices]
        if handler.m_BoneIndices:
            joints = [[int(item) for item in to_four(row, 0)] for row in handler.m_BoneIndices]
        else:
            joints = [[0, 0, 0, 0] for _ in vertices]

        position_accessor = builder.add_accessor(
            vertices,
            component_type=5126,
            accessor_type="VEC3",
            target=34962,
            include_bounds=True,
        )
        normal_accessor = (
            builder.add_accessor(normals, component_type=5126, accessor_type="VEC3", target=34962)
            if normals
            else None
        )
        uv_accessor = (
            builder.add_accessor(uvs, component_type=5126, accessor_type="VEC2", target=34962)
            if uvs
            else None
        )
        joints_accessor = builder.add_accessor(
            joints, component_type=5123, accessor_type="VEC4", target=34962
        )
        weights_accessor = builder.add_accessor(
            weights, component_type=5126, accessor_type="VEC4", target=34962
        )

        materials = [pointer.read().m_Name for pointer in renderer.m_Materials]
        primitives: list[dict[str, Any]] = []
        mesh_triangle_count = 0
        for submesh_index, triangles in enumerate(triangles_by_submesh):
            indices = [
                index
                for triangle in triangles
                for index in (int(triangle[2]), int(triangle[1]), int(triangle[0]))
            ]
            mesh_triangle_count += len(triangles)
            index_component = 5123 if len(vertices) <= 65535 else 5125
            index_accessor = builder.add_accessor(
                indices,
                component_type=index_component,
                accessor_type="SCALAR",
                target=34963,
            )
            attributes: dict[str, int] = {
                "POSITION": position_accessor,
                "JOINTS_0": joints_accessor,
                "WEIGHTS_0": weights_accessor,
            }
            if normal_accessor is not None:
                attributes["NORMAL"] = normal_accessor
            if uv_accessor is not None:
                attributes["TEXCOORD_0"] = uv_accessor
            primitive: dict[str, Any] = {"attributes": attributes, "indices": index_accessor}
            if submesh_index < len(materials):
                primitive["material"] = material_indices[materials[submesh_index]]
            primitives.append(primitive)

        mesh_index = len(builder.document["meshes"])
        builder.document["meshes"].append(
            {
                "name": mesh.m_Name,
                "primitives": primitives,
                "extras": {"unityMeshPathId": int(mesh.object_reader.path_id)},
            }
        )

        bone_ids = [int(pointer.m_PathID) for pointer in renderer.m_Bones]
        if len(bone_ids) != len(mesh.m_BindPose):
            raise ValueError(
                f"{variant.character_id}/{mesh.m_Name}: {len(bone_ids)} bones but "
                f"{len(mesh.m_BindPose)} inverse bind matrices"
            )
        inverse_bind = [unity_matrix(matrix) for matrix in mesh.m_BindPose]
        inverse_bind_accessor = builder.add_accessor(
            inverse_bind, component_type=5126, accessor_type="MAT4"
        )
        skin: dict[str, Any] = {
            "name": f"{mesh.m_Name}_skin",
            "joints": [transform_to_node[path_id] for path_id in bone_ids],
            "inverseBindMatrices": inverse_bind_accessor,
        }
        root_bone_id = int(renderer.m_RootBone.m_PathID)
        if root_bone_id in transform_to_node:
            skin["skeleton"] = transform_to_node[root_bone_id]
        skin_index = len(builder.document["skins"])
        builder.document["skins"].append(skin)

        game_object = renderer.m_GameObject.read()
        transform_id = go_to_transform[int(game_object.object_reader.path_id)]
        node = builder.document["nodes"][transform_to_node[transform_id]]
        node["mesh"] = mesh_index
        node["skin"] = skin_index
        node["extras"]["unitySkinnedMeshRendererPathId"] = int(renderer.object_reader.path_id)

        total_vertices += len(vertices)
        total_triangles += mesh_triangle_count
        max_joint_count = max(max_joint_count, len(bone_ids))
        mesh_receipts.append(
            {
                "meshName": mesh.m_Name,
                "vertexCount": len(vertices),
                "triangleCount": mesh_triangle_count,
                "submeshCount": len(triangles_by_submesh),
                "jointCount": len(bone_ids),
                "weightedVertexCount": len(weights),
                "materialNames": materials,
            }
        )

    output_path = output_root / variant.character_id / f"{variant.character_id}-rigged.glb"
    builder.write_glb(output_path)
    return {
        "characterId": variant.character_id,
        "status": "rigged-textured-glb-exported-awaiting-owner-visual-approval",
        "sourceMeshUnityFsAbsolutePath": str(mesh_path),
        "sourceMeshUnityFsSha256": sha256_file(mesh_path),
        "textureLogicalPath": variant.texture_logical_path,
        "textureReuseNote": (
            "ch027005801 has no separate texture bundle; original material names map to the "
            "ch027005800 texture family"
            if variant.character_id.endswith("01")
            else None
        ),
        "outputGlbAbsolutePath": str(output_path.resolve()),
        "outputGlbBytes": output_path.stat().st_size,
        "outputGlbSha256": sha256_file(output_path),
        "transformNodeCount": len(transforms),
        "skinnedMeshCount": len(renderers),
        "vertexCount": total_vertices,
        "triangleCount": total_triangles,
        "maxJointCountPerSkin": max_joint_count,
        "meshes": mesh_receipts,
        "materialTextureMappings": material_mappings,
        "limitations": [
            "GLB contains the source bind pose; AnimationClip curves are indexed separately and are not embedded",
            "custom Unity shaders were approximated as glTF metallic-roughness materials",
            "this is the source-resolution extraction, not the <=8000 triangle game candidate",
        ],
    }


def animation_receipt(variant: Variant, receipt: dict[str, Any]) -> dict[str, Any]:
    record = object_record_by_logical_path(receipt, variant.animation_logical_path)
    path = Path(record["unityFsAbsolutePath"])
    environment = UnityPy.load(str(path))
    clips = []
    for obj in environment.objects:
        if obj.type.name != "AnimationClip":
            continue
        clip = obj.read()
        muscle_clip = getattr(clip, "m_MuscleClip", None)
        clips.append(
            {
                "name": clip.m_Name,
                "objectPathId": int(obj.path_id),
                "sampleRate": float(getattr(clip, "m_SampleRate", 0.0)),
                "legacy": bool(getattr(clip, "m_Legacy", False)),
                "stopTimeSeconds": (
                    float(getattr(muscle_clip, "m_StopTime", 0.0)) if muscle_clip else None
                ),
                "status": "source-clip-preserved-not-converted-to-gltf",
            }
        )
    clips.sort(key=lambda item: item["name"])
    return {
        "characterId": variant.character_id,
        "sourceUnityFsAbsolutePath": str(path),
        "sourceUnityFsSha256": sha256_file(path),
        "clipCount": len(clips),
        "clips": clips,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--object-receipt", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--animation-receipt", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    object_receipt = json.loads(args.object_receipt.read_text(encoding="utf-8"))
    exports = [export_variant(variant, object_receipt, args.output_root) for variant in VARIANTS]
    animations = [animation_receipt(variant, object_receipt) for variant in VARIANTS]
    result = {
        "schema": SCHEMA,
        "unityPyVersion": UnityPy.__version__,
        "variants": exports,
    }
    animation_result = {
        "schema": ANIMATION_SCHEMA,
        "variants": animations,
        "limitations": [
            "clips use Unity's serialized/compressed AnimationClip data and are retained in decrypted UnityFS",
            "no clip is claimed as a complete combat motion set",
        ],
    }
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.animation_receipt.parent.mkdir(parents=True, exist_ok=True)
    args.animation_receipt.write_text(
        json.dumps(animation_result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
