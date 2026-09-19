from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("gon_pipeline", HERE / "run_gon_pipeline.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GonPipelineTest(unittest.TestCase):
    def test_sources_are_independent_and_blocked_honestly(self) -> None:
        config = json.loads((HERE / "gon-source-options.json").read_text(encoding="utf-8"))
        sources = config["sources"]
        self.assertEqual(len(sources), 2)
        self.assertEqual(len({row["id"] for row in sources}), 2)
        self.assertEqual({row["sourceGame"] for row in sources}, {"JUMP FORCE", "J-STARS Victory VS+"})
        self.assertTrue(config["separationPolicy"]["neverOverwriteAnotherSource"])
        with tempfile.TemporaryDirectory() as name:
            repo = Path(name)
            states = {row["sourceGame"]: MODULE.status(repo, row) for row in sources}
        self.assertEqual(states["JUMP FORCE"]["state"], "blocked-awaiting-owner-or-runtime-key-injection")
        self.assertEqual(states["J-STARS Victory VS+"]["state"], "pending-archive-inventory-and-character-id-verification")
        self.assertFalse(states["JUMP FORCE"]["runtimeSelectable"])
        self.assertFalse(states["J-STARS Victory VS+"]["registered"])


if __name__ == "__main__":
    unittest.main()
