import json
import unittest
from pathlib import Path

from historical_components import source_historical_artifacts


ROOT = Path(__file__).resolve().parents[2]


class HistoricalSourceArtifactsTest(unittest.TestCase):
    def test_exact_pre_normalization_versions_remain_archived_and_non_runtime(self):
        downloads = json.loads((ROOT / "materials/hero-model-library/download-sources.json").read_text())
        rows = source_historical_artifacts(downloads, ROOT)
        self.assertEqual(
            {row["sha256"] for row in rows},
            {
                "2bbff051c41157f9c9abdf9e9ca6c0b930e15687380f109eefdf208af5d4eb8c",
                "d5cf4ff0969a21787bfcdd1fabf787339e91c37e266231602004fc2edb5993c8",
            },
        )
        for row in rows:
            self.assertFalse(row["componentReady"])
            self.assertFalse(row["runtimeSelectable"])
            self.assertFalse(row["runtimeDropdownRegistered"])
            self.assertNotEqual(row["sha256"], row["normalizedReplacementSha256"])
            self.assertTrue((ROOT / row["gitPath"]).is_file())


if __name__ == "__main__":
    unittest.main()
