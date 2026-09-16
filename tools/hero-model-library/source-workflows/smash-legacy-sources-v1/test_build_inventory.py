import importlib.util
import tempfile
import unittest
import wave
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("smash_legacy_build_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class SmashLegacyInventoryTest(unittest.TestCase):
    def test_n64_filter_excludes_unrelated_lets_smash(self):
        self.assertFalse(MODULE.is_n64_smash_row({"Platform": "Nintendo 64", "Name": "Let's Smash (Japan)"}))
        self.assertTrue(MODULE.is_n64_smash_row({"Platform": "Nintendo 64", "Name": "Super Smash Bros. (USA)"}))
        self.assertTrue(MODULE.is_n64_smash_row({"Platform": "Nintendo 64", "Name": "N64 全明星大亂鬥"}))

    def test_wav_metadata_checks_pcm_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "clip.wav"
            with wave.open(str(path), "wb") as target:
                target.setnchannels(1)
                target.setsampwidth(2)
                target.setframerate(8000)
                target.writeframes(b"\x00\x00" * 800)
            info = MODULE.wav_info(path)
        self.assertEqual(info["frames"], 800)
        self.assertEqual(info["pcmPayloadBytes"], 1600)
        self.assertEqual(info["seconds"], 0.1)

    def test_build_preserves_generation_boundary_and_expected_totals(self):
        data = MODULE.build()
        self.assertEqual(data["schema"], "ggd.smash-legacy-source-inventory@1")
        self.assertFalse(data["ultimateBoundary"]["includedInLegacyTotals"])
        self.assertEqual(data["nintendo64"]["payloadFilesRead"], 0)
        self.assertEqual(data["melee"]["wavFiles"], 1766)
        self.assertEqual(data["brawl"]["wavFiles"], 448)
        self.assertEqual(data["verification"]["safeNewModelConversionsCompleted"], 0)


if __name__ == "__main__":
    unittest.main()
