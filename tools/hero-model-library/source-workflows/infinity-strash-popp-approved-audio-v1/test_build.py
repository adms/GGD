from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("popp_approved_audio", HERE / "build.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PoppApprovedAudioTests(unittest.TestCase):
    def test_owner_approved_only_the_single_native_event(self) -> None:
        rows, decisions = MODULE.selected_rows()
        self.assertEqual(len(rows), 36)
        self.assertFalse(decisions["runtimeMutationAllowed"])
        for candidate, decision, _ in rows:
            self.assertEqual(decision["decision"], "approve")
            self.assertEqual(decision["approvedBindings"], candidate["eventCandidates"])
            self.assertEqual(len(decision["approvedBindings"]), 1)
            self.assertFalse(decision["runtimeBindingAuthorized"])

    def test_generated_assets_and_blockers_preserve_the_runtime_boundary(self) -> None:
        manifest = json.loads((MODULE.OUTPUT_ROOT / "MANIFEST.json").read_text(encoding="utf-8"))
        blockers = json.loads((MODULE.EVIDENCE_ROOT / "candidate-blockers.json").read_text(encoding="utf-8"))
        events = json.loads((MODULE.EVIDENCE_ROOT / "runtime-event-table.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["summary"]["gameAudioFiles"], 35)
        self.assertEqual(manifest["summary"]["gameAudioCandidateRelationships"], 36)
        self.assertEqual(manifest["summary"]["runtimeBindings"], 0)
        self.assertEqual(len(events["events"]), 8)
        self.assertFalse(events["runtimeBindingAuthorized"])
        self.assertEqual(blockers["summary"], {"candidates": 36, "runtimeBindable": 0, "blocked": 36})
        self.assertTrue(all(row["ggdRuntimeTarget"] is None for row in manifest["candidates"]))
        for asset in manifest["assets"]:
            path = MODULE.OUTPUT_ROOT / asset["relativePath"]
            self.assertTrue(path.is_file())
            self.assertEqual(path.stat().st_size, asset["bytes"])
            self.assertEqual(MODULE.sha256(path), asset["sha256"])


if __name__ == "__main__":
    unittest.main()
