#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


builder = load_module("fuc_source_index", "build_source_index.py")
extractor = load_module("fuc_disc_extract", "extract_disc_payload.py")


class PlatformSourceIndexTests(unittest.TestCase):
    def test_live_index_separates_platforms_and_truth_states(self):
        report = builder.build()
        versions = report["originalGamePlatformVersions"]
        self.assertEqual(2, len(versions))
        self.assertEqual({"Japan", "USA"}, {row["region"] for row in versions})
        self.assertEqual({"ZIP", "ISO"}, {row["container"] for row in versions})
        self.assertTrue(all(row["acquisitionStatus"] == "inventory-metadata-only" for row in versions))
        self.assertTrue(all(row["payloadSha256"] is None for row in versions))
        self.assertEqual(0, report["summary"]["originalGamePayloadBytesRead"])
        self.assertEqual(3, report["summary"]["ps2PublicAudioSourcesAcquired"])
        self.assertEqual(14, report["relatedCommunityReserve"]["servants"])
        self.assertEqual(127, report["relatedCommunityReserve"]["convertedNativeClips"])
        self.assertEqual(False, report["relatedCommunityReserve"]["runtimeSelectable"])

    def test_valid_zip_inventory_and_extract(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            source = root / "sample.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("PSP_GAME/USRDIR/model/test.gmo", b"OMG.fixture")
                archive.writestr("PSP_GAME/USRDIR/data/test.fpk", b"fixture")
            report = extractor.inventory(source)
            self.assertEqual("ZIP", report["container"])
            self.assertEqual(2, report["memberCount"])
            self.assertEqual({"psp-model-animation-candidate", "fuc-container-candidate"},
                             {row["kind"] for row in report["resourceCandidates"]})
            destination = root / "extracted"
            extracted = extractor.extract(source, destination)
            self.assertEqual(2, extracted["extractedFileCount"])
            self.assertTrue((destination / "disc-extraction.json").is_file())
            self.assertEqual("ggd-fuc-disc-payload-extraction@1",
                             json.loads((destination / "disc-extraction.json").read_text())["schema"])

    def test_zip_path_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as raw:
            source = Path(raw) / "unsafe.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("../escape.gmo", b"bad")
            with self.assertRaisesRegex(ValueError, "Unsafe archive member"):
                extractor.inventory(source)


if __name__ == "__main__":
    unittest.main()
