import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_listening_review_queue.py")
SPEC = importlib.util.spec_from_file_location("build_listening_review_queue", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class ListeningReviewQueueTest(unittest.TestCase):
    def test_native_categories_do_not_become_hurt(self):
        self.assertEqual(mod.runtime_target(["emote"], []), "emote")
        self.assertEqual(mod.runtime_target(["death"], []), "death")
        self.assertIsNone(mod.runtime_target(["death", "emote"], []))

    def test_ability_requires_one_native_slot_candidate(self):
        self.assertEqual(mod.runtime_target(["ability-cast"], ["Q"]), "ability-Q")
        self.assertIsNone(mod.runtime_target(["ability-cast"], []))
        self.assertIsNone(mod.runtime_target(["ability-cast"], ["Q", "R"]))

    def test_runtime_approval_requires_completed_review_evidence(self):
        with self.assertRaisesRegex(ValueError, "lacks completed review evidence"):
            mod.validate_decision("Lux:skin0:1", {"runtimeApproved": True})
        mod.validate_decision("Lux:skin0:1", {
            "status": "verified",
            "speaker": "Lux",
            "speakerVerified": True,
            "language": "ja",
            "perClipLanguageVerified": True,
            "ggdRuntimeTarget": "ability-Q",
            "ggdSkillSemanticBindingVerified": True,
            "gainDecision": "-3 dB",
            "runtimeApproved": True,
        })


if __name__ == "__main__":
    unittest.main()
