#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof3d_integrate", HERE / "integrate.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class IntegrateTest(unittest.TestCase):
    def test_integrate_xiv_source_is_idempotent(self) -> None:
        data = {"publicSources": [{"id": MODULE.BUILD.KOF_XIV_SOURCE_ID}]}
        textures = {"summary": {"files": 1, "bytes": 2, "maxEdge": 256}, "files": [{
            "nativeCharacterId": "MAI", "outputAbsolutePath": "/tmp/MAI_COL.png", "outputBytes": 2,
            "outputSha256": "a" * 64, "width": 256, "height": 128, "channels": 4,
            "state": "decoded-review-candidate-not-material-bound",
        }], "backup": {"s3Uri": "s3://example"}}
        probe = {"sourceId": "probe", "kofXiv": {"nativeFiles": [{}], "assimpAcceptedFiles": 0,
            "conversionState": {"modelAndSkeleton": "blocked", "nativeAnimation": "blocked", "vfx": "blocked"}}}
        self.assertTrue(MODULE.integrate_xiv_source(data, textures, probe))
        self.assertFalse(MODULE.integrate_xiv_source(data, textures, probe))
        self.assertEqual(1, len(data["publicSources"][0]["componentCandidates"]))

    def test_upsert_is_idempotent_and_preserves_other_sources(self) -> None:
        source = {"id": "kof-source", "value": 1}
        data = {"publicSources": [{"id": "other", "value": 7}]}
        self.assertTrue(MODULE.upsert(data, source))
        self.assertEqual(["other", "kof-source"], [row["id"] for row in data["publicSources"]])
        self.assertFalse(MODULE.upsert(data, source))
        self.assertEqual(2, len(data["publicSources"]))

    def test_upsert_replaces_only_matching_source(self) -> None:
        data = {"publicSources": [{"id": "kof-source", "value": 0}, {"id": "other", "value": 7}]}
        self.assertTrue(MODULE.upsert(data, {"id": "kof-source", "value": 1}))
        self.assertEqual({"id": "other", "value": 7}, data["publicSources"][1])

    def test_integrate_backlog_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            model = workspace / "GGD-Asset-Library/conversions/test/left/body.glb"
            model.parent.mkdir(parents=True)
            model.write_bytes(b"glTF" + bytes(20))
            digest = MODULE.BUILD.sha256(model)
            source = {
                "id": "kof-source", "url": "https://example.invalid", "localPath": "GGD-Asset-Library/conversions/test",
                "modelCandidates": [{"candidateId": "candidate", "model": "left/body.glb", "bytes": 24,
                    "sha256": digest, "meshCount": 1, "drawCalls": 2, "skinCount": 1, "animationCount": 0,
                    "readyStage": "converted-partial", "limitations": ["review pending"]}],
            }
            data = {"characters": [{"id": "ash-crimson", "sourceIds": [], "modelCandidates": [],
                "resources": {"motionCandidateCounts": []}}]}
            self.assertTrue(MODULE.integrate_backlog(data, source, workspace))
            self.assertFalse(MODULE.integrate_backlog(data, source, workspace))
            row = data["characters"][0]
            self.assertEqual(["kof-source"], row["sourceIds"])
            self.assertEqual("candidate", row["modelCandidates"][0]["id"])
            self.assertEqual(0, row["resources"]["motionCandidateCounts"][0]["count"])


if __name__ == "__main__":
    unittest.main()
