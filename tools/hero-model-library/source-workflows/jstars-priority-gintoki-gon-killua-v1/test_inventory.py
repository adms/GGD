import json
import subprocess
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
INVENTORY = REPO / "materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1/inventory.json"


class JStarsPriorityThreeInventoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(INVENTORY.read_text(encoding="utf-8"))

    def test_generator_is_current(self):
        result = subprocess.run(
            ["python3", str(HERE / "build_inventory.py"), "--check"],
            cwd=REPO, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_identity_and_stage_boundaries(self):
        self.assertEqual(self.data["summary"]["priorityCharacters"], 3)
        self.assertEqual(self.data["summary"]["jstarsConverted"], 0)
        self.assertEqual(self.data["summary"]["jstarsRuntimeRegistered"], 0)
        self.assertEqual(self.data["summary"]["productionDeploymentsVerified"], 0)
        by_slug = {row["slug"]: row for row in self.data["characters"]}
        self.assertEqual(set(by_slug), {"gintoki", "gon", "killua"})
        self.assertIsNone(by_slug["gintoki"]["jstarsNativeId"])
        self.assertIsNone(by_slug["gon"]["jstarsNativeId"])
        self.assertEqual(by_slug["killua"]["jstarsNativeId"], "018")
        self.assertFalse(any(row["jstarsRuntimeRegistered"] for row in by_slug.values()))

    def test_models_and_audio_are_real_local_files(self):
        self.assertEqual(self.data["summary"]["validatedFallbackModels"], 3)
        self.assertEqual(self.data["summary"]["existingRegisteredFallbacks"], 2)
        self.assertEqual(self.data["summary"]["jumpForceAudioFiles"], 494)
        for character in self.data["characters"]:
            evidence = character["modules"]["model"].get("evidence")
            self.assertTrue(Path(evidence["absolutePath"]).is_file())
            self.assertEqual(evidence["khronos"]["numErrors"], 0)

    def test_killua_jstars_is_extracted_but_not_converted(self):
        source = self.data["source"]["jstarsKillua018"]
        self.assertTrue(source["stage"]["sourceObserved"])
        self.assertTrue(source["stage"]["extracted"])
        self.assertFalse(source["stage"]["converted"])
        self.assertGreaterEqual(len(source["files"]), 10)


if __name__ == "__main__":
    unittest.main()
