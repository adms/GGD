import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("popp_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PoppReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()

    def test_three_independent_weapon_options_are_verified_and_owner_selection_is_applied(self):
        review = self.contract["weaponReview"]
        self.assertEqual([row["staff"] for row in review["candidates"]], ["Magikaru", "Mahouno", "Kagayaki"])
        self.assertEqual(review["selectedCandidateId"], "infinity-strash-popp-pn020-02-kagayaki-native-v1")
        self.assertEqual(review["status"], "owner-selection-applied")
        self.assertFalse(review["automaticDefaultChangeAllowed"])
        self.assertTrue(all(row["backendDropdownOptionPresentOnFeatureBranch"] for row in review["candidates"]))
        self.assertEqual(len({row["glb"]["sha256"] for row in review["candidates"]}), 3)

    def test_five_gaps_preserve_review_and_readiness_boundaries(self):
        gaps = self.contract["fiveOpenIntegrationGaps"]
        self.assertEqual(len(gaps), 5)
        self.assertEqual(len({row["id"] for row in gaps}), 5)
        self.assertTrue(all(row["closureCriteria"] for row in gaps))
        self.assertTrue(all(row["nameZh"] for row in gaps))
        death = next(row for row in gaps if row["id"] == "distinct-death-presentation")
        self.assertEqual(death["candidate"]["motionProvenance"], "native PN020 down loop")
        self.assertFalse(death["candidate"]["borrowedMotion"])
        self.assertFalse(death["candidate"]["reviewRequired"])
        self.assertFalse(death["candidate"]["reviewPreview"]["runtimeWorldSpaceCalibrationRequiredAfterApproval"])
        self.assertTrue(death["candidate"]["runtimeImplemented"])
        self.assertEqual(death["status"], "owner-approved-existing-runtime-bound")
        self.assertTrue(death["closed"])
        self.assertFalse(death["remaining"])
        self.assertEqual(self.contract["remainingOpenIntegrationGapCount"], 4)
        self.assertEqual(self.contract["closedIntegrationGapCount"], 1)
        self.assertTrue(all(row["remaining"] for row in gaps if row is not death))
        events = next(row for row in gaps if row["id"] == "animation-events-and-sfx-binding")
        self.assertEqual(events["status"], "blocked-missing-owner-approved-unique-ggd-targets-and-runtime-playback")
        expected_gate_counts = {
            "distinct-death-presentation": (3, 0),
            "source-toon-and-hair-colour-parity": (1, 3),
            "original-vfx-conversion": (1, 4),
            "animation-events-and-sfx-binding": (2, 2),
            "skill-timing-and-full-combat-binding": (1, 3),
        }
        for gap in gaps:
            summary = gap["closureGateSummary"]
            self.assertEqual((summary["verified"], summary["blocked"]), expected_gate_counts[gap["id"]])
            self.assertEqual(summary["total"], summary["verified"] + summary["blocked"])
            self.assertTrue(all(gate["state"] == ("verified" if gate["verified"] else "blocked") for gate in gap["closureGates"]))
        audio = self.contract["audioReviewEvidence"]
        self.assertEqual(audio["fileCount"], 311)
        self.assertFalse(audio["allListeningReviewComplete"])
        self.assertFalse(audio["allSpeakerVerified"])
        self.assertEqual(self.contract["sourceDependencyEvidence"]["vfxReferenceCount"], 17)
        self.assertTrue(self.contract["sourceDependencyEvidence"]["rawPackageNamesAreNotAssetAcquisition"])
        vfx = self.contract["vfxRuntimeCandidates"]
        self.assertEqual(vfx["summary"]["ggdVfxDocumentsBuilt"], 12)
        self.assertEqual(vfx["summary"]["identityExcludedRoots"], 2)
        self.assertEqual(vfx["summary"]["skillBindingsCreated"], 0)
        self.assertEqual(vfx["summary"]["sourceManifestSkillBindingsCreated"], 0)
        self.assertEqual(vfx["summary"]["releasedDocuments"], 12)
        self.assertEqual(vfx["summary"]["visuallyAccepted"], 12)
        self.assertEqual(vfx["summary"]["sourceManifestVisuallyAccepted"], 0)
        proposals = self.contract["vfxBindingReviewProposals"]
        self.assertEqual(proposals["proposedCandidateCount"], 7)
        self.assertEqual(proposals["reserveCandidateCount"], 5)
        self.assertTrue(proposals["policy"]["visuallyApproved"])
        self.assertFalse(proposals["policy"]["runtimeMutationAllowed"])
        self.assertFalse(proposals["policy"]["nativeNiagaraTimingClaim"])
        self.assertEqual(proposals["runtimeBindingsCreated"], 0)
        self.assertEqual(proposals["runtimeAbilityBindingsCreated"], 0)
        gate = self.contract["eventAudioReviewGate"]
        self.assertEqual(gate["candidateCount"], 36)
        self.assertEqual(gate["reviewedCount"], 36)
        self.assertEqual(gate["sourceQueueReviewedCount"], 0)
        self.assertFalse(gate["automaticBindingAllowed"])
        self.assertFalse(gate["runtimeSelectable"])
        owner = self.contract["portalOwnerReview"]
        self.assertEqual(owner["audio"]["approvedCount"], 36)
        self.assertEqual(owner["vfx"]["visuallyApprovedCount"], 12)
        self.assertEqual(owner["audio"]["runtimeBindingAuthorizedCount"], 0)
        self.assertEqual(owner["vfx"]["runtimeBindingAuthorizedCount"], 0)
        self.assertFalse(owner["runtimeMutationAllowed"])
        audio_integration = self.contract["approvedAudioTechnicalIntegration"]
        self.assertEqual(audio_integration["summary"]["gameAudioFiles"], 35)
        self.assertEqual(audio_integration["summary"]["gameAudioCandidateRelationships"], 36)
        self.assertEqual(audio_integration["summary"]["nativeEventRows"], 8)
        self.assertEqual(audio_integration["summary"]["candidateBlockers"], 36)
        self.assertFalse(audio_integration["runtimeSelectable"])

    def test_gap_ledger_keeps_owner_gates_and_single_manual_weapon_default(self):
        ledger = MODULE.build_gap_ledger(self.contract)
        self.assertEqual(ledger["schema"], "ggd.popp-integration-gap-ledger@1")
        self.assertEqual(ledger["summary"]["defined"], 5)
        self.assertEqual(ledger["summary"]["closed"], 1)
        self.assertEqual(ledger["summary"]["remaining"], 4)
        self.assertEqual(ledger["summary"]["eventAudioCandidates"], 36)
        self.assertEqual(ledger["summary"]["eventAudioReviewed"], 36)
        self.assertEqual(ledger["summary"]["eventAudioGameFormatFiles"], 35)
        self.assertEqual(ledger["summary"]["eventAudioCandidateRelationshipsConverted"], 36)
        self.assertEqual(ledger["summary"]["eventAudioNativeEventRows"], 8)
        self.assertEqual(ledger["summary"]["eventAudioRuntimeBlockers"], 36)
        self.assertEqual(ledger["summary"]["ggdVfxCandidates"], 12)
        self.assertEqual(ledger["summary"]["vfxVisuallyAccepted"], 12)
        self.assertEqual(ledger["summary"]["vfxBindingProposals"], 7)
        self.assertEqual(ledger["summary"]["vfxReserveCandidates"], 5)
        self.assertEqual(ledger["summary"]["runtimeBindingsAddedByThisWorkflow"], 0)
        self.assertEqual(ledger["summary"]["closureGates"], 20)
        self.assertEqual(ledger["summary"]["closureGatesVerified"], 8)
        self.assertEqual(ledger["summary"]["closureGatesBlocked"], 12)
        self.assertEqual(ledger["weaponDecision"]["candidateCount"], 3)
        self.assertEqual(
            ledger["weaponDecision"]["selectedCandidateId"],
            "infinity-strash-popp-pn020-02-kagayaki-native-v1",
        )
        self.assertEqual(ledger["weaponDecision"]["selectionMode"], "manual")
        by_id = {row["id"]: row for row in ledger["gaps"]}
        self.assertFalse(by_id["original-vfx-conversion"]["ownerReviewRequiredBeforeRuntimeMutation"])
        self.assertEqual(
            by_id["original-vfx-conversion"]["status"],
            "feature-branch-twelve-candidates-unbound-blocked-native-niagara-timing-and-root-mesh-attribution",
        )
        self.assertTrue(by_id["animation-events-and-sfx-binding"]["ownerReviewRequiredBeforeRuntimeMutation"])

    def test_html_has_visible_state_controls_and_applied_owner_receipt(self):
        page = MODULE.build_html(self.contract)
        self.assertIn("reviewContactSheet", page)
        self.assertIn("實際 WebGL：0%／50%／100%", page)
        self.assertNotIn("<iframe", page)
        self.assertIn("popp-native-down-rise-fade-v1", page)
        self.assertIn("weaponCandidateId:D.weaponReview.selectedCandidateId", page)
        self.assertIn("下載裁決 JSON", page)
        self.assertIn("已核准並鎖定", page)
        self.assertIn("五項權威整合狀態", page)
        self.assertIn("asset-review-portal.html", page)
        self.assertIn("VFX 語意配對（候選，未綁定）", page)
        self.assertIn("closureGateSummary", page)
        self.assertIn("Gate：", page)
        self.assertIn("預覽已核准／候選未綁定", page)
        self.assertIn("candidates.find(x=>x.candidateId===D.weaponReview.selectedCandidateId)", page)
        self.assertNotIn("id=\"clearWeapon\"", page)

    def test_every_candidate_has_a_pinned_visible_contact_sheet(self):
        for row in self.contract["weaponReview"]["candidates"]:
            sheet = row["validation"]["reviewContactSheet"]
            source = MODULE.ROOT / sheet["gitPath"]
            self.assertEqual(MODULE.sha256(source), sheet["sha256"])
            self.assertEqual(sheet["states"], ["idle", "run", "attack", "cast", "hurt", "death"])
            self.assertEqual(sheet["samplesPerState"], [0, 50, 100])


if __name__ == "__main__":
    unittest.main()
