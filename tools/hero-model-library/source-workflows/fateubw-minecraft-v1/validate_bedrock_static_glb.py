#!/usr/bin/env python3
"""Read a generated Bedrock GLB and verify mesh, skin and embedded texture."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np


COMPONENTS = {5123: ("<u2", 2), 5126: ("<f4", 4)}
COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_glb(path):
    blob = path.read_bytes()
    magic, version, total, json_len, json_tag = struct.unpack_from("<5I", blob, 0)
    if (magic, version, total, json_tag) != (0x46546C67, 2, len(blob), 0x4E4F534A):
        raise ValueError("not a GLB v2 JSON-first container")
    document = json.loads(blob[20:20 + json_len])
    bin_offset = 20 + json_len
    bin_len, bin_tag = struct.unpack_from("<II", blob, bin_offset)
    if bin_tag != 0x004E4942 or bin_offset + 8 + bin_len != len(blob):
        raise ValueError("invalid GLB BIN chunk")
    return document, blob[bin_offset + 8:]


def accessor(document, binary, index):
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    code, size = COMPONENTS[item["componentType"]]
    count = COUNTS[item["type"]]
    if "byteStride" in view:
        raise ValueError("validator only accepts compact generated accessors")
    start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    length = item["count"] * count * size
    raw = binary[start:start + length]
    if len(raw) != length:
        raise ValueError("accessor exceeds BIN data")
    return np.frombuffer(raw, dtype=code).reshape(item["count"], count)


def node_world_matrices(document):
    nodes = document["nodes"]
    parents = {}
    for parent, node in enumerate(nodes):
        for child in node.get("children", []):
            if child in parents:
                raise ValueError("node has multiple parents")
            parents[child] = parent
    cache = {}
    def quaternion_matrix(value):
        quaternion = np.asarray(value, dtype=float)
        norm = float(np.dot(quaternion, quaternion))
        if not np.isfinite(norm) or norm <= 0:
            raise ValueError("invalid node quaternion")
        x, y, z, w = quaternion / np.sqrt(norm)
        return np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])
    def build(index):
        if index in cache:
            return cache[index]
        node = nodes[index]
        if "matrix" in node:
            raise ValueError("generated skeleton must use decomposed TRS")
        if not np.allclose(node.get("scale", [1, 1, 1]), [1, 1, 1]):
            raise ValueError("generated rest skeleton must not scale bones")
        local = np.eye(4)
        local[:3, :3] = quaternion_matrix(node.get("rotation", [0, 0, 0, 1]))
        local[:3, 3] = node.get("translation", [0, 0, 0])
        world = build(parents[index]) @ local if index in parents else local
        cache[index] = world
        return world
    return [build(index) for index in range(len(nodes))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--source-texture", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expect-static-mesh-only", action="store_true")
    args = parser.parse_args()
    glb, texture, output = args.glb.resolve(), args.source_texture.resolve(), args.output.resolve()
    if output.exists():
        raise ValueError("output must be new so it is a reproducible receipt")
    document, binary = read_glb(glb)
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    positions = accessor(document, binary, attributes["POSITION"]).astype(float)
    normals = accessor(document, binary, attributes["NORMAL"]).astype(float)
    indices = accessor(document, binary, primitive["indices"]).reshape(-1).astype(int)
    static_mesh_only = args.expect_static_mesh_only
    joints = weights = inverse_bind = None
    joint_nodes = []
    max_rest_error = 0.0
    used = set()
    if not static_mesh_only:
        joints = accessor(document, binary, attributes["JOINTS_0"]).astype(int)
        weights = accessor(document, binary, attributes["WEIGHTS_0"]).astype(float)
        skin = document["skins"][0]
        inverse_bind = accessor(document, binary, skin["inverseBindMatrices"]).astype(float).reshape(-1, 4, 4).transpose(0, 2, 1)
        world = node_world_matrices(document)
        joint_nodes = skin["joints"]
        for vertex, position in enumerate(positions):
            composite = np.zeros(4)
            input_position = np.append(position, 1.0)
            for lane, weight in enumerate(weights[vertex]):
                if weight:
                    joint_index = joints[vertex, lane]
                    used.add(joint_index)
                    composite += weight * (world[joint_nodes[joint_index]] @ inverse_bind[joint_index] @ input_position)
            max_rest_error = max(max_rest_error, float(np.max(np.abs(composite[:3] - position))))
    image = document["images"][0]
    view = document["bufferViews"][image["bufferView"]]
    embedded = binary[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
    normal_lengths = np.linalg.norm(normals, axis=1)
    problems = []
    if len(document.get("images", [])) != 1 or len(document.get("textures", [])) != 1:
        problems.append("expected-exactly-one-embedded-texture")
    if sha256(texture) != hashlib.sha256(embedded).hexdigest():
        problems.append("embedded-texture-hash-mismatch")
    if static_mesh_only:
        if document.get("skins") or "JOINTS_0" in attributes or "WEIGHTS_0" in attributes:
            problems.append("static-mesh-only-output-contains-skin-data")
    else:
        if not np.allclose(weights.sum(axis=1), 1.0):
            problems.append("weights-do-not-sum-to-one")
        if not np.all((weights == 0) | (weights == 1)) or not np.all((weights == 1).sum(axis=1) == 1):
            problems.append("vertices-are-not-rigidly-skinned")
        if joints.min() < 0 or joints.max() >= len(joint_nodes):
            problems.append("joint-index-out-of-range")
    if indices.min() < 0 or indices.max() >= len(positions) or len(indices) % 3:
        problems.append("invalid-triangle-indexing")
    else:
        # Every generated cube face carries one constant normal.  Checking the
        # winding catches a WebGL-visible defect that bounds/hash checks cannot.
        triangles = positions[indices].reshape(-1, 3, 3)
        face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        expected_normals = normals[indices].reshape(-1, 3, 3).mean(axis=1)
        winding_dots = np.einsum("ij,ij->i", face_normals, expected_normals)
        # Bedrock permits a zero-thickness cube for a flat garment/plane.  Its
        # side faces are degenerate by source design; retain and count them,
        # but only fail a real non-degenerate inward-facing triangle.
        degenerate_triangle_count = int(np.count_nonzero(np.isclose(np.linalg.norm(face_normals, axis=1), 0.0)))
        if np.any(winding_dots < -1e-12):
            problems.append("triangle-winding-disagrees-with-normal")
    if not np.allclose(normal_lengths, 1.0):
        problems.append("non-unit-normals")
    if not static_mesh_only and max_rest_error > 1e-6:
        problems.append("rest-skin-does-not-preserve-position")
    result = {
        "schema": "ggd-bedrock-glb-structural-readback@1",
        "glb": {"path": str(glb), "sha256": sha256(glb), "bytes": glb.stat().st_size},
        "sourceTexture": {"path": str(texture), "sha256": sha256(texture), "embeddedSha256": hashlib.sha256(embedded).hexdigest(), "embeddedByteExact": not any(p == "embedded-texture-hash-mismatch" for p in problems)},
        "structure": {"nodeCount": len(document["nodes"]), "meshCount": len(document["meshes"]), "skinCount": len(document.get("skins", [])), "jointCount": len(joint_nodes), "unusedJointIndices": sorted(set(range(len(joint_nodes))) - used), "vertexCount": len(positions), "triangleCount": len(indices) // 3, "degenerateTriangleCount": locals().get("degenerate_triangle_count", 0), "animationCount": len(document.get("animations", [])), "staticMeshOnly": static_mesh_only, "rigidWeights": None if static_mesh_only else not any(p == "vertices-are-not-rigidly-skinned" for p in problems), "normalLengthMin": float(normal_lengths.min()), "normalLengthMax": float(normal_lengths.max()), "maxRestSkinPositionError": None if static_mesh_only else max_rest_error},
        "valid": not problems,
        "problems": problems,
        "limits": (["Structural readback only; it is not a rendered visual review.",
                    "This static-mesh-only output contains no glTF rig; its source Bedrock rig and native animation remain separate."]
                   if static_mesh_only else
                   ["Structural readback checks the rest pose only; animation curves require separate contract and playback evidence.",
                    "It does not prove source-engine interpolation, event mapping, gameplay behavior or continuous visual parity."]),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": sha256(output), "valid": result["valid"], "problems": problems}, ensure_ascii=False))


if __name__ == "__main__":
    main()
