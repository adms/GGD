import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INDEX = ROOT / "materials/hero-model-library/source-inventories/community-unused-assets-v1/inventory.json"


class CommunityUnusedInventoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(INDEX.read_text())

    def test_generated_outputs_are_current(self):
        subprocess.run(["python3", str(Path(__file__).with_name("build_inventory.py")), "--check"], cwd=ROOT, check=True)

    def test_evidence_boundaries(self):
        self.assertFalse(self.data["scope"]["newDownloadPerformed"])
        self.assertFalse(self.data["scope"]["newConversionPerformed"])
        self.assertFalse(self.data["scope"]["productionDeploymentPerformed"])
        self.assertFalse(self.data["safeBatchDecision"]["newConversionStarted"])
        self.assertFalse(self.data["safeBatchDecision"]["currentContractRelaxed"])
        self.assertEqual(0, self.data["summary"]["explicitAutomaticConversionEligible"])
        self.assertEqual({"model", "motion", "vfx", "prop"}, set(self.data["scope"]["assetKinds"]))
        self.assertTrue(all(row["pipeline"]["acquired"] for row in self.data["sources"]))
        self.assertTrue(all(row["assetKinds"] for row in self.data["sources"]))
        self.assertTrue(all(not row["pipeline"]["productionDeployed"] or row["pipeline"]["registered"] for row in self.data["sources"]))

    def test_known_source_families_and_unused_components(self):
        sources = {row["sourceId"]: row for row in self.data["sources"]}
        self.assertEqual("warcraft-community-or-custom-map", sources["hive-anime-team-survival"]["sourceFamily"])
        self.assertEqual("mod-repository", sources["thunderstore-rezero"]["sourceFamily"])
        self.assertEqual("author-public-share", sources["bowlroll-sabakan359-vearn-mmd-v087"]["sourceFamily"])
        self.assertTrue(any(row["sourceId"] == "thunderstore-rezero" and row["unusedForRuntime"] for row in self.data["components"]))

    def test_large_300_mba_manifest_is_referenced(self):
        authority = self.data["externalAuthorities"]["unused300Mba"]
        path = ROOT / authority["gitPath"]
        self.assertTrue(path.is_file())
        import hashlib
        self.assertEqual(authority["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()
