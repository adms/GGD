import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("playstation_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class PlayStationInventoryTest(unittest.TestCase):
    def test_logical_groups_known_multi_container_games(self):
        cases = {
            "ULUS-10566.part2.rar": "dissidia-012-duodecim-final-fantasy",
            "pa-hp.part3.rar": "heroes-phantasia",
            "Patapon_3_USA_PSP-BAHAMUT.zip": "patapon-3",
            "b-taikodx.part1.rar": "taiko-no-tatsujin-portable-dx",
            "Dragons Crown (Asia) (ZhKo).zip": "dragons-crown",
        }
        for file_name, expected in cases.items():
            with self.subTest(file_name=file_name):
                self.assertEqual(MODULE.logical_game({"FileName": file_name})[0], expected)

    def test_fate_uc_filter_does_not_exclude_other_fate_title(self):
        self.assertTrue(MODULE.is_fate_uc({"Name": "Fate_Unlimited_Codes_USA_PSP-EMiNENT"}))
        self.assertFalse(MODULE.is_fate_uc({"Name": "Threads of Fate (USA)"}))

    def test_live_inventory_keeps_metadata_and_payload_separate(self):
        data = MODULE.build()
        self.assertEqual(data["verification"]["windowsMetadataRowsInScope"], 85)
        self.assertEqual(data["verification"]["windowsPayloadFilesRead"], 0)
        self.assertEqual(data["platformSummary"]["PS Vita"]["metadataRows"], 0)
        self.assertEqual(data["acquiredSources"]["pspNativeGmoAuthorSnapshot"]["nativeGmoHeadersVerified"], 21)
        self.assertEqual(data["acquiredSources"]["pspCloudConvertedCandidate"]["nativeMotionClips"], 13)
        self.assertEqual(data["acquiredSources"]["ps4CloudEnglishAudio"]["decodedWavFiles"], 49)
        self.assertFalse(data["acquiredSources"]["pspCloudConvertedCandidate"]["runtimeReady"])


if __name__ == "__main__":
    unittest.main()
