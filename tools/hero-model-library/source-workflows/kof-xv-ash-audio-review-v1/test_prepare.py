#!/usr/bin/env python3
"""Regression coverage for the KOF XV Ash review-audio generator."""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = Path(__file__).with_name("prepare.py")


class AshReviewAudioTests(unittest.TestCase):
    def test_checked_delivery_is_current(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(ROOT), "--workspace", str(ROOT.parent), "--check"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn('"reviewMp3Files": 86', completed.stdout)


if __name__ == "__main__":
    unittest.main()
