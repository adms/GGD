from __future__ import annotations

import importlib.util
import struct
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof_native_probe", HERE / "probe.py")
assert SPEC is not None and SPEC.loader is not None
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class ProbeParserTests(unittest.TestCase):
    def test_ascii_table_refuses_non_ascii(self) -> None:
        data = struct.pack("<I", 3) + b"A\x00B"
        with self.assertRaises(ValueError):
            PROBE.read_ascii_table(data, 0, 1)

    def test_ascii_table_stops_at_non_string_boundary(self) -> None:
        data = struct.pack("<I", 4) + b"Root" + struct.pack("<I", 0)
        self.assertEqual(PROBE.read_ascii_table(data, 0, None), (["Root"], 8))

    def test_clip_label_requires_exact_prefix(self) -> None:
        self.assertTrue(PROBE.CLIP_LABEL.fullmatch("000MAI_BAS_STAND"))
        self.assertFalse(PROBE.CLIP_LABEL.fullmatch("MAI_BAS_STAND"))
        self.assertFalse(PROBE.CLIP_LABEL.fullmatch("000mai_BAS_STAND"))


if __name__ == "__main__":
    unittest.main()
