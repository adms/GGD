import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('compact_comparison', Path(__file__).with_name(
    'hero-distillation-compact-comparison.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CompactComparisonTests(unittest.TestCase):
    def test_reduction_is_percent_and_bounded(self):
        self.assertEqual(module.reduction(100, 25), 75.0)
        with self.assertRaises(AssertionError):
            module.reduction(10, 11)


if __name__ == '__main__':
    unittest.main()
