import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("import_gap_listening_decisions.py")
SPEC = importlib.util.spec_from_file_location("import_gap_listening_decisions", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class GapDecisionImportTest(unittest.TestCase):
    def test_current_owner_export_validates_exact_source_bytes(self):
        source = Path("/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Downloads/lol-gap-listening-decisions.json")
        if not source.is_file():
            self.skipTest("owner export is not available")
        result = mod.validate(json.loads(source.read_text()))
        self.assertEqual(result["summary"], {"reviewed": 4, "approved": 4, "rejected": 0, "pending": 0})
        self.assertEqual({row["proposedTarget"] for row in result["decisions"]}, {"ability-Q"})
        self.assertTrue(all(row["nativeId"] == "Xerath" for row in result["decisions"]))


if __name__ == "__main__":
    unittest.main()
