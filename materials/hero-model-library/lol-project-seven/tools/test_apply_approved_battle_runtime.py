import importlib.util
import json
import sys
import tempfile
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

    def test_manifest_requires_exact_hash_language_and_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            path = repo / "content/assets/audio/voices/champions/MANIFEST.json"
            path.parent.mkdir(parents=True)
            manifest = {
                "champions": {
                    "lol-lux": {
                        "lines": {
                            "skill-name.q": [{
                                "clip": "assets/audio/voices/lines/lol-lux/skill-name.q.mp3",
                                "hash": "abc",
                                "lang": "ja",
                                "durationSec": 1.25,
                            }]
                        }
                    }
                }
            }
            path.write_text(json.dumps(manifest))
            row = {
                "reviewKey": "Lux:1",
                "runtimeHeroId": "lol-lux",
                "runtimeCategory": "skill-name.q",
                "runtimeTakeKey": "skill-name.q",
                "runtimeSha256": "abc",
                "sourceSeconds": 1.25,
            }
            self.assertEqual(mod.verify_manifest(repo, [row]), mod.sha256(path))
            manifest["champions"]["lol-lux"]["lines"]["skill-name.q"][0]["lang"] = "und"
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "metadata drift"):
                mod.verify_manifest(repo, [row])


if __name__ == "__main__":
    unittest.main()
