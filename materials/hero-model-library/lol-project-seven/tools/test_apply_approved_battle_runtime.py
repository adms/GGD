import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("apply_approved_battle_runtime.py")
SPEC = importlib.util.spec_from_file_location("apply_approved_battle_runtime", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class ApprovedBattleRuntimeTest(unittest.TestCase):
    def test_runtime_mapping_is_closed_over_review_targets(self):
        self.assertEqual(mod.RUNTIME_CATEGORY_MAP["ability-Q"], "skill-name.q")
        self.assertEqual(mod.RUNTIME_CATEGORY_MAP["attack"], "attack-light")
        self.assertEqual(mod.RUNTIME_CATEGORY_MAP["death"], "defeat")
        self.assertNotIn("hurt", mod.RUNTIME_CATEGORY_MAP)
        self.assertNotIn("crit", mod.RUNTIME_CATEGORY_MAP)

    def test_approval_requires_exact_native_target_and_completed_checks(self):
        row = {"nativeId": "Lux", "candidateRuntimeTarget": "ability-Q"}
        decision = {
            "status": "verified", "speaker": "Lux", "speakerVerified": True,
            "language": "ja", "perClipLanguageVerified": True,
            "ggdRuntimeTarget": "ability-Q", "ggdSkillSemanticBindingVerified": True,
            "gainDecision": "keep-source-gain", "runtimeApproved": True,
        }
        self.assertTrue(mod.approved_decision(row, decision))
        self.assertFalse(mod.approved_decision(row, {**decision, "ggdRuntimeTarget": "ability-R"}))

    def test_take_base_does_not_confuse_dotted_runtime_category(self):
        self.assertEqual(mod.category_base("skill-name.q.14"), "skill-name.q")
        self.assertEqual(mod.category_base("attack-light.2"), "attack-light")
        self.assertEqual(mod.category_base("defeat"), "defeat")


if __name__ == "__main__":
    unittest.main()
