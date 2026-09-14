#!/usr/bin/env python3
"""Unit tests for the JUMP FORCE Dai config/audio evidence audit."""

from __future__ import annotations

import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("audit_existing_scope.py")
SPEC = importlib.util.spec_from_file_location("jump_force_dai_audit_existing_scope", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def write_gz(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row) + "\n")


class ConfigIndexTest(unittest.TestCase):
    def test_indexed_config_is_not_claimed_as_extracted(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pak = root / "pak.jsonl.gz"
            summary = root / "summary.json"
            files = root / "files.jsonl.gz"
            write_gz(pak, [{
                "path": "JUMP_FORCE/Content/Game/chr0430_anim.uasset",
                "nativeCharacterIds": ["chr0430"],
                "selectedByPatchOrder": True,
                "sourceKind": "character-config-package",
                "container": "patch.pak",
                "containerSha256": "a" * 64,
            }])
            write_json(summary, {"containers": [{"name": "patch.pak", "originPath": "/readonly/patch.pak"}]})
            write_gz(files, [{"role": "native-package", "path": "Character/chr0430/model.uasset"}])
            result = MODULE.build_config_index(pak, summary, files)
            self.assertEqual(result["counts"]["selectedPaths"], 1)
            self.assertEqual(result["counts"]["selectedPathsPendingExtraction"], 1)
            self.assertFalse(result["states"]["packagesExtracted"])
            self.assertEqual(result["files"][0]["extractionState"], "indexed-only-pending-extraction")


if __name__ == "__main__":
    unittest.main()
