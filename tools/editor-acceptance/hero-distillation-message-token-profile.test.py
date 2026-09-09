import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('token_profile', Path(__file__).with_name(
    'hero-distillation-message-token-profile.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class TokenProfileTests(unittest.TestCase):
    def test_summary_uses_nearest_rank_percentiles(self):
        self.assertEqual(p.summarize([5, 1, 4, 2, 3]),
                         {'count': 5, 'sum': 15, 'min': 1, 'p50': 3, 'p95': 5, 'max': 5})


if __name__ == '__main__':
    unittest.main()
