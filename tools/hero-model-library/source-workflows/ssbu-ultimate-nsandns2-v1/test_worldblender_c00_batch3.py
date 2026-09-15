#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import unittest


REPO = Path(__file__).resolve().parents[4]
ASSET_ROOT = REPO.parent / "GGD-Asset-Library"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch3-v1"
EXPECTED = {
    "Daisy": ("22114aa5f5b26c5ba7496d9183a703574850ef564413e932f15aca4a3cfb838a", 7890, 6, 136, 7, 72468),
    "Peach": ("b3d4efeef604ea0ea207c63eff3dda3e81093e5f98bc4a1d3c9cb9767eac55bf", 7888, 6, 134, 6, 71940),
    "Toon Link": ("fede3d9ff3b28c942f55e5eed7420d7323e745d02091729c8a7c1840a79d3540", 7894, 6, 96, 7, 99416),
}
EXPECTED_BACKUP_DIRS = {
    "Daisy": "ssbu-worldblender-c00-alpha-fixed-daisy-full-v3",
    "Peach": "ssbu-worldblender-c00-alpha-fixed-peach-full-v3",
    "Toon Link": "ssbu-worldblender-c00-alpha-fixed-toonlink-full-v3",
}
EXPECTED_NEAR_DUPLICATE_PIXELS = {"Peach": 7, "Toon Link": 2}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class WorldblenderC00Batch3Test(unittest.TestCase):
    def test_frozen_batch_is_reproducible_honest_and_backed_up(self) -> None:
        subprocess.run([
            "python3", str(Path(__file__).with_name("freeze_worldblender_c00_batch3.py")),
            "--repo", str(REPO), "--asset-root", str(ASSET_ROOT),
        ], cwd=REPO, check=True, capture_output=True, text=True)
        rows = json.loads((EVIDENCE / "candidate-rows.json").read_text())["candidates"]
        self.assertEqual([row["originalName"] for row in rows], list(EXPECTED))
        for row in rows:
            digest, triangles, draws, joints, textures, finite = EXPECTED[row["originalName"]]
            model = REPO / row["gitPath"]
            self.assertEqual(model.name, digest + ".glb")
            self.assertEqual(sha(model), digest)
            self.assertEqual((row["triangles"], row["drawPrimitives"], row["jointCount"], row["textureCount"]),
                             (triangles, draws, joints, textures))
            self.assertLessEqual(triangles, 8000)
            self.assertLessEqual(draws, 6)
            self.assertEqual(row["nativeAnimationCount"], 0)
            self.assertFalse(row["fullHeroModel"])
            self.assertFalse(row["runtimeDropdownRegistered"])
            self.assertFalse(row["runtimeSelectable"])
            self.assertEqual(row["readiness"], "accepted-independent-static-skinned-component-actions-missing")
            self.assertEqual(row["s3BackupStatus"], "uploaded-and-readback-verified")
            self.assertIn("黑底修復版", row["label"])
            self.assertIn(EXPECTED_BACKUP_DIRS[row["originalName"]], row["s3Uri"])
            self.assertTrue(row["s3Uri"].startswith(row["s3PlannedPrefix"]))
            self.assertEqual(row["s3ManifestUri"], row["s3Uri"].removesuffix(".tar.gz") + ".files.json")
            self.assertFalse(row["ultimate14MotionCandidate"]["sixStateCoverageClaimed"])
            self.assertIn("not-converted", row["ultimate14MotionCandidate"]["status"])
            delivery = json.loads((REPO / row["deliveryEvidence"]["gitPath"]).read_text())
            rebuild = json.loads((REPO / row["sourceRebuildEvidence"]["gitPath"]).read_text())
            validation = json.loads((REPO / row["validationEvidence"]["gitPath"]).read_text())
            visual = json.loads((REPO / row["visualEvidence"]["gitPath"]).read_text())
            backup = json.loads((REPO / row["s3BackupEvidence"]["gitPath"]).read_text())
            alpha = json.loads((REPO / row["alphaAuditEvidence"]["gitPath"]).read_text())
            alpha_finalization = json.loads((REPO / row["alphaAtlasFinalizationEvidence"]["gitPath"]).read_text())
            material_bake = json.loads((REPO / row["materialBakeEvidence"]["gitPath"]).read_text())
            self.assertTrue(rebuild["byteIdenticalRebuild"])
            self.assertEqual(rebuild["firstBuild"]["sha256"], rebuild["secondBuild"]["sha256"])
            self.assertEqual(validation["khronosIssues"]["numErrors"], 0)
            self.assertEqual(validation["khronosIssues"]["numWarnings"], 0)
            self.assertEqual(validation["ggdInspection"]["budget"]["errors"], [])
            self.assertEqual(validation["finiteFloatAccessors"]["valueCount"], finite)
            self.assertEqual(validation["ggdInspection"]["clipCount"], 0)
            self.assertTrue(visual["accepted"])
            self.assertEqual(visual["reviewedViews"], ["front", "back", "isometric"])
            self.assertTrue(delivery["s3Backup"]["fullGetVerified"])
            self.assertTrue(delivery["s3Backup"]["allMemberSha256Verified"])
            self.assertTrue(backup["fullGetVerified"] and backup["allMemberSha256Verified"] and backup["localUnchanged"])
            self.assertTrue(alpha["passed"])
            self.assertEqual(alpha["opaqueTransparentBlockers"], 0)
            self.assertEqual(len(alpha["files"]), 2)
            self.assertTrue(all(item["passed"] for item in alpha["files"]))
            self.assertEqual(alpha_finalization["schema"], "ggd-worldblender-alpha-atlas-finalization@1")
            self.assertEqual(material_bake["schema"], "ggd-ssbu-blend-component-conversion@1")
            self.assertTrue(any("Black-background artifacts were repaired" in item for item in row["limitations"]))
            if row["originalName"] in EXPECTED_NEAR_DUPLICATE_PIXELS:
                near = json.loads((REPO / row["nearDuplicateMaterialFinalizationEvidence"]["gitPath"]).read_text())
                self.assertEqual(near["schema"], "ggd-near-identical-opaque-material-finalization@1")
                self.assertEqual(len(near["adjustments"]), 1)
                self.assertEqual(near["adjustments"][0]["materials"], ["EyeL", "EyeR"])
                self.assertEqual(near["adjustments"][0]["maximumRgbaChannelDifference"], 1)
                self.assertEqual(
                    near["adjustments"][0]["changedPixelCount"],
                    EXPECTED_NEAR_DUPLICATE_PIXELS[row["originalName"]],
                )
                self.assertTrue(near["adjustments"][0]["uvAndSamplerPreserved"])
            else:
                self.assertNotIn("nearDuplicateMaterialFinalizationEvidence", row)
            character = row["nativeId"].split("/")[1]
            for view in ("front", "back", "isometric"):
                self.assertTrue((EVIDENCE / character / f"{view}.png").read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
        toon = next(row for row in rows if row["originalName"] == "Toon Link")
        self.assertTrue(any("eye material" in limitation for limitation in toon["limitations"]))
        self.assertTrue(any("LMabuta/RMabuta" in limitation for limitation in toon["limitations"]))


if __name__ == "__main__":
    unittest.main()
