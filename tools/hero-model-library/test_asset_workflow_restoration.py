import json
import unittest
from pathlib import Path

from build_asset_workflow_restoration import build
from current_resource_index import verify_git_contents


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = (
    ROOT
    / "materials/hero-model-library/priority-evidence/asset-workflow-restoration/manifest.json"
)


class AssetWorkflowRestorationTest(unittest.TestCase):
    def test_manifest_matches_reviewed_restoration(self):
        expected = json.loads(MANIFEST.read_text())
        self.assertEqual(build(), expected)
        self.assertEqual(expected["summary"]["restoredFiles"], 411)
        self.assertEqual(expected["summary"]["historicalByteExactFiles"], 410)
        self.assertEqual(expected["summary"]["reviewedPostDeletionFixFiles"], 1)

    def test_every_restored_workflow_is_in_git_with_exact_bytes(self):
        manifest = json.loads(MANIFEST.read_text())
        verify_git_contents(manifest["files"], ROOT)


if __name__ == "__main__":
    unittest.main()
