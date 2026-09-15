#!/usr/bin/env python3
"""The checked-in Samus blocker must remain source-pinned and non-converted."""

from __future__ import annotations

from pathlib import Path
import json
import subprocess
import unittest


REPO = Path(__file__).resolve().parents[4]
SCRIPT = Path(__file__).with_name("record_blocker.py")
RECEIPT = REPO / "materials/hero-model-library/priority-evidence/ssbu-samus-blender522-macos-blocker-v1/receipt.json"


def workspace_from_source_receipt() -> Path:
    source = Path(json.loads(RECEIPT.read_text(encoding="utf-8"))["source"]["absolutePath"])
    asset_library = next(parent for parent in source.parents if parent.name == "GGD-Asset-Library")
    return asset_library.parent


class SamusBlenderBlockerTest(unittest.TestCase):
    def test_record_is_current_and_does_not_claim_a_component(self) -> None:
        subprocess.run(["python3", str(SCRIPT), "--workspace", str(workspace_from_source_receipt()), "--check"], cwd=REPO, check=True)


if __name__ == "__main__":
    unittest.main()
