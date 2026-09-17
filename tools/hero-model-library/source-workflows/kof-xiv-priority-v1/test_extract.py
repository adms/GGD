#!/usr/bin/env python3

import importlib.util
from pathlib import Path
import unittest


SPEC = importlib.util.spec_from_file_location("kofxiv_extract", Path(__file__).with_name("extract.py"))
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ExtractTests(unittest.TestCase):
    def test_parse_listing_limits_scope_and_rejects_traversal(self):
        text = "  0000000000000010 12         Chara/MAI/a.obac\n  0000000000000020 3          Stage/x.bin\n"
        self.assertEqual(MODULE.parse_listing(text), [{"offset": 16, "bytes": 12, "path": "Chara/MAI/a.obac"}])
        with self.assertRaisesRegex(ValueError, "unsafe path"):
            MODULE.parse_listing("  0000000000000010 12         Chara/MAI/../../escape.bin\n")

    def test_asset_classification(self):
        self.assertEqual(MODULE.classify("Chara/MAI/MAI.obac"), "model")
        self.assertEqual(MODULE.classify("Chara/MAI/MAI.omir"), "skeleton")
        self.assertEqual(MODULE.classify("Chara/MAI/MAI.otra"), "animation")
        self.assertEqual(MODULE.classify("Chara/MAI/MAI_COL.dds"), "texture")
        self.assertEqual(MODULE.classify("Chara/MAI/Sound/voice/v.ogg"), "audio")


if __name__ == "__main__":
    unittest.main()
