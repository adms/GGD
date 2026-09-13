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
        self.assertGreaterEqual(summary["borrowedOrDeathSubstitutionCandidateCount"], 1)
        self.assertGreaterEqual(summary["blockedMotionLeadCount"], 2)
        self.assertEqual(summary["runtimeBindingsChanged"], 0)
        self.assertEqual(summary["approvedDecisionCount"], 0)
        rows = self.contract["audioCandidates"] + self.contract["motionCandidates"]
        self.assertEqual(summary["pendingDecisionCount"], len(rows))
        self.assertTrue(all(row["decision"] == "pending" for row in rows))
        self.assertTrue(all(row["runtimeSelectable"] is False for row in rows))
        self.assertTrue(all(row["runtimeBindingChanged"] is False for row in rows))

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

    def test_death_substitution_stays_explicit_and_reviewable(self):
        rows = [row for row in self.contract["motionCandidates"] if row["presentation"]["mode"] == "hurt-ascend-fade"]
        self.assertGreaterEqual(len(rows), 1)
        self.assertTrue(all(row["semanticState"] == "death" for row in rows))
        self.assertTrue(all(row["presentation"]["runtimeWorldSpaceCalibrationRequired"] for row in rows))
        page = MODULE.build_html(self.contract)
        self.assertIn("播放受傷＋升天淡出", page)
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


if __name__ == "__main__":
    unittest.main()
