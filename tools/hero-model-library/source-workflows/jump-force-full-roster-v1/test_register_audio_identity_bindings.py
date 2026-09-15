import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jump_audio_bindings", HERE / "register_audio_identity_bindings.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class RegisterAudioIdentityBindingsTest(unittest.TestCase):
    def test_repository_binding_set_is_exact_and_non_runtime(self):
        downloads, receipt = MOD.build()
        self.assertEqual(receipt["summary"]["nativeCharacterGroupsBound"], 12)
        self.assertEqual(receipt["summary"]["distinctHeroIds"], 17)
        self.assertEqual(receipt["summary"]["publicPackageGroupsBound"], 12)
        self.assertEqual(receipt["summary"]["steamLooseGroupsBound"], 8)
        self.assertEqual(receipt["summary"]["sourceGroupRelationshipsUpdated"], 20)
        self.assertEqual(receipt["summary"]["publicPackageAudioFilesLinked"], 2724)
        self.assertEqual(receipt["summary"]["steamLooseAudioFilesLinked"], 427)
        self.assertEqual(receipt["summary"]["runtimeBindingsCreated"], 0)
        self.assertFalse(receipt["stageBoundary"]["runtimeSelectable"])
        self.assertNotIn("chr0430", {row["nativeCharacterId"] for row in receipt["bindings"]})
        self.assertEqual(
            next(row for row in receipt["bindings"] if row["nativeCharacterId"] == "chr0310")["heroIds"],
            ["community-review-24-20260907"],
        )

    def test_build_does_not_mutate_unrelated_source_fields(self):
        original = json.loads(MOD.DOWNLOADS.read_text(encoding="utf-8"))
        updated, _ = MOD.build()
        original_by_id = {row["id"]: row for row in original["publicSources"]}
        updated_by_id = {row["id"]: row for row in updated["publicSources"]}
        touched = {
            "parallel-ps-jumpforce-local-10",
            "parallel-ps-jumpforce-local-second10",
            "parallel-ps-jumpforce-local-next32",
            MOD.STEAM_SOURCE_ID,
        }
        for source_id in original_by_id:
            if source_id not in touched:
                self.assertEqual(original_by_id[source_id], updated_by_id[source_id])


if __name__ == "__main__":
    unittest.main()
