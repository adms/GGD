from __future__ import annotations

import importlib.util
import struct
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("audio_extract.py")
SPEC = importlib.util.spec_from_file_location("jstars_audio_extract", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class AudioExtractTests(unittest.TestCase):
    def test_parse_afs2(self) -> None:
        header = bytearray(b"AFS2" + bytes([1, 4, 2, 0]) + struct.pack("<IHH", 2, 16, 0))
        header += struct.pack("<HH", 7, 9)
        header += struct.pack("<III", 32, 48, 68)
        header += b"\0" * (32 - len(header))
        header += b"HCA\0" + b"A" * 12
        header += b"HCA\0" + b"B" * 16
        parsed = MODULE.parse_afs2(bytes(header))
        self.assertEqual(parsed["entryCount"], 2)
        self.assertEqual([row["id"] for row in parsed["entries"]], [7, 9])
        self.assertEqual([len(row["payload"]) for row in parsed["entries"]], [16, 20])

    def test_extract_cue_names_deduplicates_in_file_order(self) -> None:
        acb = b"x cv_018500_jp\0cv_018501_jp\0cv_018500_jp\0"
        self.assertEqual(
            MODULE.extract_cue_names(acb, "cv", "018"),
            ["cv_018500_jp", "cv_018501_jp"],
        )

    def test_hca_format_and_deterministic_wav(self) -> None:
        hca = b"HCA\0\x02\0\0\x20fmt\0" + bytes([1, 0, 0x5D, 0xC0]) + b"\0" * 16
        self.assertEqual(MODULE.hca_format(hca), (1, 24000))
        wav = MODULE.deterministic_wav(b"\0\0" * 24, 1, 24000)
        self.assertEqual(wav[:4], b"RIFF")
        self.assertEqual(wav[8:12], b"WAVE")


if __name__ == "__main__":
    unittest.main()
