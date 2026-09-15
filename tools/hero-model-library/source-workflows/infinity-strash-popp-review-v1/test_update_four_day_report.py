import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("popp_report", HERE / "update_four_day_report.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PoppReportTest(unittest.TestCase):
    def test_render_is_ledger_derived_and_preserves_review_boundaries(self):
        payload = MODULE.read_ledger()
        rendered = MODULE.render(payload)
        self.assertIn("已關閉 1／剩餘 4", rendered)
        self.assertIn("機器 gate 共 20 項：已驗證 8，阻擋 12", rendered)
        self.assertIn("事件音訊候選 36 個", rendered)
        self.assertIn("GGD VFX 候選 12 個", rendered)
        self.assertIn("7 個已依來源名稱整理成 Q/W/R 審查提案", rendered)
        self.assertIn("5 個保留未配對", rendered)
        self.assertIn("逐項聽審 36", rendered)
        self.assertIn("新增的 VFX 技能綁定為 0", rendered)
        self.assertIn("Q/W/R 維持既有共用 VFX", rendered)
        self.assertIn("root-specific mesh layer 仍明列缺口", rendered)
        self.assertIn("Kagayaki", rendered)
        self.assertIn("modelSelectionMode=manual", rendered)
        for row in payload["gaps"]:
            self.assertIn(f"`{row['id']}`", rendered)

    def test_current_report_matches_generator(self):
        original = MODULE.REPORT.read_text(encoding="utf-8")
        self.assertEqual(original, MODULE.expected(original, MODULE.render(MODULE.read_ledger())))


if __name__ == "__main__":
    unittest.main()
