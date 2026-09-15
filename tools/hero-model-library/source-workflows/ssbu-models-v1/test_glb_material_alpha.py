#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest

from PIL import Image


MODULE_PATH = Path(__file__).with_name("glb_material_alpha.py")
SPEC = importlib.util.spec_from_file_location("ggd_ssbu_glb_material_alpha", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def write_fixture(path: Path) -> None:
    document = {
        "asset": {"version": "2.0"},
        "materials": [
            {"name": "EyeL", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
            {"name": "OpaqueSkin", "pbrMetallicRoughness": {"baseColorTexture": {"index": 1}}},
            {"name": "NativeBlend", "alphaMode": "BLEND", "pbrMetallicRoughness": {"baseColorTexture": {"index": 2}}},
            {"name": "MaskedHair", "alphaMode": "MASK", "alphaCutoff": 0.4, "pbrMetallicRoughness": {"baseColorTexture": {"index": 3}}},
        ],
    }
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * ((4 - len(payload) % 4) % 4)
    binary = b"\0\0\0\0"
    raw = bytearray(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(payload) + 8 + len(binary)))
    raw.extend(struct.pack("<II", len(payload), 0x4E4F534A))
    raw.extend(payload)
    raw.extend(struct.pack("<II", len(binary), 0x004E4942))
    raw.extend(binary)
    path.write_bytes(raw)


def read_document(path: Path) -> dict:
    raw = path.read_bytes()
    length, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A
    return json.loads(raw[20 : 20 + length].decode().rstrip(" \0"))


class GlbMaterialAlphaTest(unittest.TestCase):
    def test_alpha_masked_colour_mix_is_baked_opaque(self) -> None:
        baked = MODULE.composite_alpha_masked_colors(
            [0.2, 0.4, 0.6, 0.25, 0.1, 0.3, 0.5, 0.0],
            [1.0, 0.5, 0.0, 0.25, 0.9, 0.7, 0.5, 1.0],
        )
        self.assertEqual(
            baked,
            [0.4, 0.42500000000000004, 0.44999999999999996, 1.0, 0.9, 0.7, 0.5, 1.0],
        )
        with self.assertRaisesRegex(ValueError, "equally sized RGBA"):
            MODULE.composite_alpha_masked_colors([0.0] * 4, [0.0] * 8)

    def test_source_policy_requires_both_author_signal_and_alpha(self) -> None:
        self.assertTrue(MODULE.should_promote_source_material("DITHERED", 0.0, 1))
        self.assertTrue(MODULE.should_promote_source_material("BLENDED", 254 / 255, 1))
        self.assertFalse(MODULE.should_promote_source_material("OPAQUE", 0.0, 1))
        self.assertFalse(MODULE.should_promote_source_material("DITHERED", 1.0, 1))
        self.assertFalse(MODULE.should_promote_source_material("DITHERED", 0.0, 2))

    def test_only_authorized_opaque_material_is_promoted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "fixture.glb"
            write_fixture(path)
            adjustments = MODULE.promote_transparent_base_color_materials(
                path, {"EyeL", "NativeBlend", "MaskedHair"}
            )
            document = read_document(path)
        modes = {
            material["name"]: material.get("alphaMode", "OPAQUE")
            for material in document["materials"]
        }
        self.assertEqual(
            modes,
            {
                "EyeL": "BLEND",
                "OpaqueSkin": "OPAQUE",
                "NativeBlend": "BLEND",
                "MaskedHair": "MASK",
            },
        )
        self.assertEqual(
            adjustments,
            [
                {
                    "material": "EyeL",
                    "property": "glTF alphaMode",
                    "sourceValue": "OPAQUE",
                    "exportValue": "BLEND",
                    "reason": (
                        "The source material requests transparent rendering and its "
                        "unambiguous base-colour image contains non-opaque alpha."
                    ),
                }
            ],
        )

    def test_shared_atlas_gets_rgb_identical_opaque_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "atlas.glb"
            image = Image.new("RGBA", (2, 1))
            image.putdata([(12, 34, 56, 0), (78, 90, 123, 255)])
            encoded = tempfile.SpooledTemporaryFile()
            image.save(encoded, format="PNG")
            encoded.seek(0)
            binary = encoded.read()
            document = {
                "asset": {"version": "2.0"},
                "buffers": [{"byteLength": len(binary)}],
                "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(binary)}],
                "images": [{"bufferView": 0, "mimeType": "image/png", "name": "atlas0"}],
                "textures": [{"source": 0}],
                "materials": [
                    {"name": "solid", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
                    {"name": "hair", "alphaMode": "BLEND", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
                ],
            }
            payload = json.dumps(document, separators=(",", ":")).encode()
            payload += b" " * ((4 - len(payload) % 4) % 4)
            binary += b"\0" * ((4 - len(binary) % 4) % 4)
            raw = bytearray(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(payload) + 8 + len(binary)))
            raw.extend(struct.pack("<II", len(payload), 0x4E4F534A)); raw.extend(payload)
            raw.extend(struct.pack("<II", len(binary), 0x004E4942)); raw.extend(binary)
            path.write_bytes(raw)
            report = MODULE.separate_opaque_material_texture_alpha(path)
            raw = path.read_bytes()
            self.assertEqual(struct.unpack_from("<I", raw, 8)[0], len(raw))
            offset = 12
            while offset < len(raw):
                chunk_length, _ = struct.unpack_from("<II", raw, offset)
                self.assertEqual(chunk_length % 4, 0)
                offset += 8 + chunk_length
            self.assertEqual(offset, len(raw))
            magic, version, result, chunks = MODULE._load_glb(path)
            self.assertEqual((magic, version), (0x46546C67, 2))
            solid_texture = result["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
            blend_texture = result["materials"][1]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
            self.assertNotEqual(solid_texture, blend_texture)
            self.assertEqual(blend_texture, 0)
            opaque_image = result["images"][result["textures"][solid_texture]["source"]]
            view = result["bufferViews"][opaque_image["bufferView"]]
            blob = chunks[1][1][view["byteOffset"] : view["byteOffset"] + view["byteLength"]]
            decoded = Image.open(io.BytesIO(blob)).convert("RGBA")
            self.assertEqual([pixel[:3] for pixel in decoded.get_flattened_data()], [(12, 34, 56), (78, 90, 123)])
            self.assertEqual(decoded.getchannel("A").getextrema(), (255, 255))
            self.assertTrue(report[0]["rgbUnchanged"])
            audit = MODULE.audit_opaque_material_texture_alpha(path)
            self.assertTrue(audit["passed"])
            self.assertEqual(audit["opaqueTransparentBlockers"], [])

    def test_opaque_only_atlas_with_transparent_pixels_gets_opaque_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "opaque-only.glb"
            image = Image.new("RGBA", (1, 1), (21, 43, 65, 0))
            encoded = io.BytesIO()
            image.save(encoded, format="PNG")
            binary = encoded.getvalue()
            document = {
                "asset": {"version": "2.0"},
                "buffers": [{"byteLength": len(binary)}],
                "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(binary)}],
                "images": [{"bufferView": 0, "mimeType": "image/png", "name": "opaque-atlas"}],
                "textures": [{"source": 0}],
                "materials": [
                    {"name": "solid", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
                ],
            }
            payload = json.dumps(document, separators=(",", ":")).encode()
            payload += b" " * ((4 - len(payload) % 4) % 4)
            binary += b"\0" * ((4 - len(binary) % 4) % 4)
            raw = bytearray(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(payload) + 8 + len(binary)))
            raw.extend(struct.pack("<II", len(payload), 0x4E4F534A)); raw.extend(payload)
            raw.extend(struct.pack("<II", len(binary), 0x004E4942)); raw.extend(binary)
            path.write_bytes(raw)

            report = MODULE.separate_opaque_material_texture_alpha(path)
            audit = MODULE.audit_opaque_material_texture_alpha(path)
            _, _, result, chunks = MODULE._load_glb(path)
            texture_index = result["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
            image_record = result["images"][result["textures"][texture_index]["source"]]
            view = result["bufferViews"][image_record["bufferView"]]
            blob = chunks[1][1][view["byteOffset"] : view["byteOffset"] + view["byteLength"]]
            decoded = Image.open(io.BytesIO(blob)).convert("RGBA")

            self.assertEqual(report[0]["sourceModes"], ["OPAQUE"])
            self.assertEqual(decoded.getpixel((0, 0)), (21, 43, 65, 255))
            self.assertTrue(audit["passed"])
            self.assertEqual(audit["opaqueTransparentBlockers"], [])

    def test_explicit_near_identical_opaque_pair_shares_canonical_texture(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "near-identical.glb"
            encoded_images = []
            for pixels in (
                [(10, 20, 30, 255), (40, 50, 60, 255)],
                [(10, 20, 30, 255), (41, 50, 60, 255)],
            ):
                image = Image.new("RGBA", (2, 1))
                image.putdata(pixels)
                encoded = io.BytesIO()
                image.save(encoded, format="PNG")
                encoded_images.append(encoded.getvalue())
            binary = bytearray()
            views = []
            for encoded in encoded_images:
                binary.extend(b"\0" * ((4 - len(binary) % 4) % 4))
                views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(encoded)})
                binary.extend(encoded)
            logical_length = len(binary)
            binary.extend(b"\0" * ((4 - len(binary) % 4) % 4))
            document = {
                "asset": {"version": "2.0"},
                "buffers": [{"byteLength": logical_length}],
                "bufferViews": views,
                "images": [
                    {"bufferView": 0, "mimeType": "image/png", "name": "EyeL.ggd-opaque-base-color"},
                    {"bufferView": 1, "mimeType": "image/png", "name": "EyeR.ggd-opaque-base-color"},
                ],
                "samplers": [{"wrapS": 10497, "wrapT": 10497}],
                "textures": [{"source": 0, "sampler": 0}, {"source": 1, "sampler": 0}],
                "materials": [
                    {"name": "EyeL", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0, "texCoord": 1}}},
                    {"name": "EyeR", "pbrMetallicRoughness": {"baseColorTexture": {"index": 1, "texCoord": 1}}},
                ],
            }
            payload = json.dumps(document, separators=(",", ":")).encode()
            payload += b" " * ((4 - len(payload) % 4) % 4)
            raw = bytearray(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(payload) + 8 + len(binary)))
            raw.extend(struct.pack("<II", len(payload), 0x4E4F534A)); raw.extend(payload)
            raw.extend(struct.pack("<II", len(binary), 0x004E4942)); raw.extend(binary)
            path.write_bytes(raw)

            report = MODULE.deduplicate_near_identical_opaque_base_color_materials(
                path, [("EyeL", "EyeR")]
            )
            _, _, result, _ = MODULE._load_glb(path)
            left = result["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]
            right = result["materials"][1]["pbrMetallicRoughness"]["baseColorTexture"]

            self.assertEqual(left, right)
            self.assertEqual(report[0]["maximumRgbaChannelDifference"], 1)
            self.assertEqual(report[0]["changedPixelCount"], 1)
            self.assertTrue(report[0]["uvAndSamplerPreserved"])


if __name__ == "__main__":
    unittest.main()
