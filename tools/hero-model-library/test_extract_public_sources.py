#!/usr/bin/env python3
"""Regression tests for inert public-source archive extraction."""
from __future__ import annotations

import importlib.util
import struct
import tempfile
import unittest
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("extract_public_sources", ROOT / "tools/hero-model-library/extract_public_sources.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def vpk_member(name: str, payload: bytes, *, crc: int | None = None) -> bytes:
    stem, extension = name.rsplit(".", 1)
    tree = bytearray()
    tree += extension.encode() + b"\0 \0" + stem.encode() + b"\0"
    tree += struct.pack("<IHHIIH", zlib.crc32(payload) if crc is None else crc, 0, 0x7FFF, 0, len(payload), 0xFFFF)
    tree += b"\0\0\0"
    return struct.pack("<III", 0x55AA1234, 1, len(tree)) + tree + payload


class SourceOneVpkTests(unittest.TestCase):
    def test_extracts_embedded_member_and_records_sha(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "workshop.bin"
            source.write_bytes(vpk_member("models/dai.txt", b"Dai source bytes"))
            target = root / "out"
            MODULE.unpack_vpk(source, target)
            self.assertEqual((target / "models/dai.txt").read_bytes(), b"Dai source bytes")
            manifest = __import__("json").loads((target / "vpk-manifest.json").read_text())
            self.assertEqual(manifest["members"][0]["path"], "models/dai.txt")
            self.assertEqual(manifest["members"][0]["bytes"], 16)

    def test_rejects_bad_member_crc_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "workshop.bin"
            source.write_bytes(vpk_member("models/dai.txt", b"Dai source bytes", crc=0))
            target = root / "out"
            with self.assertRaisesRegex(ValueError, "CRC32"):
                MODULE.unpack_vpk(source, target)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
