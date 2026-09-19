import importlib.util
import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("publish_candidates.py")
SPEC = importlib.util.spec_from_file_location("publish_candidates", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def png(width, height):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\0" + b"\xff\x00\xff\xff" * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def glb(image):
    binary = image + b"\0" * ((-len(image)) % 4)
    document = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(image)},
            {"buffer": 0, "byteOffset": len(binary), "byteLength": 6},
        ],
        "accessors": [{"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"}],
        "images": [{"bufferView": 0, "mimeType": "image/png"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 0}]}],
        "skins": [{}],
    }
    # The metric parser never reads the index buffer; append enough bytes and
    # correct the binary buffer/view after the image padding.
    binary += b"\0" * 8
    document["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(encoded), b"JSON")
        + encoded
        + struct.pack("<I4s", len(binary), b"BIN\0")
        + binary
    )


class PublishCandidatesTests(unittest.TestCase):
    def test_glb_metrics_reads_embedded_png_and_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.glb"
            path.write_bytes(glb(png(128, 64)))
            self.assertEqual(
                MODULE.glb_metrics(path),
                {
                    "triangleCount": 1,
                    "meshCount": 1,
                    "skinnedPrimitiveCount": 1,
                    "embeddedImageCount": 1,
                    "maxTextureDimension": 128,
                    "skinCount": 1,
                    "animationCount": 0,
                },
            )

    def test_copy_verified_rejects_wrong_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            destination = Path(directory) / "destination"
            source.write_bytes(b"candidate")
            with self.assertRaises(ValueError):
                MODULE.copy_verified(source, destination, "0" * 64)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
