import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("inventory.py")
SPEC = importlib.util.spec_from_file_location("jstars_owner_archive_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class InventoryTests(unittest.TestCase):
    def test_parse_7z_slt_is_sorted_later_and_preserves_spaces(self):
        text = """7-Zip output
----------
Path = disc image.iso
Size = 123
Packed Size = 100
CRC = ABCDEF12

Path = folder/
Folder = +
"""
        rows = MODULE.parse_7z_slt(text)
        self.assertEqual(rows[0]["path"], "disc image.iso")
        self.assertEqual(rows[0]["bytes"], 123)
        self.assertEqual(rows[0]["crc32"], "ABCDEF12")
        self.assertTrue(rows[1]["folder"])

    def test_detect_ps3_plus_identity_from_structure(self):
        identity = MODULE.detect_identity(
            ["PS3_DISC.SFB", "PS3_GAME/PARAM.SFO", "PS3_GAME/USRDIR/data.bin"],
            "J-Stars Victory Vs+.7z",
        )
        self.assertEqual(identity["platform"], "PS3")
        self.assertEqual(identity["edition"], "VS+")

    def test_collect_character_container_tokens_without_claiming_identity(self):
        rows = MODULE.character_tokens([
            "data/character_model_018_i.pak",
            "data/character_motion_018_run.pak",
            "data/chr0300/voice/battle.awb",
        ])
        self.assertEqual([row["token"] for row in rows], ["018", "0300"])
        self.assertEqual(rows[0]["assetKinds"], ["model", "motion"])
        self.assertEqual(rows[0]["identityStatus"], "native-token-observed-character-identity-not-yet-proven")
        self.assertEqual(rows[1]["assetKinds"], ["voice"])

    def test_blocked_receipt_is_deterministic_and_has_rerun_cli(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "receipt.json"
            attempted = ["/missing/J-Stars Victory Vs+.7z"]
            tools = {"sevenZip": None, "bsdtar": "/usr/bin/bsdtar"}
            first = MODULE.blocked_receipt(attempted, output, tools)
            second = MODULE.blocked_receipt(attempted, output, tools)
            self.assertEqual(MODULE.serialize(first), MODULE.serialize(second))
            self.assertEqual(first["status"], "blocked-archive-not-found")
            self.assertIn("--archive", first["rerunCommand"])
            self.assertFalse(first["safety"]["fullArchiveExtracted"])

    def test_explicit_archive_must_be_absolute(self):
        with self.assertRaisesRegex(ValueError, "absolute path"):
            MODULE.discover_archive(Path("relative.7z"), [], 2)

    def test_bundled_seven_zip_is_considered_when_path_has_none(self):
        tools = MODULE.discover_tools()
        if Path("/Applications/Parallels Desktop.app/Contents/MacOS/7z").is_file():
            self.assertEqual(tools["sevenZip"], "/Applications/Parallels Desktop.app/Contents/MacOS/7z")

    def test_parse_param_sfo_reads_string_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "PARAM.SFO"
            keys = b"TITLE_ID\0"
            value = b"BLUS31519\0"
            header = b"\0PSF" + struct.pack("<IIII", 0x101, 36, 48, 1)
            entry = struct.pack("<HHIII", 0, 0x0204, len(value), len(value), 0)
            path.write_bytes(header + entry + keys + b"\0" * 3 + value)
            self.assertEqual(MODULE.parse_param_sfo(path)["values"]["TITLE_ID"], "BLUS31519")


if __name__ == "__main__":
    unittest.main()
