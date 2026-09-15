#!/usr/bin/env python3
"""Unit tests for S3 object selection before an Infinity Strash download."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("acquire_s3_delivery.py")
SPEC = importlib.util.spec_from_file_location("acquire_s3_delivery", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def row(name: str, size: int = 1) -> dict[str, object]:
    return {"Key": MODULE.PREFIX + name, "Size": size, "ETag": '"fixture"'}


class S3DeliverySelectionTests(unittest.TestCase):
    def test_selects_primary_and_optional_sidecars(self) -> None:
        chosen = MODULE.select_objects([
            row("pakchunk1-WindowsClient.pak", 2), row("pakchunk0-WindowsClient.pak", 3),
            row("MANIFEST.sha256", 4), row("pakchunk0-WindowsClient.utoc", 5),
        ])
        self.assertEqual([entry["Key"].removeprefix(MODULE.PREFIX) for entry in chosen], [
            "MANIFEST.sha256", "pakchunk0-WindowsClient.pak", "pakchunk0-WindowsClient.utoc", "pakchunk1-WindowsClient.pak",
        ])

    def test_rejects_unknown_object_in_shared_prefix(self) -> None:
        with self.assertRaisesRegex(ValueError, "unrecognized object"):
            MODULE.select_objects([row("pakchunk0-WindowsClient.pak"), row("pakchunk1-WindowsClient.pak"), row("notes.txt")])

    def test_rejects_missing_primary(self) -> None:
        with self.assertRaisesRegex(ValueError, "pakchunk1-WindowsClient.pak"):
            MODULE.select_objects([row("pakchunk0-WindowsClient.pak")])


if __name__ == "__main__":
    unittest.main()
