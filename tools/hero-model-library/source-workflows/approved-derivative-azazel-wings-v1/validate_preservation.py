#!/usr/bin/env python3
"""Prove deterministic rebuild, source accessor preservation and wing binding."""
from __future__ import annotations

import argparse
import tempfile
from hashlib import sha256
import json
from pathlib import Path
import struct

import numpy as np


ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "content/assets/models/community/7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2.glb"
STAGE = ROOT.parent / "GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v1"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def read_glb(path: Path) -> tuple[dict, bytes]:
    blob = path.read_bytes(); length = struct.unpack_from("<I", blob, 12)[0]
    doc = json.loads(blob[20:20 + length]); binary_length = struct.unpack_from("<I", blob, 20 + length)[0]
    return doc, blob[28 + length:28 + length + binary_length]


def accessor_payload(doc: dict, binary: bytes, index: int) -> bytes:
    accessor = doc["accessors"][index]; view = doc["bufferViews"][accessor["bufferView"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
    size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[accessor["componentType"]]
    packed = width * size; stride = view.get("byteStride", packed)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return b"".join(binary[start + row * stride:start + row * stride + packed] for row in range(accessor["count"]))


def values(doc: dict, binary: bytes, index: int) -> np.ndarray:
    accessor = doc["accessors"][index]
    dtype = {5121: "<u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
    return np.frombuffer(accessor_payload(doc, binary, index), dtype=dtype).reshape(-1, width)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, default=STAGE / "azazel-wings-v1.glb")
    # ⛔ 不可以寫死 macOS 的 /private/tmp（GH#1003：Linux 上建不出來 ⇒ 靜默失敗）
    parser.add_argument("--rebuild", type=Path, default=Path(tempfile.gettempdir()) / "azazel-wings-v1-rebuild.glb")
    parser.add_argument("--output", type=Path, default=STAGE / "azazel-wings-v1.preservation.json")
    args = parser.parse_args()
    source_doc, source_bin = read_glb(SOURCE)
    candidate_doc, candidate_bin = read_glb(args.candidate)
    assert digest(SOURCE) == "7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2"
    assert digest(args.candidate) == digest(args.rebuild), "two builds differ"
    assert len(candidate_doc["accessors"]) == len(source_doc["accessors"]) + 6
    preserved = []
    for index, old in enumerate(source_doc["accessors"]):
        assert candidate_doc["accessors"][index] == old
        old_payload = accessor_payload(source_doc, source_bin, index)
        new_payload = accessor_payload(candidate_doc, candidate_bin, index)
        assert old_payload == new_payload
        preserved.append({"index": index, "sha256": sha256(old_payload).hexdigest(), "bytes": len(old_payload)})
    assert candidate_doc["nodes"] == source_doc["nodes"]
    assert candidate_doc["skins"] == source_doc["skins"]
    assert candidate_doc["animations"] == source_doc["animations"]
    assert candidate_doc["meshes"][0]["primitives"][0] == source_doc["meshes"][0]["primitives"][0]
    wing = candidate_doc["meshes"][0]["primitives"][1]
    joints = values(candidate_doc, candidate_bin, wing["attributes"]["JOINTS_0"])
    weights = values(candidate_doc, candidate_bin, wing["attributes"]["WEIGHTS_0"])
    positions = values(candidate_doc, candidate_bin, wing["attributes"]["POSITION"])
    indices = values(candidate_doc, candidate_bin, wing["indices"])
    joint_names = [candidate_doc["nodes"][i].get("name") for i in candidate_doc["skins"][0]["joints"]]
    chest_slot = joint_names.index("Bip01 Spine1")
    assert np.all(joints[:, 0] == chest_slot) and np.all(joints[:, 1:] == 0)
    assert np.allclose(weights[:, 0], 1) and np.allclose(weights[:, 1:], 0)
    assert len(positions) == 14 and len(indices) // 3 == 10
    result = {
        "schema": "ggd.approved-azazel-wings-preservation@1",
        "sourceSha256": digest(SOURCE), "candidateSha256": digest(args.candidate),
        "rebuildSha256": digest(args.rebuild), "byteIdenticalRebuild": True,
        "sourceAccessorsPreserved": len(preserved),
        "sourceAccessorPayloads": preserved,
        "sourceBodyPrimitiveUnchanged": True, "nodesUnchanged": True,
        "skinUnchanged": True, "animationsUnchanged": True,
        "wings": {"vertices": len(positions), "triangles": len(indices) // 3, "jointSlot": chest_slot, "jointName": "Bip01 Spine1", "allWeightsRigidOne": True},
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceAccessorsPreserved": len(preserved), "byteIdenticalRebuild": True, "wingJoint": "Bip01 Spine1"}))


if __name__ == "__main__":
    main()
