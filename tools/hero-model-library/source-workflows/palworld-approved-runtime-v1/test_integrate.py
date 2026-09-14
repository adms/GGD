import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = ROOT / "tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/integrate.py"
SPEC = importlib.util.spec_from_file_location("palworld_approved_runtime", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class PalworldApprovedRuntimeIntegrationTest(unittest.TestCase):
    def test_checked_products_keep_runtime_boundaries_honest(self):
        manifest, receipt, copies = MODULE.expected_products()
        self.assertEqual(36, manifest["summary"]["ownerApprovedCandidates"])
        self.assertEqual(18, manifest["summary"]["motionSemanticStatesRuntimeSelectable"])
        self.assertEqual(14, manifest["summary"]["approvedGenericMotionBindingsReachable"])
        self.assertEqual(4, manifest["summary"]["approvedPerSkillMotionOverlaysPendingRouter"])
        self.assertEqual(18, manifest["summary"]["approvedCryProductsInGit"])
        self.assertEqual(0, manifest["summary"]["approvedCryRuntimeBindings"])
        self.assertEqual(18, len(copies))
        self.assertTrue(all(row["runtimeSelectable"] for row in manifest["motions"]))
        self.assertTrue(all(not row["runtimeSelectable"] for row in manifest["cries"]))
        self.assertFalse(receipt["states"]["sourceFaithfulAudiovisualComplete"])
        self.assertFalse(receipt["states"]["productionDeploymentVerified"])

    def test_generated_products_are_current(self):
        manifest, receipt, copies = MODULE.expected_products()
        for source, target in copies:
            self.assertEqual(source.read_bytes(), target.read_bytes())
        self.assertEqual(MODULE.encoded(manifest), MODULE.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(MODULE.encoded(receipt), MODULE.RECEIPT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
