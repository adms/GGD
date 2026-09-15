import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1"


class WorkflowEvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads((EVIDENCE / "candidates.json").read_text())
        cls.policy = json.loads((EVIDENCE / "policy-check.json").read_text())

    def test_bounded_roots_remain_dai_and_unique(self):
        roots = self.report["roots"]
        self.assertEqual(len(roots), 6)
        self.assertEqual(len({row["candidateId"] for row in roots}), 6)
        self.assertTrue(all("PN010" in row["sourcePaths"][0] for row in roots))
        self.assertTrue(all(row["metrics"]["emitters"] > 0 for row in roots))

    def test_only_meaningful_textures_enter_git(self):
        eligible = [row for row in self.report["textureComponents"] if row["componentEligible"]]
        utilities = [row for row in self.report["textureComponents"] if not row["componentEligible"]]
        self.assertEqual(len(eligible), 18)
        self.assertEqual(len(utilities), 7)
        self.assertTrue(all(row["gitPath"] for row in eligible))
        self.assertTrue(all(row["gitPath"] is None for row in utilities))
        self.assertTrue(all((REPO / row["gitPath"]).is_file() for row in eligible))

    def test_policy_receipt_has_no_hard_breach(self):
        self.assertEqual(self.policy["role"], "vfx-model")
        self.assertEqual(self.policy["summary"]["texturesChecked"], 18)
        self.assertEqual(self.policy["summary"]["texturesHardPass"], 18)
        self.assertEqual(self.policy["summary"]["meshesChecked"], 8)
        self.assertEqual(self.policy["summary"]["meshesHardPass"], 8)
        self.assertEqual(self.policy["summary"]["meshesBlocked"], 0)

    def test_incomplete_states_cannot_be_promoted(self):
        states = self.report["states"]
        self.assertFalse(states["niagaraTimingRecovered"])
        self.assertFalse(states["ggdVfxBuilt"])
        self.assertEqual(states["skillBindingsCreated"], 0)
        self.assertFalse(states["runtimeSelectable"])
        self.assertFalse(states["deployed"])


if __name__ == "__main__":
    unittest.main()
