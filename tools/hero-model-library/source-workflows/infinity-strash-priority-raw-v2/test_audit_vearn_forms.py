import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("audit_vearn_forms.py")
SPEC = importlib.util.spec_from_file_location("audit_vearn_forms", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class VearnFormAuditTest(unittest.TestCase):
    def test_single_blueprint_body_reports_post_form_absent(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            pak0 = root / "pak0"
            pak1 = root / "pak1"
            repak = root / "repak"
            for path in (pak0, pak1, repak):
                path.write_bytes(b"fixture")
            listings = {
                "pakchunk0": [
                    "strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body.uasset",
                    "strash/Content/Strash/Chara/Monster/EN653/01/SK_EN653_01_model.uasset",
                ],
                "pakchunk1": [],
            }
            report = MODULE.audit(
                [("pakchunk0", pak0), ("pakchunk1", pak1)],
                listings,
                ["/Game/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body"],
                ["EN653_00_a", "EN680_00_a", "EN681_00_a", "EN801_00_a"],
                repak,
            )
            self.assertFalse(report["result"]["postTransformationVearnFullBodyLocated"])
            self.assertEqual(report["en801"]["blueprintNativeIds"], ["EN801"])

    def test_second_en801_body_requires_review(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            pak0 = root / "pak0"
            pak1 = root / "pak1"
            repak = root / "repak"
            for path in (pak0, pak1, repak):
                path.write_bytes(b"fixture")
            listings = {
                "pakchunk0": [
                    "strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body.uasset",
                    "strash/Content/Strash/Chara/Monster/EN801/01/SK_EN801_01_Body.uasset",
                ],
                "pakchunk1": [],
            }
            report = MODULE.audit(
                [("pakchunk0", pak0), ("pakchunk1", pak1)],
                listings,
                ["/Game/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body"],
                ["EN801_00_a"],
                repak,
            )
            self.assertTrue(report["result"]["postTransformationVearnFullBodyLocated"])
            self.assertEqual(report["result"]["status"], "additional-en801-form-needs-review")


if __name__ == "__main__":
    unittest.main()
