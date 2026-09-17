#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
SPEC = importlib.util.spec_from_file_location("repair_texture_backdrops", HERE / "repair_texture_backdrops.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TextureBackdropRepairTest(unittest.TestCase):
    def test_current_sources_rebuild_to_pinned_content_hashes(self) -> None:
        for candidate, spec in MODULE.CANDIDATES.items():
            with self.subTest(candidate=candidate):
                source = REPO.parent / str(spec["localOriginalRelativePath"])
                repaired, receipt = MODULE.repair(candidate, source.read_bytes())
                self.assertEqual(hashlib.sha256(repaired).hexdigest(), spec["expectedSha256"])
                self.assertTrue(receipt["nonImagePayloadIdentical"])
                self.assertFalse(receipt["runtimeRegistration"])
                if spec["mode"] == "flatten-unused-opaque-alpha":
                    self.assertEqual(receipt["materialPostcondition"]["alphaMode"], "OPAQUE")
                    self.assertEqual(receipt["imagePostcondition"]["alphaExtrema"], [255, 255])
                else:
                    self.assertGreaterEqual(receipt["imagePostcondition"]["transparentBackgroundShare"], 0.02)

    def test_repair_command_is_append_only_and_reproducible(self) -> None:
        candidate = "dai-pn010-02"
        spec = MODULE.CANDIDATES[candidate]
        source = REPO.parent / str(spec["localOriginalRelativePath"])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = MODULE.run_one(candidate, source, root / "out.glb", root / "receipt.json")
            second = MODULE.run_one(candidate, source, root / "out.glb", root / "receipt.json")
            self.assertEqual(first["output"]["sha256"], second["output"]["sha256"])

    def test_published_candidates_clear_the_exact_model_safety_gate(self) -> None:
        checker = MODULE.sys.modules["check"]
        for candidate, spec in MODULE.CANDIDATES.items():
            with self.subTest(candidate=candidate), tempfile.TemporaryDirectory() as temporary:
                model_doc = Path(temporary) / "model.json"
                output_sha = spec["expectedSha256"]
                model_doc.write_text('{"id":"test.' + candidate + '","glbPath":"assets/models/community/' + output_sha + '.glb"}\n')
                self.assertEqual(checker.check_model_doc(model_doc, set()), [])


if __name__ == "__main__":
    unittest.main()
