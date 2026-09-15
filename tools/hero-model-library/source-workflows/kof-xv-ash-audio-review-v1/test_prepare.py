#!/usr/bin/env python3
"""Regression coverage for the KOF XV Ash review-audio generator."""
from __future__ import annotations

import subprocess
import sys
import unittest
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = Path(__file__).with_name("prepare.py")
RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/kof-xv-ash-audio-review-v1/receipt.json"


def source_workspace() -> Path | None:
    """Locate the local source workspace recorded by the committed receipt.

    Raw sources intentionally live outside Git, so an isolated worktree is not
    necessarily a sibling of ``GGD-Asset-Library``.  The test uses the receipt
    only to locate a local source already required by ``--check``; it does not
    weaken the conversion's hash verification.
    """
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    source = Path(receipt["sourceValidation"]["absolutePath"])
    library = next((parent for parent in source.parents if parent.name == "GGD-Asset-Library"), None)
    if library is None or not source.is_file():
        return None
    return library.parent


class AshReviewAudioTests(unittest.TestCase):
    def test_checked_delivery_is_current(self) -> None:
        workspace = source_workspace()
        if workspace is None:
            self.skipTest("KOF XV Ash local source workspace is unavailable")
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(ROOT), "--workspace", str(workspace), "--check"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn('"reviewMp3Files": 86', completed.stdout)


if __name__ == "__main__":
    unittest.main()
