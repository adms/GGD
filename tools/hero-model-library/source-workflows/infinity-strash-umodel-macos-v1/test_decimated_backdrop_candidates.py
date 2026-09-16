#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / "tools/vfx-asset-safety"))
from check import check_model_doc  # noqa: E402


class DecimatedBackdropCandidatesTest(unittest.TestCase):
    def test_hashes_frozen_copies_and_texture_safety(self) -> None:
        generation = json.loads((REPO / "materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-decimation-v1/generation.json").read_text())
        self.assertEqual(len(generation["records"]), 3)
        for row in generation["records"]:
            with self.subTest(candidate=row["candidateId"]), tempfile.TemporaryDirectory() as temporary:
                base, frozen, local = (Path(row["output"][name]["path"]) for name in ("base", "frozen", "local"))
                payload = base.read_bytes()
                self.assertEqual(hashlib.sha256(payload).hexdigest(), row["outputSha256"])
                self.assertEqual(frozen.read_bytes(), payload)
                self.assertEqual(local.read_bytes(), payload)
                model_doc = Path(temporary) / "model.json"
                model_doc.write_text(json.dumps({"id": "test." + row["candidateId"],
                    "glbPath": "assets/models/community/" + row["outputSha256"] + ".glb"}) + "\n")
                self.assertEqual(check_model_doc(model_doc, set()), [])


if __name__ == "__main__":
    unittest.main()
