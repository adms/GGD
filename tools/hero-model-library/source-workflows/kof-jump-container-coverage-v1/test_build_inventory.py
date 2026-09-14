import gzip
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_inventory import build_jump, build_kof


class CoverageInventoryTest(unittest.TestCase):
    def test_jump_infers_tokens_without_claiming_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = root / "index.jsonl.gz"
            rows = [
                {"container": "base.pak", "path": "Game/chr0001/model.uasset", "sourceKind": "character-package", "selectedByPatchOrder": False},
                {"container": "patch.pak", "path": "Game/chr0001/model.uasset", "sourceKind": "character-package", "selectedByPatchOrder": True},
                {"container": "patch.pak", "path": "Game/chr9999/fx.uasset", "sourceKind": "vfx-package", "selectedByPatchOrder": True},
            ]
            with gzip.open(index, "wt", encoding="utf-8") as stream:
                for row in rows:
                    stream.write(json.dumps(row) + "\n")
            authority = root / "authority.json"
            authority.write_text(json.dumps({
                "schema": "ggd-encrypted-unreal-pak-index@1", "sourceId": "fixture", "relationCount": 3,
                "uniquePathCount": 2, "containerCount": 2,
                "sourceKindRelationCounts": {"character-package": 2, "vfx-package": 1},
                "sourceKindSelectedPathCounts": {"character-package": 1, "vfx-package": 1},
                "containers": [
                    {"name": "base.pak", "bytes": 10, "entryCount": 1},
                    {"name": "patch.pak", "bytes": 20, "entryCount": 2},
                ],
            }))
            result = build_jump(index, authority, root / "absent")
            self.assertEqual(result["inferredNativeCharacterIdTokens"], 2)
            self.assertTrue(all(row["identityState"] == "path-token-only-unmapped" for row in result["characterPathTokens"]))
            self.assertEqual(result["characterPathTokens"][0]["selectedPathRelationCount"], 1)

            identity = root / "identity.json"
            identity.write_text(json.dumps({
                "schema": "ggd.jumpforce.native-character-map.v1",
                "characters": {"0001": {"name": "Known", "existingGroupId": "known-audio", "heroIds": ["hero-known"]}},
            }))
            joined = build_jump(index, authority, root / "absent", identity)
            self.assertEqual(joined["knownIdentityCrosswalks"], 1)
            self.assertEqual(joined["unmappedNativeCharacterIdTokens"], 1)
            self.assertEqual(joined["characterPathTokens"][0]["characterName"], "Known")

            generated_identity = root / "generated-identity.json"
            generated_identity.write_text(json.dumps({
                "schema": "ggd.jumpforce.identity-map@1",
                "tokens": [{
                    "nativeCharacterIdToken": "chr0001", "characterName": "Known",
                    "identityState": "exact-named-audio-source-crosswalk", "identityConfidence": "high",
                    "heroIds": ["hero-known"], "existingAudioGroupIds": ["named-audio"],
                    "identityScope": "character-family", "identityEvidence": {"matchingRows": 2},
                    "assetClassCandidates": {"model": {"selectedUassetPathCount": 1}},
                }],
            }))
            generated_join = build_jump(index, authority, root / "absent", generated_identity)
            first = generated_join["characterPathTokens"][0]
            self.assertEqual(first["identityConfidence"], "high")
            self.assertEqual(first["existingAudioGroupIds"], ["named-audio"])
            self.assertEqual(first["assetClassCandidates"]["model"]["selectedUassetPathCount"], 1)

    def test_kof_separates_listing_only_from_extracted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            listing = root / "listing.log"
            listing.write_text("  0000000000000001 12 Chara/MAI/MAI.obac\n  0000000000000002 34 Chara/NEW/NEW.otra\n")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({
                "schema": "ggd-kofxiv-priority-extraction@1", "sourceId": "fixture", "installedReleaseMarker": "v1",
                "wadIndex": {"totalEntries": 2}, "source": {"bytes": 99, "sha256": "a" * 64},
                "characters": [{"nativeCharacterId": "MAI", "nameZh": "不知火舞", "originalName": "Mai", "heroIds": ["hero-mai"]}],
            }))
            result = build_kof(listing, manifest, root / "absent.wad")
            by_id = {row["nativeCharacterIdToken"]: row for row in result["characters"]}
            self.assertEqual(by_id["MAI"]["acquisition"], "selected-files-extracted-and-sha256-verified")
            self.assertEqual(by_id["NEW"]["acquisition"], "wad-listing-only")
            self.assertEqual(by_id["NEW"]["heroIds"], [])


if __name__ == "__main__":
    unittest.main()
