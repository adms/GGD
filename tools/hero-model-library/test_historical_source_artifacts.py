import json
import unittest
from pathlib import Path

from current_resource_index import verify_component_git_contents
from historical_components import source_historical_artifacts, source_historical_components


ROOT = Path(__file__).resolve().parents[2]


class HistoricalSourceArtifactsTest(unittest.TestCase):
    def test_four_recovered_components_remain_in_git_and_design_backlog(self):
        downloads = json.loads((ROOT / "materials/hero-model-library/download-sources.json").read_text())
        components = {row["id"]: row for row in source_historical_components(downloads, ROOT)}
        expected = {
            "historical-astralym-7bc2fa3f8": (
                "618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8",
                "community:palworld-astralym",
                "designed",
            ),
            "historical-jetragon-7bc2fa3f8": (
                "0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c1a07c3bbf9106fa6",
                "community:palworld-jetragon",
                "designed",
            ),
            "historical-kita-kita-7bc2fa3f8": (
                "be6148045377a8207a09f7bb5834f4e9104eaadc6822d8a94c315f4510c9740e",
                "mba:Chara14",
                "not-defined",
            ),
            "historical-lord-nightmares-7bc2fa3f8": (
                "98ba248a71e17db1bc3ac783d89d4f6aa1c683cd659ad0bd2d5ae89e32b49b8c",
                "mba:Chara13",
                "not-defined",
            ),
        }
        backlog = json.loads((ROOT / "materials/hero-model-library/已取得模型待設計英雄.json").read_text())
        backlog_by_id = {row["id"]: row for row in backlog["characters"]}

        for component_id, (digest, identity_id, design_status) in expected.items():
            self.assertIn(component_id, components)
            component = components[component_id]
            self.assertEqual(component["sha256"], digest)
            self.assertIn(identity_id, component["identityIds"])
            self.assertTrue(component["componentReady"])
            self.assertFalse(component["runtimeSelectable"])
            self.assertEqual(component["heroIds"], [])
            self.assertIn(identity_id, backlog_by_id)
            self.assertEqual(backlog_by_id[identity_id]["designStatus"], design_status)

        # Presence in a dirty worktree is insufficient after the original merge
        # deletion. Require all four normalized replacements in the Git index.
        verify_component_git_contents([components[key] for key in expected], ROOT)

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
        # A local file is not delivery evidence.  The exact historical bytes
        # must also exist in the Git index at the catalogued path.
        verify_component_git_contents(rows, ROOT)


if __name__ == "__main__":
    unittest.main()
