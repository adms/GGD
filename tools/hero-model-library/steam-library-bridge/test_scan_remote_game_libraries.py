import json
import tempfile
import unittest
from pathlib import Path

from scan_remote_game_libraries import scan_roms, scan_steam


class RemoteGameLibraryScanTest(unittest.TestCase):
    def test_common_directory_inventory_keeps_priority_games(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "common"
            (root / "KOFXV").mkdir(parents=True)
            (root / "Other Game").mkdir()
            result = scan_steam(root)
            self.assertEqual([row["title"] for row in result["games"]], ["KOFXV", "Other Game"])
            self.assertTrue(result["games"][0]["prioritySource"])
            self.assertEqual(result["metrics"]["actualFileContentBytesRead"], 0)

    def test_common_directory_inventory_marks_palworld(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "common"
            (root / "Palworld").mkdir(parents=True)
            result = scan_steam(root)
            self.assertEqual(result["games"][0]["title"], "Palworld")
            self.assertTrue(result["games"][0]["prioritySource"])

    def test_rom_scan_uses_path_and_extension_without_reading_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Game"
            fate = root / "PSP" / "Fate unlimited codes.cso"
            smash = root / "Switch" / "Super Smash Bros Ultimate.xci"
            fate.parent.mkdir(parents=True)
            smash.parent.mkdir(parents=True)
            fate.write_bytes(b"not-a-real-rom")
            smash.write_bytes(b"not-a-real-rom")
            result = scan_roms(root)
            self.assertEqual(len(result["games"]), 2)
            self.assertEqual(result["metrics"]["actualFileContentBytesRead"], 0)
            self.assertTrue(all(row["prioritySource"] for row in result["games"]))
            by_name = {row["fileName"]: row for row in result["games"]}
            self.assertIn("Sony PSP", by_name[fate.name]["platformCandidates"])
            self.assertIn("Nintendo Switch", by_name[smash.name]["platformCandidates"])

    def test_rom_scan_marks_mba_and_j_stars(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Game"
            mba = root / "Magical Battle Arena" / "Magical Battle Arena.zip"
            jump = root / "PSV" / "J-STARS Victory VS.vpk"
            mba.parent.mkdir(parents=True)
            jump.parent.mkdir(parents=True)
            mba.write_bytes(b"inventory-fixture")
            jump.write_bytes(b"inventory-fixture")
            result = scan_roms(root)
            self.assertTrue(all(row["prioritySource"] for row in result["games"]))


if __name__ == "__main__":
    unittest.main()
