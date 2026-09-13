import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/hero-model-library"))


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PalworldHeroIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sync = load("sync_palworld_hero_integration", "tools/hero-model-library/sync_palworld_hero_integration.py")
        cls.palworld = load("build_palworld_index", "tools/hero-model-library/build_palworld_index.py")
        cls.backlog = load("build_model_design_backlog", "tools/hero-model-library/build_model_design_backlog.py")

    def test_receipt_pins_current_recipe_model_and_glb_bytes(self):
        receipt = json.loads(self.sync.RECEIPT.read_text())
        self.sync.check_receipt(receipt)
        self.assertEqual(
            "ggd-authoring-packages-verified-model-options-policy-eligible-source-av-review-pending-production-unverified",
            receipt["status"],
        )
        self.assertEqual(3, receipt["completionBoundary"]["ggdHeroAuthoringCompleteCount"])
        self.assertEqual(0, receipt["completionBoundary"]["sourceFaithfulAudiovisualCompleteCount"])
        self.assertEqual(3, receipt["completionBoundary"]["currentFormalModelAdoptionEligibleCount"])
        self.assertEqual(0, receipt["completionBoundary"]["currentFormalModelAdoptionBlockedCount"])
        self.assertEqual(0, receipt["completionBoundary"]["releaseReadyHeroCount"])
        self.assertEqual(0, receipt["completionBoundary"]["productionDeploymentVerifiedCount"])
        self.assertEqual(
            {"acquired-jetragon", "acquired-astralym", "acquired-cattiva"},
            {row["heroId"] for row in receipt["integrations"]},
        )
        for row in receipt["integrations"]:
            self.assertTrue(row["ggdHeroAuthoringComplete"])
            self.assertTrue(row["heroForgePackageVerified"])
            self.assertTrue(row["localHeroForgeModelSelectable"])
            self.assertFalse(row["staticChampionDocumentPresent"])
            self.assertEqual(
                ["idle", "run", "attack", "cast", "hurt", "death"],
                row["contentSchema"]["clipMapStates"],
            )
            self.assertFalse(row["sourceFidelity"]["sourceFaithfulAudiovisualComplete"])
            self.assertFalse(row["sourceFidelity"]["creatureCryListeningApproved"])
            self.assertFalse(row["productionDeploymentVerified"])
        by_hero = {row["heroId"]: row for row in receipt["integrations"]}
        self.assertEqual("eligible-default", by_hero["acquired-jetragon"]["formalModelAdoption"]["status"])
        self.assertEqual("eligible-registered-alternative", by_hero["acquired-astralym"]["formalModelAdoption"]["status"])
        self.assertEqual(23928, by_hero["acquired-astralym"]["formalModelAdoption"]["defaultModelTriangles"])
        self.assertEqual(
            ["community.body.c45f111dfef172872db990ee8c40161bfba4a9e38f36a959"],
            by_hero["acquired-astralym"]["formalModelAdoption"]["policyEligibleModelKeys"],
        )
        self.assertEqual("eligible-default", by_hero["acquired-cattiva"]["formalModelAdoption"]["status"])

    def test_palworld_index_separates_complete_authoring_from_deployment(self):
        data = self.palworld.build(ROOT.parent)
        self.assertEqual(3, len(data["characters"]))
        registered_components = []
        blocked_components = []
        for row in data["characters"]:
            self.assertTrue(row["ggdHeroImplemented"])
            self.assertTrue(row["backendDropdownRegistered"])
            self.assertTrue(row["ggdHeroAuthoringComplete"])
            self.assertTrue(row["localHeroForgeModelSelectable"])
            self.assertFalse(row["sourceFaithfulAudiovisualComplete"])
            self.assertFalse(row["productionRuntimeSelectableVerified"])
            self.assertFalse(row["productionDeploymentVerified"])
            self.assertEqual(6, len(row["heroIntegration"]["slots"]))
            for item in row["modelCandidates"]:
                if not item.get("componentReady"):
                    continue
                (registered_components if item.get("runtimeSelectable") else blocked_components).append(item["id"])
        self.assertEqual(
            {
                "opgg-palworld-jetragon.material-bound-256-v1",
                "palworld-cattiva-opgg-materials-256-v1",
            },
            set(registered_components),
        )
        self.assertEqual(
            ["opgg-palworld-astralym-2026081102.idle-walk-256"],
            blocked_components,
        )

    def test_full_motion_option_receipt_is_reproducible(self):
        registration = load(
            "register_full_motion_options",
            "tools/hero-model-library/source-workflows/palworld/register_full_motion_options.py",
        )
        receipt = registration.build(False)
        self.assertEqual(2, receipt["summary"]["registered"])
        self.assertEqual(1, receipt["summary"]["blocked"])
        self.assertEqual(62, receipt["summary"]["newNativeMotionEntriesExposed"])
        self.assertEqual(0, receipt["summary"]["defaultsChanged"])
        for row in receipt["registrations"]:
            self.assertTrue(all(
                value["byteIdenticalAccessorSamples"]
                for value in row["semanticMap"].values()
            ))
            self.assertFalse(row["productionDeploymentVerified"])

    def test_design_backlog_recognizes_verified_hero_forge_recipes(self):
        data = self.backlog.build()
        rows = {row["id"]: row for row in data["characters"]}
        for identity in (
            "community:palworld-jetragon",
            "community:palworld-astralym",
            "community:palworld-cattiva",
        ):
            self.assertEqual("designed", rows[identity]["designStatus"])
            self.assertEqual("hero-forge-six-slot-package-verified", rows[identity]["currentHeroChecks"][0]["status"])


if __name__ == "__main__":
    unittest.main()
