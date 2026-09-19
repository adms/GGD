#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import shutil
import struct
import subprocess
import sys
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("probe_bonds_blobs", HERE / "probe_bonds_blobs.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class BondsBlobProbeTest(unittest.TestCase):
    def test_magic_detection(self) -> None:
        self.assertEqual(MODULE.detect_magic(b"UnityFS\x00rest"), "unityfs")
        self.assertEqual(MODULE.detect_magic(b"@UTFrest"), "cri-acb")
        self.assertEqual(MODULE.detect_magic(b"AFS2rest"), "cri-awb")
        self.assertIsNone(MODULE.detect_magic(b"opaque"))

    def test_entropy_extremes(self) -> None:
        self.assertEqual(MODULE.entropy(bytes(1024)), 0.0)
        uniform = bytes(range(256)) * 4
        self.assertAlmostEqual(MODULE.entropy(uniform), 8.0)

    def test_rejects_non_catalog(self) -> None:
        with self.assertRaisesRegex(ValueError, "not an ALDC catalog"):
            MODULE.parse_aldc(b"not-a-catalog")

    def test_character_hints_do_not_assert_identity(self) -> None:
        self.assertEqual(MODULE.character_hint("Character/Model/ch027005800/Meshes"), "ch027005800")
        self.assertEqual(MODULE.character_hint("Effect/Particles/Battle/Enemy/kiganohburn"),
                         "direct-kiganohburn-effect")

    def test_seekable_aes_comparison_requires_key_info(self) -> None:
        self.assertEqual(MODULE.seekable_aes_comparison_probe(b"UnityFS\x00", None), [])

    @unittest.skipUnless(shutil.which("openssl"), "openssl is required for the comparison probe")
    def test_seekable_aes_comparison_recognizes_reference_layout(self) -> None:
        key_info = bytes(range(32))
        counters = struct.pack("<Q", 1) + bytes(8)
        process = subprocess.run(
            ["openssl", "enc", "-aes-128-ecb", "-e", "-K", key_info[:16].hex(),
             "-nopad", "-nosalt"],
            input=counters, stdout=subprocess.PIPE, check=True,
        )
        plain = b"UnityFS\x00" + bytes(8)
        encrypted = bytes(left ^ right for left, right in zip(plain, process.stdout))
        attempts = MODULE.seekable_aes_comparison_probe(encrypted, key_info.hex())
        self.assertTrue(any(row["knownMagic"] == "unityfs" for row in attempts))


if __name__ == "__main__":
    unittest.main()
