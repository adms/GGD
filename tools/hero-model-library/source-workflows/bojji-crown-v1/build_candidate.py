#!/usr/bin/env python3
"""Attach a small gold crown to the existing independent Bojji GLB.

The crown is a separate primitive whose vertices receive 100% weight from
``Bip001 Head``.  The source skin, textures, animation accessors and primitives
are copied byte for byte; skinning makes the crown follow every source-native
head animation while satisfying the runtime's all-primitives-skinned gate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
ASSETS = WORKSPACE / "GGD-Asset-Library"
SOURCE = REPO / "content/assets/models/community/versions/745fe9a31c9ed44098f7d92984de88e81f5ddf6605c7327f327ddcd82ee96581.glb"
SOURCE_SHA256 = "745fe9a31c9ed44098f7d92984de88e81f5ddf6605c7327f327ddcd82ee96581"
OUTPUT_ROOT = ASSETS / "conversions/bojji-crown-v1"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def align4(data: bytearray, pad: int = 0) -> None:
    while len(data) % 4:
        data.append(pad)


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError("expected a glTF 2.0 GLB")
    if struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError("GLB declared length mismatch")
    offset = 12
    document = None
    binary = None
    while offset < len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if kind == b"JSON":
            document = json.loads(chunk.rstrip(b" \t\r\n\0"))
        elif kind == b"BIN\0":
            binary = bytes(chunk)
    if document is None or binary is None:
        raise ValueError("GLB must contain JSON and BIN chunks")
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> bytes:
    document["buffers"][0]["byteLength"] = len(binary)
    payload = bytearray(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode())
    align4(payload, 0x20)
    body = bytearray(binary)
    align4(body)
    out = bytearray(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(payload) + 8 + len(body)))
    out += struct.pack("<I4s", len(payload), b"JSON") + payload
    out += struct.pack("<I4s", len(body), b"BIN\0") + body
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)
    return bytes(out)


def quat_matrix(q: list[float]) -> list[list[float]]:
    x, y, z, w = q
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return [
        [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0],
        [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0],
        [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0],
        [0, 0, 0, 1],
    ]


def matrix_multiply(left: list[list[float]], right: list[list[float]]) -> list[list[float]]:
    return [[sum(left[r][k] * right[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def node_matrix(node: dict) -> list[list[float]]:
    if "matrix" in node:
        values = node["matrix"]
        return [[values[c * 4 + r] for c in range(4)] for r in range(4)]
    rotation = quat_matrix(node.get("rotation", [0, 0, 0, 1]))
    scale = node.get("scale", [1, 1, 1])
    for row in range(3):
        for column in range(3):
            rotation[row][column] *= scale[column]
    translation = node.get("translation", [0, 0, 0])
    for row in range(3):
        rotation[row][3] = translation[row]
    return rotation


def affine_inverse(matrix: list[list[float]]) -> list[list[float]]:
    # All source bone scales are one; transposing the orthonormal 3x3 is exact.
    inv = [[0.0] * 4 for _ in range(4)]
    inv[3][3] = 1.0
    for r in range(3):
        for c in range(3):
            inv[r][c] = matrix[c][r]
    t = [matrix[r][3] for r in range(3)]
    for r in range(3):
        inv[r][3] = -sum(inv[r][c] * t[c] for c in range(3))
    return inv


def transform(matrix: list[list[float]], point: tuple[float, float, float]) -> tuple[float, float, float]:
    v = (*point, 1.0)
    return tuple(sum(matrix[r][c] * v[c] for c in range(4)) for r in range(3))


def global_matrix(document: dict, node_index: int) -> list[list[float]]:
    parents: dict[int, int] = {}
    for parent, node in enumerate(document["nodes"]):
        for child in node.get("children", []):
            parents[child] = parent
    chain = []
    cursor = node_index
    while True:
        chain.append(cursor)
        if cursor not in parents:
            break
        cursor = parents[cursor]
    result = [[1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
    for index in reversed(chain):
        result = matrix_multiply(result, node_matrix(document["nodes"][index]))
    return result


def crown_geometry() -> tuple[list[tuple[float, float, float]], list[int]]:
    # A compact four-point crown, slightly right and behind the head as in the
    # supplied character reference.  All values are expressed in model space,
    # then weighted to the source head joint.
    segments = 8
    centre_x, centre_z = 0.042, 0.012
    outer, inner = 0.027, 0.021
    bottom, valley, peak = 0.371, 0.387, 0.412
    world: list[tuple[float, float, float]] = []
    for radius in (outer, inner):
        for y_kind in ("bottom", "top"):
            for i in range(segments):
                angle = 2 * math.pi * i / segments
                y = bottom if y_kind == "bottom" else (peak if i % 2 == 0 else valley)
                world.append((centre_x + radius * math.cos(angle), y, centre_z + radius * math.sin(angle)))
    # outer bottom/top, inner bottom/top
    ob, ot, ib, it = 0, segments, segments * 2, segments * 3
    indices: list[int] = []
    for i in range(segments):
        j = (i + 1) % segments
        # Outer wall, inner wall, bottom rim and top rim.  The material is
        # double-sided, but consistent winding also keeps validators happy.
        indices += [ob + i, ob + j, ot + j, ob + i, ot + j, ot + i]
        indices += [ib + i, it + j, ib + j, ib + i, it + i, it + j]
        indices += [ob + i, ib + j, ob + j, ob + i, ib + i, ib + j]
        indices += [ot + i, ot + j, it + j, ot + i, it + j, it + i]
    return world, indices


def build(source: Path, output: Path) -> dict:
    source_bytes = source.read_bytes()
    if sha256(source_bytes) != SOURCE_SHA256:
        raise ValueError("source GLB bytes changed; re-audit before rebuilding")
    document, source_binary = read_glb(source)
    original = {
        "nodes": len(document["nodes"]),
        "meshes": len(document["meshes"]),
        "materials": len(document.get("materials", [])),
        "bufferViews": len(document["bufferViews"]),
        "accessors": len(document["accessors"]),
        "binaryBytes": len(source_binary),
        "animations": len(document.get("animations", [])),
    }
    head_matches = [i for i, node in enumerate(document["nodes"]) if node.get("name") == "Bip001 Head"]
    if head_matches != [1]:
        raise ValueError(f"unexpected head joint candidates: {head_matches}")
    head_index = head_matches[0]
    vertices, indices = crown_geometry()
    skin_index = 0
    head_joint_slot = document["skins"][skin_index]["joints"].index(head_index)
    binary = bytearray(source_binary)
    align4(binary)
    position_offset = len(binary)
    binary.extend(b"".join(struct.pack("<3f", *point) for point in vertices))
    align4(binary)
    index_offset = len(binary)
    binary.extend(struct.pack("<" + "H" * len(indices), *indices))
    align4(binary)
    joints_offset = len(binary)
    binary.extend(b"".join(struct.pack("<4H", head_joint_slot, 0, 0, 0) for _ in vertices))
    align4(binary)
    weights_offset = len(binary)
    binary.extend(b"".join(struct.pack("<4f", 1.0, 0.0, 0.0, 0.0) for _ in vertices))
    align4(binary)

    position_view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": position_offset, "byteLength": len(vertices) * 12, "target": 34962})
    index_view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": index_offset, "byteLength": len(indices) * 2, "target": 34963})
    joints_view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": joints_offset, "byteLength": len(vertices) * 8, "target": 34962})
    weights_view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": weights_offset, "byteLength": len(vertices) * 16, "target": 34962})
    position_accessor = len(document["accessors"])
    document["accessors"].append({
        "bufferView": position_view,
        "componentType": 5126,
        "count": len(vertices),
        "type": "VEC3",
        "min": [min(point[axis] for point in vertices) for axis in range(3)],
        "max": [max(point[axis] for point in vertices) for axis in range(3)],
    })
    index_accessor = len(document["accessors"])
    document["accessors"].append({
        "bufferView": index_view,
        "componentType": 5123,
        "count": len(indices),
        "type": "SCALAR",
        "min": [min(indices)],
        "max": [max(indices)],
    })
    joints_accessor = len(document["accessors"])
    document["accessors"].append({
        "bufferView": joints_view,
        "componentType": 5123,
        "count": len(vertices),
        "type": "VEC4",
        "min": [head_joint_slot, 0, 0, 0],
        "max": [head_joint_slot, 0, 0, 0],
    })
    weights_accessor = len(document["accessors"])
    document["accessors"].append({
        "bufferView": weights_view,
        "componentType": 5126,
        "count": len(vertices),
        "type": "VEC4",
        "min": [1.0, 0.0, 0.0, 0.0],
        "max": [1.0, 0.0, 0.0, 0.0],
    })
    material_index = len(document.setdefault("materials", []))
    document["materials"].append({
        "name": "GGD Bojji Crown Gold",
        "pbrMetallicRoughness": {
            "baseColorFactor": [1.0, 0.72, 0.08, 1.0],
            "metallicFactor": 0.12,
            "roughnessFactor": 0.5,
        },
        "doubleSided": True,
        "extensions": {"KHR_materials_unlit": {}},
    })
    if "KHR_materials_unlit" not in document.setdefault("extensionsUsed", []):
        document["extensionsUsed"].append("KHR_materials_unlit")
    mesh_index = len(document["meshes"])
    document["meshes"].append({
        "name": "GGD Bojji Crown",
        "primitives": [{"attributes": {"POSITION": position_accessor, "JOINTS_0": joints_accessor, "WEIGHTS_0": weights_accessor}, "indices": index_accessor, "material": material_index}],
        "extras": {"ggdAttachment": "bojji-crown", "source": "owner-approved-visual-reference"},
    })
    crown_node = len(document["nodes"])
    document["nodes"].append({
        "name": "GGD Bojji Crown",
        "mesh": mesh_index,
        "skin": skin_index,
        "extras": {"ggdAttachment": "bojji-crown", "followsBone": "Bip001 Head", "headJointSlot": head_joint_slot},
    })
    default_scene = document.get("scene", 0)
    document["scenes"][default_scene].setdefault("nodes", []).append(crown_node)
    document.setdefault("asset", {}).setdefault("extras", {})["ggdDerivative"] = {
        "id": "bojji-crown-v1",
        "heroId": "b2-bojji",
        "sourceSha256": SOURCE_SHA256,
        "copyMode": "independent-embedded-copy",
        "attachment": "small-gold-crown-parented-to-head",
    }
    output_bytes = write_glb(output, document, bytes(binary))
    receipt = {
        "schema": "ggd.bojji-crown-build@1",
        "source": {"path": str(source.resolve()), "bytes": len(source_bytes), "sha256": SOURCE_SHA256},
        "output": {"path": str(output.resolve()), "bytes": len(output_bytes), "sha256": sha256(output_bytes)},
        "attachment": {
            "node": crown_node,
            "mesh": mesh_index,
            "material": material_index,
            "parentHeadNode": head_index,
            "headJointSlot": head_joint_slot,
            "vertices": len(vertices),
            "triangles": len(indices) // 3,
            "materialName": "GGD Bojji Crown Gold",
        },
        "preservation": {
            "sourceBinaryPrefixExact": bytes(binary[: len(source_binary)]) == source_binary,
            "sourceAnimationCount": original["animations"],
            "sourceNodesRetained": original["nodes"],
            "sourceMeshesRetained": original["meshes"],
            "sourceMaterialsRetained": original["materials"],
            "onlyNewGeometryFullyWeightedToHeadJoint": True,
            "crownFollowsHeadBySkinning": True,
        },
        "status": {"converted": True, "validated": False, "runtimeRegistered": False, "productionDeployed": False},
    }
    receipt_path = output.parent / "build-receipt.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT_ROOT / "candidate.glb")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        expected = args.output.read_bytes()
        with tempfile.TemporaryDirectory(prefix="ggd-bojji-crown-check-") as directory:
            temporary = Path(directory) / "candidate.glb"
            receipt = build(args.source.resolve(), temporary)
            actual = temporary.read_bytes()
        if actual != expected:
            raise ValueError("candidate is stale or non-deterministic")
    else:
        receipt = build(args.source.resolve(), args.output.resolve())
    print(json.dumps({"output": receipt["output"], "attachment": receipt["attachment"], "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
