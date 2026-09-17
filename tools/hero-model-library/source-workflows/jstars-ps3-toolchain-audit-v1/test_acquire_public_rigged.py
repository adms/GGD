#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("acquire_public_rigged.py")
SPEC = importlib.util.spec_from_file_location("acquire_public_rigged", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublicRiggedAcquisitionTest(unittest.TestCase):
    def test_parse_csrf(self) -> None:
        self.assertEqual(MODULE.parse_csrf("window.__CSRF_TOKEN__ = 'abc.123';"), "abc.123")

    def test_validate_download(self) -> None:
        payload = {
            "deviation": {
                "deviationId": 42,
                "isDownloadable": True,
                "license": "none",
                "extended": {
                    "download": {
                        "url": "https://www.deviantart.com/download/42/a.7z?token=x",
                        "filesize": 123,
                        "type": "7-zip",
                    }
                },
            }
        }
        row = MODULE.validate_download(payload, 42)
        self.assertEqual(row["expectedBytes"], 123)
        self.assertEqual(row["pageLicenseField"], "none")

    def test_rejects_disabled_download(self) -> None:
        with self.assertRaises(PermissionError):
            MODULE.validate_download({"deviation": {"deviationId": 42}}, 42)


if __name__ == "__main__":
    unittest.main()
