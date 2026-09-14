#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("asset_review_server", HERE / "serve_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class AssetReviewServerTest(unittest.TestCase):
    def test_current_queue_resolves_every_sha_pinned_media_file(self):
        files = MODULE.media_map()
        queue = json.loads(MODULE.QUEUE.read_text())
        self.assertEqual(
            len(files),
            queue["summary"]["audioCandidateCount"] + queue["summary"]["visualPreviewFileCount"],
        )
        self.assertTrue(all(path.is_file() for path, _ in files.values()))

    def test_byte_ranges_are_bounded(self):
        self.assertEqual(MODULE.byte_range(None, 100), (0, 99))
        self.assertEqual(MODULE.byte_range("bytes=0-15", 100), (0, 15))
        self.assertEqual(MODULE.byte_range("bytes=70-", 100), (70, 99))
        self.assertEqual(MODULE.byte_range("bytes=-12", 100), (88, 99))
        self.assertEqual(MODULE.byte_range("bytes=90-200", 100), (90, 99))
        self.assertIsNone(MODULE.byte_range("bytes=100-", 100))
        self.assertIsNone(MODULE.byte_range("bytes=20-10", 100))
        self.assertIsNone(MODULE.byte_range("bytes=0-1,4-5", 100))

    def test_handler_serves_range_and_refuses_unknown_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "sample.ogg"
            source.write_bytes(bytes(range(64)))
            files = {"safe:id": (source, "audio/ogg")}
            server = ThreadingHTTPServer(("127.0.0.1", 0), MODULE.handler_class(files))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}"
                request = urllib.request.Request(base + "/media/safe%3Aid", headers={"Range": "bytes=4-11"})
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Content-Range"], "bytes 4-11/64")
                    self.assertEqual(response.read(), bytes(range(4, 12)))
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(base + "/media/unknown")
                self.assertEqual(caught.exception.code, 404)
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
