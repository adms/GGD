import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("catalog_dependency_assets", HERE / "catalog_dependency_assets.py")
CATALOG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CATALOG)


class DependencySupportCatalogTests(unittest.TestCase):
    def test_tga_inspection_fully_decodes_channels_and_alpha(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "mask.tga"
            Image.new("RGBA", (2, 2), (1, 2, 3, 127)).save(path)
            result, _preview = CATALOG.inspect_image(path)
        self.assertTrue(result["readable"])
        self.assertEqual((result["width"], result["height"]), (2, 2))
        self.assertEqual(result["channels"], 4)
        self.assertEqual(result["alpha"]["min"], 127)
        self.assertEqual(result["alpha"]["nonOpaquePixels"], 4)

    def test_flat_rgbe_payload_is_fully_decoded(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.hdr"
            path.write_bytes(
                b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n"
                + bytes((128, 64, 32, 129, 0, 0, 0, 0))
            )
            result, preview = CATALOG.parse_hdr(path)
        self.assertTrue(result["readable"])
        self.assertEqual((result["width"], result["height"]), (2, 1))
        self.assertEqual(result["channels"], 3)
        self.assertEqual(preview.size, (2, 1))
        self.assertGreater(result["valueRange"][1], 0)

    def test_semantic_group_uses_source_meaning_not_physical_channels(self):
        group, _reason = CATALOG.semantic_group(
            ["exported/T_Flowmap_Tk_00.tga"],
            ["/Game/Strash/VFX/Texture/Color/T_Flowmap_Tk_00"],
            ".tga",
        )
        self.assertEqual(group, "Flow")
        group, _reason = CATALOG.semantic_group(
            ["exported/T_ef_Mask00.tga"],
            ["/Game/Strash/VFX/Texture/Alpha/Mask/T_ef_Mask00"],
            ".tga",
        )
        self.assertEqual(group, "Alpha")


if __name__ == "__main__":
    unittest.main()
