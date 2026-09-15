import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = (
    Path(__file__).parent
    / "source-workflows/ultimate14-motion-audit-20260912-v1/audit.py"
)
SPEC = importlib.util.spec_from_file_location("ultimate14_motion_audit", MODULE_PATH)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class Ultimate14MotionAuditTest(unittest.TestCase):
    def test_repeated_generation_replaces_existing_motion_label(self):
        base = "整庫 49 個 Blender 候選；原檔均無 Action datablock。"
        generated = "Ultimate14 NUANMB 已逐檔解析：link: 本體 3檔／3種內容。"
        self.assertEqual(
            base,
            AUDIT.without_existing_motion_label(f"{base} {generated} {generated}"),
        )

    def test_historical_motion_label_is_replaced(self):
        base = "骨架不等於已取得動作。"
        self.assertEqual(
            base,
            AUDIT.without_existing_motion_label(
                f"{base} 另有 MOD 動作：parallel-ns-ultimate14 64檔／8種 SHA；未轉 GGD。"
            ),
        )


if __name__ == "__main__":
    unittest.main()
