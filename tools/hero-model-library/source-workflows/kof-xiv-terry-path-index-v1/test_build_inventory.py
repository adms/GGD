import importlib.util
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof_xiv_terry", HERE / "build_inventory.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)
EXTRACT_SPEC = importlib.util.spec_from_file_location("kof_xiv_terry_extract", HERE / "extract.py")
EXTRACT = importlib.util.module_from_spec(EXTRACT_SPEC)
assert EXTRACT_SPEC.loader is not None
EXTRACT_SPEC.loader.exec_module(EXTRACT)


class TerryPathInventoryTest(unittest.TestCase):
    def test_asset_classification_keeps_runtime_semantics_pending(self):
        cases = {
            "Chara/TRY/TRY.obac": ("model", "character-body-container"),
            "Chara/TRY/P01_CAP.obac": ("model", "character-accessory-container"),
            "Chara/TRY/TRY.otra": ("animation", "native-animation-container"),
            "Chara/TRY/TRY.omir": ("skeleton", "native-rig-or-skin-metadata"),
            "Chara/TRY/TRY_COL_SKIN.dds": ("texture", "character-material-texture"),
            "Chara/TRY/Effect/0800_Geyser_Shell.eff": ("vfx", "native-effect-record-or-dependency"),
            "Chara/TRY/Effect/TRY_Geyser_Shell.obac": ("vfx", "native-effect-mesh-container"),
            "Chara/TRY/Sound/voice/v_006_try_001_1.ogg": ("voice", "native-character-directory-voice-pending-listening-review"),
            "Chara/TRY/Sound/se/s_006_101_pw.ogg": ("sound-effect", "native-character-directory-sfx-pending-listening-review"),
        }
        for path, expected in cases.items():
            with self.subTest(path=path):
                self.assertEqual(MODULE.classify(path), expected)

    def test_listing_metadata_hash_is_not_payload_hash(self):
        rows = MODULE.parse_listing(
            "  0000000000000010 12 Chara/TRY/TRY.obac\n"
            "  0000000000000020 34 Chara/TRY/Sound/voice/v_006_try_001.ogg\n"
        )
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0]["payloadPresent"])
        self.assertIn("unavailable", rows[0]["payloadSha256State"])
        self.assertEqual(len(rows[0]["indexEvidenceSha256"]), 64)

    def test_rejects_unsafe_paths(self):
        original = MODULE.ROW_RE
        try:
            MODULE.ROW_RE = __import__("re").compile(r"^  ([0-9a-fA-F]{16}) +(\d+) +(Chara/TRY/.*)$")
            # The strict TRY prefix makes an absolute path impossible; a parent
            # segment still exercises the PurePosixPath safety gate.
            with self.assertRaises(ValueError):
                MODULE.parse_listing("  0000000000000001 1 Chara/TRY/../BAD.obac\n")
        finally:
            MODULE.ROW_RE = original

    def test_extraction_freeze_requires_exact_path_set_and_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "Chara/TRY/TRY.obac"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"body")
            indexed = {
                "Chara/TRY/TRY.obac": {
                    "listedBytes": 4,
                    "assetKind": "model",
                    "resourceRole": "character-body-container",
                }
            }
            frozen = EXTRACT.freeze_extracted(root, indexed)
            self.assertEqual(frozen[0]["bytes"], 4)
            self.assertEqual(len(frozen[0]["sha256"]), 64)
            (root / "unexpected.bin").write_bytes(b"x")
            with self.assertRaises(ValueError):
                EXTRACT.freeze_extracted(root, indexed)


if __name__ == "__main__":
    unittest.main()
