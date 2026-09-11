#!/usr/bin/env python3
"""Build a bounded, self-contained Kirei GLB before handing it to GGD's importer.

The archived source GLB exceeds the current parser's JSON, clip and accessor
limits.  This converter intentionally performs only the operations needed to
make the source parseable: retain six exact source animations, combine three
identity mesh nodes that share one skin, remove unused binary ranges and remove
two unsupported extension declarations that have no corresponding payloads.
The official GGD normalizer and verifier remain responsible for final output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


SOURCE_SHA256 = "cf5f5d84cf6c8419c8d8a006771d5ce1d6206ddbb97701cb24b8ef4450190ac3"
SELECTIONS = [
    ("idle", 1, "idle"),
    ("run", 3, "run2"),
    ("attack", 5, "2handshoot"),
    ("cast", 348, "action_wave"),
    ("hurt", 18, "gutshot"),
    ("death", 12, "die_simple"),
]
MESH_NODES = (26, 28, 30)
UNSUPPORTED_EMPTY_DECLARATIONS = {"KHR_materials_volume", "FB_ngon_encoding"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_glb(data: bytes) -> tuple[dict[str, Any], bytes, int]:
    if len(data) < 28 or data[:4] != b"glTF":
        raise ValueError("source is not a complete GLB")
    magic, version, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or total != len(data):
        raise ValueError("unexpected GLB header")
    offset = 12
    chunks: list[tuple[int, bytes]] = []
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if length % 4 or offset + length > len(data):
            raise ValueError("invalid GLB chunk")
        chunks.append((kind, data[offset:offset + length]))
        offset += length
    if len(chunks) != 2 or chunks[0][0] != 0x4E4F534A or chunks[1][0] != 0x004E4942:
        raise ValueError("expected one JSON chunk followed by one BIN chunk")
    document = json.loads(chunks[0][1].rstrip(b" \x00"))
    return document, chunks[1][1], len(chunks[0][1])


def encode_glb(document: dict[str, Any], binary: bytes) -> bytes:
    document["buffers"] = [{"byteLength": len(binary)}]
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    raw += b" " * ((-len(raw)) % 4)
    padded_binary = binary + b"\x00" * ((-len(binary)) % 4)
    total = 28 + len(raw) + len(padded_binary)
    return b"".join((
        struct.pack("<III", 0x46546C67, 2, total),
        struct.pack("<II", len(raw), 0x4E4F534A), raw,
        struct.pack("<II", len(padded_binary), 0x004E4942), padded_binary,
    ))


def has_extension_payload(value: Any) -> bool:
    if isinstance(value, dict):
        if "extensions" in value:
            return True
        return any(has_extension_payload(child) for child in value.values())
    if isinstance(value, list):
        return any(has_extension_payload(child) for child in value)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    source_bytes = source.read_bytes()
    if sha256(source_bytes) != SOURCE_SHA256:
        raise ValueError("Kotomine Kirei source bytes changed")
    doc, binary, source_json_bytes = parse_glb(source_bytes)

    if doc.get("asset", {}).get("version") != "2.0" or len(doc.get("buffers", [])) != 1:
        raise ValueError("unexpected source document")
    if len(doc.get("animations", [])) != 349 or len(doc.get("accessors", [])) != 46117:
        raise ValueError("source animation/accessor inventory changed")
    if len(doc.get("meshes", [])) != 3 or len(doc.get("skins", [])) != 1:
        raise ValueError("source mesh/skin inventory changed")
    if set(doc.get("extensionsUsed", [])) != UNSUPPORTED_EMPTY_DECLARATIONS:
        raise ValueError("source extension declarations changed")
    if doc.get("extensionsRequired") or has_extension_payload(doc):
        raise ValueError("cannot remove extension declarations with actual extension payloads")

    selected_animations = []
    selected_report = []
    for role, index, expected_name in SELECTIONS:
        animation = doc["animations"][index]
        if animation.get("name") != expected_name:
            raise ValueError(f"animation {index} changed")
        selected_animations.append(json.loads(json.dumps(animation)))
        selected_report.append({
            "role": role,
            "sourceIndex": index,
            "sourceName": expected_name,
            "channels": len(animation.get("channels", [])),
            "samplers": len(animation.get("samplers", [])),
            "semanticStatus": "provisional-community-mod-role-mapping",
        })
    doc["animations"] = selected_animations

    nodes = doc["nodes"]
    mesh_refs = [(index, node.get("mesh"), node.get("skin")) for index, node in enumerate(nodes) if "mesh" in node]
    if mesh_refs != [(26, 0, 0), (28, 1, 0), (30, 2, 0)]:
        raise ValueError(f"mesh node layout changed: {mesh_refs}")
    for index in MESH_NODES:
        if any(key in nodes[index] for key in ("matrix", "translation", "rotation", "scale")):
            raise ValueError(f"mesh node {index} is no longer identity-transform")
    combined = {
        "name": "Kotomine Kirei combined source meshes",
        "primitives": [json.loads(json.dumps(primitive)) for mesh in doc["meshes"] for primitive in mesh["primitives"]],
    }
    if len(combined["primitives"]) != 8:
        raise ValueError("source primitive inventory changed")
    doc["meshes"] = [combined]
    for index in MESH_NODES[1:]:
        nodes[index].pop("mesh")
        nodes[index].pop("skin")
    nodes[MESH_NODES[0]]["mesh"] = 0
    nodes[MESH_NODES[0]]["skin"] = 0

    doc.pop("extensionsUsed", None)
    doc.pop("extensionsRequired", None)
    asset = doc.setdefault("asset", {})
    asset["generator"] = "GGD make_kirei_preflight.py"
    asset["extras"] = {
        "sourceSha256": SOURCE_SHA256,
        "selection": "six exact Sven/GoldSrc community-MOD sequences; not Fate-native",
    }

    old_accessors = doc["accessors"]
    kept_accessors: dict[int, int] = {}
    new_accessors: list[dict[str, Any]] = []

    def keep_accessor(index: int) -> int:
        if index not in kept_accessors:
            kept_accessors[index] = len(new_accessors)
            new_accessors.append(json.loads(json.dumps(old_accessors[index])))
        return kept_accessors[index]

    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            if "indices" in primitive:
                primitive["indices"] = keep_accessor(primitive["indices"])
            for attributes in [primitive.get("attributes", {}), *primitive.get("targets", [])]:
                for key, index in list(attributes.items()):
                    attributes[key] = keep_accessor(index)
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = keep_accessor(skin["inverseBindMatrices"])
    for animation in doc["animations"]:
        for sampler in animation["samplers"]:
            sampler["input"] = keep_accessor(sampler["input"])
            sampler["output"] = keep_accessor(sampler["output"])

    old_views = doc["bufferViews"]
    kept_views: dict[int, int] = {}
    new_views: list[dict[str, Any]] = []
    chunks: list[bytes] = []
    binary_size = 0

    def keep_view(index: int) -> int:
        nonlocal binary_size
        if index in kept_views:
            return kept_views[index]
        old = old_views[index]
        padding = (-binary_size) % 4
        if padding:
            chunks.append(b"\x00" * padding)
            binary_size += padding
        start = old.get("byteOffset", 0)
        length = old["byteLength"]
        if start < 0 or length <= 0 or start + length > len(binary):
            raise ValueError(f"bufferView {index} is out of range")
        mapped = len(new_views)
        kept_views[index] = mapped
        new_view = json.loads(json.dumps(old))
        new_view["buffer"] = 0
        new_view["byteOffset"] = binary_size
        new_views.append(new_view)
        chunk = binary[start:start + length]
        chunks.append(chunk)
        binary_size += len(chunk)
        return mapped

    for accessor in new_accessors:
        if "bufferView" in accessor:
            accessor["bufferView"] = keep_view(accessor["bufferView"])
        sparse = accessor.get("sparse")
        if sparse:
            sparse["indices"]["bufferView"] = keep_view(sparse["indices"]["bufferView"])
            sparse["values"]["bufferView"] = keep_view(sparse["values"]["bufferView"])
    for image in doc.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = keep_view(image["bufferView"])
    doc["accessors"] = new_accessors
    doc["bufferViews"] = new_views
    compact_binary = b"".join(chunks)
    if len(compact_binary) != binary_size:
        raise AssertionError("binary compaction accounting mismatch")

    result = encode_glb(doc, compact_binary)
    preflight = output / "preflight.glb"
    preflight.write_bytes(result)
    report = {
        "schema": "ggd.fuc-kotomine-kirei-preflight@1",
        "source": {"path": str(source), "bytes": len(source_bytes), "sha256": SOURCE_SHA256, "jsonChunkBytes": source_json_bytes},
        "output": {"path": str(preflight), "bytes": len(result), "sha256": sha256(result)},
        "transform": {
            "selectedAnimations": selected_report,
            "sourceAnimationEntries": 349,
            "retainedAnimationEntries": 6,
            "omittedAnimationEntriesPreservedInFullSource": 343,
            "sourceAccessors": 46117,
            "retainedAccessors": len(new_accessors),
            "sourceBufferViews": len(old_views),
            "retainedBufferViews": len(new_views),
            "sourceMeshes": 3,
            "retainedMeshNodes": 1,
            "sourcePrimitives": 8,
            "retainedPrimitivesBeforeOfficialNormalization": 8,
            "removedEmptyUnsupportedExtensionDeclarations": sorted(UNSUPPORTED_EMPTY_DECLARATIONS),
        },
        "claims": {
            "fateNativeMotion": False,
            "sourceModMotionRetained": True,
            "semanticRoleMappingAccepted": False,
            "gameplayAccepted": False,
            "runtimeRegistered": False,
            "deployed": False,
        },
    }
    (output / "conversion-preflight.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(preflight), "bytes": len(result), "sha256": sha256(result), "accessors": len(new_accessors), "bufferViews": len(new_views)}))


if __name__ == "__main__":
    main()
