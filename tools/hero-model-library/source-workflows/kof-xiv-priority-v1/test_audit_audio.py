#!/usr/bin/env python3
"""Tests for KOF XIV source-directory audio classification."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("audit_audio.py")
SPEC = importlib.util.spec_from_file_location("kof_xiv_audit_audio", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class AudioClassificationTest(unittest.TestCase):
    def test_native_directories_do_not_become_listening_claims(self) -> None:
        self.assertEqual(MODULE.source_category("extracted/Chara/MAI/Sound/voice/v_022.ogg"), "voice")
        self.assertEqual(MODULE.source_category("extracted/Chara/MAI/Sound/se/s_022.ogg"), "sfx")
        self.assertEqual(MODULE.source_category("extracted/Chara/MAI/Sound/unknown.ogg"), "unclassified")


if __name__ == "__main__":
    unittest.main()
