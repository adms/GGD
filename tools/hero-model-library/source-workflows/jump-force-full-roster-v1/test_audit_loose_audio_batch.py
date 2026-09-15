import importlib.util
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jump_loose_audio", HERE / "audit_loose_audio_batch.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class AuditLooseAudioBatchTest(unittest.TestCase):
    def test_repository_receipt_is_complete_and_non_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, _, stats = MOD.build(full_rehash=False, cache_path=Path(directory) / "cache.json")
        summary = receipt["summary"]
        self.assertEqual(summary["decodedWavFilesVerified"], 4034)
        self.assertEqual(summary["decodedVoiceLabelFiles"], 1794)
        self.assertEqual(summary["decodedSoundEffectFiles"], 2170)
        self.assertEqual(summary["decodedMusicFiles"], 70)
        self.assertEqual(summary["nativeCharacterGroups"], 37)
        self.assertEqual(summary["highConfidenceCharacterGroups"], 32)
        self.assertEqual(summary["unresolvedNativeIdGroups"], 5)
        self.assertEqual(summary["characterGroupsLinkedToExistingHeroes"], 8)
        self.assertEqual(summary["distinctExistingHeroIdsLinked"], 12)
        self.assertEqual(summary["modelsConverted"], 0)
        self.assertEqual(summary["runtimeAudioBindingsCreated"], 0)
        self.assertFalse(receipt["stages"]["runtimeSelectable"])
        self.assertNotIn("chr0430", {row["nativeCharacterId"] for row in receipt["characters"]})

    def test_markdown_keeps_stage_boundary_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, _, _ = MOD.build(full_rehash=False, cache_path=Path(directory) / "cache.json")
        report = MOD.render_markdown(receipt)
        self.assertIn("不等於逐段說話者", report)
        self.assertIn("模型／動作／VFX 成品皆為 0", report)
        self.assertIn("沒有後台選項或正式部署", report)


if __name__ == "__main__":
    unittest.main()
