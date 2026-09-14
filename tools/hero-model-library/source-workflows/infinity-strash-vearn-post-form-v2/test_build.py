import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build.py")
SPEC = importlib.util.spec_from_file_location("vearn_post_form_build", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class VearnPostFormBuildTest(unittest.TestCase):
    def test_categories_are_explicit(self):
        fixtures = {
            "strash/Content/WwiseAudio/Events/EN_Boss/EN801_Vearn/Foo.uasset": "audio",
            "strash/Content/Strash/VFX/NPS/NPS_EN801_Foo.uasset": "vfx",
            "strash/Content/Strash/Chara/Monster/EN801/Animations/AS_EN801_Foo.uasset": "motion",
            "strash/Content/Strash/Chara/Monster/EN801/SK_EN801_Skeleton.uasset": "skeleton",
            "strash/Content/Strash/Chara/Monster/EN801/00/T_EN801_Body_Base.uasset": "texture",
            "strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_Body.uasset": "model",
            "strash/Content/Strash/Chara/Monster/EN801/00/MI_EN801_Body.uasset": "material",
            "strash/Content/Strash/Chara/Monster/EN801/CB_EN801_00_a.uasset": "configuration",
        }
        for path, expected in fixtures.items():
            with self.subTest(path=path):
                self.assertEqual(MODULE.classify(path), expected)

    def test_post_form_patterns_do_not_match_mystvearn_or_baran(self):
        safe = [
            "EN653_MystVearn",
            "EN680_Baran",
            "EN681_RyuBaran",
            "EN801_Vearn",
        ]
        for value in safe:
            self.assertFalse(any(pattern.search(value) for pattern in MODULE.POST_FORM_PATTERNS))

    def test_post_form_patterns_find_explicit_names(self):
        for value in ("TrueDarkKingVearn", "Vearn_Young", "post-vearn"):
            self.assertTrue(any(pattern.search(value) for pattern in MODULE.POST_FORM_PATTERNS))


if __name__ == "__main__":
    unittest.main()
