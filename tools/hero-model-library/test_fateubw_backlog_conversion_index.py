#!/usr/bin/env python3
"""Portable contract checks for the FateUBW 14-servant reserve."""
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "tools/hero-model-library/verify_fateubw_reserve.py"
SPEC = importlib.util.spec_from_file_location("verify_fateubw_reserve", MODULE_PATH)
VERIFY = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VERIFY)


class FateUbwBacklogConversionIndexTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = VERIFY.build_report(ROOT, workspace=None)

    def test_tracked_indexes_are_self_consistent_without_deleted_local_audits(self):
        self.assertEqual([], self.report["errors"])
        self.assertEqual(14, self.report["summary"]["servants"])
        self.assertEqual(42, self.report["summary"]["centralCandidateRecords"])

    def test_fourteen_native_motion_glbs_total_one_hundred_twelve_clips(self):
        self.assertEqual(132, self.report["summary"]["sourceClips"])
        self.assertEqual(112, self.report["summary"]["convertedNativeClips"])
        self.assertEqual(20, self.report["summary"]["unconvertedClips"])

    def test_every_servant_remains_a_non_runtime_arr_reserve(self):
        self.assertEqual("ARR", self.report["license"])
        self.assertIn("republication permission not inferred", self.report["rightsStatus"])
        self.assertEqual(0, self.report["summary"]["runtimeSelectable"])
        self.assertEqual(0, self.report["summary"]["defaultEligible"])
        self.assertEqual(0, self.report["summary"]["deployed"])
        for servant in self.report["servants"]:
            self.assertFalse(servant["runtimeSelectable"])
            self.assertFalse(servant["defaultEligible"])

    def test_s3_receipts_cover_source_and_selected_conversion_archives(self):
        self.assertGreaterEqual(self.report["summary"]["distinctS3Archives"], 3)
        for uri in self.report["s3Archives"]:
            self.assertTrue(uri.startswith("s3://ggd-390630837668-ap-east-2-an/legacy/"))


if __name__ == "__main__":
    unittest.main()
