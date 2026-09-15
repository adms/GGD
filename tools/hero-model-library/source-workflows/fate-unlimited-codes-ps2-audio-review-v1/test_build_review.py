#!/usr/bin/env python3
"""Regression coverage for the Fate PS2 local listening portal."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("fuc_ps2_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class FatePs2ReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()

    def test_exactly_653_pending_sha_pinned_wavs(self) -> None:
        rows, summary = self.contract["audioCandidates"], self.contract["summary"]
        self.assertEqual(len(rows), 653)
        self.assertEqual(summary["archerCandidateCount"], 180)
        self.assertEqual(summary["shirouCandidateCount"], 222)
        self.assertEqual(summary["saberCandidateCount"], 251)
        self.assertEqual(len({row["candidateId"] for row in rows}), 653)
        self.assertTrue(all(row["classification"] == {"category": "unclassified-audio", "language": "pending-confirmation", "speaker": "pending-confirmation", "event": "pending-confirmation"} for row in rows))
        self.assertTrue(all(Path(row["file"]["absolutePath"]).is_absolute() for row in rows))
        self.assertTrue(all(len(row["file"]["sha256"]) == 64 for row in rows))

    def test_portal_and_export_have_no_runtime_authority(self) -> None:
        self.assertIs(self.contract["policy"]["runtimeMutationAllowed"], False)
        self.assertEqual(self.contract["policy"]["backendSelectableAssets"], 0)
        self.assertEqual(self.contract["policy"]["productionDeployments"], 0)
        self.assertTrue(all(row["runtimeBindingAuthorized"] is False and row["runtimeSelectable"] is False and row["productionDeployed"] is False for row in self.contract["audioCandidates"]))
        schema = MODULE.decision_schema(self.contract)
        self.assertEqual(schema["properties"]["decisions"]["minItems"], 653)
        self.assertIs(schema["properties"]["runtimeMutationAllowed"]["const"], False)
        self.assertIs(schema["properties"]["decisions"]["items"]["properties"]["runtimeBindingAuthorized"]["const"], False)

    def test_products_are_serializable_and_server_allowlist_is_exact(self) -> None:
        generated = MODULE.products()
        queue = json.loads(generated[MODULE.OUTPUT_JSON])
        self.assertEqual(queue["sourceFingerprint"], self.contract["sourceFingerprint"])
        self.assertIn("pending-confirmation", generated[MODULE.OUTPUT_HTML])
        server_path = HERE.parent / "asset-review-portal-v1" / "serve_review.py"
        spec = importlib.util.spec_from_file_location("asset_review_server", server_path)
        server = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(server)
        allowlist = server.media_map(MODULE.OUTPUT_JSON)
        self.assertEqual(len(allowlist), 653)
        self.assertTrue(all(key.startswith("fuc-ps2:") for key in allowlist))
        self.assertTrue(all(path.suffix.lower() == ".wav" for path, _ in allowlist.values()))


if __name__ == "__main__":
    unittest.main()
