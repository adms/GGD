#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("fuc_psp_asset_audit", HERE / "build_psp_asset_audit.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class PspAssetAuditTests(unittest.TestCase):
    def test_live_sources_remain_platform_separated(self):
        report = MODULE.build()
        summary = report["summary"]
        self.assertEqual(2, summary["originalPspInventoryRows"])
        self.assertEqual(0, summary["originalPspPayloadsPresent"])
        self.assertEqual(0, summary["originalPspPayloadBytesRead"])
        self.assertEqual(0, summary["nativeFucPackages"])
        self.assertEqual(0, summary["nativeFucMotionEntries"])
        self.assertEqual(0, summary["nativeFucVfxEntries"])
        self.assertEqual(13, summary["standardGlbCandidates"])
        self.assertEqual(13, summary["standardGlbCandidatesVerified"])
        self.assertEqual(103, summary["pspCommunityReplacementTextures"])
        self.assertEqual(653, summary["ps2AudioFiles"])
        self.assertTrue(all(not row["runtimeSelectable"] for row in report["sources"]))
        self.assertTrue(all(row["fileVerification"]["allMemberSha256Verified"] for row in report["sources"]))

    def test_unknown_platform_models_are_not_promoted_to_psp(self):
        report = MODULE.build()
        model_sources = [row for row in report["sources"] if row["modelCandidateCount"]]
        self.assertTrue(model_sources)
        self.assertTrue(all(row["platformClass"] == "platform-unverified-community-supplemental" for row in model_sources))
        kirei = next(row for row in model_sources if row["sourceId"] == "gamebanana-fuc-kotomine-kirei-291438")
        self.assertEqual(349, kirei["motionEntries"])
        self.assertEqual(0, kirei["nativeFucMotionEntries"])


if __name__ == "__main__":
    unittest.main()
