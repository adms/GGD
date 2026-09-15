import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("register_backend_options.py")
SPEC = importlib.util.spec_from_file_location("fate_backend_options", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FateBackendRegistrationTest(unittest.TestCase):
    def test_exactly_five_mapped_options_are_planned(self):
        rows = MODULE.expected_rows()
        self.assertEqual(len(rows), 5)
        self.assertEqual(len({row["sourceModelKey"] for row in rows}), 4)
        self.assertEqual(len({row["heroId"] for row in rows}), 5)


if __name__ == "__main__":
    unittest.main()
