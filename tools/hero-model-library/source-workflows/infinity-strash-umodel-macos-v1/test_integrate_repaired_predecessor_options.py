import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "integrate_repaired_predecessor_options",
    HERE / "integrate_repaired_predecessor_options.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class RepairedPredecessorIntegrationTest(unittest.TestCase):
    def test_plan_redirects_six_documents_and_preserves_active_versions(self):
        outputs, plan = MODULE.build(MODULE.DEFAULT_REPO)
        self.assertEqual(len(plan["records"]), 3)
        self.assertTrue(plan["boundaries"]["originalUnsafeBinariesPreserved"])
        self.assertTrue(plan["boundaries"]["activePointersUnchanged"])
        self.assertTrue(plan["boundaries"]["decimatedOptionsRemainPreferred"])
        self.assertFalse(plan["boundaries"]["productionDeploymentVerified"])

        for row in plan["records"]:
            source_doc_path = MODULE.DEFAULT_REPO / "content/models" / f"{row['sourceModelKey']}.json"
            frozen_doc_path = MODULE.DEFAULT_REPO / "content/models" / f"{row['frozenModelKey']}.json"
            source_doc = MODULE.json.loads(outputs[source_doc_path])
            frozen_doc = MODULE.json.loads(outputs[frozen_doc_path])
            repaired_sha = row["repaired"]["sha256"]
            self.assertEqual(Path(source_doc["glbPath"]).stem, repaired_sha)
            self.assertEqual(Path(frozen_doc["glbPath"]).stem, repaired_sha)
            self.assertFalse((MODULE.DEFAULT_REPO / row["original"]["baseGitPath"]).exists())
            self.assertFalse((MODULE.DEFAULT_REPO / row["original"]["frozenGitPath"]).exists())
            self.assertTrue(row["original"]["preservedInGitHistory"])
            self.assertTrue(plan["s3"]["fullGetVerified"])

        for hero_id in {row["heroId"] for row in plan["records"]}:
            champion_path = MODULE.DEFAULT_REPO / "content/champions" / f"{hero_id}.json"
            before = MODULE.read(champion_path)
            after = MODULE.json.loads(outputs[champion_path])
            self.assertEqual(after["modelKey"], before["modelKey"])

    def test_plan_is_byte_deterministic(self):
        first_outputs, first_plan = MODULE.build(MODULE.DEFAULT_REPO)
        second_outputs, second_plan = MODULE.build(MODULE.DEFAULT_REPO)
        self.assertEqual(first_outputs, second_outputs)
        self.assertEqual(first_plan, second_plan)


if __name__ == "__main__":
    unittest.main()
