#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import struct
import sys
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("index_bonds_assets", HERE / "index_bonds_assets.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class BondsAli2ParserTest(unittest.TestCase):
    def test_rejects_non_ali2_data(self) -> None:
        with self.assertRaisesRegex(ValueError, "not an ALI2 index"):
            MODULE.parse_ali2(b"not-an-index")

    def test_bounds_check_rejects_truncated_index(self) -> None:
        data = bytearray(32)
        struct.pack_into("<I", data, 0, 24)
        data[4:8] = b"ALI2"
        with self.assertRaises((MODULE.BoundsError, ValueError)):
            MODULE.parse_ali2(bytes(data))

    def test_asset_kind_suffix_is_preserved_and_normalized(self) -> None:
        row = MODULE.Ali2Row("Character/Model/ch027002800!", 1, 2, 3, 2, 4, 1, 5)
        self.assertEqual(row.raw_path, "Character/Model/ch027002800!")
        self.assertEqual(row.logical_path, "Character/Model/ch027002800")
        self.assertEqual(row.blob_hex, "0000000000000003")

    def test_candidate_selection_prefers_downloaded_cache(self) -> None:
        common = {
            "logicalPath": "Character/Model/Character/ch027005800/Meshes",
            "blobId": "1234567890abcdef",
        }
        rows = [
            {**common, "source": "bundledtree-apk"},
            {**common, "source": "downloaded-cache"},
            {"logicalPath": "Effect/Particles/Battle/Enemy/kiganohburn",
             "blobId": "fedcba0987654321", "source": "downloaded-cache"},
        ]
        selected = MODULE.select_candidate_records(rows, ("kigan",), ("027005800",))
        self.assertEqual(len(selected), 2)
        self.assertEqual(selected[0]["source"], "downloaded-cache")

    def test_asset_kind_classification(self) -> None:
        self.assertEqual(MODULE.asset_kind("Character/AnimationClip/ch027005800"), "motion")
        self.assertEqual(MODULE.asset_kind("Character/Model/Character/ch027005800/Meshes"), "model")
        self.assertEqual(MODULE.asset_kind("Common/Sounds/ch027003700.awb"), "audio")


if __name__ == "__main__":
    unittest.main()
