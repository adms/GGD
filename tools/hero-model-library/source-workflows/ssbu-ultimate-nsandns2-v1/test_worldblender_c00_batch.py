#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import unittest


REPO = Path(__file__).resolve().parents[4]
ASSET_ROOT = REPO.parent / "GGD-Asset-Library"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch-v1"
EXPECTED = {
    "mario": ("87f172896c929c486dfcefd7f905e7bac5c1b0c5b5349cd0a047f744da997257", 7189, 6, 98, 6),
    "link": ("ab6b618b3db1c3d085648bc6a75ea27903595d864756d97efa96f53aa1ae1754", 7897, 6, 145, 5),
    "sonic": ("9c05c3efbb080e8182ff32a2429c2b07a47b01842fe38bbfe1d7414748e56c2a", 8980, 5, 115, 5),
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class WorldblenderC00BatchTest(unittest.TestCase):
    def test_regeneration_preserves_later_sonic_candidate(self) -> None:
        """The earlier c00 batch cannot erase the later formal Sonic build."""
        subprocess.run([
            "python3",
            str(Path(__file__).with_name("integrate_worldblender_c00_batch.py")),
        ], cwd=REPO, check=True, capture_output=True, text=True)
        supplemental = json.loads((
            REPO / "materials/hero-model-library/design-backlog/sources-supplemental.json"
        ).read_text())
        sonic = next(row for row in supplemental["characters"]
                     if row["id"] == "community:ssbu-sonic-c00-standardized-v1")
        self.assertEqual(
            {row["id"] for row in sonic["modelCandidates"]},
            {"ssbu-sonic-c00-static-skinned-v1", "ssbu-sonic-c00-static-skinned-v2"},
        )

    def test_frozen_batch_is_reproducible_and_honest(self) -> None:
        subprocess.run([
            "python3",
            str(Path(__file__).with_name("freeze_worldblender_c00_batch.py")),
            "--repo", str(REPO), "--asset-root", str(ASSET_ROOT),
        ], cwd=REPO, check=True, capture_output=True, text=True)
        rows = json.loads((EVIDENCE / "candidate-rows.json").read_text())["candidates"]
        self.assertEqual([row["originalName"].lower() for row in rows], list(EXPECTED))
        for row in rows:
            key = row["originalName"].lower()
            digest, triangles, draws, joints, textures = EXPECTED[key]
            model = REPO / row["gitPath"]
            self.assertEqual(model.name, digest + ".glb")
            self.assertEqual(sha(model), digest)
            self.assertEqual((row["triangles"], row["drawPrimitives"], row["jointCount"], row["textureCount"]),
                             (triangles, draws, joints, textures))
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
            bake = json.loads((REPO / row["materialBakeEvidence"]["gitPath"]).read_text())
            self.assertGreater(len(bake["materialCompatibilityAdjustments"]), 0)
            if key == "link":
                finalization = json.loads((REPO / row["alphaAtlasFinalizationEvidence"]["gitPath"]).read_text())
                self.assertGreater(finalization["opaqueTransparentSharedAtlasesSeparated"], 0)
            if key == "sonic":
                self.assertTrue(any("8,000-triangle" in item for item in row["limitations"]))
            delivery = json.loads((REPO / row["deliveryEvidence"]["gitPath"]).read_text())
            rebuild = json.loads((REPO / row["sourceRebuildEvidence"]["gitPath"]).read_text())
            validation = json.loads((REPO / row["validationEvidence"]["gitPath"]).read_text())
            visual = json.loads((REPO / row["visualEvidence"]["gitPath"]).read_text())
            self.assertTrue(rebuild["byteIdenticalRebuild"])
            self.assertEqual(rebuild["firstBuild"]["sha256"], rebuild["secondBuild"]["sha256"])
            self.assertEqual(validation["khronosIssues"]["numErrors"], 0)
            self.assertEqual(validation["khronosIssues"]["numWarnings"], 0)
            self.assertEqual(validation["ggdInspection"]["budget"]["errors"], [])
            self.assertEqual(validation["ggdInspection"]["clipCount"], 0)
            self.assertTrue(visual["accepted"])
            self.assertEqual(visual["reviewedViews"], ["front", "back", "isometric"])
            self.assertFalse(delivery["status"]["runtimeSelectable"])
            for view in ("front", "back", "isometric"):
                self.assertTrue((EVIDENCE / key / f"{view}.png").read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
