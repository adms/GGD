#!/usr/bin/env python3
"""Regression tests for the Infinity Strash full-game delivery gate."""

from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("inspect_delivery.py")
MAGIC = 0x5A6F12E1


def fixture_pak(path: Path) -> None:
    payload = bytearray(512)
    # This is deliberately only a footer-shaped fixture: the gate must classify
    # it, never attempt an extraction from it.
    struct.pack_into("<IIQQ", payload, 468, MAGIC, 4, 64, 128)
    path.write_bytes(payload)


class InspectDeliveryTests(unittest.TestCase):
    def make_delivery(self, root: Path) -> Path:
        delivery = root / "delivery"
        delivery.mkdir()
        fixture_pak(delivery / "pakchunk0-WindowsClient.pak")
        fixture_pak(delivery / "pakchunk1-WindowsClient.pak")
        (delivery / "pakchunk0-WindowsClient.utoc").write_bytes(b"-io-\0\0\0\0")
        hashes = []
        for name in ("pakchunk0-WindowsClient.pak", "pakchunk1-WindowsClient.pak", "pakchunk0-WindowsClient.utoc"):
            hashes.append(hashlib.sha256((delivery / name).read_bytes()).hexdigest() + "  " + name)
        (delivery / "MANIFEST.sha256").write_text("\n".join(hashes) + "\n")
        return delivery

    def run_gate(self, delivery: Path, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["python3", str(SCRIPT), str(delivery), str(output)], text=True, capture_output=True)

    def test_freezes_primary_containers_and_iostore_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            delivery = self.make_delivery(Path(temp))
            result = self.run_gate(delivery, Path(temp) / "out")
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads((Path(temp) / "out/delivery-inspection.json").read_text())
            self.assertTrue(document["primaryContainersPresent"])
            self.assertTrue(document["providedManifest"]["allProvidedEntriesVerified"])
            pak = next(row for row in document["containers"] if row["name"] == "pakchunk0-WindowsClient.pak")
            self.assertEqual(pak["probe"]["kind"], "unreal-pak")
            self.assertFalse(pak["probe"]["legacyPlainUnpackEligible"])
            utoc = next(row for row in document["containers"] if row["name"].endswith(".utoc"))
            self.assertEqual(utoc["probe"]["kind"], "iostore-utoc")

    def test_refuses_manifest_mismatch_without_writing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            delivery = self.make_delivery(Path(temp))
            manifest = delivery / "MANIFEST.sha256"
            manifest.write_text("0" * 64 + "  pakchunk0-WindowsClient.pak\n")
            output = Path(temp) / "out"
            result = self.run_gate(delivery, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("MANIFEST.sha256 mismatch", result.stderr)
            self.assertFalse(output.exists())

    def test_requires_both_primary_paks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            delivery = Path(temp) / "delivery"
            delivery.mkdir()
            fixture_pak(delivery / "pakchunk0-WindowsClient.pak")
            result = self.run_gate(delivery, Path(temp) / "out")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("pakchunk1-WindowsClient.pak", result.stderr)


if __name__ == "__main__":
    unittest.main()
