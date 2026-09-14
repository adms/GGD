#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("asset_review_builder", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class AssetReviewBuilderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()

    def test_expected_sources_are_aggregated_without_runtime_authority(self):
        summary = self.contract["summary"]
        self.assertEqual(summary["poppEventAudioCandidateCount"], 36)
        self.assertEqual(summary["palworldCreatureCryCandidateCount"], 18)
        self.assertEqual(summary["jumpForceGroupSampleCount"], 89)
        self.assertEqual(summary["palworldMotionCandidateCount"], 18)
        self.assertEqual(summary["borrowedOrDeathSubstitutionCandidateCount"], 0)
        self.assertEqual(summary["kofXivTextureCandidateCount"], 55)
        self.assertEqual(summary["kofXivEffGroupCandidateCount"], 71)
        self.assertEqual(summary["daiVfxTextureComponentCount"], 18)
        self.assertEqual(summary["daiVfxMeshComponentCount"], 8)
        self.assertEqual(summary["poppVfxCandidateCount"], 12)
        self.assertEqual(summary["visualCandidateCount"], 164)
        self.assertGreaterEqual(summary["blockedMotionLeadCount"], 2)
        self.assertEqual(summary["runtimeBindingsChanged"], 0)
        self.assertEqual(summary["approvedDecisionCount"], 0)
        rows = self.contract["audioCandidates"] + self.contract["motionCandidates"] + self.contract["visualCandidates"]
        self.assertEqual(summary["pendingDecisionCount"], len(rows))
        self.assertTrue(all(row["decision"] == "pending" for row in rows))
        self.assertTrue(all(row["runtimeSelectable"] is False for row in rows))
        self.assertTrue(all(row["runtimeBindingChanged"] is False for row in rows))

    def test_visual_candidates_are_sha_pinned_owner_pending_and_runtime_inert(self):
        rows = self.contract["visualCandidates"]
        self.assertEqual(len(rows), 164)
        self.assertTrue(all(row["ownerDecision"] == "pending" for row in rows))
        self.assertTrue(all(row["runtimeMutationAllowed"] is False for row in rows))
        self.assertTrue(all(row["eventCandidates"] == [] for row in rows))
        self.assertTrue(all(row["approvalScope"].endswith("-only") for row in rows))
        previews = [preview for row in rows for preview in row["previewFiles"]]
        self.assertEqual(len(previews), self.contract["summary"]["visualPreviewFileCount"])
        self.assertTrue(all(Path(row["absolutePath"]).is_file() for row in previews))
        self.assertTrue(all(len(row["sha256"]) == 64 and row["bytes"] > 0 for row in previews))

    def test_audio_queue_counts_are_unchanged_by_visual_review_addition(self):
        summary = self.contract["summary"]
        self.assertEqual(summary["audioCandidateCount"], 143)
        self.assertEqual(summary["poppEventAudioCandidateCount"], 36)
        self.assertEqual(summary["palworldCreatureCryCandidateCount"], 18)
        self.assertEqual(summary["jumpForceGroupSampleCount"], 89)

    def test_playable_audio_has_absolute_path_and_sha(self):
        for row in self.contract["audioCandidates"]:
            path = Path(row["file"]["absolutePath"])
            self.assertTrue(path.is_absolute())
            self.assertTrue(path.is_file())
            self.assertEqual(len(row["file"]["sha256"]), 64)
            self.assertGreater(row["file"]["bytes"], 0)
            self.assertTrue(row["gaps"])
            self.assertIn("languageConfidence", row)
            self.assertIn("speakerConfidence", row)

    def test_jumpforce_sample_scope_cannot_authorize_event_binding(self):
        rows = [row for row in self.contract["audioCandidates"] if row["sourceKind"] == "jumpforce-group-identity-sample"]
        self.assertEqual(len(rows), 89)
        self.assertTrue(all(row["approvalScope"] == "group-sample-classification-only" for row in rows))
        self.assertTrue(all(row["eventCandidates"] == [] for row in rows))
        self.assertTrue(all("group-not-expanded-to-event-pairs" in row["gaps"] for row in rows))

    def test_resolved_popp_death_substitution_is_not_requeued(self):
        rows = [row for row in self.contract["motionCandidates"] if row["presentation"]["mode"] == "hurt-ascend-fade"]
        self.assertEqual(rows, [])
        page = MODULE.build_html(self.contract)
        self.assertNotIn("popp-native-hurt-ascend-fade-v1", page)
        self.assertIn("不會重新排入 pending", page)
        self.assertIn("__settled", page)
        self.assertIn("畫面上沒有可見三角形", page)
        self.assertIn("runtimeBindingAuthorized:false", page)

    def test_decision_schema_pins_all_candidates_and_no_runtime_mutation(self):
        schema = MODULE.decision_schema(self.contract)
        props = schema["properties"]
        self.assertEqual(props["runtimeMutationAllowed"]["const"], False)
        self.assertEqual(props["decisions"]["minItems"], self.contract["summary"]["pendingDecisionCount"])
        decision_props = props["decisions"]["items"]["properties"]
        self.assertEqual(decision_props["runtimeBindingAuthorized"]["const"], False)
        self.assertEqual(decision_props["decision"]["enum"], ["pending", "approve", "reject"])
        visual_rule = props["decisions"]["items"]["allOf"][0]
        self.assertEqual(
            len(visual_rule["if"]["properties"]["candidateId"]["enum"]),
            self.contract["summary"]["visualCandidateCount"],
        )
        self.assertEqual(visual_rule["then"]["properties"]["approvedBindings"]["maxItems"], 0)


if __name__ == "__main__":
    unittest.main()
