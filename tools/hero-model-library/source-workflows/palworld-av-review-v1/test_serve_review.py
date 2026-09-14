import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("palworld_av_server", HERE / "serve_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class PalworldReviewServerTest(unittest.TestCase):
    def test_queue_resolves_exactly_eighteen_existing_files(self):
        files = MODULE.audio_map()
        self.assertEqual(len(files), 18)
        self.assertEqual(len(set(files.values())), 18)
        self.assertTrue(all(path.is_file() for path in files.values()))

    def test_browser_byte_ranges_are_bounded(self):
        self.assertEqual(MODULE.byte_range(None, 100), (0, 99))
        self.assertEqual(MODULE.byte_range("bytes=0-31", 100), (0, 31))
        self.assertEqual(MODULE.byte_range("bytes=70-", 100), (70, 99))
        self.assertEqual(MODULE.byte_range("bytes=-12", 100), (88, 99))
        self.assertEqual(MODULE.byte_range("bytes=90-200", 100), (90, 99))
        self.assertIsNone(MODULE.byte_range("bytes=100-", 100))
        self.assertIsNone(MODULE.byte_range("bytes=20-10", 100))
        self.assertIsNone(MODULE.byte_range("bytes=0-1,4-5", 100))


if __name__ == "__main__":
    unittest.main()
