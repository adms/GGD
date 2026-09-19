#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import struct
import sys
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("extract_bonds_audio", HERE / "extract_bonds_audio.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class BondsAudioExtractionTest(unittest.TestCase):
    def test_rejects_non_afs2(self) -> None:
        with self.assertRaisesRegex(ValueError, "not an AFS2"):
            MODULE.parse_afs2(b"bad")

    def test_parses_minimal_afs2(self) -> None:
        data = bytearray(40)
        data[:4] = b"AFS2"
        data[4:8] = bytes((2, 2, 2, 0))
        struct.pack_into("<I", data, 8, 1)
        struct.pack_into("<H", data, 12, 4)
        struct.pack_into("<H", data, 16, 0)
        struct.pack_into("<HH", data, 18, 24, 28)
        data[24:28] = b"HCA!"
        self.assertEqual(MODULE.parse_afs2(bytes(data)), [b"HCA!"])


if __name__ == "__main__":
    unittest.main()
