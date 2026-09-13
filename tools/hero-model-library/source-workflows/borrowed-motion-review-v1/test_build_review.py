#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("borrowed_motion_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class BorrowedMotionReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads(MODULE.SOURCE.read_text())
        cls.contract = MODULE.build_contract(cls.source)

    def test_candidate_is_pinned_playable_and_default_pending(self):
        self.assertEqual(self.contract["schema"], "ggd.borrowed-motion-review@1")
        self.assertEqual(self.contract["summary"]["playableCandidateCount"], 1)
        candidate = self.contract["candidates"][0]
        self.assertEqual(candidate["id"], "popp-native-hurt-ascend-fade-v1")
        self.assertEqual(candidate["clip"]["embeddedName"], "GGD_native_down")
        self.assertEqual(candidate["skeletonCompatibility"]["status"], "compatible-verified")
        self.assertIsNone(candidate["review"]["decision"])
        self.assertFalse(candidate["review"]["runtimeBindingChanged"])
        self.assertGreaterEqual(len(candidate["validationEvidence"]), 1)
        for evidence in candidate["validationEvidence"]:
            self.assertEqual(len(evidence["sha256"]), 64)

    def test_blocked_retarget_is_not_misrepresented_as_playable(self):
        self.assertEqual(self.contract["summary"]["blockedLeadCount"], 1)
        lead = self.contract["blockedLeads"][0]
        self.assertEqual(lead["motionKind"], "retargeted")
        self.assertFalse(lead["playableReviewEligible"])
        self.assertFalse(lead["decisionAvailable"])
        self.assertIn("unsupported extensions", " ".join(lead["blockers"]))

    def test_html_reuses_existing_audition_and_exports_no_runtime_authority(self):
        page = MODULE.build_html(self.contract)
        self.assertIn("/champion-model-audition.html", page)
        self.assertIn("data-decision=\"approve\"", page)
        self.assertIn("data-decision=\"reject\"", page)
        self.assertIn("重新播放原始 clip", page)
        self.assertIn("播放升天淡出替代演出", page)
        self.assertIn("live=1", page)
        self.assertIn("viewer-status", page)
        self.assertIn("loadAndWait(true)", page)
        self.assertIn("viewer.animate", page)
        self.assertNotIn("setTimeout(()=>viewer.classList.add('rise')", page)
        self.assertIn("runtimeBindingAuthorized:false", page)
        self.assertIn("hurt-ascend-fade", page)
        self.assertIn("same-work-borrowed", json.dumps(self.contract, ensure_ascii=False))
        self.assertIn("JSON.stringify(receipt,null,2)+'\\n'", page)

    def test_source_policy_refuses_default_approval_and_runtime_mutation(self):
        altered = json.loads(json.dumps(self.source))
        altered["policy"]["defaultDecision"] = "approve"
        with self.assertRaisesRegex(ValueError, "defaultDecision"):
            MODULE.build_contract(altered)
        altered = json.loads(json.dumps(self.source))
        altered["policy"]["runtimeMutationAllowed"] = True
        with self.assertRaisesRegex(ValueError, "runtime mutation"):
            MODULE.build_contract(altered)

    def test_source_contract_rejects_mislabeled_presentation(self):
        altered = json.loads(json.dumps(self.source))
        altered["candidates"][0]["presentation"]["mode"] = "none"
        with self.assertRaisesRegex(ValueError, "presentation mode"):
            MODULE.build_contract(altered)

        altered = json.loads(json.dumps(self.source))
        altered["candidates"][0]["presentation"]["runtimeWorldSpaceCalibrationRequired"] = False
        with self.assertRaisesRegex(ValueError, "runtime calibration"):
            MODULE.build_contract(altered)


if __name__ == "__main__":
    unittest.main()
