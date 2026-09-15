from __future__ import annotations

import json
from pathlib import Path
import subprocess
import unittest


REPO = Path(__file__).resolve().parents[4]
SCRIPT = Path(__file__).with_name("archive_ssbu_superseded_versions.py")
INVENTORY = REPO / "materials/hero-model-library/source-inventories/ssbu-superseded-conversion-versions.json"
ASSET_ROOT = REPO.parent / "GGD-Asset-Library"


class SupersededSsbuVersionsTest(unittest.TestCase):
    def test_current_candidate_regenerators_preserve_legacy_versions(self) -> None:
        workflows = [
            "integrate_worldblender_c00_batch.py",
            "integrate_worldblender_c00_batch2.py",
            "integrate_worldblender_c00_batch3.py",
        ]
        for workflow in workflows:
            subprocess.run(["python3", str(Path(__file__).with_name(workflow)), "--write"],
                           cwd=REPO, check=True, capture_output=True, text=True)
        subprocess.run([
            "python3", str(Path(__file__).with_name("integrate_sonic_formal_decimation.py")),
            "--repo", str(REPO), "--asset-root", str(ASSET_ROOT), "--write",
        ], cwd=REPO, check=True, capture_output=True, text=True)
        subprocess.run(["python3", str(SCRIPT)], cwd=REPO, check=True, capture_output=True, text=True)

    def test_every_staged_legacy_version_is_archived_and_non_runtime(self) -> None:
        subprocess.run(["python3", str(SCRIPT)], cwd=REPO, check=True, capture_output=True, text=True)
        inventory = json.loads(INVENTORY.read_text())
        self.assertEqual(inventory["summary"]["retainedLegacyConversionVersions"], 9)
        self.assertEqual(inventory["summary"]["runtimeSelectable"], 0)
        self.assertEqual(inventory["summary"]["runtimeDropdownRegistered"], 0)
        self.assertEqual(inventory["summary"]["defaultEligible"], 0)
        for row in inventory["versions"]:
            self.assertEqual(row["state"], "retained-legacy-conversion-stage")
            self.assertFalse(row["componentReady"])
            self.assertFalse(row["fullHeroModel"])
            self.assertFalse(row["runtimeSelectable"])
            self.assertFalse(row["runtimeDropdownRegistered"])
            self.assertFalse(row["defaultEligible"])
            self.assertTrue(row["s3Backup"]["fullGetVerified"])
            self.assertTrue(row["s3Backup"]["allMemberSha256Verified"])
            self.assertNotEqual(row["sourceGlb"]["sha256"], row["supersededBy"]["sha256"])


if __name__ == "__main__":
    unittest.main()
