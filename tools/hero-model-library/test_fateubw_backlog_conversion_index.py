#!/usr/bin/env python3
"""Portable contract checks for the FateUBW 14-servant reserve."""
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
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
        self.assertEqual(61, self.report["summary"]["centralCandidateRecords"])

    def test_fourteen_native_motion_glbs_total_one_hundred_twenty_seven_clips(self):
        self.assertEqual(132, self.report["summary"]["sourceClips"])
        self.assertEqual(127, self.report["summary"]["convertedNativeClips"])
        self.assertEqual(5, self.report["summary"]["unconvertedClips"])
        self.assertEqual(15, self.report["summary"]["newlyConvertedFormulaOrPrePostClips"])
        self.assertEqual(5, self.report["summary"]["retainedNoDurationSourcePoses"])
        self.assertEqual(0, self.report["summary"]["pendingV2S3Backups"])
        self.assertEqual(0, self.report["summary"]["pendingSourceIndexSync"])
        self.assertEqual(0, self.report["summary"]["pendingDesignBacklogSync"])

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

    def test_generated_backlog_has_tracked_overlay_and_no_local_cache_inputs(self):
        backlog = json.loads((ROOT / "materials/hero-model-library/已取得模型待設計英雄.json").read_text())
        candidates = [
            candidate
            for row in backlog["characters"]
            for candidate in row.get("modelCandidates", [])
            if candidate.get("sourceId") == VERIFY.SOURCE_ID
        ]
        self.assertEqual(61, len(candidates))
        self.assertEqual(14, sum(c["id"].endswith("-native-motion-completion-v2") for c in candidates))
        self.assertEqual(5, sum(c["id"].endswith("-durationless-derivative-v1") for c in candidates))
        forbidden = {
            "materials/hero-model-library/design-backlog/resource-coverage.json",
            "materials/hero-model-library/design-backlog/sources-300-mba.json",
            "materials/hero-model-library/design-backlog/sources-community.json",
        }
        self.assertTrue(forbidden.isdisjoint(row["path"] for row in backlog["inputs"]))
        self.assertFalse(any(
            c.get("nativeDurationClaim") is not False
            for c in candidates if c["id"].endswith("-durationless-derivative-v1")
        ))
        family = next(row for row in backlog["resourceCoverage"]["sourceFamilies"]
                      if row["id"] == "fateubw-community")
        self.assertIn("127項已轉換原生動作", family["motion"])
        self.assertIn("5項未提供來源時長", family["motion"])

    def test_portable_generator_checks_without_three_local_cache_files(self):
        files = [
            "tools/hero-model-library/build_model_design_backlog.py",
            "tools/hero-model-library/design_backlog_labels.py",
            "tools/hero-model-library/design_backlog_resources.py",
            "tools/hero-model-library/fateubw_backlog_overlay.py",
            "materials/hero-model-library/已取得模型待設計英雄.json",
            "materials/hero-model-library/已取得模型待設計英雄.md",
            "materials/hero-model-library/download-sources.json",
            "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2.json",
            "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2-s3-backup.json",
            "materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1/batch-manifest.json",
            "materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1/validation.json",
            "materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1/s3-backup-receipt.json",
        ]
        with tempfile.TemporaryDirectory() as directory:
            checkout = Path(directory)
            for relative in files:
                target = checkout / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / relative, target)
            completed = subprocess.run(
                [sys.executable, str(checkout / files[0]), "--check"],
                cwd=checkout, text=True, capture_output=True,
            )
            self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)


if __name__ == "__main__":
    unittest.main()
