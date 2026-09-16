#!/usr/bin/env python3
"""Build the JUMP FORCE Dai six-draw candidate with a source-specific atlas."""
from __future__ import annotations

import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path
import struct
import subprocess

from PIL import Image


INPUT_RELATIVE = Path("conversions/jump-force-dai-decimation-v2/run-a/dai-chr0430-review-v4.glb")
INPUT_SHA256 = "2b3030a97ff3add18e8addbc5d0ab39153e66d2da45a0d5ccf1dc10ff0fc55ba"
FINAL_NAME = "dai-chr0430-six-draw.glb"
CANDIDATE_ID = "jump-force-native-dai-chr0430-uv-eye-repaired-six-draw-v3"

# Face keeps one quarter of the final atlas. The remaining source sets each keep
# at least 64 x 64 pixels. Repeated materials share one region.
ATLAS_SLOTS = {
    "face": (0, 0, 128, 128),
    "cloth": (128, 0, 128, 128),
    "pants": (0, 128, 64, 128),
    "skin": (64, 128, 64, 128),
    "weapon": (128, 128, 64, 128),
    "blood": (192, 128, 64, 128),
}
MATERIAL_GROUPS = {
    "MI_chr0430_face": "face",
    "MI_chr0430_oral": "face",
    "MI_chr0430_face.001": "face",
    "MI_chr0430_cloth": "cloth",
    "MI_chr0430_cloth.001": "cloth",
    "MI_chr0430_cloth.002": "cloth",
    "MI_chr0430_pants": "pants",
    "MI_chr0430_pants.001": "pants",
    "MI_chr0430_pants.002": "pants",
    "MI_chr0430_pants.003": "pants",
    "MI_chr0430_skin": "skin",
    "MI_chr0430_skin.001": "skin",
    "MI_chr0430_weapon": "weapon",
    "MI_chr0430_weapon.001": "weapon",
    "MI_chr0430_damage_blood": "blood",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path, repo: Path | None = None) -> dict:
    out = {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}
    if repo is not None:
        out["gitPath"] = path.resolve().relative_to(repo.resolve()).as_posix()
        del out["absolutePath"]
    return out


def run(command: list[str], cwd: Path, log: Path) -> None:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    log.write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}); see {log}")


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    model = json.loads(data[20:20 + json_length])
    binary_offset = 20 + (json_length + 3) // 4 * 4
    binary_length = struct.unpack_from("<I", data, binary_offset)[0]
    return model, data[binary_offset + 8:binary_offset + 8 + binary_length]


COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def accessor_rows(model: dict, binary: bytes, accessor_index: int) -> tuple[dict, list[bytes]]:
    accessor = model["accessors"][accessor_index]
    view = model["bufferViews"][accessor["bufferView"]]
    width = COMPONENT_BYTES[accessor["componentType"]] * TYPE_COMPONENTS[accessor["type"]]
    stride = view.get("byteStride", width)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return accessor, [binary[start + i * stride:start + i * stride + width] for i in range(accessor["count"])]


def append_blob(model: dict, binary: bytearray, blob: bytes, target: int | None = None) -> int:
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    binary.extend(blob)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob)}
    if target is not None:
        view["target"] = target
    model.setdefault("bufferViews", []).append(view)
    return len(model["bufferViews"]) - 1


def append_accessor(model: dict, view_index: int, template: dict, count: int, *, minimum=None, maximum=None) -> int:
    accessor = {
        "bufferView": view_index,
        "componentType": template["componentType"],
        "count": count,
        "type": template["type"],
    }
    if template.get("normalized"):
        accessor["normalized"] = True
    if minimum is not None:
        accessor["min"] = minimum
    if maximum is not None:
        accessor["max"] = maximum
    model.setdefault("accessors", []).append(accessor)
    return len(model["accessors"]) - 1


