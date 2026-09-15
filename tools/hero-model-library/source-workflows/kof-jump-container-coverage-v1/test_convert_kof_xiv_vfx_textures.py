import struct
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert_kof_xiv_vfx_textures import dds_metrics, png_metrics


class TextureMetricsTest(unittest.TestCase):
    def test_dds_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.dds"
            raw = bytearray(128)
            raw[:4] = b"DDS "
            struct.pack_into("<II", raw, 12, 64, 128)
            raw[84:88] = b"DXT5"
            path.write_bytes(raw)
            self.assertEqual(dds_metrics(path), {"width": 128, "height": 64, "fourCC": "DXT5", "dxgiFormat": None})

    def test_png_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.png"
            raw = bytearray(26)
            raw[:8] = b"\x89PNG\r\n\x1a\n"
            struct.pack_into(">II", raw, 16, 256, 128)
            raw[25] = 6
            path.write_bytes(raw)
            self.assertEqual(png_metrics(path), {"width": 256, "height": 128, "channels": 4})


if __name__ == "__main__":
    unittest.main()
