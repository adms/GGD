import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class MbaUnusedModelBatch2Test(unittest.TestCase):
    def test_report_and_fixed_indexes_agree(self):
        report_path = ROOT / "materials/hero-model-library/priority-evidence/mba-unused-model-batch2-v1/report.json"
        report = json.loads(report_path.read_text())
        self.assertEqual(report["schema"], "ggd-mba-unused-model-batch2@1")
        self.assertEqual(report["summary"]["componentsAccepted"], 4)
        self.assertEqual(report["summary"]["runtimeSelectable"], 0)
        self.assertEqual(report["summary"]["defaultsChanged"], 0)
        self.assertEqual(len({row["sha256"] for row in report["candidates"]}), 4)
        self.assertTrue(report["conversionStageBackup"]["fullGetVerified"])
        self.assertTrue(report["conversionStageBackup"]["allMemberSha256Verified"])
        self.assertEqual(report["conversionStageBackup"]["fileCount"], 85)
        for row in report["candidates"]:
            body = ROOT / row["gitPath"]
            self.assertEqual(body.stat().st_size, row["bytes"])
            self.assertEqual(hashlib.sha256(body.read_bytes()).hexdigest(), row["sha256"])
            self.assertLess(row["metrics"]["triangles"], 10000)
            self.assertLessEqual(row["metrics"]["drawPrimitives"], 3)
            self.assertLessEqual(row["metrics"]["maxTextureEdge"], 256)
            self.assertEqual(row["metrics"]["nativeClips"], 6)
            self.assertFalse(row["runtimeSelectable"])
            self.assertFalse(row["runtimeDropdownRegistered"])

        downloads = json.loads((ROOT / "materials/hero-model-library/download-sources.json").read_text())
        source = next(row for row in downloads["publicSources"] if row["id"] == report["sourceId"])
        component_ids = {row["id"] for row in source["componentCandidates"]}
        self.assertTrue({row["id"] for row in report["candidates"]}.issubset(component_ids))
        self.assertEqual(len(component_ids), 8)

        current = json.loads((ROOT / "materials/asset-library/current-resources.json").read_text())
        batch = current["mbaUnusedModelBatch2"]
        self.assertEqual(batch["summary"]["componentsAccepted"], 4)
        self.assertEqual(len(batch["candidates"]), 4)
        self.assertFalse(batch["runtimeSelectable"])
        self.assertFalse(batch["productionDeploymentVerified"])


if __name__ == "__main__":
    unittest.main()
