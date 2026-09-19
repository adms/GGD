import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("cpk_inventory.py")
SPEC = importlib.util.spec_from_file_location("jstars_cpk_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CpkInventoryTests(unittest.TestCase):
    def test_utf_decryption_is_symmetric_for_known_magic(self):
        encrypted = bytes.fromhex("1f9ef3f5")
        self.assertEqual(MODULE.decrypt_utf(encrypted), b"@UTF")

    def test_native_tokens_cover_model_and_assist_paths(self):
        self.assertEqual(
            MODULE.native_tokens("character/model/character_model_018_m.pak"),
            ["018"],
        )
        self.assertEqual(
            MODULE.native_tokens("character/battle_character_assist_skill/018/battle_character_assist_skill_018_02_v.pak"),
            ["018"],
        )
        self.assertEqual(MODULE.native_tokens("sound/JP/CV_018_00_ST_JP.awb"), ["018"])

    def test_module_classification_does_not_claim_runtime_readiness(self):
        self.assertEqual(
            MODULE.classify_modules(
                "partition_op_character_ps3.cpk",
                "character/model/character_model_018_m.pak",
            ),
            ["model", "skeleton", "texture"],
        )
        self.assertEqual(
            MODULE.classify_modules(
                "partition_op_character_ps3.cpk",
                "character/battle_character_sound/jp/battle_character_sound_018_jp_m.pak",
            ),
            ["motion", "sfx", "voice"],
        )

    def test_manifest_gzip_is_deterministic(self):
        rows = [{"container": "a.cpk", "path": "x", "bytes": 1}]
        self.assertEqual(MODULE.manifest_bytes(rows), MODULE.manifest_bytes(rows))

    def test_priority_mapping_comes_from_identity_probe(self):
        identities = MODULE.load_priority_identities(MODULE.default_identity_probe())
        self.assertEqual(
            {slug: row["nativeId"] for slug, row in identities.items()},
            {
                "gintoki": "028", "nube": "041", "gon": "017",
                "killua": "018", "luckyman": "037", "hiei": "012",
            },
        )


if __name__ == "__main__":
    unittest.main()
