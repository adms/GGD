import gzip
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_jumpforce_identity_map import build, classify_path, derive_named_audio_identities


class JumpForceIdentityMapTest(unittest.TestCase):
    def test_named_audio_path_is_required_for_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "voice.jsonl.gz"
            rows = [
                {"path": "root/JForce_Dai/extracted/JForce_Dai/chr0430_ActVoice/a.ogg", "groupId": "dai"},
                {"path": "root/no-name/chr9999_ActVoice/a.ogg", "groupId": "unknown"},
            ]
            with gzip.open(path, "wt", encoding="utf-8") as stream:
                for row in rows:
                    stream.write(json.dumps(row) + "\n")
            result, matching_rows = derive_named_audio_identities(path)
            self.assertEqual(matching_rows, 1)
            self.assertEqual(result["chr0430"]["characterName"], "Dai")
            self.assertNotIn("chr9999", result)

    def test_asset_classification_is_conservative(self):
        self.assertEqual(classify_path("Game/Character/chr1/Textures/T_body.uasset", "character-package"), "texture")
        self.assertEqual(classify_path("Game/Character/chr1/chr1_Skeleton.uasset", "character-package"), "skeleton")
        self.assertEqual(classify_path("Game/Character/chr1/body.uasset", "character-package"), "model")
        self.assertEqual(classify_path("Game/Sound/chr1/cue.uasset", "audio-package"), "audio")
        self.assertEqual(classify_path("Game/Effects/chr1/fx.uasset", "vfx-package"), "vfx")
        self.assertIsNone(classify_path("Game/Character/chr1/body.uexp", "character-package"))

    def test_build_keeps_unnamed_token_unresolved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = root / "index.jsonl.gz"
            rows = [
                {"container": "base.pak", "path": "Game/Character/chr0430/body.uasset", "sourceKind": "character-package", "selectedByPatchOrder": True},
                {"container": "base.pak", "path": "Game/Character/chr9999/body.uasset", "sourceKind": "character-package", "selectedByPatchOrder": True},
            ]
            with gzip.open(index, "wt", encoding="utf-8") as stream:
                for row in rows:
                    stream.write(json.dumps(row) + "\n")
            authority = root / "authority.json"
            authority.write_text(json.dumps({
                "schema": "ggd-encrypted-unreal-pak-index@1", "sourceId": "fixture",
                "relationCount": 2, "uniquePathCount": 2,
                "characters": [{"nativeCharacterId": "chr0430", "name": "Dai", "heroIds": ["hero-dai"]}],
            }))
            voice = root / "voice.jsonl.gz"
            with gzip.open(voice, "wt", encoding="utf-8") as stream:
                stream.write(json.dumps({"path": "root/JForce_Dai/chr0430_ActVoice/a.ogg", "groupId": "dai"}) + "\n")
            result = build(index, authority, voice)
            by_token = {row["nativeCharacterIdToken"]: row for row in result["tokens"]}
            self.assertEqual(result["summary"]["highConfidenceIdentities"], 1)
            self.assertEqual(by_token["chr0430"]["heroIds"], ["hero-dai"])
            self.assertEqual(by_token["chr9999"]["identityConfidence"], "unresolved")
            self.assertEqual(by_token["chr9999"]["assetClassCandidates"]["model"]["selectedUassetPathCount"], 1)


if __name__ == "__main__":
    unittest.main()
