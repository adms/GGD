#!/usr/bin/env python3
"""Build Azazel wings v2 with a reference-derived closed-eye face atlas.

The source is the existing independent Azazel derivative. Body geometry, skin,
skeleton and five borrowed source animations remain byte-for-byte at accessor
level. The 512px body atlas is deterministically recomposed from the owner
reference: the two closed-eye/brow crops are colour-matched, scaled and pasted
onto the actual face UV islands; head-weighted brown hair becomes orange and
spine-weighted brown torso pixels become skin colour. The result is resized to
the 256px cap before the same chest-bound bat-wing primitive is appended.
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
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[4]
SOURCE_REL = Path("content/assets/models/community/7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2.glb")
SOURCE_SHA256 = "7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2"
WORKFLOW_ID = "approved-derivative-azazel-wings-v2"
STAGE_DEFAULT = ROOT.parent / "GGD-Asset-Library/conversions" / WORKFLOW_ID
REFERENCE = ROOT.parent / "GGD-Asset-Library/references/approved-derivative-azazel-wings-v1/owner-appearance-reference.png"


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


def accessor(document: dict, binary: bytes, index: int) -> np.ndarray:
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    offset = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[item["type"]]
    dtype = {5121: np.dtype("u1"), 5123: np.dtype("<u2"), 5125: np.dtype("<u4"), 5126: np.dtype("<f4")}[item["componentType"]]
    return np.frombuffer(binary, dtype=dtype, count=item["count"] * width, offset=offset).reshape(item["count"], width)


def weighted_uv_mask(document: dict, binary: bytes, joint_names: set[str], threshold: float) -> Image.Image:
    primitive = document["meshes"][0]["primitives"][0]
    uvs = accessor(document, binary, primitive["attributes"]["TEXCOORD_0"])
    joints = accessor(document, binary, primitive["attributes"]["JOINTS_0"])
    weights = accessor(document, binary, primitive["attributes"]["WEIGHTS_0"])
    indices = accessor(document, binary, primitive["indices"]).reshape(-1, 3)
    skin_names = [document["nodes"][node].get("name", "") for node in document["skins"][0]["joints"]]
    slots = {index for index, name in enumerate(skin_names) if name in joint_names}
    if not slots:
        raise ValueError(f"joint names missing: {sorted(joint_names)}")
    influence = np.zeros(len(joints), dtype=np.float32)
    for column in range(joints.shape[1]):
        influence += weights[:, column] * np.isin(joints[:, column], list(slots))
    mask = Image.new("L", (512, 512), 0)
    draw = ImageDraw.Draw(mask)
    for triangle in indices:
        if float(influence[triangle].mean()) < threshold:
            continue
        points = [(float(uvs[index, 0] * 511), float((1 - uvs[index, 1]) * 511)) for index in triangle]
        draw.polygon(points, fill=255)
    return mask


def top_scalp_uv_mask(document: dict, binary: bytes) -> Image.Image:
    primitive = document["meshes"][0]["primitives"][0]
    positions = accessor(document, binary, primitive["attributes"]["POSITION"])
    uvs = accessor(document, binary, primitive["attributes"]["TEXCOORD_0"])
    joints = accessor(document, binary, primitive["attributes"]["JOINTS_0"])
    weights = accessor(document, binary, primitive["attributes"]["WEIGHTS_0"])
    indices = accessor(document, binary, primitive["indices"]).reshape(-1, 3)
    names = [document["nodes"][node].get("name", "") for node in document["skins"][0]["joints"]]
    head_slot = names.index("Bip01 Head")
    influence = np.zeros(len(joints), dtype=np.float32)
    for column in range(joints.shape[1]):
        influence += weights[:, column] * (joints[:, column] == head_slot)
    mask = Image.new("L", (512, 512), 0)
    draw = ImageDraw.Draw(mask)
    for triangle in indices:
        # Use the triangle's highest vertex so long scalp strips crossing the
        # crown boundary are included.  The rear scalp island sits slightly
        # lower in bind space, so include upper rear-facing head triangles too.
        is_crown = float(positions[triangle, 1].max()) >= 0.545
        is_upper_rear = (
            float(positions[triangle, 2].mean()) < 0.0
            and float(positions[triangle, 1].max()) >= 0.48
        )
        if float(influence[triangle].mean()) < 0.50 or not (is_crown or is_upper_rear):
            continue
        points = [(float(uvs[index, 0] * 511), float((1 - uvs[index, 1]) * 511)) for index in triangle]
        draw.polygon(points, fill=255)
    return mask


def force_orange_scalp(image: Image.Image, mask: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    selected = (np.asarray(mask) > 0) & (pixels.sum(axis=2) > 24)
    luminance = 0.299 * pixels[:, :, 0] + 0.587 * pixels[:, :, 1] + 0.114 * pixels[:, :, 2]
    shade = np.clip(luminance / 105.0, 0.92, 1.10)
    for channel, value in enumerate((220, 84, 34)):
        pixels[:, :, channel][selected] = np.clip(value * shade[selected], 0, 255)
    return Image.fromarray(pixels.astype(np.uint8), "RGB")


def recolour_weighted_region(image: Image.Image, mask: Image.Image, base: tuple[int, int, int], kind: str) -> Image.Image:
    pixels = np.asarray(image).copy()
    region = np.asarray(mask) > 0
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    if kind == "hair":
        # Hair pixels are the darker brown part of the shared head atlas.  The
        # prior broad rectangular exclusions protected skin but also preserved
        # a visible brown scalp cap.  A luminance gate keeps the brighter face
        # skin intact while recolouring every dark hair island consistently.
        brown = region & (red >= 30) & (red <= 195) & (green >= 12) & (green <= 135) & (blue <= 110) & (luminance < 130) & (red > green * 1.08)
    else:
        brown = region & (red >= 38) & (red <= 185) & (green >= 18) & (green <= 130) & (blue <= 105) & (red > green * 1.12)
    # Eyes, outlines, bell and empty black atlas pixels are excluded by the
    # chroma/luminance gate. Shading from the source atlas is retained.
    denominator = 92.0 if kind == "hair" else 105.0
    shade = (
        np.clip(luminance / denominator, 0.90, 1.15)
        if kind == "hair"
        else np.clip(luminance / denominator, 0.58, 1.28)
    )
    for channel, value in enumerate(base):
        pixels[:, :, channel][brown] = np.clip(value * shade[brown], 0, 255).astype(np.uint8)
    return Image.fromarray(pixels, "RGB")


def colour_match_crop(crop: Image.Image, target: Image.Image) -> Image.Image:
    source = np.asarray(crop.convert("RGB"), dtype=np.float32)
    destination = np.asarray(target.convert("RGB"), dtype=np.float32)
    source_skin = (source[:, :, 0] > 135) & (source[:, :, 1] > 75) & (source[:, :, 2] > 45)
    target_skin = (destination[:, :, 0] > 115) & (destination[:, :, 1] > 65) & (destination[:, :, 2] > 35)
    source_mean = source[source_skin].mean(axis=0)
    target_mean = destination[target_skin].mean(axis=0)
    adjusted = np.clip(source * (target_mean / np.maximum(source_mean, 1)), 0, 255).astype(np.uint8)
    return Image.fromarray(adjusted, "RGB")


def paste_reference_eye(atlas: Image.Image, reference: Image.Image, source_box: tuple[int, int, int, int], target_box: tuple[int, int, int, int]) -> tuple[Image.Image, bytes]:
    crop = reference.crop(source_box).convert("RGB")
    size = (target_box[2] - target_box[0], target_box[3] - target_box[1])
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    crop = colour_match_crop(crop, atlas.crop(target_box))
    feather = Image.new("L", size, 0)
    ImageDraw.Draw(feather).rounded_rectangle((3, 3, size[0] - 4, size[1] - 4), radius=10, fill=255)
    feather = feather.filter(ImageFilter.GaussianBlur(3.0))
    result = atlas.copy()
    result.paste(crop, target_box[:2], feather)
    return result, png(crop)


def split_material_indices(document: dict, binary: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    primitive = document["meshes"][0]["primitives"][0]
    joints = accessor(document, binary, primitive["attributes"]["JOINTS_0"])
    weights = accessor(document, binary, primitive["attributes"]["WEIGHTS_0"])
    triangles = accessor(document, binary, primitive["indices"]).reshape(-1, 3)
    names = [document["nodes"][node].get("name", "") for node in document["skins"][0]["joints"]]
    head_slot = names.index("Bip01 Head")
    pelvis_slot = names.index("Bip01 Pelvis")
    head_influence = np.zeros(len(joints), dtype=np.float32)
    pelvis_influence = np.zeros(len(joints), dtype=np.float32)
    for column in range(joints.shape[1]):
        head_influence += weights[:, column] * (joints[:, column] == head_slot)
        pelvis_influence += weights[:, column] * (joints[:, column] == pelvis_slot)
    is_head = np.asarray([float(head_influence[triangle].mean()) >= 0.50 for triangle in triangles])
    is_pants = np.asarray([
        not is_head[index] and float(pelvis_influence[triangle].mean()) >= 0.34
        for index, triangle in enumerate(triangles)
    ])
    head = triangles[is_head].reshape(-1)
    pants = triangles[is_pants].reshape(-1)
    body = triangles[~is_head & ~is_pants].reshape(-1)
    if len(head) == 0 or len(body) == 0 or len(pants) == 0 or len(head) + len(body) + len(pants) != triangles.size:
        raise ValueError("failed to partition head/body/pants triangles")
    return body.astype(np.uint16), head.astype(np.uint16), pants.astype(np.uint16)


def orange_hair_uvs(document: dict, binary: bytes) -> tuple[np.ndarray, dict]:
    """Pin the two connected hair shells to one verified orange atlas texel.

    The source reuses a face/eye UV island on the rear crown, so atlas-only
    recolouring cannot fix the brown patch without damaging the face.
    """
    primitive = document["meshes"][0]["primitives"][0]
    triangles = accessor(document, binary, primitive["indices"]).reshape(-1, 3)
    uvs = accessor(document, binary, primitive["attributes"]["TEXCOORD_0"]).copy()
    parent = list(range(len(uvs)))
    def find(value: int) -> int:
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value
    def union(left: int, right: int) -> None:
        left, right = find(left), find(right)
        if left != right:
            parent[right] = left
    for triangle in triangles:
        union(int(triangle[0]), int(triangle[1]))
        union(int(triangle[0]), int(triangle[2]))
    groups: dict[int, list[np.ndarray]] = {}
    for triangle in triangles:
        groups.setdefault(find(int(triangle[0])), []).append(triangle)
    ranked = sorted(groups.values(), key=len, reverse=True)
    counts = [len(group) for group in ranked[:2]]
    if counts != [876, 846]:
        raise ValueError(f"unexpected Azazel hair shell topology: {counts}")
    vertices = sorted({int(vertex) for group in ranked[:2] for triangle in group for vertex in triangle})
    uvs[vertices] = (0.10, 0.90)
    return uvs.astype(np.float32), {
        "method": "two-largest-connected-hair-shell UV pin",
        "triangleCounts": counts,
        "vertexCount": len(vertices),
        "orangeAtlasUv": [0.10, 0.90],
    }


def dark_brown_pants_atlas(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    luminance = 0.299 * pixels[:, :, 0] + 0.587 * pixels[:, :, 1] + 0.114 * pixels[:, :, 2]
    visible = pixels.sum(axis=2) > 24
    shade = np.clip(luminance / 120.0, 0.55, 1.25)
    result = pixels.copy()
    for channel, value in enumerate((78, 38, 27)):
        result[:, :, channel][visible] = np.clip(value * shade[visible], 0, 255)
    return Image.fromarray(result.astype(np.uint8), "RGB")


def body_atlas(document: dict, binary: bytes) -> tuple[bytes, bytes, bytes, dict, dict[str, bytes]]:
    image = document["images"][0]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    source = binary[start:start + view["byteLength"]]
    decoded = Image.open(BytesIO(source)).convert("RGB")
    if decoded.size != (512, 512):
        raise ValueError(f"unexpected approved atlas size {decoded.size}")
    reference = Image.open(REFERENCE).convert("RGB")
    if reference.size != (550, 825):
        raise ValueError(f"unexpected owner reference size {reference.size}")
    head_mask = weighted_uv_mask(document, binary, {"Bip01 Head"}, 0.50)
    scalp_mask = top_scalp_uv_mask(document, binary)
    torso_mask = weighted_uv_mask(document, binary, {"Bip01 Spine", "Bip01 Spine1"}, 0.34)
    torso_surface_mask = Image.new("L", (512, 512), 0)
    torso_draw = ImageDraw.Draw(torso_surface_mask)
    torso_draw.rectangle((0, 0, 208, 170), fill=255)
    torso_draw.rectangle((208, 0, 380, 64), fill=255)
    torso_draw.rectangle((0, 238, 442, 394), fill=255)
    body_composed = recolour_weighted_region(decoded, torso_mask, (224, 157, 108), "torso")
    body_composed = recolour_weighted_region(body_composed, torso_surface_mask, (224, 157, 108), "torso")
    full_head_material_mask = Image.new("L", (512, 512), 255)
    head_composed = recolour_weighted_region(decoded, full_head_material_mask, (220, 84, 34), "hair")
    head_composed = force_orange_scalp(head_composed, scalp_mask)
    # Reference crops contain the actual closed eye and brow strokes. They are
    # colour-matched and feathered over the two eye UV islands; no freehand eye
    # drawing is used.
    head_composed, left_crop = paste_reference_eye(head_composed, reference, (188, 232, 235, 273), (433, 70, 509, 146))
    head_composed, right_crop = paste_reference_eye(head_composed, reference, (261, 235, 309, 278), (296, 211, 376, 296))
    body_resized = body_composed.resize((256, 256), Image.Resampling.LANCZOS)
    head_resized = head_composed.resize((256, 256), Image.Resampling.LANCZOS)
    pants_resized = dark_brown_pants_atlas(decoded).resize((256, 256), Image.Resampling.LANCZOS)
    body_result = png(body_resized)
    head_result = png(head_resized)
    pants_result = png(pants_resized)
    receipt = {
        "sourceSha256": digest(source), "sourceSize": list(decoded.size),
        "bodyOutputSha256": digest(body_result), "headOutputSha256": digest(head_result),
        "pantsOutputSha256": digest(pants_result),
        "outputSize": list(body_resized.size),
        "reference": {"path": str(REFERENCE.resolve()), "sha256": digest(REFERENCE.read_bytes()), "size": list(reference.size)},
        "operations": [
            "head-joint UV mask brown-to-orange recolour with source shading retained",
            "spine-joint UV mask brown-to-skin recolour with source shading retained",
            "owner-reference closed-eye/brow crops colour-matched, scaled and feather-composited onto two eye UV islands",
            "Pillow Lanczos 512-to-256 resize",
        ],
        "cropBoxes": {
            "referenceLeft": [188, 232, 235, 273], "atlasLeft": [433, 70, 509, 146],
            "referenceRight": [261, 235, 309, 278], "atlasRight": [296, 211, 376, 296],
        },
    }
    audit = {
        "source-atlas.png": png(decoded), "body-atlas-512.png": png(body_composed),
        "head-atlas-512.png": png(head_composed), "body-atlas-256.png": body_result,
        "head-atlas-256.png": head_result, "pants-atlas-256.png": pants_result,
        "reference-left-eye.png": left_crop,
        "reference-right-eye.png": right_crop, "head-uv-mask.png": png(head_mask),
        "torso-uv-mask.png": png(torso_mask),
        "top-scalp-uv-mask.png": png(scalp_mask),
    }
    return body_result, head_result, pants_result, receipt, audit


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

    body_png, head_png, pants_png, body_receipt, atlas_audit = body_atlas(document, original_binary)
    body_indices, head_indices, pants_indices = split_material_indices(document, original_binary)
    hair_uvs, hair_uv_receipt = orange_hair_uvs(document, original_binary)
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
    document["images"][0].update(mimeType="image/png", name="Azazel owner-reference face and colour atlas v2 256")

    head_image_view = app.view(head_png)
    head_image = len(document["images"])
    document["images"].append({"bufferView": head_image_view, "mimeType": "image/png", "name": "Azazel orange-hair closed-eye head atlas v2 256"})
    head_texture = len(document.setdefault("textures", []))
    head_texture_entry = {"source": head_image, "name": "Azazel owner-reference head texture v2"}
    if "sampler" in document["textures"][0]:
        head_texture_entry["sampler"] = document["textures"][0]["sampler"]
    document["textures"].append(head_texture_entry)
    head_material = len(document.setdefault("materials", []))
    original_material = deepcopy(document["materials"][document["meshes"][0]["primitives"][0].get("material", 0)])
    original_material["name"] = "Azazel orange-hair closed-eye head v2"
    original_material.setdefault("pbrMetallicRoughness", {})["baseColorTexture"] = {"index": head_texture}
    # The face shell reaches behind the hair cap. Rendering it two-sided made
    # its inner skin surface appear as a brown patch on the crown/back.
    original_material["doubleSided"] = False
    document["materials"].append(original_material)

    pants_image_view = app.view(pants_png)
    pants_image = len(document["images"])
    document["images"].append({"bufferView": pants_image_view, "mimeType": "image/png", "name": "Azazel deep-brown pants atlas v2 256"})
    pants_texture = len(document.setdefault("textures", []))
    pants_texture_entry = {"source": pants_image, "name": "Azazel deep-brown pants texture v2"}
    if "sampler" in document["textures"][0]:
        pants_texture_entry["sampler"] = document["textures"][0]["sampler"]
    document["textures"].append(pants_texture_entry)
    pants_material = len(document.setdefault("materials", []))
    pants_material_entry = deepcopy(document["materials"][body_primitive_material := document["meshes"][0]["primitives"][0].get("material", 0)])
    pants_material_entry["name"] = "Azazel deep-brown pelvis pants v2"
    pants_material_entry.setdefault("pbrMetallicRoughness", {})["baseColorTexture"] = {"index": pants_texture}
    document["materials"].append(pants_material_entry)

    body_primitive = document["meshes"][0]["primitives"][0]
    source_indices = body_primitive["indices"]
    body_primitive["indices"] = app.accessor(body_indices, "SCALAR", 5123, 34963)
    head_primitive = deepcopy(body_primitive)
    head_primitive["indices"] = app.accessor(head_indices, "SCALAR", 5123, 34963)
    head_primitive["attributes"]["TEXCOORD_0"] = app.accessor(hair_uvs, "VEC2", 5126, 34962)
    head_primitive["material"] = head_material
    head_primitive["extras"] = {
        "ggdMaterialSplit": "head-by-Bip01-Head-majority-weight",
        "sourceIndicesAccessor": source_indices,
        "geometryChanged": False,
    }
    document["meshes"][0]["primitives"].append(head_primitive)
    pants_primitive = deepcopy(body_primitive)
    pants_primitive["indices"] = app.accessor(pants_indices, "SCALAR", 5123, 34963)
    pants_primitive["material"] = pants_material
    pants_primitive["extras"] = {
        "ggdMaterialSplit": "pants-by-Bip01-Pelvis-majority-weight",
        "sourceIndicesAccessor": source_indices,
        "geometryChanged": False,
    }
    document["meshes"][0]["primitives"].append(pants_primitive)

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
        "bodyAtlas": "owner-reference cropped closed-eye face; orange hair; skin torso; dark-brown lower body; resized 512 to 256",
        "attachment": "small deep-burgundy/violet bat wings",
        "attachmentJoint": "Bip01 Spine1",
        "materialSplit": "source triangles partitioned into body/head/pants primitives by Bip01 Head/Pelvis majority weight; union unchanged",
        "hairUvRepair": hair_uv_receipt,
        "sourceCandidateRetained": True,
        "targetCharacterNativeMotion": False,
    }
    result = pack_glb(document, bytes(app.binary))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result)
    audit_root = output.parent / "atlas-audit-v13"
    audit_root.mkdir(parents=True, exist_ok=True)
    for name, data in atlas_audit.items():
        path = audit_root / name
        if path.is_file() and path.read_bytes() != data:
            raise ValueError(f"refusing to overwrite changed atlas audit artifact: {path}")
        path.write_bytes(data)
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
            "trianglePartition": {
                "sourceIndexAccessor": source_indices,
                "sourceTriangles": (len(body_indices) + len(head_indices) + len(pants_indices)) // 3,
                "bodyTriangles": len(body_indices) // 3,
                "headTriangles": len(head_indices) // 3,
                "pantsTriangles": len(pants_indices) // 3,
                "unionPreserved": True,
            },
            "atlasAudit": {
                name: {"path": str((audit_root / name).resolve()), "bytes": len(data), "sha256": digest(data)}
                for name, data in sorted(atlas_audit.items())
            },
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
    parser.add_argument("--output", type=Path, default=STAGE_DEFAULT / "azazel-wings-v2.glb")
    args = parser.parse_args()
    receipt = build(args.source.resolve(), args.output.resolve())
    print(json.dumps(receipt["output"], ensure_ascii=False))


if __name__ == "__main__":
    main()
