import importlib.util
import json
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("build.py")
SPEC = importlib.util.spec_from_file_location("jump_force_gon_audio_build", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class GonAudioBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compressed, cls.receipt, cls.runtime = MODULE.build(verify_local_files=False)

    def test_complete_source_set_is_frozen(self):
        self.assertEqual(self.receipt["summary"]["files"], 250)
        self.assertEqual(self.receipt["summary"]["actVoiceFiles"], 225)
        self.assertEqual(self.receipt["summary"]["eventVoiceFiles"], 25)
        self.assertGreater(self.receipt["summary"]["durationSeconds"], 400)

    def test_no_unreviewed_semantics_are_promoted(self):
        self.assertEqual(self.runtime["activeBindings"], [])
        self.assertFalse(self.runtime["runtimeBindingAuthorized"])
        self.assertFalse(self.runtime["runtimeSelectable"])
        self.assertEqual(self.receipt["summary"]["perClipEventBindingsApproved"], 0)

    def test_manifest_digest_is_pinned(self):
        self.assertEqual(
            MODULE.sha256_bytes(self.compressed),
            self.receipt["filesManifest"]["sha256"],
        )


if __name__ == "__main__":
    unittest.main()
