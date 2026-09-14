#!/usr/bin/env python3
"""Build a portable textured GLB for Infinity Strash MystVearn EN653/01.

UModel exports the skeletal mesh and source textures separately.  This tool
keeps the mesh/skin/accessor bytes unchanged, maps the confirmed face/body
base-colour textures, and embeds both PNGs into one deterministic GLB.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, __version__ as PILLOW_VERSION


CANDIDATE_ID = "infinity-strash-mystvearn-en653-01-static-skinned-v1"
SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
GLTF_PATH = Path("Strash/Chara/Monster/EN653/01/SK_EN653_01_model.gltf")
TEXTURES = {
    "body": Path("Strash/Chara/Monster/EN653/00/T_EN653_00_Base.tga"),
    "face": Path("Strash/Chara/Monster/EN653/01/T_EN653_01_Face_Base.tga"),
}
MATERIAL_TEXTURES = {
    "MI_EN653_01_Face": "face",
    "MI_EN653_00_Body": "body",
    "MI_EN653_00_Metal": "body",
    "MI_EN653_00_BodySphere": "body",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path, root: Path | None = None) -> dict[str, Any]:
    data = path.read_bytes()
    result: dict[str, Any] = {
        "absolutePath": str(path.resolve()),
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    }
    if root is not None:
        result["relativePath"] = path.relative_to(root).as_posix()
    return result


def pad4(data: bytes, byte: bytes) -> bytes:
    return data + byte * ((-len(data)) % 4)


def png_bytes(path: Path) -> bytes:
    with Image.open(path) as image:
        output = BytesIO()
        image.convert("RGBA").save(output, format="PNG", optimize=False, compress_level=9)
    return output.getvalue()


def repair_buffer_views_and_position_bounds(document: dict[str, Any], source_bin: bytes) -> dict[str, Any]:
    """Repair UModel omissions required by the Khronos glTF validator."""
    targets: dict[int, int] = {}
    repaired_positions = []
    for primitive in document["meshes"][0]["primitives"]:
        uses = [(primitive["indices"], 34963)]
        uses.extend((accessor, 34962) for accessor in primitive["attributes"].values())
        for accessor_index, target in uses:
            view_index = document["accessors"][accessor_index]["bufferView"]
            previous = targets.setdefault(view_index, target)
            if previous != target:
                raise ValueError(f"bufferView {view_index} is shared by vertex and index accessors")
            document["bufferViews"][view_index]["target"] = target

        position_index = primitive["attributes"]["POSITION"]
        accessor = document["accessors"][position_index]
        if accessor.get("componentType") != 5126 or accessor.get("type") != "VEC3":
            raise ValueError("EN653 POSITION accessors must be float32 VEC3")
        view = document["bufferViews"][accessor["bufferView"]]
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", 12))
        rows = [struct.unpack_from("<3f", source_bin, start + row * stride) for row in range(accessor["count"])]
        accessor["min"] = [min(row[column] for row in rows) for column in range(3)]
        accessor["max"] = [max(row[column] for row in rows) for column in range(3)]
        repaired_positions.append({
            "accessor": position_index,
            "count": accessor["count"],
            "min": accessor["min"],
            "max": accessor["max"],
        })
    return {"bufferViewTargets": len(targets), "positionAccessors": repaired_positions}


def build_document(source: dict[str, Any], source_bin: bytes, images: dict[str, bytes]) -> tuple[dict[str, Any], bytes]:
    document = json.loads(json.dumps(source))
    if len(document.get("buffers", [])) != 1:
        raise ValueError("EN653 UModel glTF must contain exactly one buffer")
    if int(document["buffers"][0].get("byteLength", -1)) != len(source_bin):
        raise ValueError("EN653 source BIN byte length differs from glTF")
    if len(document.get("meshes", [])) != 1 or len(document.get("skins", [])) != 1:
        raise ValueError("EN653/01 must contain one mesh and one skin")
    if document.get("animations"):
        raise ValueError("EN653/01 unexpectedly contains native animations")

    material_names = [material.get("name") for material in document.get("materials", [])]
    if material_names != list(MATERIAL_TEXTURES):
        raise ValueError(f"Unexpected EN653/01 material order: {material_names}")
    primitives = document["meshes"][0].get("primitives", [])
    if [primitive.get("material") for primitive in primitives] != list(range(len(MATERIAL_TEXTURES))):
        raise ValueError("EN653/01 primitive/material mapping changed")
    required = {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"}
    for index, primitive in enumerate(primitives):
        missing = required - set(primitive.get("attributes", {}))
        if missing:
            raise ValueError(f"EN653/01 primitive {index} is missing {sorted(missing)}")

    document.setdefault("extras", {})["ggdUmodelContractRepair"] = repair_buffer_views_and_position_bounds(
        document, source_bin
    )

    binary = bytearray(source_bin)
    buffer_views = document.setdefault("bufferViews", [])
    image_rows = []
    texture_rows = []
    texture_index: dict[str, int] = {}
    for key in ("body", "face"):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(images[key])
        view = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(images[key])})
        image_rows.append({"name": f"EN653-01-{key}-base", "bufferView": view, "mimeType": "image/png"})
        texture_index[key] = len(texture_rows)
        texture_rows.append({"sampler": 0, "source": len(image_rows) - 1})

    document["images"] = image_rows
    document["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    document["textures"] = texture_rows
    for material in document["materials"]:
        key = MATERIAL_TEXTURES[material["name"]]
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
        pbr["baseColorTexture"] = {"index": texture_index[key], "texCoord": 0}
        pbr["metallicFactor"] = 0.45 if material["name"] == "MI_EN653_00_Metal" else 0.0
        pbr["roughnessFactor"] = 0.35 if material["name"] == "MI_EN653_00_Metal" else 0.7
        material["doubleSided"] = True

    document["buffers"] = [{"byteLength": len(binary)}]
    document.setdefault("asset", {})["generator"] = "GGD prepare_en653_component.py"
    return document, bytes(binary)


def encode_glb(document: dict[str, Any], binary: bytes) -> bytes:
    json_chunk = pad4(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = pad4(binary, b"\0")
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
        + struct.pack("<I4s", len(bin_chunk), b"BIN\0") + bin_chunk
    )


def triangle_count(document: dict[str, Any]) -> int:
    total = 0
    for primitive in document["meshes"][0]["primitives"]:
        accessor = document["accessors"][primitive["indices"]]
        if primitive.get("mode", 4) != 4 or accessor["count"] % 3:
            raise ValueError("EN653/01 contains a non-triangle primitive")
        total += accessor["count"] // 3
    return total


def prepare(source_root: Path, output: Path) -> dict[str, Any]:
    source_root, output = source_root.resolve(), output.resolve()
    gltf_path = source_root / GLTF_PATH
    if not gltf_path.is_file():
        raise FileNotFoundError(f"missing UModel glTF: {gltf_path}")
    source = json.loads(gltf_path.read_text(encoding="utf-8"))
    bin_uri = source["buffers"][0].get("uri")
    if not isinstance(bin_uri, str) or ":" in bin_uri or bin_uri.startswith("/"):
        raise ValueError("EN653 source buffer must use one local relative URI")
    bin_path = gltf_path.parent / bin_uri
    texture_paths = {key: source_root / path for key, path in TEXTURES.items()}
    for path in [bin_path, *texture_paths.values()]:
        if not path.is_file():
            raise FileNotFoundError(path)
    output.mkdir(parents=True, exist_ok=False)
    (output / "textures").mkdir()

    converted = {key: png_bytes(path) for key, path in texture_paths.items()}
    for key, data in converted.items():
        (output / "textures" / f"{key}-base.png").write_bytes(data)
    document, binary = build_document(source, bin_path.read_bytes(), converted)
    glb = encode_glb(document, binary)
    glb_path = output / "component.glb"
    glb_path.write_bytes(glb)

    receipt = {
        "schema": "ggd.infinity-strash-en653-component-conversion@1",
        "candidateId": CANDIDATE_ID,
        "sourceId": SOURCE_ID,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "identity": {
            "nameZh": "密斯特巴恩",
            "originalName": "MystVearn",
            "nativeId": "EN653/01",
            "sourceWorkZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            "classification": "confirmed-separate-character-do-not-merge-with-vearn-or-baran",
            "notVearnPostTransformation": True,
            "notBaran": True,
        },
        "source": {
            "root": str(source_root),
            "gltf": pin(gltf_path, source_root),
            "binary": pin(bin_path, source_root),
            "textures": {key: pin(path, source_root) for key, path in texture_paths.items()},
        },
        "output": {
            **pin(glb_path),
            "meshCount": len(document["meshes"]),
            "drawPrimitives": len(document["meshes"][0]["primitives"]),
            "triangles": triangle_count(document),
            "skinCount": len(document["skins"]),
            "jointCount": len(document["skins"][0]["joints"]),
            "nativeAnimationCount": len(document.get("animations", [])),
            "embeddedTextureCount": len(document["images"]),
        },
        "materialMapping": MATERIAL_TEXTURES,
        "sourceContractRepair": document["extras"]["ggdUmodelContractRepair"],
        "derivedTextures": {
            key: pin(output / "textures" / f"{key}-base.png", output) for key in converted
        },
        "tools": {"python": "3", "pillow": PILLOW_VERSION, "converter": pin(Path(__file__))},
        "status": {
            "downloaded": True,
            "extracted": True,
            "converted": True,
            "structurallyValidated": False,
            "visuallyAcceptedIndependentComponent": False,
            "completeHero": False,
            "heroBound": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "limitations": [
            "The source supplies no native animation clips for this component export.",
            "Base colour is portable PBR; the original Unreal custom toon shader, shade, bundle and filter behavior is not reproduced.",
            "UModel omitted bufferView targets and rounded POSITION bounds; the converter restores those JSON declarations without changing accessor bytes.",
            "This is MystVearn EN653/01, not Vearn's post-transformation body and not Baran.",
            "No hero ID, skill binding, backend option, default selection or deployment is claimed.",
        ],
    }
    (output / "conversion.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source_root, args.output), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
