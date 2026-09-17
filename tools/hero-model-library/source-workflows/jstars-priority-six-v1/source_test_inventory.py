import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("source_inventory.py")
SPEC = importlib.util.spec_from_file_location("jstars_priority_six_source_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SourceInventoryTests(unittest.TestCase):
    def test_archive_classification_does_not_treat_public_sample_as_owner_archive(self):
        self.assertFalse(
            MODULE.is_jstars_archive_candidate(Path("easyrpg-player-0.6.2.3-js.tar.gz"))
        )
        self.assertTrue(MODULE.is_jstars_archive_candidate(Path("j-stars_samples.7z")))
        self.assertEqual(
            MODULE.candidate_kind(Path("j-stars_samples.7z")),
            "public-model-sample",
        )
        self.assertEqual(
            MODULE.candidate_kind(Path("J-Stars Victory Vs+.7z")),
            "owner-archive-candidate",
        )

    def test_missing_archive_scan_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp:
            missing = Path(temp) / "missing"
            result = MODULE.scan_roots(
                [{"id": "test", "path": missing, "recursive": True}]
            )
        self.assertFalse(result["ownerArchiveFound"])
        self.assertEqual(result["candidateCount"], 0)
        self.assertFalse(result["roots"][0]["exists"])

    def test_killua_public_sample_confirms_only_id_and_model_family(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            row = {
                "slug": "killua",
                "name": "Killua Zoldyck",
                "nativeCharacterId": "018",
                "pairs": [
                    {
                        "kind": "i",
                        "pak": {
                            "path": "/sample/character_model_018_i.pak",
                            "requiresUnsupportedCh0Stage": True,
                        },
                        "stpk": {"path": "/sample/character_model_018_i.stpk"},
                        "splitOutputs": [],
                    },
                    {
                        "kind": "m",
                        "pak": {"path": "/sample/character_model_018_m.pak"},
                        "stpk": {"path": "/sample/character_model_018_m.stpk"},
                        "splitOutputs": [
                            {"path": "/split/color_effect_018_killua_m.pak"},
                            {"path": "/split/018_killua_stream_jp_lps_PS3.pak"},
                        ],
                    },
                    {
                        "kind": "v",
                        "pak": {"path": "/sample/character_model_018_v.pak"},
                        "stpk": {"path": "/sample/character_model_018_v.stpk"},
                        "splitOutputs": [],
                    },
                ],
            }
            character = next(row for row in MODULE.PRIORITY_CHARACTERS if row["slug"] == "killua")
            receipt = MODULE.build_character_receipt(
                repo,
                dict(character),
                {"characters": [row]},
                owner_archive_found=False,
            )
        self.assertEqual(receipt["nativeId"], "018")
        self.assertTrue(receipt["modules"]["model"]["candidateContainerFound"])
        self.assertFalse(receipt["modules"]["model"]["runtimeReady"])
        self.assertEqual(
            receipt["modules"]["motion"]["status"],
            "blocked-source-container-not-observed",
        )
        self.assertFalse(receipt["modules"]["voice"]["candidateContainerFound"])
        self.assertTrue(receipt["modules"]["voice"]["relatedMemberObserved"])
        self.assertFalse(receipt["defaultUseEligible"])

    def test_unknown_character_id_is_never_inferred_from_roster_order(self):
        character = next(row for row in MODULE.PRIORITY_CHARACTERS if row["slug"] == "gintoki")
        receipt = MODULE.build_character_receipt(
            Path("/repo"),
            dict(character),
            {"characters": []},
            owner_archive_found=False,
        )
        self.assertIsNone(receipt["nativeId"])
        self.assertEqual(receipt["identityStatus"], "blocked-native-id-unproven")
        self.assertTrue(
            all(not module["candidateContainerFound"] for module in receipt["modules"].values())
        )


if __name__ == "__main__":
    unittest.main()
