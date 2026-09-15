import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("inventory.py")
SPEC = importlib.util.spec_from_file_location("jstars_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class InventoryTests(unittest.TestCase):
    def test_parse_and_extract_minimal_stpk(self):
        header = b"STPK" + (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + (16).to_bytes(4, "big")
        row = (64).to_bytes(4, "big") + (4).to_bytes(4, "big") + b"\0" * 8 + b"safe.srd".ljust(32, b"\0")
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "one.stpk"
            source.write_bytes(header + row + b"DATA")
            parsed = MODULE.parse_stpk(source)
            self.assertEqual(parsed["nonEmptyEntryCount"], 1)
            output = Path(temp) / "out"
            rows = MODULE.extract_stpk(parsed, output)
            self.assertEqual((output / "safe.srd").read_bytes(), b"DATA")
            self.assertEqual(rows[0]["bytes"], 4)

    def test_rejects_path_traversal(self):
        header = b"STPK" + (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + (16).to_bytes(4, "big")
        row = (64).to_bytes(4, "big") + (0).to_bytes(4, "big") + b"\0" * 8 + b"../bad".ljust(32, b"\0")
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "bad.stpk"
            source.write_bytes(header + row)
            with self.assertRaises(ValueError):
                MODULE.parse_stpk(source)

    def test_rejects_out_of_bounds_member(self):
        header = b"STPK" + (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + (16).to_bytes(4, "big")
        row = (64).to_bytes(4, "big") + (8).to_bytes(4, "big") + b"\0" * 8 + b"bad.srd".ljust(32, b"\0")
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "bad.stpk"
            source.write_bytes(header + row + b"tiny")
            with self.assertRaises(ValueError):
                MODULE.parse_stpk(source)


if __name__ == "__main__":
    unittest.main()
