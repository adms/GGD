import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


class InfinityStrashUmodelWorkflowTest(unittest.TestCase):
    def test_patch_has_game_tag_and_section_alignment_fix(self):
        patch = (HERE / "ueviewer-infinity-strash.patch").read_text(encoding="utf-8")
        self.assertIn("GAME_InfinityStrash", patch)
        self.assertIn("strash, GAME_InfinityStrash", patch)
        self.assertIn("uint64 BaseVertexIndex64", patch)
        self.assertIn("S.BaseVertexIndex = (uint32)BaseVertexIndex64", patch)
        self.assertIn("RegisterExporter<UTexture2D>", patch)
        self.assertIn("ExportTexture(Tex)", patch)
        self.assertIn("-arch x86_64", patch)

if __name__ == "__main__":
    unittest.main()
