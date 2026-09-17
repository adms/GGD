import importlib.util
import json
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_catalog.py")
SPEC = importlib.util.spec_from_file_location("source_module_catalog", MODULE_PATH)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MOD)


class CatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = MOD.build_catalog(MOD.repo_root())

    def test_expected_scope_and_counts(self):
        self.assertEqual(self.catalog["schema"], "ggd.source-module-catalog@1")
        self.assertEqual(self.catalog["counts"]["sourceGroups"], 13)
        self.assertEqual(self.catalog["counts"]["candidates"], 537)
        self.assertEqual(self.catalog["counts"]["deployedCandidates"], 0)

    def test_every_candidate_has_all_module_cells(self):
        for group in self.catalog["sourceGroups"]:
            for row in group["candidates"]:
                for name in MOD.MODULES + ("registration", "deployment"):
                    self.assertIn(name, row)
                    self.assertIn("stage", row[name])
                    self.assertIn("count", row[name])
                    self.assertIn("note", row[name])

    def test_large_fragments_use_clone_readable_compact_schema(self):
        root = MOD.repo_root() / "materials/hero-model-library/source-module-catalog-v1"
        for name in ("300-mba.json", "ssbu.json"):
            path = root / name
            stored = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(stored["schema"], "ggd.source-module-catalog-fragment@2")
            self.assertLess(path.stat().st_size, 256 * 1024)
            self.assertFalse(stored["fullAudit"]["restoreRequiredForCatalogBuild"])

    def test_master_section_keeps_truth_boundaries(self):
        text = MOD.markdown(self.catalog)
        self.assertIn("13 組來源、537 筆角色／容器候選", text)
        self.assertIn("正式站部署為 **0**", text)
        self.assertIn("不會因名稱相同", text)
        self.assertIn("owner-cpk-inventoried-native-id-unmapped", text)
        self.assertIn("日文 CV/PV WAV 候選 2394 段", text)
        self.assertIn("已解碼／待審（399）", text)


if __name__ == "__main__":
    unittest.main()
