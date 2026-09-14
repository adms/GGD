import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("serve_listening_review.py")
SPEC = importlib.util.spec_from_file_location("serve_listening_review", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)
builder = mod.load_builder()


class ListeningReviewServerTest(unittest.TestCase):
    def setUp(self):
        self.queue = {"records": [
            {"key": "Lux:skin0:1", "candidateRuntimeTarget": "ability-Q"},
            {"key": "Lux:skin0:2", "candidateRuntimeTarget": None},
        ]}

    def document(self, key, decision):
        return {
            "schema": "ggd-lol-listening-review-decisions@1",
            "sourceId": builder.SOURCE_ID,
            "decisions": {key: decision},
        }

    def test_accepts_only_native_event_target(self):
        decision = {
            "status": "verified", "speaker": "Lux", "speakerVerified": True,
            "language": "ja", "perClipLanguageVerified": True,
            "ggdRuntimeTarget": "ability-Q", "ggdSkillSemanticBindingVerified": True,
            "gainDecision": "keep-source-gain", "runtimeApproved": True,
        }
        mod.validate_decisions(self.document("Lux:skin0:1", decision), self.queue, builder)
        decision["ggdRuntimeTarget"] = "ability-R"
        with self.assertRaisesRegex(ValueError, "differs from native event evidence"):
            mod.validate_decisions(self.document("Lux:skin0:1", decision), self.queue, builder)

    def test_cannot_approve_unmapped_audio(self):
        decision = {
            "status": "verified", "speaker": "Lux", "speakerVerified": True,
            "language": "ja", "perClipLanguageVerified": True,
            "ggdRuntimeTarget": "ability-Q", "ggdSkillSemanticBindingVerified": True,
            "gainDecision": "keep-source-gain", "runtimeApproved": True,
        }
        with self.assertRaisesRegex(ValueError, "differs from native event evidence"):
            mod.validate_decisions(self.document("Lux:skin0:2", decision), self.queue, builder)

    def test_rejects_unknown_review_key(self):
        with self.assertRaisesRegex(ValueError, "Unknown review keys"):
            mod.validate_decisions(self.document("Other:skin0:1", {}), self.queue, builder)


if __name__ == "__main__":
    unittest.main()
