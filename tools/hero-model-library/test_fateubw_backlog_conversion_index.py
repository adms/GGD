#!/usr/bin/env python3
"""Contract checks for the FateUBW 14-servant conversion backlog view."""
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "materials/hero-model-library"
SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
IDENTITIES = {
    "artoria_pendragon_saber": "saber",
    "cu_chulainn_lancer": "cu-chulainn",
    "diarmuid_ua_duibhne_lancer": "diarmuid",
    "emiya_archer": "emiya-archer",
    "gilgamesh_archer": "gilgamesh",
    "gilles_de_rais_caster": "gilles-de-rais",
    "hassan-i-sabbah_assassin": "hassan",
    "heracles_berserker": "heracles",
    "iskander_rider": "iskander",
    "lancelot_berserker": "lancelot",
    "medea_caster": "medea",
    "medusa_rider": "medusa",
    "nero_claudius_saber": "nero-claudius",
    "sasaki_kojiro_assassin": "sasaki-kojiro",
}


class FateUbwBacklogConversionIndexTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sources = json.loads((LIBRARY / "download-sources.json").read_text())
        cls.source = next(row for row in sources["publicSources"] if row["id"] == SOURCE_ID)
        audit = json.loads((LIBRARY / "design-backlog/sources-community.json").read_text())
        cls.rows = {row["id"]: row for row in audit["characters"]}
        cls.coverage = json.loads((LIBRARY / "design-backlog/resource-coverage.json").read_text())

    def test_all_fourteen_servants_keep_source_and_verified_static_glb(self):
        servants = [row for row in self.source["modelCandidates"] if "/servant/" in row.get("sourceModel", "")]
        self.assertEqual(14, len(servants))
        self.assertEqual(set(IDENTITIES), {row["character"] for row in servants})
        for source_candidate in servants:
            row = self.rows[IDENTITIES[source_candidate["character"]]]
            by_id = {candidate["id"]: candidate for candidate in row["modelCandidates"]}
            static_id = source_candidate["bodyStandardization"]["attemptId"]
            static = by_id[static_id]
            self.assertTrue(static["existsLocal"])
            self.assertTrue(static["sizeMatchesManifest"])
            self.assertTrue(static["readbackVerified"])
            self.assertEqual(1, static["modelProof"]["meshes"])
            self.assertEqual(0, static["modelProof"]["animationEntries"])
            self.assertFalse(static["runtimeSelectable"])
            self.assertFalse(static["defaultEligible"])

    def test_fourteen_native_motion_glbs_total_one_hundred_twelve_clips(self):
        servants = [row for row in self.source["modelCandidates"] if "/servant/" in row.get("sourceModel", "")]
        native = [row for row in servants if row.get("nativeMotionStandardization")]
        self.assertEqual(14, len(native))
        converted_total = 0
        for source_candidate in native:
            metadata = source_candidate["nativeMotionStandardization"]
            row = self.rows[IDENTITIES[source_candidate["character"]]]
            candidate = next(item for item in row["modelCandidates"] if item["id"] == metadata["attemptId"])
            self.assertEqual(1, candidate["modelProof"]["skins"])
            self.assertEqual(metadata["convertedClipCount"], candidate["modelProof"]["animationEntries"])
            self.assertEqual(metadata["convertedClipCount"], candidate["nativeAnimationCount"])
            self.assertTrue(candidate["readbackVerified"])
            self.assertFalse(candidate["runtimeSelectable"])
            self.assertFalse(candidate["defaultEligible"])
            converted_total += candidate["nativeAnimationCount"]
        self.assertEqual(112, converted_total)

    def test_heracles_leaf_rest_rotation_conversion_remains_non_runtime(self):
        heracles = next(row for row in self.source["modelCandidates"] if row["character"] == "heracles_berserker")
        metadata = heracles["nativeMotionStandardization"]
        self.assertEqual(14, metadata["convertedClipCount"])
        self.assertEqual(3, metadata["unconvertedClipCount"])
        self.assertEqual("unanimated-terminal-static-rotations-baked-with-full-inverse-bind",
                         metadata["restPosePolicy"])
        self.assertFalse(metadata["runtimeReady"])
        motion = self.coverage["characterOverrides"]["heracles"]["motion"]
        self.assertIn("已轉換 14 個原生動作", motion)
        self.assertIn("3 個公式／無時長等片段保留未轉換", motion)

    def test_converted_servant_summaries_no_longer_claim_pending_conversion(self):
        for character, identity in IDENTITIES.items():
            motion = self.coverage["characterOverrides"][identity]["motion"]
            self.assertIn("已轉換", motion)
            self.assertNotIn("待轉換", motion)

    def test_source_family_totals_separate_servants_shared_and_props(self):
        family = next(row for row in self.coverage["sourceFamilies"] if row["id"] == "fateubw-community")
        self.assertIn("14名英靈均已轉為靜態GLB", family["model"])
        self.assertIn("20個動畫JSON共156項", family["motion"])
        self.assertIn("14名英靈合計132項", family["motion"])
        self.assertIn("已轉換112項", family["motion"])
        self.assertIn("5個道具／生物20項及共用4項", family["motion"])


if __name__ == "__main__":
    unittest.main()
