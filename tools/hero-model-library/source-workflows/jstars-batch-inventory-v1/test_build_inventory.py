#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("jstars_batch_inventory", SCRIPT)
assert SPEC and SPEC.loader
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class JStarsBatchInventoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = MOD.build(MOD.repo_root())

    def test_full_roster_and_native_groups_are_preserved(self) -> None:
        self.assertEqual(self.data["summary"]["rosterCharacters"], 52)
        self.assertEqual(self.data["summary"]["playableCharacters"], 39)
        self.assertEqual(self.data["summary"]["supportCharacters"], 13)
        self.assertEqual(self.data["summary"]["nativeTokenGroups"], 58)
        self.assertEqual(self.data["summary"]["nativeTokensWithInternalIdentity"], 56)
        self.assertEqual(self.data["summary"]["sourceMembersHashed"], 19471)

    def test_priority_four_exact_tokens_and_existing_audio_receipts(self) -> None:
        rows = {row["slug"]: row for row in self.data["priorityFour"]}
        self.assertEqual({key: row["nativeId"] for key, row in rows.items()}, {
            "gon": "017", "nube": "041", "luckyman": "037", "hiei": "012"
        })
        self.assertTrue(all(row["payloadMemberCount"] == 89 for row in rows.values()))
        self.assertTrue(all(row["localFilesIncludingManifest"] == 90 for row in rows.values()))
        self.assertEqual(self.data["summary"]["priorityDecodedJapaneseWavCandidates"], 1596)
        self.assertAlmostEqual(self.data["summary"]["priorityDecodedDurationSeconds"], 1817.984, places=3)

    def test_runtime_setup_is_recorded_without_promoting_conversion(self) -> None:
        self.assertEqual(self.data["platformVersion"], "BLUS31519 / 01.00")
        self.assertTrue(self.data["summary"]["runtimeToolSetupVerified"])
        self.assertTrue(self.data["summary"]["firmwareInstalledVerified"])
        self.assertEqual(self.data["summary"]["titleScreenMemoryCaptures"], 1)
        self.assertEqual(self.data["summary"]["titleScreenCarvedStpk"], 0)
        self.assertEqual(self.data["summary"]["characterTaggedMemoryCaptures"], 0)

    def test_no_source_container_is_promoted_to_runtime_completion(self) -> None:
        for row in self.data["priorityFour"] + self.data["roster"] + self.data["nativeContainerGroups"]:
            self.assertFalse(row["converted"])
            self.assertFalse(row["registered"])
            self.assertFalse(row["deployed"])
        for row in self.data["priorityFour"]:
            self.assertEqual(row["modules"]["voice"]["runtimeEventBindingCount"], 0)
            self.assertEqual(row["modules"]["model"]["convertedArtifactCount"], 0)

    def test_report_section_is_bounded_and_status_explicit(self) -> None:
        section = MOD.report_section(self.data)
        self.assertEqual(section.count(MOD.START), 1)
        self.assertEqual(section.count(MOD.END), 1)
        self.assertIn("轉換／註冊／部署", section)
        self.assertIn("**0／0／0**", section)


if __name__ == "__main__":
    unittest.main()
