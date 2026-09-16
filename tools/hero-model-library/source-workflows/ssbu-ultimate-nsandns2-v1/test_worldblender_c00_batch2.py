#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import unittest


REPO = Path(__file__).resolve().parents[4]
ASSET_ROOT = REPO.parent / "GGD-Asset-Library"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch2-v1"
EXPECTED = {
    "Chrom": ("fb2db67a3741b78e16fd5d5ed09911a8cf7382011896e16bd976701de06e7587", 7890, 6, 123, 7, 88368),
    "Ganondorf": ("46ba09bc4e5bc1eba60479c55136c43cd8c59594690b98618e783ff21183b65b", 7890, 6, 90, 6, 150184),
    "Lucina": ("44b065ca0a0a3191ba9a859c9a30d7f4579f62297f6facc3e9f933c1cdc9e170", 7927, 6, 156, 5, 84324),
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class WorldblenderC00Batch2Test(unittest.TestCase):
    def test_frozen_batch_is_reproducible_honest_and_s3_verified(self) -> None:
        subprocess.run([
            "python3", str(Path(__file__).with_name("freeze_worldblender_c00_batch2.py")),
            "--repo", str(REPO), "--asset-root", str(ASSET_ROOT),
        ], cwd=REPO, check=True, capture_output=True, text=True)
        rows = json.loads((EVIDENCE / "candidate-rows.json").read_text())["candidates"]
        self.assertEqual([row["originalName"] for row in rows], list(EXPECTED))
        for row in rows:
            digest, triangles, draws, joints, textures, finite = EXPECTED[row["originalName"]]
            model = REPO / row["gitPath"]
            self.assertEqual(model.name, digest + ".glb")
            self.assertEqual(sha(model), digest)
            self.assertEqual(
                (row["triangles"], row["drawPrimitives"], row["jointCount"], row["textureCount"]),
                (triangles, draws, joints, textures),
            )
            self.assertEqual(row["nativeAnimationCount"], 0)
            self.assertFalse(row["fullHeroModel"])
            self.assertFalse(row["runtimeDropdownRegistered"])
            self.assertFalse(row["runtimeSelectable"])
            self.assertEqual(row["readiness"], "accepted-independent-static-skinned-component-actions-missing")
            self.assertIn("黑底修復版", row["label"])
            self.assertIn("black-background repair", row["auditEvidence"])
            alpha = json.loads((REPO / row["alphaAuditEvidence"]["gitPath"]).read_text())
            self.assertTrue(alpha["passed"])
            self.assertEqual(alpha["opaqueTransparentBlockers"], 0)
            self.assertEqual(len(alpha["files"]), 2)
            finalization = json.loads((REPO / row["alphaAtlasFinalizationEvidence"]["gitPath"]).read_text())
            self.assertGreaterEqual(finalization.get("opaqueTransparentSharedAtlasesSeparated", 0), 0)
            bake = json.loads((REPO / row["materialBakeEvidence"]["gitPath"]).read_text())
            self.assertGreater(len(bake["materialCompatibilityAdjustments"]), 0)
            self.assertEqual(row["s3BackupStatus"], "uploaded-and-readback-verified")
            self.assertTrue(row["s3Uri"].startswith(row["s3PlannedPrefix"]))
            self.assertEqual(row["s3ManifestUri"], row["s3Uri"].removesuffix(".tar.gz") + ".files.json")
            self.assertFalse(row["ultimate14MotionCandidate"]["sixStateCoverageClaimed"])
            self.assertIn("not-converted", row["ultimate14MotionCandidate"]["status"])
            delivery = json.loads((REPO / row["deliveryEvidence"]["gitPath"]).read_text())
            rebuild = json.loads((REPO / row["sourceRebuildEvidence"]["gitPath"]).read_text())
            validation = json.loads((REPO / row["validationEvidence"]["gitPath"]).read_text())
            visual = json.loads((REPO / row["visualEvidence"]["gitPath"]).read_text())
            self.assertTrue(rebuild["byteIdenticalRebuild"])
            self.assertEqual(rebuild["firstBuild"]["sha256"], rebuild["secondBuild"]["sha256"])
            self.assertEqual(validation["khronosIssues"]["numErrors"], 0)
            self.assertEqual(validation["khronosIssues"]["numWarnings"], 0)
            self.assertEqual(validation["ggdInspection"]["budget"]["errors"], [])
            self.assertEqual(validation["finiteFloatAccessors"]["valueCount"], finite)
            self.assertEqual(validation["ggdInspection"]["clipCount"], 0)
            self.assertTrue(visual["accepted"])
            self.assertEqual(visual["reviewedViews"], ["front", "back", "isometric"])
            self.assertEqual(delivery["s3Backup"]["status"], "uploaded-and-readback-verified")
            self.assertTrue(delivery["s3Backup"]["fullGetVerified"])
            self.assertTrue(delivery["s3Backup"]["allMemberSha256Verified"])
            self.assertFalse(delivery["status"]["runtimeSelectable"])
            character = row["nativeId"].split("/")[1]
            for view in ("front", "back", "isometric"):
                self.assertTrue((EVIDENCE / character / f"{view}.png").read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
