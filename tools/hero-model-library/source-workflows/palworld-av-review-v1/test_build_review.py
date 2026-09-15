import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("palworld_av_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class PalworldReviewBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()

    def test_candidates_default_to_unreviewed_and_unselectable(self):
        self.assertEqual(self.contract["summary"]["ggdHeroAuthoringCompleteCount"], 3)
        self.assertEqual(self.contract["summary"]["localHeroForgeModelSelectableHeroCount"], 3)
        self.assertEqual(self.contract["summary"]["sourceFaithfulAudiovisualCompleteHeroCount"], 0)
        self.assertEqual(self.contract["summary"]["productionDeploymentVerifiedHeroCount"], 0)
        self.assertEqual(self.contract["summary"]["audioCandidateCount"], 18)
        self.assertEqual(self.contract["summary"]["motionSemanticCandidateCount"], 18)
        candidates = self.contract["audioCandidates"] + self.contract["motionCandidates"]
        self.assertTrue(all(row["reviewStatus"] == "unreviewed" for row in candidates))
        self.assertTrue(all(row["runtimeSelectable"] is False for row in candidates))
        self.assertEqual(self.contract["summary"]["approvedCandidateCount"], 0)
        for character in self.contract["characters"]:
            self.assertTrue(character["ggdHeroAuthoringComplete"])
            self.assertTrue(character["currentOptimizedModel"]["registeredInLocalHeroForgeDropdown"])
            self.assertTrue(character["currentOptimizedModel"]["localHeroForgeModelSelectable"])
            self.assertFalse(character["sourceFaithfulAudiovisualComplete"])
            self.assertFalse(character["productionDeploymentVerified"])
            self.assertFalse(character["reviewCandidatesHaveRuntimeAuthority"])
        by_hero = {row["heroId"]: row for row in self.contract["characters"]}
        self.assertEqual(
            "eligible-registered-alternative",
            by_hero["acquired-astralym"]["currentOptimizedModel"]["formalModelAdoption"]["status"],
        )
        self.assertEqual(
            [
                "community.body.c45f111dfef172872db990ee8c40161bfba4a9e38f36a959",
                "community.body.d45146e882628fe8bbf635727ad272ff8f82238cf36b4d5f",
            ],
            by_hero["acquired-astralym"]["currentOptimizedModel"]["formalModelAdoption"]["policyEligibleModelKeys"],
        )

    def test_cries_are_not_language_or_skill_events(self):
        for row in self.contract["audioCandidates"]:
            self.assertEqual(row["category"], "nonverbal-creature-cry")
            self.assertEqual(row["language"], "not-applicable-nonverbal")
            self.assertFalse(row["speakerVerified"])
            self.assertEqual(row["sourceSkillBindingCandidates"], [])

    def test_missing_original_vfx_and_skill_sfx_are_explicit(self):
        self.assertEqual(self.contract["summary"]["standaloneVfxCandidateCount"], 0)
        self.assertEqual(self.contract["summary"]["skillSpecificSfxCandidateCount"], 0)
        self.assertEqual({row["status"] for row in self.contract["globalSourceBlockers"]}, {"not-acquired"})

    def test_decision_schema_pins_source_fingerprint(self):
        schema = MODULE.decision_schema(self.contract)
        self.assertEqual(schema["properties"]["sourceFingerprint"]["const"], self.contract["sourceFingerprint"])
        self.assertEqual(schema["properties"]["schema"]["const"], "ggd.palworld-av-review-decision@1")
        audio_items = schema["properties"]["audioDecisions"]["items"]["oneOf"]
        self.assertEqual(len(audio_items), 18)
        self.assertEqual(len({row["properties"]["candidateId"]["const"] for row in audio_items}), 18)
        self.assertEqual(schema["properties"]["audioDecisions"]["maxItems"], 18)
        self.assertEqual(len(schema["properties"]["audioDecisions"]["allOf"]), 18)
        self.assertEqual(schema["properties"]["motionDecisions"]["maxItems"], 18)

    def test_html_embeds_current_contract(self):
        page = MODULE.build_html(self.contract)
        self.assertIn(self.contract["sourceFingerprint"], page)
        self.assertIn("127.0.0.1:8766/audio/", page)
        self.assertIn("champion-model-audition.html", page)


if __name__ == "__main__":
    unittest.main()
