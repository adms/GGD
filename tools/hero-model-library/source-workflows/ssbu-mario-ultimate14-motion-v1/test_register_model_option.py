#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("mario_option_preflight", HERE / "register_model_option.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class MarioOptionPreflightTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.receipt = MODULE.build_receipt()

    def test_registration_is_blocked_without_mutating_existing_default(self):
        self.assertEqual(self.receipt["status"], "blocked-not-registered")
        selection = self.receipt["hero"]["existingSelection"]
        self.assertEqual(selection["modelOptions"], ["imported.linkstik"])
        self.assertEqual(selection["proxyModel"], "imported.linkstik")
        self.assertTrue(selection["manualOrProxyDefaultPreserved"])
        self.assertFalse(self.receipt["result"]["runtimeDropdownRegistered"])
        self.assertFalse(self.receipt["result"]["optionListChanged"])
        self.assertFalse(self.receipt["result"]["defaultChanged"])

    def test_component_is_valid_but_has_no_semantic_mapping(self):
        option = self.receipt["proposedOption"]
        self.assertEqual(option["triangles"], 7189)
        self.assertEqual(len(option["nativeClips"]), 5)
        self.assertTrue(all(name.startswith("d01special") for name in option["nativeClips"]))
        self.assertEqual(option["approvedSemanticMapping"], {})
        self.assertEqual(option["requiredSemanticStates"], ["idle", "run", "attack", "cast", "hurt", "death"])
        self.assertLessEqual(option["reservedModelIdLength"], 64)
        self.assertFalse(option["modelDocumentCreated"])
        self.assertTrue(self.receipt["validation"]["runtimeBudgetPass"])
        self.assertEqual(self.receipt["validation"]["khronosErrors"], 0)
        self.assertEqual(self.receipt["validation"]["khronosWarnings"], 0)
        self.assertEqual(self.receipt["validation"]["visualSamplesReadBack"], 15)

    def test_unverified_borrowed_motion_stays_out_of_playable_review(self):
        borrowed = self.receipt["borrowedMotion"]
        self.assertEqual(borrowed["blockedLeadId"], "mario-linkstik-to-ssbu-c00-six-state-v1")
        self.assertFalse(borrowed["playableReviewEligible"])
        self.assertEqual(borrowed["compatiblePlayableCandidates"], 0)
        blockers = " ".join(self.receipt["blockers"])
        self.assertIn("idle", blockers)
        self.assertIn("d01special", blockers)
        self.assertIn("target-side playback evidence", blockers)


if __name__ == "__main__":
    unittest.main()
