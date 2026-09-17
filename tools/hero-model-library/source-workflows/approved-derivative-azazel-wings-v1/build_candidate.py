#!/usr/bin/env python3
"""Build the approved Azazel appearance copy with chest-bound bat wings.

The source is the existing independent Azazel derivative.  Its body geometry,
skin, skeleton and five borrowed source animations remain byte-for-byte at the
accessor level.  The already-approved brown/dark-brown body atlas is resized to
the current 256px cap and a small procedural burgundy wing primitive is bound
100% to ``Bip01 Spine1``.  No other derivative is accepted by this workflow.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[4]
SOURCE_REL = Path("content/assets/models/community/7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2.glb")
SOURCE_SHA256 = "7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2"
WORKFLOW_ID = "approved-derivative-azazel-wings-v1"
STAGE_DEFAULT = ROOT.parent / "GGD-Asset-Library/conversions" / WORKFLOW_ID


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def read_glb(path: Path) -> tuple[dict, bytes]:
    blob = path.read_bytes()
    if len(blob) < 28 or blob[:4] != b"glTF":
        raise ValueError("expected GLB 2.0")
    version, total = struct.unpack_from("<II", blob, 4)
    json_length, json_kind = struct.unpack_from("<II", blob, 12)
    if version != 2 or total != len(blob) or json_kind != 0x4E4F534A:
        raise ValueError("invalid GLB header")
    document = json.loads(blob[20:20 + json_length])
    binary_length, binary_kind = struct.unpack_from("<II", blob, 20 + json_length)
    binary = blob[28 + json_length:28 + json_length + binary_length]
    if binary_kind != 0x004E4942 or 28 + json_length + binary_length != len(blob):
        raise ValueError("expected one complete BIN chunk")
    return document, binary


def pack_glb(document: dict, binary: bytes) -> bytes:
    binary = binary + b"\0" * ((-len(binary)) % 4)
    document["buffers"] = [{"byteLength": len(binary)}]
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total) +
            struct.pack("<II", len(encoded), 0x4E4F534A) + encoded +
            struct.pack("<II", len(binary), 0x004E4942) + binary)


class Appender:
    def __init__(self, document: dict, binary: bytes):
        self.document = document
        self.binary = bytearray(binary)

    def view(self, data: bytes, target: int | None = None) -> int:
        self.binary.extend(b"\0" * ((-len(self.binary)) % 4))
        item = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data)}
        if target is not None:
            item["target"] = target
        index = len(self.document.setdefault("bufferViews", []))
        self.document["bufferViews"].append(item)
        self.binary.extend(data)
        return index

    def accessor(self, values: np.ndarray, kind: str, component: int,
                 target: int | None = None, bounds: bool = False) -> int:
        types = {5123: np.dtype("<u2"), 5125: np.dtype("<u4"), 5126: np.dtype("<f4")}
        array = np.asarray(values, dtype=types[component])
        if array.ndim == 1:
            array = array.reshape(-1, 1)
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[kind]
        if array.shape[1] != width or not np.isfinite(array).all():
            raise ValueError(f"invalid {kind} accessor")
        item = {
            "bufferView": self.view(array.tobytes(order="C"), target),
            "componentType": component,
            "count": len(array),
            "type": kind,
        }
        if bounds:
            item["min"] = array.min(axis=0).astype(float).tolist()
            item["max"] = array.max(axis=0).astype(float).tolist()
        index = len(self.document.setdefault("accessors", []))
        self.document["accessors"].append(item)
        return index


def png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, format="PNG", optimize=False, compress_level=9)
    return out.getvalue()


def body_atlas(document: dict, binary: bytes) -> tuple[bytes, dict]:
    image = document["images"][0]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    source = binary[start:start + view["byteLength"]]
    decoded = Image.open(BytesIO(source)).convert("RGB")
    if decoded.size != (512, 512):
        raise ValueError(f"unexpected approved atlas size {decoded.size}")
    resized = decoded.resize((256, 256), Image.Resampling.LANCZOS)
    result = png(resized)
    return result, {
        "sourceSha256": digest(source), "sourceSize": list(decoded.size),
        "outputSha256": digest(result), "outputSize": list(resized.size),
        "operation": "Pillow Lanczos resize only; approved colour treatment retained",
    }


def wing_atlas() -> tuple[bytes, dict]:
    image = Image.new("RGB", (256, 256))
    px = image.load()
    for y in range(256):
        t = y / 255
        for x in range(256):
            edge = abs(x - 127.5) / 127.5
            px[x, y] = (int(105 - 28 * t - 12 * edge), int(27 - 8 * t), int(52 + 23 * (1 - t)))
    draw = ImageDraw.Draw(image)
    vein = (56, 15, 31)
    for end in [(255, 8), (255, 96), (255, 188), (212, 255)]:
        draw.line([(10, 226), end], fill=vein, width=7)
    draw.line([(4, 232), (64, 74), (176, 18), (252, 8)], fill=(48, 12, 29), width=9)
    draw.line([(7, 235), (94, 247), (164, 224), (212, 255)], fill=(48, 12, 29), width=9)
    result = png(image)
    return result, {"sha256": digest(result), "size": [256, 256], "palette": "deep burgundy and muted violet"}


def wing_geometry() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    # One seven-point scalloped membrane per side.  +Z is the character front;
    # both wings sit behind the torso and the material is explicitly double-sided.
    right = np.array([
        [0.115, 0.215, -0.207], [0.115, 0.280, -0.207],
        [0.195, 0.325, -0.210], [0.330, 0.290, -0.215],
        [0.300, 0.245, -0.214], [0.275, 0.200, -0.212],
        [0.195, 0.225, -0.209],
    ], dtype=np.float32)
    left = right.copy(); left[:, 0] *= -1
    positions = np.concatenate([left, right])
    normals = np.tile([0.0, 0.0, 1.0], (len(positions), 1)).astype(np.float32)
    def uv(points: np.ndarray, mirror: bool) -> np.ndarray:
        x = (np.abs(points[:, 0]) - 0.115) / (0.330 - 0.115)
        y = (points[:, 1] - 0.200) / (0.325 - 0.200)
        u = 1 - x if mirror else x
        return np.column_stack([u, 1 - y]).astype(np.float32)
    uvs = np.concatenate([uv(left, True), uv(right, False)])
    faces = np.array([[0,1,2],[0,2,6],[2,3,6],[3,4,6],[4,5,6]], dtype=np.uint16)
    # Mirroring reverses winding; double-sided rendering also keeps the back visible.
    left_faces = faces[:, [0,2,1]]
    right_faces = faces + 7
    return positions, normals, uvs, np.concatenate([left_faces, right_faces]).reshape(-1)


def build(source: Path, output: Path) -> dict:
    source_bytes = source.read_bytes()
    if digest(source_bytes) != SOURCE_SHA256:
        raise ValueError("approved Azazel source changed")
    original, original_binary = read_glb(source)
    document = deepcopy(original)
    derivative = document.get("extras", {}).get("ggdDerivative", {})
    if derivative.get("id") != "azazel" or derivative.get("heroId") != "community-review-32-20260907":
        raise ValueError("workflow only accepts the approved Azazel derivative")
    if len(document.get("meshes", [])) != 1 or len(document["meshes"][0].get("primitives", [])) != 1:
        raise ValueError("unexpected source mesh layout")
    if len(document.get("images", [])) != 1 or len(document.get("skins", [])) != 1:
        raise ValueError("unexpected source image/skin layout")

    joint_names = [document["nodes"][node].get("name") for node in document["skins"][0]["joints"]]
    if joint_names.count("Bip01 Spine1") != 1:
        raise ValueError("expected one Bip01 Spine1 joint")
    chest_slot = joint_names.index("Bip01 Spine1")

    body_png, body_receipt = body_atlas(document, original_binary)
    old_image_view_index = document["images"][0]["bufferView"]
    old_image_view = document["bufferViews"][old_image_view_index]
    old_image_start = old_image_view.get("byteOffset", 0)
    if old_image_view_index != len(document["bufferViews"]) - 1 or old_image_start + old_image_view["byteLength"] > len(original_binary):
        raise ValueError("approved atlas is no longer the final source buffer view")

    # The original atlas is the final buffer view. Replace it in place so the
    # output contains no orphaned 512px image while all prior accessor bytes stay exact.
    app = Appender(document, original_binary[:old_image_start])
    app.binary.extend(body_png)
    old_image_view.update(buffer=0, byteOffset=old_image_start, byteLength=len(body_png))
    document["images"][0].update(mimeType="image/png", name="Azazel approved brown body atlas 256")

    wing_png, wing_texture_receipt = wing_atlas()
    wing_image_view = app.view(wing_png)
    wing_image = len(document["images"])
    document["images"].append({"bufferView": wing_image_view, "mimeType": "image/png", "name": "Azazel burgundy wing atlas 256"})
    wing_texture = len(document.setdefault("textures", []))
    wing_texture_entry = {"source": wing_image, "name": "Azazel wing texture"}
    if "sampler" in document["textures"][0]:
        wing_texture_entry["sampler"] = document["textures"][0]["sampler"]
    document["textures"].append(wing_texture_entry)
    wing_material = len(document.setdefault("materials", []))
    document["materials"].append({
        "name": "Azazel small burgundy bat wings",
        "doubleSided": True,
        "alphaMode": "OPAQUE",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": wing_texture},
            "metallicFactor": 0,
            "roughnessFactor": 0.82,
        },
    })

    positions, normals, uvs, indices = wing_geometry()
    joints = np.zeros((len(positions), 4), dtype=np.uint16); joints[:, 0] = chest_slot
    weights = np.zeros((len(positions), 4), dtype=np.float32); weights[:, 0] = 1
    primitive = {
        "attributes": {
            "POSITION": app.accessor(positions, "VEC3", 5126, 34962, True),
            "NORMAL": app.accessor(normals, "VEC3", 5126, 34962),
            "TEXCOORD_0": app.accessor(uvs, "VEC2", 5126, 34962),
            "JOINTS_0": app.accessor(joints, "VEC4", 5123, 34962),
            "WEIGHTS_0": app.accessor(weights, "VEC4", 5126, 34962),
        },
        "indices": app.accessor(indices, "SCALAR", 5123, 34963),
        "material": wing_material,
        "mode": 4,
        "extras": {
            "ggdAttachment": "azazel-small-bat-wings",
            "binding": "100%-rigid-to-Bip01-Spine1",
            "jointSlot": chest_slot,
            "visualReference": "owner-provided Azazel figure photo; appearance guidance only",
        },
    }
    document["meshes"][0]["primitives"].append(primitive)
    extras = document.setdefault("extras", {})
    extras["ggdAppearanceRevision"] = {
        "id": WORKFLOW_ID,
        "scope": "approved Azazel derivative only",
        "bodyAtlas": "approved brown/dark-brown recolour retained and resized 512 to 256",
        "attachment": "small deep-burgundy/violet bat wings",
        "attachmentJoint": "Bip01 Spine1",
        "sourceCandidateRetained": True,
        "targetCharacterNativeMotion": False,
    }
    result = pack_glb(document, bytes(app.binary))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result)
    receipt = {
        "schema": "ggd.approved-azazel-wings-build@1",
        "workflowId": WORKFLOW_ID,
        "source": {"path": str(source.resolve()), "gitPath": SOURCE_REL.as_posix(), "sha256": SOURCE_SHA256, "bytes": len(source_bytes)},
        "output": {"path": str(output.resolve()), "sha256": digest(result), "bytes": len(result)},
        "preservation": {
            "sourceCandidateRetained": True,
            "sourceBodyGeometryAccessorCount": len(original.get("accessors", [])),
            "sourceAnimationsRetained": [a.get("name") for a in original.get("animations", [])],
            "sourceSkeletonRetained": True,
            "bodyAtlas": body_receipt,
        },
        "wings": {
            "triangles": len(indices) // 3, "vertices": len(positions), "drawPrimitivesAdded": 1,
            "binding": {"skin": 0, "jointSlot": chest_slot, "jointNode": document["skins"][0]["joints"][chest_slot], "jointName": "Bip01 Spine1", "weight": 1.0},
            "texture": wing_texture_receipt,
            "material": {"doubleSided": True, "metallicFactor": 0, "roughnessFactor": 0.82},
        },
        "claims": {"converted": True, "validated": False, "registered": False, "selectable": False, "deployed": False},
    }
    receipt_path = output.with_suffix(".build.json")
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / SOURCE_REL)
    parser.add_argument("--output", type=Path, default=STAGE_DEFAULT / "azazel-wings-v1.glb")
    args = parser.parse_args()
    receipt = build(args.source.resolve(), args.output.resolve())
    print(json.dumps(receipt["output"], ensure_ascii=False))


if __name__ == "__main__":
    main()
