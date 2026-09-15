#!/usr/bin/env python3
"""Regression coverage for the Fate PS2 review-manifest generator."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = Path(__file__).with_name("prepare.py")
RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/fate-unlimited-codes-ps2-audio-review-v1/receipt.json"


def source_workspace() -> Path | None:
    if not RECEIPT.is_file():
        return None
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    workspace = Path(receipt.get("voiceIndexWorkspace", ""))
    return workspace if (workspace / "GGD-Asset-Library").is_dir() else None


class FatePs2PrepareTests(unittest.TestCase):
    def test_checked_delivery_is_current(self) -> None:
        workspace = source_workspace()
        if workspace is None:
            self.skipTest("Fate PS2 local source workspace is unavailable")
        completed = subprocess.run([sys.executable, str(SCRIPT), "--workspace", str(workspace), "--check"], text=True, capture_output=True, check=False)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn('"reviewWavFiles": 653', completed.stdout)


if __name__ == "__main__":
    unittest.main()
