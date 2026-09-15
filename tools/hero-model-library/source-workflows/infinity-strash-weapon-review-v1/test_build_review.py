#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("infinity_strash_weapon_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class InfinityStrashWeaponReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()
        cls.page = MODULE.build_html(cls.contract)

    def test_popp_owner_choice_is_preserved_and_locked(self):
        self.assertEqual(self.contract["popp"]["selectedCandidateId"], "infinity-strash-popp-pn020-02-kagayaki-native-v1")
        self.assertEqual(sum(row["selectedByOwner"] for row in self.contract["popp"]["candidates"]), 1)
        self.assertTrue(all(row["selectionLockedByReceipt"] for row in self.contract["popp"]["candidates"]))
        self.assertEqual(self.contract["popp"]["deathPresentation"]["status"], "owner-approved-existing-runtime-bound")

    def test_dai_has_two_full_model_choices_and_no_generated_owner_default(self):
        self.assertEqual(len(self.contract["dai"]["candidates"]), 2)
        self.assertIsNone(self.contract["dai"]["ownerSelectedCandidateId"])
        self.assertFalse(self.contract["dai"]["automaticDefaultChangeAllowed"])
        self.assertEqual(sum(row["isCurrentRuntimeSelection"] for row in self.contract["dai"]["candidates"]), 1)
        self.assertTrue(all(row["formalHeroAdoptionEligible"] for row in self.contract["dai"]["candidates"]))
        self.assertTrue(all(row["clipMap"]["death"] == "GGD_native_down" for row in self.contract["dai"]["candidates"]))
        self.assertTrue(all(set(row["reviewContactSheet"]["stateImages"]) == {"idle", "run", "attack", "cast", "hurt", "death"} for row in self.contract["dai"]["candidates"]))

    def test_independent_props_stay_unselectable_until_attachment_fit(self):
        self.assertEqual(len(self.contract["dai"]["independentProps"]), 2)
        self.assertTrue(all(row["accepted"] for row in self.contract["dai"]["independentProps"]))
        self.assertTrue(all(not row["heroAttachmentFitVerified"] for row in self.contract["dai"]["independentProps"]))
        self.assertTrue(all(not row["selectableAsHeroWeapon"] for row in self.contract["dai"]["independentProps"]))

    def test_page_uses_visible_image_evidence_and_one_dai_radio_group(self):
        self.assertIn("background-image:url", self.page)
        self.assertIn("name=\"${group}\"", self.page)
        self.assertIn("sheetCard(c,'dai')", self.page)
        self.assertIn("exp.disabled=!draft.daiWeaponCandidateId", self.page)
        self.assertIn("runtimeMutationAllowed:false", self.page)
        self.assertNotIn("<audio", self.page.lower())


if __name__ == "__main__":
    unittest.main()
