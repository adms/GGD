import json
import tempfile
import unittest
from pathlib import Path

import build_inventory


class PalworldVfxSfxInventoryTest(unittest.TestCase):
    def test_inventory_keeps_unreviewed_audio_unbound(self):
        inventory, unused = build_inventory.build()
        self.assertEqual(inventory["summary"]["characters"], 3)
        self.assertEqual(inventory["summary"]["genericCryCandidates"], 18)
        self.assertEqual(inventory["summary"]["distinctSourceSkills"], 27)
        self.assertEqual(inventory["summary"]["sourceSkillMotionCandidates"], 70)
        self.assertGreater(inventory["summary"]["nativeNameStemSkillMotionCandidates"], 0)
        self.assertEqual(inventory["summary"]["translatedAliasSkillMotionCandidates"], 3)
        self.assertEqual(inventory["summary"]["acquiredStandaloneVfx"], 0)
        self.assertEqual(inventory["summary"]["acquiredSkillSpecificSfx"], 0)
        self.assertEqual(inventory["summary"]["runtimeBindingsAdded"], 0)
        self.assertEqual(unused["summary"]["ownerReviewPending"], 18)
        self.assertEqual(unused["summary"]["unboundMotions"], 70)
        self.assertTrue(all(not row["runtimeBinding"] for row in unused["audio"]))
        self.assertTrue(all(row["skillCode"] is None for row in unused["audio"]))
        self.assertEqual(
            {row["id"]: len(row["sourceSkillMotionCandidates"]) for row in inventory["characters"]},
            {"jetragon": 8, "astralym": 54, "cattiva": 8},
        )
        self.assertTrue(all(
            row["durationSeconds"] is not None and row["animationChannelCount"] > 0
            for character in inventory["characters"]
            for row in character["sourceSkillMotionCandidates"]
        ))
        self.assertTrue(all(
            character["sourceMotionContainer"]["hashVerified"]
            for character in inventory["characters"]
        ))

    def test_scan_requires_character_and_media_or_ue_marker(self):
        import scan_extracted_assets as scan
        scan.CONFIG = json.loads((build_inventory.HERE / "source-config.json").read_text())
        self.assertIsNotNone(scan.classify("Pal/Content/Effect/JetDragon/NS_JumpBeam.uasset", None))
        self.assertIsNone(scan.classify("Pal/Content/Effect/Common/NS_Generic.uasset", None))
        row = scan.classify("Pal/Content/WwiseAudio/PinkCat/CatPunch.wem", None)
        self.assertEqual(row["kind"], "audio-candidate")
        self.assertFalse(row["runtimeBinding"])


if __name__ == "__main__":
    unittest.main()
