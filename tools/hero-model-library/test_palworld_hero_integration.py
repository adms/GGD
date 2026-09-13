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
            {"acquired-jetragon", "acquired-astralym", "acquired-cattiva"},
            {row["heroId"] for row in receipt["integrations"]},
        )

    def test_palworld_index_separates_complete_authoring_from_deployment(self):
        data = self.palworld.build(ROOT.parent)
        self.assertEqual(3, len(data["characters"]))
        for row in data["characters"]:
            self.assertTrue(row["ggdHeroImplemented"])
            self.assertTrue(row["backendDropdownRegistered"])
            self.assertFalse(row["productionDeploymentVerified"])
            self.assertEqual(6, len(row["heroIntegration"]["slots"]))
            # Independent reserve components do not become selectable merely
            # because a different, fully packaged model is registered.
            self.assertTrue(all(not item.get("runtimeSelectable", False) for item in row["modelCandidates"]))

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
