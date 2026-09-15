import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("audit_approved_battle_runtime.py")
SPEC = importlib.util.spec_from_file_location("audit_approved_battle_runtime", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class ApprovedBattleRuntimeAuditTest(unittest.TestCase):
    def test_owner_decision_requires_the_complete_per_clip_receipt(self):
        registration = {"nativeId": "Lux", "candidateRuntimeTarget": "ability-Q"}
        decision = {
            "status": "verified",
            "reviewer": "owner",
            "reviewedAt": "2026-09-14",
            "speaker": "Lux",
            "speakerVerified": True,
            "language": "ja",
            "perClipLanguageVerified": True,
            "ggdRuntimeTarget": "ability-Q",
            "ggdSkillSemanticBindingVerified": True,
            "gainDecision": "keep-source-gain",
            "runtimeApproved": True,
        }
        self.assertTrue(mod.owner_decision_matches(decision, registration))
        self.assertFalse(mod.owner_decision_matches({**decision, "speaker": "Yasuo"}, registration))
        self.assertFalse(mod.owner_decision_matches({**decision, "ggdRuntimeTarget": "ability-R"}, registration))
        self.assertFalse(mod.owner_decision_matches({**decision, "reviewer": "automation"}, registration))


if __name__ == "__main__":
    unittest.main()