def write_glb(model: dict, binary: bytes, output: Path) -> None:
    model["buffers"] = [{"byteLength": len(binary)}]
    json_bytes = json.dumps(model, ensure_ascii=False, separators=(",", ":")).encode()
    json_bytes += b" " * ((-len(json_bytes)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    output.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
        + struct.pack("<II", len(binary), 0x004E4942) + binary
    )


def merge_six_draw(source: Path, atlas_dir: Path, output: Path, receipt_path: Path) -> None:
    model, source_binary = read_glb(source)
    binary = bytearray(source_binary)
    material_names = [row.get("name", "") for row in model["materials"]]
    body_meshes = []
    preserved_meshes = []
    for mesh_index, mesh in enumerate(model["meshes"]):
        if len(mesh["primitives"]) != 1:
            raise ValueError(f"mesh {mesh_index} is not a one-primitive source")
        name = material_names[mesh["primitives"][0]["material"]]
        (body_meshes if name in MATERIAL_GROUPS else preserved_meshes).append(mesh_index)
    if len(body_meshes) != 15 or len(preserved_meshes) != 5:
        raise ValueError(f"unexpected groups: body={len(body_meshes)}, preserved={len(preserved_meshes)}")

    atlas_texture_indices = {}
    for kind in ("base", "normal", "orm"):
        png = (atlas_dir / f"dai-body-{kind}-atlas.png").read_bytes()
        view_index = append_blob(model, binary, png)
        model.setdefault("images", []).append({"name": f"DaiBody{kind.title()}Atlas", "mimeType": "image/png", "bufferView": view_index})
        model.setdefault("textures", []).append({"source": len(model["images"]) - 1})
        atlas_texture_indices[kind] = len(model["textures"]) - 1
    model["materials"].append({
        "name": "MI_chr0430_body_atlas",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": atlas_texture_indices["base"]},
            "metallicRoughnessTexture": {"index": atlas_texture_indices["orm"]},
        },
        "normalTexture": {"index": atlas_texture_indices["normal"]},
        "occlusionTexture": {"index": atlas_texture_indices["orm"]},
    })
    atlas_material = len(model["materials"]) - 1

    attribute_names = sorted(model["meshes"][body_meshes[0]]["primitives"][0]["attributes"])
    attribute_rows = {name: [] for name in attribute_names}
    templates = {}
    indices = []
    vertex_base = 0
    position_min = [float("inf")] * 3
    position_max = [float("-inf")] * 3
    for mesh_index in body_meshes:
        primitive = model["meshes"][mesh_index]["primitives"][0]
        material_name = material_names[primitive["material"]]
        group = MATERIAL_GROUPS[material_name]
        slot = ATLAS_SLOTS[group]
        vertex_count = None
        for attribute_name in attribute_names:
            template, rows = accessor_rows(model, source_binary, primitive["attributes"][attribute_name])
            templates.setdefault(attribute_name, template)
            signature = (template["componentType"], template["type"], bool(template.get("normalized")))
            expected = (templates[attribute_name]["componentType"], templates[attribute_name]["type"], bool(templates[attribute_name].get("normalized")))
            if signature != expected:
                raise ValueError(f"attribute signature differs for {attribute_name}")
            vertex_count = len(rows) if vertex_count is None else vertex_count
            if len(rows) != vertex_count:
                raise ValueError("attribute counts differ")
            if attribute_name == "TEXCOORD_0":
                if signature != (5126, "VEC2", False):
                    raise ValueError("unexpected UV accessor")
                transformed = []
                for row in rows:
                    u, v = struct.unpack("<ff", row)
                    # glTF texture coordinates and embedded PNG rows both use the
                    # upper-left convention in the runtime loader. Preserve V.
                    transformed.append(struct.pack("<ff", slot[0] / 256 + u * slot[2] / 256, slot[1] / 256 + v * slot[3] / 256))
                rows = transformed
            if attribute_name == "POSITION":
                for row in rows:
                    xyz = struct.unpack("<fff", row)
                    position_min = [min(position_min[i], xyz[i]) for i in range(3)]
                    position_max = [max(position_max[i], xyz[i]) for i in range(3)]
            attribute_rows[attribute_name].extend(rows)
        index_accessor, index_rows = accessor_rows(model, source_binary, primitive["indices"])
        fmt = {5121: "B", 5123: "H", 5125: "I"}[index_accessor["componentType"]]
        indices.extend(vertex_base + struct.unpack("<" + fmt, row)[0] for row in index_rows)
        vertex_base += vertex_count or 0

    merged_attributes = {}
    for name in attribute_names:
        blob = b"".join(attribute_rows[name])
        view = append_blob(model, binary, blob, 34962)
        minimum = position_min if name == "POSITION" else None
        maximum = position_max if name == "POSITION" else None
        merged_attributes[name] = append_accessor(model, view, templates[name], vertex_base, minimum=minimum, maximum=maximum)
    index_blob = struct.pack("<" + "I" * len(indices), *indices)
    index_view = append_blob(model, binary, index_blob, 34963)
    index_accessor = append_accessor(model, index_view, {"componentType": 5125, "type": "SCALAR"}, len(indices), minimum=[min(indices)], maximum=[max(indices)])
    merged_mesh = {"name": "chr0430_body_atlas", "primitives": [{"attributes": merged_attributes, "indices": index_accessor, "material": atlas_material}]}

    old_to_new = {old: new for new, old in enumerate(preserved_meshes)}
    merged_index = len(preserved_meshes)
    model["meshes"] = [model["meshes"][old] for old in preserved_meshes] + [merged_mesh]
    first_body_node = None
    for node in model["nodes"]:
        old = node.get("mesh")
        if old in old_to_new:
            node["mesh"] = old_to_new[old]
        elif old in body_meshes:
            if first_body_node is None:
                first_body_node = node
                node["mesh"] = merged_index
            else:
                node.pop("mesh", None)
                node.pop("skin", None)
    if first_body_node is None:
        raise ValueError("no body node")
    first_body_node["name"] = "chr0430_body_atlas"
    write_glb(model, bytes(binary), output)
    receipt = {
        "schema": "ggd.jump-force-dai-six-draw-binary-merge@1",
        "sourceMeshObjects": 20,
        "joinedOpaqueObjects": 15,
        "preservedTransparentOrEyeObjects": 5,
        "outputMeshObjects": 6,
        "output": pin(output),
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")


def embedded_image(model: dict, binary: bytes, texture_index: int) -> Image.Image:
    image_index = model["textures"][texture_index]["source"]
    view = model["bufferViews"][model["images"][image_index]["bufferView"]]
    start = view.get("byteOffset", 0)
    return Image.open(BytesIO(binary[start:start + view["byteLength"]])).convert("RGBA")


def build_atlases(source: Path, output: Path) -> dict:
    model, binary = read_glb(source)
    materials = {row["name"]: row for row in model["materials"]}
    representative = {
        "face": "MI_chr0430_face",
        "cloth": "MI_chr0430_cloth",
        "pants": "MI_chr0430_pants",
        "skin": "MI_chr0430_skin",
        "weapon": "MI_chr0430_weapon",
        "blood": "MI_chr0430_damage_blood",
    }
    kinds = {
        "base": lambda material: material.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index"),
        "normal": lambda material: material.get("normalTexture", {}).get("index"),
        "orm": lambda material: material.get("pbrMetallicRoughness", {}).get("metallicRoughnessTexture", {}).get("index"),
    }
    defaults = {"base": (255, 255, 255, 255), "normal": (128, 128, 255, 255), "orm": (255, 255, 0, 255)}
    output.mkdir(parents=True)
    result = {}
    for kind, lookup in kinds.items():
        atlas = Image.new("RGBA", (256, 256), defaults[kind])
        for group, material_name in representative.items():
            material = materials[material_name]
            texture_index = lookup(material)
            slot = ATLAS_SLOTS[group]
            if texture_index is None:
                if kind == "base" and group == "blood":
                    rgba = material["pbrMetallicRoughness"]["baseColorFactor"]
                    color = tuple(round(channel * 255) for channel in rgba)
                    tile = Image.new("RGBA", (slot[2], slot[3]), color)
                else:
                    tile = Image.new("RGBA", (slot[2], slot[3]), defaults[kind])
            else:
                # These source materials are OPAQUE. Their unused PNG alpha
                # contains arbitrary exporter data; RGBA resampling would mix
                # that hidden RGB into visible texels. Flatten alpha first.
                opaque = embedded_image(model, binary, texture_index).convert("RGB")
                tile = opaque.resize((slot[2], slot[3]), Image.Resampling.LANCZOS).convert("RGBA")
            atlas.paste(tile, (slot[0], slot[1]))
        path = output / f"dai-body-{kind}-atlas.png"
        atlas.save(path, format="PNG", optimize=False, compress_level=9)
        result[kind] = pin(path)
    plan = {
        "schema": "ggd.jump-force-dai-multichannel-atlas-plan@1",
        "source": pin(source),
        "atlasEdge": 256,
        "slots": {key: {"x": v[0], "y": v[1], "width": v[2], "height": v[3]} for key, v in ATLAS_SLOTS.items()},
        "materials": MATERIAL_GROUPS,
        "atlases": result,
    }
    (output / "atlas-plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    return plan


def metrics(path: Path) -> dict:
    model, binary = read_glb(path)
    edges = []
    for image in model.get("images", []):
        view = model["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        with Image.open(BytesIO(binary[start:start + view["byteLength"]])) as opened:
            edges.extend(opened.size)
    return {
        "triangles": sum(model["accessors"][primitive["indices"]]["count"] // 3 for mesh in model.get("meshes", []) for primitive in mesh.get("primitives", [])),
        "drawPrimitives": sum(len(mesh.get("primitives", [])) for mesh in model.get("meshes", [])),
        "maxTextureEdge": max(edges),
        "skins": len(model.get("skins", [])),
        "joints": max((len(skin.get("joints", [])) for skin in model.get("skins", [])), default=0),
        "animations": len(model.get("animations", [])),
    }


def build(repo: Path, asset_root: Path, output: Path) -> None:
    if output.exists():
        raise ValueError(f"refusing to overwrite conversion stage: {output}")
    source = asset_root / INPUT_RELATIVE
    if not source.is_file() or sha(source) != INPUT_SHA256:
        raise ValueError("frozen JUMP FORCE Dai v2 source differs")
    output.mkdir(parents=True)
    workflow = Path(__file__).resolve().parent
    atlas_dir = output / "atlas"
    plan = build_atlases(source, atlas_dir)
    outputs = []
    commands = []
    for run_name in ("run-a", "run-b"):
        root = output / run_name
        root.mkdir()
        final = root / FINAL_NAME
        merge_six_draw(source, atlas_dir, final, root / "merge-receipt.json")
        outputs.append(final)
        commands.append({"run": run_name, "implementation": "merge_six_draw", "input": str(source), "atlasPlan": str(atlas_dir / "atlas-plan.json"), "output": str(final)})
    if outputs[0].read_bytes() != outputs[1].read_bytes():
        raise ValueError("independent six-draw rebuild differs")
    observed = metrics(outputs[0])
    if observed["triangles"] > 8000 or observed["drawPrimitives"] > 6 or observed["maxTextureEdge"] > 256:
        raise ValueError(f"formal limits missed: {observed}")
    receipt = {
        "schema": "ggd.jump-force-dai-six-draw-conversion@1",
        "candidateId": CANDIDATE_ID,
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "nativeCharacterId": "chr0430",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "input": pin(source),
        "atlasPlan": pin(atlas_dir / "atlas-plan.json"),
        "output": pin(outputs[0]),
        "rebuild": pin(outputs[1]),
        "byteIdenticalRebuild": True,
        "observed": observed,
        "tools": {
            "builder": pin(Path(__file__).resolve(), repo),
            "pillow": Image.__version__,
        },
        "commands": commands,
        "states": {
            "geometryTargetPassed": True,
            "drawCallLimitPassed": True,
            "textureEdgePassed": True,
            "visualReview": "pending-owner-review",
            "animationBinding": "blocked-no-reviewed-motion",
            "backendOptionRegistered": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "limitations": [
            "The opaque body sets are resampled into one 256px source-specific base/normal/ORM atlas; face retains 128x128 and transparent eye/hair layers remain separate.",
            "No reviewed motion binding exists for this JUMP FORCE skeleton; no clip was invented or borrowed automatically.",
            "Visual approval is required for this new atlas output before runtime registration.",
        ],
    }
    (output / "conversion.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    output = (args.output_root or asset_root / "conversions/jump-force-dai-six-draw-v3").resolve()
    if args.write:
        build(repo, asset_root, output)
    receipt = json.loads((output / "conversion.json").read_text())
    for key in ("input", "atlasPlan", "output", "rebuild"):
        path = Path(receipt[key]["absolutePath"])
        if not path.is_file() or pin(path) != receipt[key]:
            raise ValueError(f"{key} pin differs")
    print(json.dumps(receipt["observed"] | {"sha256": receipt["output"]["sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
