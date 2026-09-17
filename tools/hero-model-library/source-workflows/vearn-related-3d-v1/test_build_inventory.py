#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("build_inventory", HERE / "build_inventory.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class VearnRelatedInventoryTest(unittest.TestCase):
    def test_reference_has_unique_sources_and_fixed_archive_metadata(self) -> None:
        data = json.loads((HERE / "source-reference.json").read_text())
        ids = [row["id"] for row in data["sources"]]
        self.assertEqual(len(ids), len(set(ids)))
        ia = next(row for row in data["sources"] if row["id"] == "internet-archive-heros-bonds-final-cache-1.17.0.121")
        self.assertEqual(sum(row["bytes"] for row in ia["files"]), 2_098_263_630)
        self.assertTrue(all(len(row["sha1"]) == 40 and len(row["md5"]) == 32 for row in ia["files"]))

    def test_status_language_does_not_claim_runtime_or_identity(self) -> None:
        source = (HERE / "build_inventory.py").read_text()
        self.assertIn('"kiganKingPayloadIdentified": False', source)
        self.assertIn('"runtimeStatus": "not-registered"', source)
        self.assertIn('"motionStatus": "no-native-motion-acquired"', source)
        self.assertIn('"isNewYoungOrKiganCandidate": False', source)


if __name__ == "__main__":
    unittest.main()
