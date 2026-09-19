#!/usr/bin/env python3
"""Convert every PMX payload in the acquired Vearn archive to a static review GLB.

This intentionally does not invent animation. It preserves each PMX as an
independent visual candidate and embeds its diffuse textures so identity can be
reviewed in a browser even when Blender is unavailable.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import struct
from collections import Counter
from pathlib import Path

from PIL import Image


SOURCE_ID = "bowlroll-sabakan359-vearn-mmd-v087"
ARCHIVE_SHA256 = "5948beb33e350ce50da0294e2ce387b6c533cd3e783b2b1759662f00dc0ed0a3"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class Reader:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.offset = 0
        self.encoding = "utf-8"

    def take(self, size: int) -> bytes:
        if size < 0 or self.offset + size > len(self.payload):
            raise ValueError(f"PMX read outside payload: {self.offset}+{size}/{len(self.payload)}")
        result = self.payload[self.offset : self.offset + size]
        self.offset += size
        return result

    def unpack(self, fmt: str):
        return struct.unpack("<" + fmt, self.take(struct.calcsize("<" + fmt)))

    def integer(self) -> int:
        return self.unpack("i")[0]

    def count(self, maximum: int = 10_000_000) -> int:
        value = self.integer()
        if not 0 <= value <= maximum:
            raise ValueError(f"invalid PMX count: {value}")
        return value

    def index(self, size: int, *, unsigned: bool = False) -> int:
        return int.from_bytes(self.take(size), "little", signed=not unsigned)

    def floats(self, count: int) -> tuple[float, ...]:
        values = self.unpack("f" * count)
        if not all(math.isfinite(value) for value in values):
            raise ValueError("non-finite PMX float")
        return values

    def text(self) -> str:
        size = self.integer()
        if not 0 <= size <= 100_000_000:
            raise ValueError(f"invalid PMX text size: {size}")
        return self.take(size).decode(self.encoding)


def parse_pmx(path: Path) -> dict:
    reader = Reader(path.read_bytes())
    if reader.take(4) != b"PMX ":
        raise ValueError(f"not PMX: {path}")
    version = reader.unpack("f")[0]
    header = reader.take(reader.unpack("B")[0])
    if len(header) < 8:
        raise ValueError("short PMX header")
    encoding, extra_uv, vertex_index_size, texture_index_size, material_index_size, bone_index_size, morph_index_size, rigid_index_size = header[:8]
    reader.encoding = "utf-16-le" if encoding == 0 else "utf-8"
    name, name_en, comment, comment_en = (reader.text() for _ in range(4))

    vertices = []
    weight_types: Counter[int] = Counter()
    for _ in range(reader.count()):
        position = reader.floats(3)
        normal = reader.floats(3)
        uv = reader.floats(2)
        reader.floats(extra_uv * 4)
        weight_type = reader.unpack("B")[0]
        weight_types[weight_type] += 1
        if weight_type == 0:
            reader.index(bone_index_size)
        elif weight_type == 1:
            reader.index(bone_index_size)
            reader.index(bone_index_size)
            reader.floats(1)
        elif weight_type in (2, 4):
            for _ in range(4):
                reader.index(bone_index_size)
            reader.floats(4)
        elif weight_type == 3:
            reader.index(bone_index_size)
            reader.index(bone_index_size)
            reader.floats(10)
        else:
            raise ValueError(f"unsupported PMX weight type: {weight_type}")
        reader.floats(1)
        vertices.append((position, normal, (uv[0], 1.0 - uv[1])))

    index_count = reader.count()
    if index_count % 3:
        raise ValueError("PMX index count is not triangular")
    indices = [reader.index(vertex_index_size, unsigned=True) for _ in range(index_count)]
    if indices and max(indices) >= len(vertices):
        raise ValueError("PMX index outside vertex array")
    textures = [reader.text() for _ in range(reader.count(1_000_000))]

    materials = []
    for _ in range(reader.count(100_000)):
        material = {
            "name": reader.text(),
            "nameEn": reader.text(),
            "diffuse": reader.floats(4),
            "specular": reader.floats(3),
            "specularPower": reader.floats(1)[0],
            "ambient": reader.floats(3),
            "flags": reader.unpack("B")[0],
            "edgeColor": reader.floats(4),
            "edgeSize": reader.floats(1)[0],
            "textureIndex": reader.index(texture_index_size),
            "sphereTextureIndex": reader.index(texture_index_size),
            "sphereMode": reader.unpack("B")[0],
        }
        material["toonShared"] = reader.unpack("B")[0]
        material["toonIndex"] = reader.unpack("B")[0] if material["toonShared"] else reader.index(texture_index_size)
        material["memo"] = reader.text()
        material["indexCount"] = reader.count()
        materials.append(material)
    if sum(row["indexCount"] for row in materials) != index_count:
        raise ValueError("PMX material index ranges do not cover geometry")

    bone_count = reader.count(1_000_000)
    for _ in range(bone_count):
        reader.text(); reader.text(); reader.floats(3); reader.index(bone_index_size); reader.integer()
        flags = reader.unpack("H")[0]
        reader.index(bone_index_size) if flags & 1 else reader.floats(3)
        if flags & 0x300:
            reader.index(bone_index_size); reader.floats(1)
        if flags & 0x400:
            reader.floats(3)
        if flags & 0x800:
            reader.floats(6)
        if flags & 0x2000:
            reader.integer()
        if flags & 0x20:
            reader.index(bone_index_size); reader.integer(); reader.floats(1)
            for _ in range(reader.count(1_000_000)):
                reader.index(bone_index_size)
                limited = reader.unpack("B")[0]
                if limited:
                    reader.floats(6)

    return {
        "path": path,
        "version": version,
        "name": name,
        "nameEn": name_en,
        "comment": comment,
        "commentEn": comment_en,
        "vertices": vertices,
        "indices": indices,
        "textures": textures,
        "materials": materials,
        "boneCount": bone_count,
        "weightTypes": dict(sorted(weight_types.items())),
    }


class GlbBuilder:
    def __init__(self):
        self.binary = bytearray()
        self.buffer_views: list[dict] = []
        self.accessors: list[dict] = []

    def add_bytes(self, payload: bytes, *, target: int | None = None) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(payload)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
        if target is not None:
            view["target"] = target
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def add_accessor(self, payload: bytes, *, component_type: int, count: int, kind: str, target: int, minimum=None, maximum=None) -> int:
        view = self.add_bytes(payload, target=target)
        accessor = {"bufferView": view, "componentType": component_type, "count": count, "type": kind}
        if minimum is not None:
            accessor["min"] = minimum
        if maximum is not None:
            accessor["max"] = maximum
        self.accessors.append(accessor)
        return len(self.accessors) - 1


def pack_floats(values) -> bytes:
    values = list(values)
    return struct.pack("<" + "f" * len(values), *values)


def texture_png(path: Path) -> tuple[bytes, bool, tuple[int, int]]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A").getextrema()[0] < 255
        output = io.BytesIO()
        rgba.save(output, format="PNG", optimize=True)
        return output.getvalue(), alpha, rgba.size


def build_glb(model: dict, output: Path) -> dict:
    builder = GlbBuilder()
    vertices = model["vertices"]
    positions = [value for vertex in vertices for value in vertex[0]]
    normals = [value for vertex in vertices for value in vertex[1]]
    uvs = [value for vertex in vertices for value in vertex[2]]
    minimum = [min(vertex[0][axis] for vertex in vertices) for axis in range(3)]
    maximum = [max(vertex[0][axis] for vertex in vertices) for axis in range(3)]
    position_accessor = builder.add_accessor(pack_floats(positions), component_type=5126, count=len(vertices), kind="VEC3", target=34962, minimum=minimum, maximum=maximum)
    normal_accessor = builder.add_accessor(pack_floats(normals), component_type=5126, count=len(vertices), kind="VEC3", target=34962)
    uv_accessor = builder.add_accessor(pack_floats(uvs), component_type=5126, count=len(vertices), kind="VEC2", target=34962)

    images = []
    textures = []
    texture_map: dict[int, int] = {}
    texture_meta = []
    for index, raw_name in enumerate(model["textures"]):
        relative = Path(raw_name.replace("\\", "/"))
        source = model["path"].parent / relative
        if not source.is_file() or source.suffix.lower() not in {".bmp", ".png", ".tga", ".jpg", ".jpeg"}:
            texture_meta.append({"reference": raw_name, "exists": source.is_file(), "embedded": False})
            continue
        payload, has_alpha, size = texture_png(source)
        view = builder.add_bytes(payload)
        images.append({"name": source.name, "mimeType": "image/png", "bufferView": view})
        textures.append({"source": len(images) - 1, "sampler": 0})
        texture_map[index] = len(textures) - 1
        texture_meta.append({"reference": raw_name, "exists": True, "embedded": True, "size": list(size), "hasAlpha": has_alpha, "sha256": sha256(source)})

    gltf_materials = []
    primitives = []
    cursor = 0
    for material in model["materials"]:
        pbr = {
            "baseColorFactor": list(material["diffuse"]),
            "metallicFactor": 0.0,
            "roughnessFactor": 0.82,
        }
        texture_index = texture_map.get(material["textureIndex"])
        if texture_index is not None:
            pbr["baseColorTexture"] = {"index": texture_index}
        material_json = {
            "name": material["name"] or material["nameEn"],
            "doubleSided": bool(material["flags"] & 0x01),
            "pbrMetallicRoughness": pbr,
            "alphaMode": "BLEND" if material["diffuse"][3] < 0.999 else "OPAQUE",
        }
        gltf_materials.append(material_json)
        count = material["indexCount"]
        sub_indices = model["indices"][cursor : cursor + count]
        cursor += count
        component_type = 5123 if (not sub_indices or max(sub_indices) < 65536) else 5125
        fmt = "H" if component_type == 5123 else "I"
        index_accessor = builder.add_accessor(
            struct.pack("<" + fmt * len(sub_indices), *sub_indices),
            component_type=component_type,
            count=len(sub_indices),
            kind="SCALAR",
            target=34963,
            minimum=[min(sub_indices)] if sub_indices else [0],
            maximum=[max(sub_indices)] if sub_indices else [0],
        )
        primitives.append({
            "attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor, "TEXCOORD_0": uv_accessor},
            "indices": index_accessor,
            "material": len(gltf_materials) - 1,
            "mode": 4,
        })

    document = {
        "asset": {"version": "2.0", "generator": "GGD static PMX review converter v1"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": model["name"] or model["path"].stem, "mesh": 0}],
        "meshes": [{"name": model["name"] or model["path"].stem, "primitives": primitives}],
        "materials": gltf_materials,
        "images": images,
        "textures": textures,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "bufferViews": builder.buffer_views,
        "accessors": builder.accessors,
        "buffers": [{"byteLength": len(builder.binary)}],
        "extras": {
            "sourceId": SOURCE_ID,
            "sourcePmxSha256": sha256(model["path"]),
            "identityStatus": "owner-visual-review-required",
            "staticReviewOnly": True,
        },
    }
    json_payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    binary_payload = bytes(builder.binary)
    binary_payload += b"\0" * ((4 - len(binary_payload) % 4) % 4)
    total_length = 12 + 8 + len(json_payload) + 8 + len(binary_payload)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(
        struct.pack("<4sII", b"glTF", 2, total_length)
        + struct.pack("<I4s", len(json_payload), b"JSON") + json_payload
        + struct.pack("<I4s", len(binary_payload), b"BIN\0") + binary_payload
    )
    return {
        "vertexCount": len(vertices),
        "triangleCount": len(model["indices"]) // 3,
        "primitiveCount": len(primitives),
        "materialCount": len(gltf_materials),
        "boneCountInSource": model["boneCount"],
        "animationCount": 0,
        "textureReferences": texture_meta,
        "bounds": {"min": minimum, "max": maximum},
        "glb": {"absolutePath": str(output), "bytes": output.stat().st_size, "sha256": sha256(output)},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    root = workspace / "GGD-Asset-Library/intake/public-models-20260913/bowlroll-sabakan359-vearn-mmd-v087"
    archive = root / "original/vearn-mmd-v087.zip"
    if not archive.is_file() or sha256(archive) != ARCHIVE_SHA256:
        raise ValueError("frozen Vearn archive missing or changed")
    input_root = root / "extracted/大魔王バーン"
    output_root = workspace / "GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1/static"
    rows = []
    for path in sorted(input_root.glob("*.pmx")):
        model = parse_pmx(path)
        output = output_root / path.stem / "candidate.glb"
        metrics = build_glb(model, output)
        rows.append({
            "candidateId": f"{SOURCE_ID}:{path.stem}",
            "displayName": path.name,
            "sourcePmx": {"absolutePath": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)},
            "pmx": {"version": model["version"], "name": model["name"], "nameEn": model["nameEn"], "weightTypes": model["weightTypes"]},
            **metrics,
            "identityStatus": "owner-visual-review-required",
            "conversionStatus": "static-review-converted",
            "fullSkinnedConversionStatus": "blocked-by-local-blender-5.2.1-metal-init-crash",
            "runtimeStatus": "not-registered",
        })
    manifest = {
        "schema": "ggd.vearn-static-review-conversion@1",
        "sourceId": SOURCE_ID,
        "archive": {"absolutePath": str(archive), "bytes": archive.stat().st_size, "sha256": ARCHIVE_SHA256},
        "ownerDecision": {
            "date": "2026-09-17",
            "instruction": "巴恩大魔王相關的 3d model 都可以抓取 我來人工視覺鑑定就好",
            "effect": "retain-and-convert-all-related-candidates-for-owner-visual-review",
        },
        "conversionScope": "static geometry and diffuse textures only; no animation or runtime registration",
        "candidates": rows,
        "summary": {
            "candidateCount": len(rows),
            "reviewGlbCount": sum(Path(row["glb"]["absolutePath"]).is_file() for row in rows),
            "sourceTriangleCount": sum(row["triangleCount"] for row in rows),
            "nativeMotionCount": 0,
            "runtimeRegisteredCount": 0,
            "productionDeployedCount": 0,
        },
    }
    manifest_path = output_root.parent / "conversion-manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
