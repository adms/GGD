import importlib.util
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jump_full_report", HERE / "update_four_day_report.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class UpdateFourDayReportTest(unittest.TestCase):
    def test_generated_block_contains_all_fixed_counts_and_characters(self):
        plan = MOD.load_plan()
        generated = MOD.block(plan)
        self.assertIn("63 個高信度", generated)
        self.assertIn("9 批", generated)
        self.assertIn("86,238 筆", generated)
        self.assertIn("3,466 檔／23,856,777,652 bytes", generated)
        self.assertIn("6/6", generated)
        self.assertIn("不再需要 LV99 分享", generated)
        self.assertIn("S3 狀態為 `pending`", generated)
        self.assertIn("`mirrorPak=6/6`", generated)
        self.assertIn("`extracted=0`", generated)
        self.assertIn("`convertedModel=0`", generated)
        self.assertIn("`backend=0`", generated)
        self.assertIn("`deployed=0`", generated)
        for row in plan["characters"]:
            self.assertIn(f"`{row['nativeCharacterId']}` {row['characterName']}", generated)

    def test_write_then_check_is_stable(self):
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "report.md"
            report.write_text("# fixture\n\n" + MOD.BOUNDARY + "\n")
            MOD.update(report, write=True)
            first = report.read_bytes()
            MOD.update(report, write=False)
            MOD.update(report, write=True)
            self.assertEqual(first, report.read_bytes())

    def test_repository_report_is_current(self):
        MOD.update(write=False)


if __name__ == "__main__":
    unittest.main()
